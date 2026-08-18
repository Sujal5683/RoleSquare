// PATCH /api/organizations/[id]/members/[memberId] — update role/status.
// DELETE /api/organizations/[id]/members/[memberId] — remove member.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeMember } from "@/lib/serialize";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: organizationId, memberId } = await params;
    const user = await getCurrentUser();
    if (!user.organizations.some((o) => o.id === organizationId)) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }
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
    const user = await getCurrentUser();
    if (!user.organizations.some((o) => o.id === organizationId)) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }
    const existing = await db.organizationMember.findUnique({
      where: { id: memberId },
    });
    if (!existing || existing.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove member" },
      { status: 500 }
    );
  }
}
