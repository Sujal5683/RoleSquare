// GET /api/organizations — list organizations the current user belongs to
//   with memberCount.
// POST /api/organizations — create a new organization (current user becomes
//   owner).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeOrganization } from "@/lib/serialize";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const orgIds = user.memberships.map((m) => m.organizationId);
    const orgs = await db.organization.findMany({
      where: { id: { in: orgIds } },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(
      orgs.map((o) => {
        const mem = user.memberships.find((m) => m.organizationId === o.id);
        return {
          ...serializeOrganization(o, o._count?.members ?? 0),
          userStatus: mem?.status,
        };
      })
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list orgs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const slug =
      String(body?.slug ?? "").trim() ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const plan = String(body?.plan ?? "free");

    if (!name || !slug) {
      return NextResponse.json(
        { error: "name and slug are required" },
        { status: 400 }
      );
    }

    const org = await db.organization.create({
      data: {
        name,
        slug,
        plan,
        createdBy: user.id,
        members: {
          create: { userId: user.id, role: "owner", status: "active" },
        },
      },
      include: { _count: { select: { members: true } } },
    });

    await logAudit({
      organizationId: org.id,
      actorId: user.id,
      action: "create",
      entity: "organization",
      entityId: org.id,
      after: { id: org.id, name: org.name, slug: org.slug, plan: org.plan },
    });

    return NextResponse.json(
      serializeOrganization(org, org._count?.members ?? 0),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create org" },
      { status: 500 }
    );
  }
}
