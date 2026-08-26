// DELETE /api/datasets/[id]/columns/[columnId]
// Soft-deletes a DatasetColumnDef and marks its SchemaField as deleted (or sets a flag).
// For now, we will mark DatasetColumnDef as isDeleted = true.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { createSchemaVersion, getCurrentColumns } from "@/lib/services/schema-versioning";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string, columnId: string }> }
) {
  try {
    const { id: datasetId, columnId } = await params;
    const { user, organizationId } = await requireOrgContext(req);

    // Verify dataset belongs to org
    const dataset = await db.dataset.findFirst({
      where: { id: datasetId, organizationId },
      select: { id: true, schemaId: true },
    });
    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    // Update dataset column to deleted
    const updated = await db.datasetColumnDef.updateMany({
      where: { datasetId, columnId },
      data: { isDeleted: true },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Column not found or already deleted" }, { status: 404 });
    }

    // Record schema version
    const cols = await getCurrentColumns(datasetId);
    await createSchemaVersion(datasetId, cols, "manual", user.id, `Deleted column ${columnId}`);

    return NextResponse.json({ ok: true, message: "Column deleted" });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete column" },
      { status: 500 }
    );
  }
}
