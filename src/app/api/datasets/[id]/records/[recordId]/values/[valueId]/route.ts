// PATCH /api/datasets/[id]/records/[recordId]/values/[valueId] — update a
//   value (human correction). Body: { value, confidence?, evidence? }.
//   Preserves the original AI-extracted value in `originalValue` on the
//   first human correction. Subsequent corrections update `value` but
//   preserve the original. Records an audit log entry capturing
//   before/after of the corrected value so the human-in-the-loop trail
//   is preserved.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyDatasetAccess, requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { attachFieldInfo, fieldsByIdMap, serializeDatasetValue } from "@/lib/serialize";

async function requireValue(
  datasetId: string,
  recordId: string,
  valueId: string,
  organizationId: string,
  userId: string
) {
  const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
  if (!dataset) return null;
  if (!(await verifyDatasetAccess(dataset, organizationId, userId, "edit"))) return null;
  const record = await db.datasetRecord.findUnique({
    where: { id: recordId },
  });
  if (!record || record.datasetId !== datasetId) return null;
  const value = await db.datasetValue.findUnique({
    where: { id: valueId },
  });
  if (!value || value.recordId !== recordId) return null;
  const field = await db.schemaField.findUnique({ where: { id: value.fieldId } });
  return { ...value, field: field ?? null };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string; valueId: string }> }
) {
  try {
    const { id: datasetId, recordId, valueId } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const before = await requireValue(datasetId, recordId, valueId, organizationId, user.id);
    if (!before) {
      return NextResponse.json(
        { error: "Value not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const data: any = {};

    // On the FIRST human correction, preserve the original AI value.
    // Subsequent corrections don't overwrite the original.
    if (body?.value !== undefined && before.originalValue === null) {
      data.originalValue = before.value;
      data.originalConfidence = before.confidence;
    }

    if (body?.value !== undefined) {
      data.value = JSON.stringify(body.value);
    }
    if (typeof body?.confidence === "number") data.confidence = body.confidence;
    if (typeof body?.evidence === "string") {
      data.evidence = body.evidence;
      // Human corrections bump the confidence to 1.0 unless overridden.
      if (typeof body?.confidence !== "number") data.confidence = 1.0;
    }
    if (typeof body?.sourceFile === "string") data.sourceFile = body.sourceFile;
    if (typeof body?.pageNumber === "number") data.pageNumber = body.pageNumber;

    // Mark as corrected
    data.correctedAt = new Date();
    data.correctedBy = user.id;

    const value = await db.datasetValue.update({
      where: { id: valueId },
      data,
    });
    const field = await db.schemaField.findUnique({ where: { id: value.fieldId } });
    const enriched = attachFieldInfo(value, fieldsByIdMap(field ? [field] : []));

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "record",
      entityId: recordId,
      before: {
        valueId,
        fieldId: before.fieldId,
        value: before.value ? JSON.parse(before.value) : null,
        confidence: before.confidence,
      },
      after: {
        valueId,
        fieldId: before.fieldId,
        value: body?.value,
        confidence: value.confidence,
        evidence: value.evidence,
        originalPreserved: data.originalValue !== undefined,
      },
      reason: "human_correction",
    });

    return NextResponse.json(serializeDatasetValue(enriched));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update value" },
      { status: 500 }
    );
  }
}
