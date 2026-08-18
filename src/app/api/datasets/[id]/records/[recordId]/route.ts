// GET /api/datasets/[id]/records/[recordId] — record with values.
// PATCH /api/datasets/[id]/records/[recordId] — update record status
//   (approve / reject / review / valid).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  attachFieldsToRecords,
  fieldsByIdMap,
  serializeDatasetRecord,
} from "@/lib/serialize";

async function loadSchemaFields(datasetId: string, organizationId: string) {
  const dataset = await db.dataset.findUnique({
    where: { id: datasetId },
    include: { schema: { include: { fields: true } } },
  });
  if (!dataset || dataset.organizationId !== organizationId) return null;
  return fieldsByIdMap(dataset.schema?.fields ?? []);
}

async function requireRecord(id: string, recordId: string, organizationId: string) {
  const dataset = await db.dataset.findUnique({ where: { id } });
  if (!dataset || dataset.organizationId !== organizationId) return null;
  const record = await db.datasetRecord.findUnique({
    where: { id: recordId },
    include: { values: true },
  });
  if (!record || record.datasetId !== id) return null;
  return record;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  try {
    const { id, recordId } = await params;
    const { organizationId } = await requireOrgContext(req);
    const record = await requireRecord(id, recordId, organizationId);
    if (!record) {
      return NextResponse.json(
        { error: "Record not found" },
        { status: 404 }
      );
    }
    const fieldsMap = await loadSchemaFields(id, organizationId);
    return NextResponse.json(
      serializeDatasetRecord(
        attachFieldsToRecords([record], fieldsMap ?? new Map())[0]
      )
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load record" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  try {
    const { id, recordId } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const before = await requireRecord(id, recordId, organizationId);
    if (!before) {
      return NextResponse.json(
        { error: "Record not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const data: any = {};
    if (typeof body?.status === "string") data.status = body.status;
    if (typeof body?.confidence === "number") data.confidence = body.confidence;

    const record = await db.datasetRecord.update({
      where: { id: recordId },
      data,
      include: { values: true },
    });

    const fieldsMap = await loadSchemaFields(id, organizationId);
    const enriched = attachFieldsToRecords([record], fieldsMap ?? new Map())[0];

    await logAudit({
      organizationId,
      actorId: user.id,
      action: body?.status === "approved" ? "approve" : "update",
      entity: "record",
      entityId: recordId,
      before: { status: before.status },
      after: data,
    });

    return NextResponse.json(serializeDatasetRecord(enriched));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update record" },
      { status: 500 }
    );
  }
}
