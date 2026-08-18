// GET /api/organizations/[id]/members — list members with user info.
// POST /api/organizations/[id]/members — invite member. Looks up user by
//   email; creates an OrganizationMember row with status=invited.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeMember } from "@/lib/serialize";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user.organizations.some((o) => o.id === id)) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }
    const members = await db.organizationMember.findMany({
      where: { organizationId: id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(members.map(serializeMember));
  } catch (err) {
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
    if (!user.organizations.some((o) => o.id === organizationId)) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const role = String(body?.role ?? "member");
    if (!email) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }

    // Find or create the user record (mock invite flow).
    let target = await db.user.findUnique({ where: { email } });
    if (!target) {
      target = await db.user.create({
        data: { email, name: email.split("@")[0] },
      });
    }

    const existing = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: target.id } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User is already a member or has a pending invite" },
        { status: 409 }
      );
    }

    const member = await db.organizationMember.create({
      data: {
        organizationId,
        userId: target.id,
        role,
        status: "invited",
        invitedBy: user.id,
      },
      include: { user: true },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "member",
      entityId: member.id,
      after: { email, role, status: "invited" },
    });

    return NextResponse.json(serializeMember(member), { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to invite member" },
      { status: 500 }
    );
  }
}
