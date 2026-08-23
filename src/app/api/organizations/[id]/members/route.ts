// GET /api/organizations/[id]/members — list members with user info.
//   Requires: active member of the org (viewer+).
// POST /api/organizations/[id]/members — DEPRECATED: now proxies to
//   /api/organizations/[id]/invitations. Use that endpoint to invite members.
//   Kept for backward compat with older client code.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeMember } from "@/lib/serialize";
import { dispatchWebhookEvent } from "@/lib/webhook-dispatcher";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const membership = user.memberships.find((m) => m.organizationId === id);
    if (!membership || membership.status !== "active") {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }
    const members = await db.organizationMember.findMany({
      where: { organizationId: id, status: "active" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(members.map(serializeMember));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list members" },
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
    const user = await getCurrentUser();
    const membership = user.memberships.find((m) => m.organizationId === organizationId);
    if (!membership || membership.status !== "active") {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const ROLE_LEVEL: Record<string, number> = {
      owner: 5, admin: 4, manager: 3, member: 2, viewer: 1,
    };
    if ((ROLE_LEVEL[membership.role] ?? 0) < ROLE_LEVEL.manager) {
      return NextResponse.json(
        { error: `Inviting members requires manager role or higher. You are a ${membership.role}.` },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const role = String(body?.role ?? "member");

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Check if already an active member
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

    // Create an Invitation (proper flow — no longer creating member directly)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days

    let invitation;
    const existingInvite = await db.invitation.findUnique({
      where: { organizationId_email: { organizationId, email } },
    });

    if (existingInvite) {
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
      after: { email, role, status: "pending (invitation sent)", invitationId: invitation.id },
    });

    dispatchWebhookEvent({
      event: "member.invited",
      organizationId,
      data: { invitationId: invitation.id, email, role, invitedBy: user.id },
    });

    // Return a member-like shape for backward compat with old client code
    return NextResponse.json(
      {
        id: invitation.id,
        userId: null,
        role: invitation.role,
        status: "invited",
        user: { id: null, email: invitation.email, name: invitation.email.split("@")[0], avatarUrl: null, role: "user" },
        createdAt: invitation.createdAt instanceof Date ? invitation.createdAt.toISOString() : invitation.createdAt,
        _invitationId: invitation.id,
        _invitationToken: invitation.token,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to invite member" },
      { status: 500 }
    );
  }
}

