// GET /api/organizations/[id] — organization detail.
// PATCH /api/organizations/[id] — update name / plan.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeOrganization } from "@/lib/serialize";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const isMember = user.organizations.some((o) => o.id === id);
    if (!isMember) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }
    const org = await db.organization.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      serializeOrganization(org, org._count?.members ?? 0)
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load org" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const isMember = user.organizations.some((o) => o.id === id);
    if (!isMember) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const data: { name?: string; plan?: string } = {};
    if (typeof body?.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (typeof body?.plan === "string" && body.plan.trim()) {
      data.plan = body.plan.trim();
    }

    const before = await db.organization.findUnique({ where: { id } });
    const org = await db.organization.update({
      where: { id },
      data,
      include: { _count: { select: { members: true } } },
    });

    await logAudit({
      organizationId: id,
      actorId: user.id,
      action: "update",
      entity: "organization",
      entityId: id,
      before,
      after: { id: org.id, name: org.name, plan: org.plan },
    });

    return NextResponse.json(
      serializeOrganization(org, org._count?.members ?? 0)
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update org" },
      { status: 500 }
    );
  }
}
