// POST /api/assistant/chat — Workspace AI Assistant backend.
//
// Receives a conversation history + app context, builds a tool-aware system
// prompt, calls Gemini via the fallback chain, parses any tool calls from
// the model's response, executes them against real app data, then makes a
// second Gemini call to generate the final user-facing response.
//
// Streams responses as newline-delimited JSON so the panel can render
// tokens progressively.
//
// Tool call format the model uses in its response:
//   <tool_call>{"tool":"list_sources","args":{}}</tool_call>
//
// After tool execution the result is appended to the conversation and the
// model produces a final human-readable reply. The UI receives:
//   {"type":"token","text":"..."}      — streamed text chunk
//   {"type":"tool","name":"...","result":{...}} — tool execution result
//   {"type":"done","modelUsed":"..."}  — final marker

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { callGeminiWithFallback } from "@/lib/gemini";
import { db } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AppContext {
  view?: string;
  orgId?: string;
  sourceId?: string | null;
  datasetId?: string | null;
  schemaId?: string | null;
  userName?: string;
  userEmail?: string;
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: AppContext, orgId: string): string {
  return `You are the Workspace Intelligence Platform AI Assistant — a powerful, context-aware agent embedded in the app. You can answer questions, navigate the UI, and execute actions on behalf of the user.

## Current App Context
- Active view: ${ctx.view ?? "unknown"}
- Organization ID: ${orgId}
- User: ${ctx.userName ?? "unknown"} (${ctx.userEmail ?? ""})
${ctx.sourceId ? `- Selected Source ID: ${ctx.sourceId}` : ""}
${ctx.datasetId ? `- Selected Dataset ID: ${ctx.datasetId}` : ""}
${ctx.schemaId ? `- Selected Schema ID: ${ctx.schemaId}` : ""}

## Available Tools
You may call tools by embedding a tool call in your response using this EXACT format:
<tool_call>{"tool":"TOOL_NAME","args":{...}}</tool_call>

Available tools:
- navigate: {"view": string} — Navigate to a view. Views: dashboard, sources, datasets, schema-builder, ai-studio, usage, members, sharing, audit, settings, organizations
- get_dashboard: {} — Get KPI snapshot (sources, records, jobs, review queue)
- list_sources: {"limit":10} — List sources with status and last-run info
- trigger_scan: {"sourceId": string, "mode": "incremental"|"historical"} — Trigger a Gmail scan
- list_datasets: {"limit":10} — List datasets
- get_dataset_records: {"datasetId": string, "limit": 10} — Fetch records from a dataset
- list_schemas: {"limit":10} — List schemas
- test_extraction: {"schemaId": string, "sampleText": string} — Run AI extraction test
- list_ai_jobs: {"type":"GMAIL_SCAN"|"AI_EXTRACTION"|"...", "status":"queued"|"running"|"failed", "limit":20} — List AI jobs
- retry_job: {"jobId": string} — Retry a failed job
- cancel_job: {"jobId": string} — Cancel a queued job
- list_members: {} — List org members
- get_usage: {} — Get token/cost usage stats
- search: {"q": string} — Full-text search across the app
- get_model_status: {} — Get live Gemini model chain status

## Behavior Rules
1. NEVER repeat context or summaries from previous messages. Just continue the conversation.
2. When intent is ambiguous or you need clarification, end your message with a line starting with "CLARIFY:" followed by your question. Do NOT take action until clarified.
3. For destructive actions (delete, cancel, revoke), always ask for confirmation with: "CONFIRM: <action description>" before executing.
4. Keep responses concise. Use markdown. Use tables for lists of data. Use bullet points for steps.
5. You can call AT MOST ONE tool per turn. If multiple tools are needed, execute sequentially across turns.
6. After a tool executes, present the result clearly in structured format — do not just dump raw JSON.
7. If a tool fails, explain what went wrong and suggest alternatives.
8. You have full knowledge of the platform's schema: Sources (Gmail/Drive pipelines), Schemas (field definitions), Datasets (extracted records), AI Jobs (background processing).`;
}

// ── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  organizationId: string
): Promise<unknown> {
  switch (toolName) {
    case "navigate":
      // Navigation is handled client-side — we just echo the intent
      return { navigateTo: args.view, status: "ok" };

    case "get_dashboard": {
      const [sources, datasets, jobs, records] = await Promise.all([
        db.source.count({ where: { organizationId } }),
        db.dataset.count({ where: { organizationId } }),
        db.aiJob.count({ where: { organizationId, status: { in: ["queued", "running"] } } }),
        db.datasetRecord.count({
          where: { dataset: { organizationId }, status: "needs_review" },
        }),
      ]);
      return { activeSources: sources, datasets, runningJobs: jobs, reviewQueue: records };
    }

    case "list_sources": {
      const limit = Number(args.limit ?? 10);
      const sources = await db.source.findMany({
        where: { organizationId },
        take: Math.min(limit, 50),
        orderBy: { createdAt: "desc" },
        select: {
          id: true, name: true, sourceType: true, status: true,
          runState: true, lastRunAt: true, scheduleMode: true,
        },
      });
      return sources;
    }

    case "trigger_scan": {
      const sourceId = String(args.sourceId ?? "");
      const mode = args.mode === "historical" ? "historical" : "incremental";
      const source = await db.source.findUnique({ where: { id: sourceId } });
      if (!source || source.organizationId !== organizationId) {
        throw new Error(`Source ${sourceId} not found`);
      }
      const now = new Date();
      const run = await db.sourceRun.create({
        data: { sourceId, status: "running", mode, progress: 0, startedAt: now },
      });
      await db.aiJob.create({
        data: {
          organizationId,
          type: "GMAIL_SCAN",
          status: "queued",
          payload: JSON.stringify({ sourceId, runId: run.id, mode, triggeredBy: "assistant" }),
          progress: 0,
        },
      });
      await db.source.update({
        where: { id: sourceId },
        data: { lastRunAt: now, runState: "scanning" },
      });
      const { ensureJobRunnerStarted } = await import("@/lib/job-runner");
      ensureJobRunnerStarted();
      return { runId: run.id, sourceId, mode, status: "queued" };
    }

    case "list_datasets": {
      const limit = Number(args.limit ?? 10);
      const datasets = await db.dataset.findMany({
        where: { organizationId },
        take: Math.min(limit, 50),
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, recordCount: true, createdAt: true },
      });
      return datasets;
    }

    case "get_dataset_records": {
      const datasetId = String(args.datasetId ?? "");
      const limit = Number(args.limit ?? 10);
      const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
      if (!dataset || dataset.organizationId !== organizationId) {
        throw new Error(`Dataset ${datasetId} not found`);
      }
      const records = await db.datasetRecord.findMany({
        where: { datasetId },
        take: Math.min(limit, 50),
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, confidence: true, createdAt: true },
      });
      return { datasetId, name: dataset.name, records };
    }

    case "list_schemas": {
      const limit = Number(args.limit ?? 10);
      const schemas = await db.schema.findMany({
        where: { organizationId },
        take: Math.min(limit, 50),
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, version: true, createdAt: true },
      });
      return schemas;
    }

    case "list_ai_jobs": {
      const limit = Number(args.limit ?? 20);
      const statusFilter = typeof args.status === "string" ? args.status : undefined;
      const typeFilter = typeof args.type === "string" ? args.type : undefined;
      const jobs = await db.aiJob.findMany({
        where: {
          organizationId,
          ...(typeFilter ? { type: typeFilter } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
        },
        take: Math.min(limit, 50),
        orderBy: { createdAt: "desc" },
        select: {
          id: true, type: true, status: true, progress: true,
          attempts: true, errorMessage: true, createdAt: true,
        },
      });
      return jobs;
    }

    case "retry_job": {
      const jobId = String(args.jobId ?? "");
      const job = await db.aiJob.findUnique({ where: { id: jobId } });
      if (!job || job.organizationId !== organizationId) throw new Error(`Job ${jobId} not found`);
      await db.aiJob.update({
        where: { id: jobId },
        data: { status: "queued", attempts: 0, errorMessage: null },
      });
      const { ensureJobRunnerStarted } = await import("@/lib/job-runner");
      ensureJobRunnerStarted();
      return { jobId, status: "re-queued" };
    }

    case "cancel_job": {
      const jobId = String(args.jobId ?? "");
      const job = await db.aiJob.findUnique({ where: { id: jobId } });
      if (!job || job.organizationId !== organizationId) throw new Error(`Job ${jobId} not found`);
      await db.aiJob.update({ where: { id: jobId }, data: { status: "cancelled" } });
      return { jobId, status: "cancelled" };
    }

    case "list_members": {
      const members = await db.organizationMember.findMany({
        where: { organizationId },
        include: { user: { select: { email: true, name: true } } },
        take: 50,
      });
      return members.map((m) => ({
        id: m.id, role: m.role, status: m.status,
        email: m.user.email, name: m.user.name,
      }));
    }

    case "get_usage": {
      const metrics = await db.usageMetric.findMany({
        where: { organizationId },
        orderBy: { periodStart: "desc" },
        take: 10,
      });
      return metrics.map((m) => ({
        metric: m.metricType, value: m.value,
        period: `${m.periodStart} – ${m.periodEnd}`,
      }));
    }

    case "search": {
      const q = String(args.q ?? "").toLowerCase().trim();
      if (!q) return { results: [] };
      const [sources, datasets, schemas] = await Promise.all([
        db.source.findMany({
          where: { organizationId, name: { contains: q, mode: "insensitive" } },
          take: 5, select: { id: true, name: true, sourceType: true },
        }),
        db.dataset.findMany({
          where: { organizationId, name: { contains: q, mode: "insensitive" } },
          take: 5, select: { id: true, name: true, recordCount: true },
        }),
        db.schema.findMany({
          where: { organizationId, name: { contains: q, mode: "insensitive" } },
          take: 5, select: { id: true, name: true, version: true },
        }),
      ]);
      return {
        results: [
          ...sources.map((s) => ({ type: "source", ...s })),
          ...datasets.map((d) => ({ type: "dataset", ...d })),
          ...schemas.map((s) => ({ type: "schema", ...s })),
        ],
      };
    }

    case "get_model_status": {
      const { getModelChainStatus } = await import("@/lib/gemini");
      return getModelChainStatus();
    }

    case "test_extraction": {
      const { extractWithLLM } = await import("@/lib/extraction");
      const schemaId = String(args.schemaId ?? "");
      const sampleText = String(args.sampleText ?? "");
      const schema = await db.schema.findUnique({
        where: { id: schemaId },
        include: { fields: true },
      });
      if (!schema || schema.organizationId !== organizationId) {
        throw new Error(`Schema ${schemaId} not found`);
      }
      const result = await extractWithLLM({
        fields: schema.fields.map((f) => ({
          name: f.name, type: f.type,
          description: f.description, instructions: f.instructions,
          required: f.required,
          options: f.options ? JSON.parse(f.options) : null,
        })),
        sourceText: sampleText,
        systemOverride: schema.promptTemplate ?? undefined,
      });
      return { fieldsExtracted: result.fields.length, overallConfidence: result.overallConfidence, modelUsed: result.modelUsed };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ── Tool call parser ─────────────────────────────────────────────────────────

function parseToolCall(text: string): { tool: string; args: Record<string, unknown> } | null {
  const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (typeof parsed.tool !== "string") return null;
    return { tool: parsed.tool, args: parsed.args ?? {} };
  } catch {
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));

    const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const ctx: AppContext = body.context ?? {};

    // Cap history to last 20 messages to avoid token bloat
    const history = messages.slice(-20);

    const systemPrompt = buildSystemPrompt(
      { ...ctx, userName: user.name ?? user.email, userEmail: user.email },
      organizationId
    );

    // ── First Gemini call ──────────────────────────────────────────────────
    const firstResult = await callGeminiWithFallback(
      history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", content: m.content })),
      { system: systemPrompt, temperature: 0.4, maxOutputTokens: 2048 }
    );

    let finalText = firstResult.text;
    let modelUsed = firstResult.modelUsed;
    let toolResult: { name: string; result: unknown } | null = null;

    // ── Tool execution ─────────────────────────────────────────────────────
    const toolCall = parseToolCall(firstResult.text);
    if (toolCall) {
      let toolResultData: unknown;
      let toolError: string | null = null;

      try {
        toolResultData = await executeTool(toolCall.tool, toolCall.args, organizationId);
      } catch (err) {
        toolError = err instanceof Error ? err.message : String(err);
        toolResultData = { error: toolError };
      }

      toolResult = { name: toolCall.tool, result: toolResultData };

      // Second Gemini call to turn raw tool result into human-readable reply
      const toolContext = `[Tool "${toolCall.tool}" was called and returned the following result. Now generate a helpful, concise, well-structured response for the user based on this result. Do NOT include another tool_call tag.]\n\nTool result:\n${JSON.stringify(toolResultData, null, 2)}${toolError ? `\n\nError: ${toolError}` : ""}`;

      const secondResult = await callGeminiWithFallback(
        [
          ...history.map((m) => ({ role: m.role === "assistant" ? "model" as const : "user" as const, content: m.content })),
          { role: "model" as const, content: firstResult.text },
          { role: "user" as const, content: toolContext },
        ],
        { system: systemPrompt, temperature: 0.3, maxOutputTokens: 2048 }
      );

      finalText = secondResult.text;
      modelUsed = secondResult.modelUsed;
    }

    // ── Stream response ────────────────────────────────────────────────────
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // Send tool result metadata first (if any)
        if (toolResult) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "tool", name: toolResult.name, result: toolResult.result }) + "\n"
            )
          );
        }

        // Stream text in chunks (simulate progressive rendering)
        const words = finalText.split(/(?<=\s)/);
        let i = 0;
        function sendNext() {
          if (i >= words.length) {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "done", modelUsed }) + "\n")
            );
            controller.close();
            return;
          }
          const chunk = words.slice(i, i + 5).join("");
          controller.enqueue(encoder.encode(JSON.stringify({ type: "token", text: chunk }) + "\n"));
          i += 5;
          // Use setTimeout to yield to the event loop between chunks
          setTimeout(sendNext, 0);
        }
        sendNext();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Model-Used": modelUsed,
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
