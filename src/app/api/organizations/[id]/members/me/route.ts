import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeMember } from "@/lib/serialize";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
    const user = await getCurrentUser();

    const membership = user.memberships.find(
      (m) => m.organizationId === organizationId
    );

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this organization." },
        { status: 404 }
      );
    }

    if (membership.status !== "invited") {
      return NextResponse.json(
        { error: `Cannot update membership in status: ${membership.status}` },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const newStatus = String(body.status ?? "");

    if (newStatus !== "active" && newStatus !== "rejected") {
      return NextResponse.json(
        { error: "Status must be 'active' or 'rejected'" },
        { status: 400 }
      );
    }

    if (newStatus === "rejected") {
      // Remove the member record completely
      await db.organizationMember.delete({
        where: { id: membership.id },
      });

      await logAudit({
        organizationId,
        actorId: user.id,
        action: "delete",
        entity: "member",
        entityId: membership.id,
        after: { status: "rejected" },
      });

      return NextResponse.json({ success: true });
    }

    // Accept the invite
    const updated = await db.organizationMember.update({
      where: { id: membership.id },
      data: { status: "active" },
      include: { user: true },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "member",
      entityId: membership.id,
      after: { status: "active" },
    });

    return NextResponse.json(serializeMember(updated));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update membership" },
      { status: 500 }
    );
  }
}
