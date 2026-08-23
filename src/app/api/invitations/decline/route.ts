// POST /api/invitations/decline — decline a pending invitation by token.
//
// Body: { token: string }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, AuthError, authErrorResponse } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const invitation = await db.invitation.findUnique({ where: { token } });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: `Invitation has already been ${invitation.status}` },
        { status: 409 }
      );
    }

    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "This invitation was sent to a different email address" },
        { status: 403 }
      );
    }

    await db.invitation.update({
      where: { token },
      data: { status: "cancelled" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to decline invitation" },
      { status: 500 }
    );
  }
}
