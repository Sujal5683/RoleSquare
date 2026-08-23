// GET /api/datasets/[id] — dataset detail with schema + fields.
// DELETE /api/datasets/[id] — delete dataset (cascades records + values).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeDataset } from "@/lib/serialize";

async function requireDataset(id: string, organizationId: string, userId: string, requireOwnership = false) {
  const d = await db.dataset.findUnique({
    where: { id },
    include: {
      schema: { include: { fields: { orderBy: { position: "asc" } } } },
      sources: { select: { id: true } },
    },
  });
  if (!d) return null;
  
  if (d.organizationId !== organizationId) {
    if (requireOwnership) return null;
    // Check if it's shared with the user/org
    const access = await db.datasetAccess.findFirst({
      where: {
        datasetId: id,
        status: "active",
        OR: [
          { granteeOrgId: organizationId },
          { granteeUserId: userId }
        ]
      }
    });
    if (!access) return null;
  }
  return d;
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const before = await requireDataset(id, organizationId, user.id, true);
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
