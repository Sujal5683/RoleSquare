// POST /api/invitations/accept — accept a pending invitation by token.
//
// Body: { token: string }
//
// Flow:
//  1. Find Invitation by token, verify pending & not expired
//  2. Resolve the current session user (must match invitation email)
//  3. Upsert OrganizationMember { status: "active", role: invitation.role }
//  4. Mark Invitation { status: "accepted", acceptedAt: now }
//  5. Return the new membership

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, AuthError, authErrorResponse } from "@/lib/auth";
import { serializeMember } from "@/lib/serialize";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    // Find the invitation
    const invitation = await db.invitation.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found or invalid token" }, { status: 404 });
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: `Invitation has already been ${invitation.status}` },
        { status: 409 }
      );
    }

    if (new Date() > invitation.expiresAt) {
      // Mark as expired
      await db.invitation.update({
        where: { token },
        data: { status: "expired" },
      });
      return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
    }

    // Email must match (case-insensitive)
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "This invitation was sent to a different email address" },
        { status: 403 }
      );
    }

    const organizationId = invitation.organizationId;
    const now = new Date();

    // Upsert the OrganizationMember row
    const existingMember = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
    });

    let member;
    if (existingMember) {
      member = await db.organizationMember.update({
        where: { organizationId_userId: { organizationId, userId: user.id } },
        data: { status: "active", role: invitation.role },
        include: { user: true },
      });
    } else {
      member = await db.organizationMember.create({
        data: {
          organizationId,
          userId: user.id,
          role: invitation.role,
          status: "active",
          invitedBy: invitation.invitedBy,
        },
        include: { user: true },
      });
    }

    // Mark invitation accepted
    await db.invitation.update({
      where: { token },
      data: { status: "accepted", acceptedAt: now },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "member",
      entityId: member.id,
      after: { email: user.email, role: invitation.role, status: "active", via: "invitation" },
      reason: "accept_invitation",
    });

    return NextResponse.json(serializeMember(member));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
