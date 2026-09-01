// DELETE /api/datasets/[id]/records/bulk
// Deletes multiple records. Body: { recordIds: string[] }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: datasetId } = await params;
    const { user, organizationId } = await requireRole(req, "member");

    const dataset = await db.dataset.findUnique({
      where: { id: datasetId },
      select: { id: true, organizationId: true },
    });
    
    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    const { verifyDatasetAccess } = await import("@/lib/auth");
    if (!(await verifyDatasetAccess(dataset, organizationId, user.id, "edit"))) {
      return NextResponse.json({ error: "Not authorized to edit this dataset" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body.recordIds) || body.recordIds.length === 0) {
      return NextResponse.json({ error: "recordIds array is required" }, { status: 400 });
    }

    // Delete records
    const result = await db.datasetRecord.deleteMany({
      where: {
        datasetId,
        id: { in: body.recordIds },
      },
    });

    // Update dataset record count
    const actualCount = await db.datasetRecord.count({ where: { datasetId } });
    await db.dataset.update({
      where: { id: datasetId },
      data: { recordCount: actualCount },
    });

    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete records" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: datasetId } = await params;
    const { user, organizationId } = await requireRole(req, "member");

    const dataset = await db.dataset.findUnique({
      where: { id: datasetId },
      select: { id: true, organizationId: true },
    });
    
    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    const { verifyDatasetAccess } = await import("@/lib/auth");
    if (!(await verifyDatasetAccess(dataset, organizationId, user.id, "edit"))) {
      return NextResponse.json({ error: "Not authorized to edit this dataset" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body.recordIds) || body.recordIds.length === 0) {
      return NextResponse.json({ error: "recordIds array is required" }, { status: 400 });
    }
    if (!body.status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    // Update records
    const result = await db.datasetRecord.updateMany({
      where: {
        datasetId,
        id: { in: body.recordIds },
      },
      data: {
        status: body.status
      }
    });

    const { logAudit } = await import("@/lib/audit");
    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update_bulk",
      entity: "record",
      entityId: datasetId,
      after: { status: body.status, count: result.count },
    });

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update records" },
      { status: 500 }
    );
  }
}
