/**
 * POST /api/assistant/chat
 *
 * Streaming AI assistant chat endpoint. Processes one turn of conversation:
 *
 *   1. Authenticates the caller — messages are strictly user-scoped.
 *   2. Loads or creates a persistent AssistantSession for this conversation.
 *   3. Fetches a live data snapshot for the system prompt (counts, context).
 *   4. Calls Gemini with the full message history + system prompt.
 *   5. Parses tool calls from the model response:
 *      - READ tools  → execute immediately, run a second Gemini pass, stream result.
 *      - WRITE tools → emit a "pending" event (NO execution) — user must confirm via /confirm.
 *   6. Persists both the user and assistant messages (AES-256-GCM encrypted).
 *   7. Streams events as newline-delimited JSON.
 *
 * Stream event types:
 *   { type: "token",       text: string }          — progressive text chunk
 *   { type: "tool",        name, result }           — read tool result metadata
 *   { type: "pending",     tool, args, label, risk, sessionId, messageId } — write tool awaiting confirmation
 *   { type: "parse_error", raw: string }            — model returned unparseable tool call
 *   { type: "done",        modelUsed, sessionId }   — final marker
 *
 * Request body:
 *   {
 *     messages:  ChatMessage[]   // conversation history (last 20 kept)
 *     context:   AppContext      // current view, selected IDs
 *     sessionId?: string         // resume an existing session (optional)
 *     mode?:     "chat"|"suggest" // default "chat"
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { callGeminiWithFallback } from "@/lib/gemini";
import { db } from "@/lib/db";
import { executeTool, TOOL_DEFINITIONS, getToolDef } from "../tools";
import { encryptContent, decryptContent } from "../crypto";

// ── Types ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AppContext {
  view?: string;
  sourceId?: string | null;
  datasetId?: string | null;
  schemaId?: string | null;
}

// ── Session management ────────────────────────────────────────────────────

/**
 * Returns an existing valid session (not expired, not deleted, owned by user)
 * or creates a fresh one for this user+org combination.
 */
async function getOrCreateSession(
  sessionId: string | undefined,
  userId: string,
  organizationId: string,
  suggestionMode: boolean
): Promise<{ id: string; position: number }> {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Try to resume an existing session
  if (sessionId) {
    const existing = await db.assistantSession.findFirst({
      where: {
        id: sessionId,
        userId,         // Strict ownership check — never allow cross-user access
        organizationId,
        deletedAt: null,
        expiresAt: { gt: now }, // Reject expired sessions
      },
      select: { id: true, _count: { select: { messages: true } } },
    });
    if (existing) {
      return { id: existing.id, position: existing._count.messages };
    }
  }

  // Create a new session
  const session = await db.assistantSession.create({
    data: {
      userId,
      organizationId,
      expiresAt: sevenDaysFromNow,
      suggestionMode,
    },
  });
  return { id: session.id, position: 0 };
}

/**
 * Persists a message to the DB. Content is AES-256-GCM encrypted before write.
 */
async function saveMessage(params: {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  position: number;
  toolName?: string;
  toolResult?: unknown;
  modelUsed?: string;
  undoToken?: string;
}) {
  await db.assistantMessage.create({
    data: {
      sessionId: params.sessionId,
      role: params.role,
      content: encryptContent(params.content),
      position: params.position,
      toolName: params.toolName ?? null,
      toolResult: params.toolResult ? encryptContent(JSON.stringify(params.toolResult)) : null,
      modelUsed: params.modelUsed ?? null,
      undoToken: params.undoToken ?? null,
    },
  });
}

/**
 * Updates the session title from the first user message (plain truncated text,
 * not the encrypted blob — safe to store since it's just a display label).
 */
async function maybeUpdateTitle(sessionId: string, firstUserMessage: string) {
  const title = firstUserMessage.slice(0, 80).trim() || "New conversation";
  await db.assistantSession.update({
    where: { id: sessionId },
    data: { title },
  });
}

// ── Live data snapshot for system prompt ──────────────────────────────────

/**
 * Fetches lightweight counts to embed in the system prompt so the model has
 * up-to-date context without needing to call tools for basic facts.
 */
