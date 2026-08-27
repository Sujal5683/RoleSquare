// GET  /api/organizations/[id]/invitations — list all invitations for an org.
//   Requires: manager+ role.
// POST /api/organizations/[id]/invitations — send an invitation to a new member.
//   Body: { email, role? }
//   Requires: manager+ role.
//
// This REPLACES the old approach of directly creating OrganizationMember{status:"invited"}.
// Invited users now stay out of the org until they accept via /api/invitations/accept.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeInvitation } from "@/lib/serialize";

const ROLE_LEVEL: Record<string, number> = {
  owner: 5, admin: 4, manager: 3, member: 2, viewer: 1,
};

async function requireManagerAccess(organizationId: string) {
  const user = await getCurrentUser();
  const membership = user.memberships.find(
    (m) => m.organizationId === organizationId && m.status === "active"
  );
  if (!membership) {
    throw new AuthError("Organization not found", 404);
  }
  if ((ROLE_LEVEL[membership.role] ?? 0) < ROLE_LEVEL.manager) {
    throw new AuthError(
      `This action requires manager role or higher. You are a ${membership.role}.`,
      403
    );
  }
  return { user, membership };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
    await requireManagerAccess(organizationId);

    const invitations = await db.invitation.findMany({
      where: { organizationId },
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
    const { user } = await requireManagerAccess(organizationId);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const role = String(body?.role ?? "member");

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const { membership } = await requireManagerAccess(organizationId);
    const inviterLevel = ROLE_LEVEL[membership.role] ?? 0;
    const requestedLevel = ROLE_LEVEL[role] ?? 0;

    if (requestedLevel > inviterLevel) {
      return NextResponse.json(
        { error: `You cannot invite someone with a higher role than your own. You are a ${membership.role}.` },
        { status: 403 }
      );
    }

    // Check if the user is already an active member
    const targetUser = await db.user.findUnique({ where: { email } });
    if (targetUser) {
      const existingMember = await db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: targetUser.id } },
      });
      if (existingMember && existingMember.status === "active") {
        return NextResponse.json(
          { error: "User is already an active member of this organization" },
          { status: 409 }
        );
      }
    }

    // Upsert the invitation (reset if previously cancelled/expired)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days

    let invitation;
    const existingInvite = await db.invitation.findUnique({
      where: { organizationId_email: { organizationId, email } },
    });

    if (existingInvite) {
      // Resend: regenerate token and reset expiry
      invitation = await db.invitation.update({
        where: { organizationId_email: { organizationId, email } },
        data: {
          role,
          status: "pending",
          token: (await import("crypto")).randomUUID(),
          expiresAt,
          invitedBy: user.id,
        },
        include: { organization: true, inviter: true },
      });
    } else {
      invitation = await db.invitation.create({
        data: {
          organizationId,
          email,
          role,
          invitedBy: user.id,
          expiresAt,
        },
        include: { organization: true, inviter: true },
      });
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "member",
      entityId: invitation.id,
      after: { email, role, status: "pending", invitationId: invitation.id },
      reason: "send_invitation",
    });

    return NextResponse.json(serializeInvitation(invitation), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send invitation" },
      { status: 500 }
    );
  }
}
