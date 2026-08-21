// PATCH /api/organizations/[id]/members/[memberId] — update role/status.
//   Requires: admin+ role. Owners cannot be demoted by non-owners.
// DELETE /api/organizations/[id]/members/[memberId] — remove member.
//   Requires: admin+ role. Cannot remove the last owner.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeMember } from "@/lib/serialize";

const ROLE_LEVEL: Record<string, number> = {
  owner: 5, admin: 4, manager: 3, member: 2, viewer: 1,
};

async function verifyOrgAccess(organizationId: string, minRole: string = "admin") {
  const user = await getCurrentUser();
  const membership = user.memberships.find((m) => m.organizationId === organizationId);
  if (!membership || membership.status !== "active") {
    return { error: NextResponse.json({ error: "Organization not found" }, { status: 404 }), user: null, membership: null };
  }
  if ((ROLE_LEVEL[membership.role] ?? 0) < (ROLE_LEVEL[minRole] ?? 0)) {
    return {
      error: NextResponse.json(
        { error: `This action requires ${minRole} role or higher. You are a ${membership.role}.` },
        { status: 403 }
      ),
      user: null,
      membership: null,
    };
  }
  return { error: null, user, membership };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: organizationId, memberId } = await params;
    const access = await verifyOrgAccess(organizationId, "admin");
    if (access.error || !access.user || !access.membership) return access.error;
    const { user, membership: actorMembership } = access;

    const body = await req.json().catch(() => ({}));
    const data: { role?: string; status?: string } = {};
    if (typeof body?.role === "string") data.role = body.role;
    if (typeof body?.status === "string") data.status = body.status;

    const before = await db.organizationMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
    if (!before || before.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // Non-owners cannot modify owners
    if (before.role === "owner" && actorMembership.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can modify other owners" },
        { status: 403 }
      );
    }

    const member = await db.organizationMember.update({
      where: { id: memberId },
      data,
      include: { user: true },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "member",
      entityId: memberId,
      before: { role: before.role, status: before.status },
      after: data,
    });

    return NextResponse.json(serializeMember(member));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update member" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: organizationId, memberId } = await params;
    const access = await verifyOrgAccess(organizationId, "admin");
    if (access.error || !access.user || !access.membership) return access.error;
    const { user, membership: actorMembership } = access;

    const existing = await db.organizationMember.findUnique({
      where: { id: memberId },
    });
    if (!existing || existing.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // Non-owners cannot remove owners
    if (existing.role === "owner" && actorMembership.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can remove other owners" },
        { status: 403 }
      );
    }

    // Cannot remove the last owner
    if (existing.role === "owner") {
      const ownerCount = await db.organizationMember.count({
        where: { organizationId, role: "owner", status: "active" },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last owner of the organization" },
          { status: 400 }
        );
      }
    }

    await db.organizationMember.delete({ where: { id: memberId } });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "delete",
      entity: "member",
      entityId: memberId,
      before: { userId: existing.userId, role: existing.role },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove member" },
      { status: 500 }
    );
  }
}
