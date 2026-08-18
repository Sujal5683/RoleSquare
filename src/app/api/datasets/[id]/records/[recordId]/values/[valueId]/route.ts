// PATCH /api/datasets/[id]/records/[recordId]/values/[valueId] — update a
//   value (human correction). Body: { value, confidence?, evidence? }.
//   Records an audit log entry capturing before/after of the corrected
//   value so the human-in-the-loop trail is preserved.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { attachFieldInfo, fieldsByIdMap, serializeDatasetValue } from "@/lib/serialize";

async function loadFieldForValue(fieldId: string, organizationId: string) {
  const field = await db.schemaField.findUnique({ where: { id: fieldId } });
  if (!field) return null;
  // Verify the field's schema belongs to the org.
  const schema = await db.schema.findUnique({ where: { id: field.schemaId } });
  if (!schema || schema.organizationId !== organizationId) return null;
  return field;
}

async function requireValue(
  datasetId: string,
  recordId: string,
  valueId: string,
  organizationId: string
) {
  const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
  if (!dataset || dataset.organizationId !== organizationId) return null;
  const record = await db.datasetRecord.findUnique({
    where: { id: recordId },
  });
  if (!record || record.datasetId !== datasetId) return null;
  const value = await db.datasetValue.findUnique({
    where: { id: valueId },
  });
  if (!value || value.recordId !== recordId) return null;
  const field = await loadFieldForValue(value.fieldId, organizationId);
  return { ...value, field: field ?? null };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string; valueId: string }> }
) {
  try {
    const { id: datasetId, recordId, valueId } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const before = await requireValue(datasetId, recordId, valueId, organizationId);
    if (!before) {
      return NextResponse.json(
        { error: "Value not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const data: any = {};
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

    const value = await db.datasetValue.update({
      where: { id: valueId },
      data,
    });
    const field = await loadFieldForValue(value.fieldId, organizationId);
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
      },
      reason: "human_correction",
    });

    return NextResponse.json(serializeDatasetValue(enriched));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update value" },
      { status: 500 }
    );
  }
}
