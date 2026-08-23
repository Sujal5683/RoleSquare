// GET /api/invitations — list pending invitations for the current user's email.
// Also accepts ?organizationId=... to list invitations for a specific org (manager+ only).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, AuthError, authErrorResponse } from "@/lib/auth";
import { serializeInvitation } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const url = new URL(req.url);
    const orgId = url.searchParams.get("organizationId");

    if (orgId) {
      // Return invitations for a specific org (requires manager+ in that org)
      const membership = user.memberships.find(
        (m) => m.organizationId === orgId && m.status === "active"
      );
      if (!membership) {
        return NextResponse.json({ error: "Organization not found" }, { status: 404 });
      }
      const ROLE_LEVEL: Record<string, number> = {
        owner: 5, admin: 4, manager: 3, member: 2, viewer: 1,
      };
      if ((ROLE_LEVEL[membership.role] ?? 0) < ROLE_LEVEL.manager) {
        return NextResponse.json(
          { error: "Viewing invitations requires manager role or higher." },
          { status: 403 }
        );
      }
      const invitations = await db.invitation.findMany({
        where: { organizationId: orgId },
        include: { organization: true, inviter: true },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(invitations.map(serializeInvitation));
    }

    // Return invitations for the current user's email (any org)
    const invitations = await db.invitation.findMany({
      where: {
        email: user.email,
        status: "pending",
      },
      include: { organization: true, inviter: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(invitations.map(serializeInvitation));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list invitations" },
      { status: 500 }
    );
  }
}
