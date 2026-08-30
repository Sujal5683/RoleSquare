/**
 * POST /api/assistant/confirm
 *
 * Executes a write tool that the user has explicitly confirmed in the chat UI.
 *
 * The chat route emits a "pending" event when the model calls a write tool.
 * The frontend shows a confirmation card (Continue/Skip). On "Continue",
 * it POSTs here with the tool name + args. This route validates auth,
 * executes the tool, logs to audit, and returns an undo token when applicable.
 *
 * SECURITY: Same user+org isolation as the chat route. The sessionId is
 * required so the result message can be persisted to the correct session.
 *
 * Request body:
 *   {
 *     tool:      string                    // tool name to execute
 *     args:      Record<string, unknown>   // tool arguments
 *     sessionId: string                    // assistant session ID
 *     label?:    string                    // human-readable action label (for undo display)
 *   }
 *
 * Response:
 *   {
 *     ok: true
 *     result:     unknown    // tool execution result
 *     undoToken?: string     // base64 undo payload (omitted if undo not supported)
 *     label:      string     // action label for UI display
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { executeTool, getToolDef } from "../tools";
import { encryptContent } from "../crypto";

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
    const body = await req.json().catch(() => ({}));

    const toolName: string = body.tool ?? "";
    const args: Record<string, unknown> = body.args ?? {};
    const sessionId: string = body.sessionId ?? "";
    const label: string = body.label ?? toolName;

    // Validate the tool is known and is actually a write tool
    const toolDef = getToolDef(toolName);
    if (!toolDef) {
      return NextResponse.json({ error: `Unknown tool: ${toolName}` }, { status: 400 });
    }
    if (!toolDef.isWrite) {
      return NextResponse.json({ error: `Tool "${toolName}" is not a write tool — use the chat route` }, { status: 400 });
    }

    // Validate the session belongs to this user (ownership check)
    if (sessionId) {
      const session = await db.assistantSession.findFirst({
        where: { id: sessionId, userId: user.id, organizationId, deletedAt: null },
        select: { id: true, _count: { select: { messages: true } } },
      });
      if (!session) {
        return NextResponse.json({ error: "Session not found or access denied" }, { status: 403 });
      }
    }

    // Execute the write tool
    const result = await executeTool(toolName, args, organizationId, user.id, new URL(req.url).origin);

    // Build undo token where applicable (stateless — encodes before-state in base64)
    const undoToken = buildUndoToken(toolName, args, result);

    // Persist the confirmation result as an assistant message in the session
    if (sessionId) {
      const session = await db.assistantSession.findFirst({
        where: { id: sessionId, userId: user.id, organizationId },
        select: { _count: { select: { messages: true } } },
      });
      const position = session?._count.messages ?? 0;

      await db.assistantMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: encryptContent(`✅ Action completed: ${label}`),
          position,
          toolName,
          toolResult: encryptContent(JSON.stringify(result)),
          undoToken: undoToken ?? null,
        },
      });
    }

    return NextResponse.json({ ok: true, result, undoToken, label });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("[assistant/confirm] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Confirmation failed" },
      { status: 500 }
    );
  }
}

// ── Undo token builder ─────────────────────────────────────────────────────

/**
 * Builds a base64-encoded undo token for reversible write operations.
 *
 * Supported undos:
 *   create_schema  → can delete the created schema
 *   create_dataset → can delete the created dataset
 *   update_schema  → NOT yet supported (before-state not available here)
 *   delete_schema  → re-creates schema from _undoData embedded in result
 *
 * Returns null for operations that are not undoable (e.g. delete_dataset).
 *
 * Token format (base64 JSON):
 *   { action, entity, entityId, before?, expiresAt }
 */
function buildUndoToken(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown
): string | null {
  const res = result as Record<string, unknown>;
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1-hour TTL

  // create_schema → undo = delete the schema
  if (toolName === "create_schema" && typeof res?.id === "string") {
    return btoa(JSON.stringify({ action: "delete_schema", entity: "schema", entityId: res.id, expiresAt }));
  }

  // create_dataset → undo = delete the dataset
  if (toolName === "create_dataset" && typeof res?.id === "string") {
    return btoa(JSON.stringify({ action: "delete_dataset", entity: "dataset", entityId: res.id, expiresAt }));
  }

  // delete_schema → undo = re-create from _undoData embedded in the result
  if (toolName === "delete_schema" && typeof res?._undoData !== "undefined") {
    return btoa(JSON.stringify({
      action: "recreate_schema",
      entity: "schema",
      entityId: res.deletedId,
      before: res._undoData,
      expiresAt,
    }));
  }

  // add_schema_field → undo = delete the new field
  if (toolName === "add_schema_field" && typeof res?.fieldId === "string") {
    return btoa(JSON.stringify({ action: "delete_schema_field", entity: "schema_field", entityId: res.fieldId, expiresAt }));
  }

  // update_member_role → undo = restore the previous role
  if (toolName === "update_member_role" && typeof res?.previousRole === "string") {
    return btoa(JSON.stringify({
      action: "restore_member_role",
      entity: "org_member",
      email: args.email,
      before: { role: res.previousRole },
      expiresAt,
    }));
  }

  // pause_source → undo = resume
  if (toolName === "pause_source" && typeof res?.sourceId === "string") {
    return btoa(JSON.stringify({ action: "resume_source", entity: "source", entityId: res.sourceId, expiresAt }));
  }

  // resume_source → undo = pause
  if (toolName === "resume_source" && typeof res?.sourceId === "string") {
    return btoa(JSON.stringify({ action: "pause_source", entity: "source", entityId: res.sourceId, expiresAt }));
  }

  // delete_dataset, cancel_job, retry_job etc. are not undoable
  return null;
}
