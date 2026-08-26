// PATCH /api/datasets/[id]/records/[recordId]/values/[fieldId]
// Updates or clears a specific cell value in a record.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string, recordId: string, fieldId: string }> }
) {
  try {
    const { id: datasetId, recordId, fieldId } = await params;
    const { organizationId } = await requireOrgContext(req);

    // Verify dataset belongs to org
    const dataset = await db.dataset.findFirst({
      where: { id: datasetId, organizationId },
      select: { id: true },
    });
    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    // Update the value (JSON stringified)
    const updated = await db.datasetValue.updateMany({
      where: { recordId, fieldId },
      data: { value: JSON.stringify(body.value ?? null) },
    });

    if (updated.count === 0) {
      // If it doesn't exist, we might need to create it
      await db.datasetValue.create({
        data: {
          recordId,
          fieldId,
          value: JSON.stringify(body.value ?? null),
          confidence: 1.0,
          evidence: "Manual edit",
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update value" },
      { status: 500 }
    );
  }
}