async function fetchDataSnapshot(organizationId: string, ctx: AppContext) {
  const [sources, datasets, schemas, runningJobs, reviewQueue] = await Promise.all([
    db.source.count({ where: { organizationId } }),
    db.dataset.count({ where: { organizationId } }),
    db.schema.count({ where: { organizationId } }),
    db.aiJob.count({ where: { organizationId, status: { in: ["queued", "running"] } } }),
    db.datasetRecord.count({ where: { dataset: { organizationId }, status: "needs_review" } }),
  ]);

  // If user is on schema-builder with a schema selected, include its fields
  let selectedSchemaInfo = "";
  if (ctx.schemaId) {
    const schema = await db.schema.findUnique({
      where: { id: ctx.schemaId },
      include: { fields: { orderBy: { position: "asc" }, select: { name: true, type: true, required: true } } },
    });
    if (schema?.organizationId === organizationId) {
      selectedSchemaInfo = `\n- Currently open schema: "${schema.name}" (${schema.fields.length} fields: ${schema.fields.map(f => `${f.name}:${f.type}`).join(", ")})`;
    }
  }

  return { sources, datasets, schemas, runningJobs, reviewQueue, selectedSchemaInfo };
}

// ── System prompt ─────────────────────────────────────────────────────────

function buildSystemPrompt(
  snapshot: { sources: number; datasets: number; schemas: number; runningJobs: number; reviewQueue: number; selectedSchemaInfo: string },
  ctx: AppContext,
  orgId: string,
  userName: string,
  mode: "chat" | "suggest"
): string {
  const writeToolNames = TOOL_DEFINITIONS.filter(t => t.isWrite).map(t => `- ${t.name}(args: ${t.argsSchema}) [WRITE|${t.risk}]: ${t.description}`).join("\n");
  const readToolNames = TOOL_DEFINITIONS.filter(t => !t.isWrite).map(t => `- ${t.name}(args: ${t.argsSchema}): ${t.description}`).join("\n");

  return `You are the AI Assistant for the Workspace Intelligence Platform. You are embedded in the app and help ${userName} manage their data pipelines, schemas, datasets, and AI extraction jobs.

## Live Workspace Snapshot
- Organization: ${orgId}
- Active sources: ${snapshot.sources} | Datasets: ${snapshot.datasets} | Schemas: ${snapshot.schemas}
- Running jobs: ${snapshot.runningJobs} | Records in review queue: ${snapshot.reviewQueue}
- Current view: ${ctx.view ?? "unknown"}${ctx.sourceId ? `\n- Selected source: ${ctx.sourceId}` : ""}${ctx.datasetId ? `\n- Selected dataset: ${ctx.datasetId}` : ""}${snapshot.selectedSchemaInfo}

## Tool Call Format
To call a tool, embed EXACTLY this format in your response:
<tool_call>{"tool":"TOOL_NAME","args":{...}}</tool_call>

You may call AT MOST ONE tool per turn. Wait for the result before calling another.

## Read Tools (safe to call directly)
${readToolNames}

## Write Tools (REQUIRE user confirmation — do NOT execute without CONFIRM from user)
${writeToolNames}

## Behavior Rules
1. NEVER dump raw JSON at the user. Always format results as markdown tables or bullet lists.
2. For WRITE tools: You MUST embed the EXACT <tool_call>...</tool_call> tag in your response. DO NOT just say you did it or will do it. The system will intercept the tag and ask the user to confirm.
3. For destructive actions (delete_*): after the tool call tag, add a brief warning about the impact.
4. If input is ambiguous, ask ONE clarifying question before taking action.
5. For schema creation: FIRST call suggest_schema_fields with the user's description, present the result as a markdown table, then say "Shall I create this schema?" — only call create_schema AFTER they confirm. When they confirm, you MUST output the <tool_call>{"tool":"create_schema", "args": {...}}</tool_call> tag. Do NOT just say "I have created it".
6. Prefer tabular output for lists of data.
7. Keep responses concise. Use markdown headers for multi-section responses.
8. ${mode === "suggest" ? "SUGGESTION MODE: You are in a collaborative design mode. For every action, first propose a detailed plan, present it as structured markdown, and end your message with the exact tag `[SUGGESTION_READY]` to ask for approval." : "NORMAL MODE: Be direct and action-oriented."}

## Privacy & Security
- Only reference data belonging to org ${orgId}. Never mention internal IDs in human-facing text unless asked.
- Do not repeat full conversation history in your responses.
- If the user asks you to access data from another org, refuse politely.`;
}

