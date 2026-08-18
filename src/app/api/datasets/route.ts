// GET /api/datasets?organizationId=... — list datasets for org (include
//   schema, recordCount).
// POST /api/datasets — create a dataset.
//   Body: { name, description?, schemaId? }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeDataset } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const datasets = await db.dataset.findMany({
      where: { organizationId },
      include: { schema: { include: { fields: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(datasets.map(serializeDataset));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list datasets" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }
    const dataset = await db.dataset.create({
      data: {
        organizationId,
        schemaId: body?.schemaId || null,
        createdBy: user.id,
        name,
        description: body?.description ?? null,
        recordCount: 0,
      },
      include: { schema: { include: { fields: true } } },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "dataset",
      entityId: dataset.id,
      after: { name, schemaId: dataset.schemaId },
    });

    return NextResponse.json(serializeDataset(dataset), { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create dataset" },
      { status: 500 }
    );
  }
}
