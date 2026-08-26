// GET /api/datasets/[id] — dataset detail with schema + fields.
// PATCH /api/datasets/[id] — assign/change schema.
// DELETE /api/datasets/[id] — delete dataset (cascades records + values).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeDataset } from "@/lib/serialize";

import { verifyDatasetAccess } from "@/lib/auth";

async function requireDataset(id: string, organizationId: string, userId: string, requiredLevel: "read" | "comment" | "edit" | "owner" = "read") {
  const d = await db.dataset.findUnique({
    where: { id },
    include: {
      schema: { include: { fields: { orderBy: { position: "asc" } } } },
      columnDefs: { orderBy: { position: "asc" } },
      sources: { select: { id: true } },
    },
  });
  if (!d) return null;
  const hasAccess = await verifyDatasetAccess(d, organizationId, userId, requiredLevel);
  return hasAccess ? d : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const dataset = await requireDataset(id, organizationId, user.id);
    if (!dataset) {
      return NextResponse.json(
        { error: "Dataset not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(serializeDataset(dataset));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load dataset" },
      { status: 500 }
    );
  }
}

// PATCH /api/datasets/[id] — assign or change schema
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);

    // Requires edit access
    const before = await requireDataset(id, organizationId, user.id, "edit");
    if (!before) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { schemaId } = body;

    if (!schemaId) {
      return NextResponse.json({ error: "schemaId is required" }, { status: 400 });
    }

    // Verify the schema belongs to this org
    const schema = await db.schema.findFirst({
      where: { id: schemaId, organizationId },
      select: { id: true, name: true },
    });
    if (!schema) {
      return NextResponse.json({ error: "Schema not found" }, { status: 404 });
    }

    const updated = await db.dataset.update({
      where: { id },
      data: { schemaId },
      include: {
        schema: { include: { fields: { orderBy: { position: "asc" } } } },
        columnDefs: { orderBy: { position: "asc" } },
        sources: { select: { id: true } },
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "dataset",
      entityId: id,
      before: { schemaId: before.schemaId },
      after: { schemaId, schemaName: schema.name },
    });

    return NextResponse.json(serializeDataset(updated));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update dataset" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const before = await requireDataset(id, organizationId, user.id, "owner");
    if (!before) {
      return NextResponse.json(
        { error: "Dataset not found" },
        { status: 404 }
      );
    }
    await db.dataset.delete({ where: { id } });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "delete",
      entity: "dataset",
      entityId: id,
      before: { name: before.name, recordCount: before.recordCount },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete dataset" },
      { status: 500 }
    );
  }
}