// ── Tool call parser (robust) ─────────────────────────────────────────────

/**
 * Parses a <tool_call>...</tool_call> block from model output.
 * Returns null if no tool call is found.
 * Returns { parseError: true } if a block exists but JSON is malformed.
 */
function safeParseToolCall(text: string):
  | { tool: string; args: Record<string, unknown> }
  | { parseError: true; raw: string }
  | null {
  const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  if (!match) return null;
  const raw = match[1].trim();
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.tool !== "string") return { parseError: true, raw };
    return { tool: parsed.tool, args: parsed.args ?? {} };
  } catch {
    return { parseError: true, raw };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
    const body = await req.json().catch(() => ({}));

    const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const ctx: AppContext = body.context ?? {};
    const incomingSessionId: string | undefined = body.sessionId;
    const mode: "chat" | "suggest" = body.mode === "suggest" ? "suggest" : "chat";

    // Cap history to last 20 turns to keep token usage bounded
    const history = messages.slice(-20);

    // Resolve or create the persistent session
    const session = await getOrCreateSession(incomingSessionId, user.id, organizationId, mode === "suggest");

    // Persist the latest user message (last in history array)
    const lastUserMsg = history.findLast((m) => m.role === "user");
    if (lastUserMsg) {
      await saveMessage({
        sessionId: session.id,
        role: "user",
        content: lastUserMsg.content,
        position: session.position,
      });
      // Update session title from first user message
      if (session.position === 0) {
        await maybeUpdateTitle(session.id, lastUserMsg.content);
      }
    }

    // Fetch live data snapshot for context
    const snapshot = await fetchDataSnapshot(organizationId, ctx);
    const systemPrompt = buildSystemPrompt(snapshot, ctx, organizationId, user.name ?? user.email, mode);

    // ── First Gemini call ────────────────────────────────────────────────
    const geminiHistory = history.map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      content: m.content,
    }));

    const firstResult = await callGeminiWithFallback(geminiHistory, {
      system: systemPrompt,
      temperature: mode === "suggest" ? 0.6 : 0.4,
      maxOutputTokens: 2048,
    });

    // ── Tool call dispatch ───────────────────────────────────────────────
    const toolCall = safeParseToolCall(firstResult.text);
    let finalText = firstResult.text;
    let modelUsed = firstResult.modelUsed;
    let toolResultMeta: { name: string; result: unknown } | null = null;
    let pendingAction: { tool: string; args: Record<string, unknown>; label: string; risk: string } | null = null;

    if (toolCall && "parseError" in toolCall) {
      // Model returned a malformed tool call — signal UI to show retry
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "parse_error", raw: toolCall.raw }) + "\n"));
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done", modelUsed: firstResult.modelUsed, sessionId: session.id }) + "\n"));
          controller.close();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    if (toolCall && !("parseError" in toolCall)) {
      const toolDef = getToolDef(toolCall.tool);

      if (toolDef?.isWrite) {
        // WRITE TOOL: Do NOT execute. Emit a "pending" event — frontend handles confirmation.
        const label = buildActionLabel(toolCall.tool, toolCall.args);
        pendingAction = { tool: toolCall.tool, args: toolCall.args, label, risk: toolDef.risk };

        // Generate the pre-confirmation message (AI explains what it plans to do)
        const planningResult = await callGeminiWithFallback(
          [
            ...geminiHistory,
            { role: "model" as const, content: firstResult.text },
            { role: "user" as const, content: `[SYSTEM: The tool call "${toolCall.tool}" requires user confirmation. Generate a clear, concise explanation of what you are about to do, what data will be affected, and any irreversible consequences. Do NOT include a tool_call tag in this response.]` },
          ],
          { system: systemPrompt, temperature: 0.2, maxOutputTokens: 512 }
        );
        finalText = planningResult.text;
        modelUsed = planningResult.modelUsed;
      } else if (toolDef) {
        // READ TOOL: Execute immediately
        let toolResultData: unknown;
        let toolError: string | null = null;
        try {
          toolResultData = await executeTool(toolCall.tool, toolCall.args, organizationId, user.id, new URL(req.url).origin);
        } catch (err) {
          toolError = err instanceof Error ? err.message : String(err);
          toolResultData = { error: toolError };
        }

        toolResultMeta = { name: toolCall.tool, result: toolResultData };

        // Second Gemini pass to format the result for the user
        const toolCtx = `[Tool "${toolCall.tool}" executed and returned the following result. Format it as a clear, well-structured markdown response. Use tables for list data. Do NOT include another tool_call tag in this response. If you need to call another tool to complete the user's request, explain what you will do next and include the exact tag \`[SUGGESTION_READY]\` so the user can click 'Continue'.]\n\nResult:\n${JSON.stringify(toolResultData, null, 2)}${toolError ? `\n\nError: ${toolError}` : ""}`;
        const secondResult = await callGeminiWithFallback(
          [...geminiHistory, { role: "model" as const, content: firstResult.text }, { role: "user" as const, content: toolCtx }],
          { system: systemPrompt, temperature: 0.3, maxOutputTokens: 2048 }
        );
        finalText = secondResult.text;
        modelUsed = secondResult.modelUsed;
      }
    }

    // Clean the tool_call tag from final text (UI doesn't need to see raw tags)
    finalText = finalText.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();

    // Persist assistant message
    await saveMessage({
      sessionId: session.id,
      role: "assistant",
      content: finalText,
      position: session.position + 1,
      toolName: toolResultMeta?.name ?? pendingAction?.tool,
      toolResult: toolResultMeta?.result,
      modelUsed,
    });

    // ── Stream response ──────────────────────────────────────────────────
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const enqueue = (obj: object) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

        // IMPORTANT: Emit structural events (tool result / pending action) FIRST,
        // before any text tokens. This prevents the frontend from flashing
        // partial text that gets replaced once the event is processed.
        if (toolResultMeta) {
          enqueue({ type: "tool", name: toolResultMeta.name, result: toolResultMeta.result });
        }
        if (pendingAction) {
          enqueue({ type: "pending", ...pendingAction, sessionId: session.id });
        }

        // Skip streaming text for pending write actions — the UI only shows the
        // explanation text which will come through as tokens below.
        // For empty final text (e.g. pure tool dispatch), emit done immediately.
        const words = finalText ? finalText.split(" ").filter(Boolean) : [];
        if (words.length === 0) {
          enqueue({ type: "done", modelUsed, sessionId: session.id });
          controller.close();
          return;
        }

        // Stream text word-by-word for progressive rendering feel
        let i = 0;
        function sendNext() {
          if (i >= words.length) {
            enqueue({ type: "done", modelUsed, sessionId: session.id });
            controller.close();
            return;
          }
          // Send 5 words at a time, re-adding space between them
          const chunk = words.slice(i, i + 5).join(" ") + (i + 5 < words.length ? " " : "");
          enqueue({ type: "token", text: chunk });
          i += 5;
          setTimeout(sendNext, 0);
        }
        sendNext();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Session-Id": session.id,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("[assistant/chat] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Assistant error" },
      { status: 500 }
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Generates a human-readable label for a write action (shown in confirmation card). */
function buildActionLabel(tool: string, args: Record<string, unknown>): string {
  const labels: Record<string, (a: Record<string, unknown>) => string> = {
    create_schema:       (a) => `Create schema "${a.name ?? "new schema"}"`,
    update_schema:       (a) => `Update schema ${a.schemaId}`,
    delete_schema:       (a) => `Delete schema ${a.schemaId}`,
    add_schema_field:    (a) => `Add field "${a.name}" to schema ${a.schemaId}`,
    create_dataset:      (a) => `Create dataset "${a.name ?? "new dataset"}"`,
    update_dataset:      (a) => `Update dataset ${a.datasetId}`,
    delete_dataset:      (a) => `Delete dataset ${a.datasetId} (PERMANENT — all records lost)`,
    trigger_scan:        (a) => `Trigger ${a.mode ?? "incremental"} scan on source ${a.sourceId}`,
    pause_source:        (a) => `Pause source ${a.sourceId}`,
    resume_source:       (a) => `Resume source ${a.sourceId}`,
    retry_job:           (a) => `Retry job ${a.jobId}`,
    cancel_job:          (a) => `Cancel job ${a.jobId}`,
    update_member_role:  (a) => `Change ${a.email}'s role to "${a.role}"`,
  };
  return labels[tool]?.(args) ?? `Execute ${tool}`;
}
