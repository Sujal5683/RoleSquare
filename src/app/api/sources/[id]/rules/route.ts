// GET /api/sources/[id]/rules — list rules for a source.
// PUT /api/sources/[id]/rules — replace all rules (delete existing, create
//   new). Body: { rules: [{ filterType, operator, value, position? }] }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSourceRule } from "@/lib/serialize";

async function requireSource(id: string, organizationId: string) {
  const s = await db.source.findUnique({ where: { id } });
  if (!s || s.organizationId !== organizationId) return null;
  return s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireOrgContext(req);
    const source = await requireSource(id, organizationId);
    if (!source) {
      return NextResponse.json(
        { error: "Source not found" },
        { status: 404 }
      );
    }
    const rules = await db.sourceRule.findMany({
      where: { sourceId: id },
      orderBy: { position: "asc" },
    });
    return NextResponse.json(rules.map(serializeSourceRule));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list rules" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const source = await requireSource(id, organizationId);
    if (!source) {
      return NextResponse.json(
        { error: "Source not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const rulesInput: any[] = Array.isArray(body?.rules) ? body.rules : [];

    await db.$transaction(async (tx) => {
      await tx.sourceRule.deleteMany({ where: { sourceId: id } });
      if (rulesInput.length > 0) {
        await tx.sourceRule.createMany({
          data: rulesInput.map((r, i) => ({
            sourceId: id,
            filterType: String(r.filterType ?? ""),
            operator: String(r.operator ?? ""),
            value: JSON.stringify(r.value ?? null),
            position: typeof r.position === "number" ? r.position : i,
          })),
        });
      }
    });

    const rules = await db.sourceRule.findMany({
      where: { sourceId: id },
      orderBy: { position: "asc" },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "source",
      entityId: id,
      after: { rules: rulesInput.length },
      reason: "replace_rules",
    });

    return NextResponse.json(rules.map(serializeSourceRule));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to replace rules" },
      { status: 500 }
    );
  }
}
