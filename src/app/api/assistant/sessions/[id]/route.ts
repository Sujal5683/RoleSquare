/**
 * GET    /api/assistant/sessions/[id]
 *   Returns a session with its full decrypted message history.
 *   Only accessible by the owning user.
 *
 * DELETE /api/assistant/sessions/[id]
 *   Soft-deletes a session (sets deletedAt). Does not hard-delete messages
 *   immediately — they cascade when the session is eventually pruned.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { safeDecryptContent } from "../../crypto";

// ── Ownership guard ───────────────────────────────────────────────────────

/**
 * Loads a session and verifies it belongs to the caller.
 * Returns null if not found, expired, deleted, or owned by another user.
 */
async function requireOwnedSession(
  id: string,
  userId: string,
  organizationId: string
) {
  return db.assistantSession.findFirst({
    where: {
      id,
      userId,           // Strict ownership: must be the requesting user
      organizationId,   // Strict org scope
      deletedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}

// ── GET — session with messages ───────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");

    const session = await requireOwnedSession(id, user.id, organizationId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Load messages in order
    const rawMessages = await db.assistantMessage.findMany({
      where: { sessionId: id },
      orderBy: { position: "asc" },
      select: {
        id: true,
        role: true,
        content: true,        // Encrypted — decrypt below
        toolName: true,
        toolResult: true,     // Encrypted — decrypt below
        modelUsed: true,
        undoToken: true,
        createdAt: true,
        position: true,
      },
    });

    // Decrypt message content for the response
    // safeDecryptContent returns null for keys that can't decrypt (rotation safety)
    const messages = rawMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: safeDecryptContent(m.content) ?? "[Message unavailable]",
      toolName: m.toolName,
      toolResult: m.toolResult ? (() => {
        const raw = safeDecryptContent(m.toolResult);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
      })() : null,
      modelUsed: m.modelUsed,
      undoToken: m.undoToken,
      timestamp: m.createdAt.getTime(),
    }));

    return NextResponse.json({
      id: session.id,
      title: session.title === "New conversation" ? session.title : (safeDecryptContent(session.title) ?? "New conversation"),
      suggestionMode: session.suggestionMode,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      messages,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("[assistant/sessions/[id]] GET error:", err);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}

// ── DELETE — soft delete session ──────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");

    const session = await requireOwnedSession(id, user.id, organizationId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await db.assistantSession.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
