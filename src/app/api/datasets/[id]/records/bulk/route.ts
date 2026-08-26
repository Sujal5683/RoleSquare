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
    const { organizationId } = await requireRole(req, "member");

    // Verify dataset belongs to org
    const dataset = await db.dataset.findFirst({
      where: { id: datasetId, organizationId },
      select: { id: true },
    });
    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
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
