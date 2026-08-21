// GET /api/datasets/[id]/records — list records with values (parsed JSON
//   `value` field). Query params:
//     - status: filter by record status
//     - page:    default 1
//     - pageSize: default 50
// POST /api/datasets/[id]/records — create an empty record.
//   Body: { sourceEmailId?, status? }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  attachFieldsToRecords,
  fieldsByIdMap,
  serializeDatasetRecord,
} from "@/lib/serialize";

async function requireDataset(id: string, organizationId: string) {
  const d = await db.dataset.findUnique({
    where: { id },
    include: { schema: { include: { fields: { orderBy: { position: "asc" } } } } },
  });
  if (!d || d.organizationId !== organizationId) return null;
  return d;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireOrgContext(req);
    const dataset = await requireDataset(id, organizationId);
    if (!dataset) {
      return NextResponse.json(
        { error: "Dataset not found" },
        { status: 404 }
      );
    }
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.max(
      1,
      Math.min(500, Number(url.searchParams.get("pageSize") ?? 50))
    );

    const where: any = { datasetId: id };
    if (status) where.status = status;

    const [total, records] = await Promise.all([
      db.datasetRecord.count({ where }),
      db.datasetRecord.findMany({
        where,
        include: { values: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const fieldsMap = fieldsByIdMap(dataset?.schema?.fields ?? []);
    const enriched = attachFieldsToRecords(records, fieldsMap);

    return NextResponse.json({
      data: enriched.map(serializeDatasetRecord),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list records" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const dataset = await requireDataset(id, organizationId);
    if (!dataset) {
      return NextResponse.json(
        { error: "Dataset not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const record = await db.datasetRecord.create({
      data: {
        datasetId: id,
        sourceEmailId: body?.sourceEmailId || null,
        status: body?.status || "valid",
        confidence: 0,
      },
      include: { values: true },
    });
    await db.dataset.update({
      where: { id },
      data: { recordCount: { increment: 1 } },
    });

    const fieldsMap = fieldsByIdMap(dataset?.schema?.fields ?? []);
    const enrichedRecord = attachFieldsToRecords([record], fieldsMap)[0];

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "record",
      entityId: record.id,
      after: { datasetId: id, status: record.status },
    });

    return NextResponse.json(serializeDatasetRecord(enrichedRecord), {
      status: 201,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create record" },
      { status: 500 }
    );
  }
}
