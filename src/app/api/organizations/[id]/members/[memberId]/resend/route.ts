import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: organizationId, memberId } = await params;
    const access = await verifyOrgAccess(organizationId, "admin");
    if (access.error || !access.user || !access.membership) return access.error;
    const { user } = access;

    const existing = await db.organizationMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    if (!existing || existing.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    if (existing.status !== "invited") {
      return NextResponse.json(
        { error: "Cannot resend invitation for a member that is not in the 'invited' state." },
        { status: 400 }
      );
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "member",
      entityId: memberId,
      before: { status: "invited" },
      after: { status: "invited_resent" },
    });

    // In a real application, you would re-trigger your email dispatching webhook or job queue here.
    // e.g. dispatchWebhook("member.invited", { memberId });

    return NextResponse.json({ success: true, message: "Invitation resent" });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resend invitation" },
      { status: 500 }
    );
  }
}
