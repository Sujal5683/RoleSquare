/**
 * GET  /api/assistant/sessions
 *   Returns the current user's assistant sessions from the last 7 days,
 *   ordered by most recently updated. Expired and deleted sessions are excluded.
 *   Triggers lazy pruning of sessions past their expiresAt.
 *
 * POST /api/assistant/sessions
 *   Creates a new assistant session for the current user+org.
 *   Returns the new session ID which the frontend uses for the current conversation.
 *
 * SECURITY: All queries are filtered by both userId AND organizationId.
 * A user can never see sessions from another user or another org.
 */


export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { db } from "@/lib/db";

// ── Session list ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
    const now = new Date();

    // Lazy pruning: soft-delete all sessions for this user that are past expiresAt
    // We do this in the background (fire-and-forget) to keep GET fast.
    db.assistantSession.updateMany({
      where: {
        userId: user.id,
        organizationId,
        expiresAt: { lt: now },
        deletedAt: null,
      },
      data: { deletedAt: now },
    }).catch(() => {}); // Non-critical — never block the response

    // Fetch active sessions for this user in this org
    const sessions = await db.assistantSession.findMany({
      where: {
        userId: user.id,              // Strict: only this user's sessions
        organizationId,               // Strict: only this org
        deletedAt: null,              // Exclude soft-deleted
        expiresAt: { gt: now },       // Exclude expired
      },
      orderBy: { updatedAt: "desc" }, // Most recent first
      select: {
        id: true,
        title: true,
        suggestionMode: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json(
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        suggestionMode: s.suggestionMode,
        messageCount: s._count.messages,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        expiresAt: s.expiresAt,
      }))
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}

// ── Create session ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
    const body = await req.json().catch(() => ({}));
    const suggestionMode = !!body.suggestionMode;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    const session = await db.assistantSession.create({
      data: {
        userId: user.id,
        organizationId,
        suggestionMode,
        expiresAt,
      },
      select: { id: true, title: true, createdAt: true, expiresAt: true },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
