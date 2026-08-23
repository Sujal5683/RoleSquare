// GET /api/sources?organizationId=... — list sources for org (include
//   googleConnection, schema, dataset).
// POST /api/sources — create a source together with its rules
//   (transactional). Body:
//     { name, description?, sourceType, googleConnectionId, schemaId?,
//       datasetId?, scheduleMode?, scheduleExpr?, config?, rules?: [{filterType, operator, value, position?}] }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSource } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const sources = await db.source.findMany({
      where: { organizationId },
      include: {
        googleConnection: true,
        schema: { include: { fields: true } },
        dataset: { select: { id: true, name: true } },
        rules: { orderBy: { position: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(sources.map(serializeSource));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list sources" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const googleConnectionId = String(body?.googleConnectionId ?? "").trim();
    if (!name || !googleConnectionId) {
      return NextResponse.json(
        { error: "name and googleConnectionId are required" },
        { status: 400 }
      );
    }

    // Verify the connection belongs to the org.
    const conn = await db.googleConnection.findUnique({
      where: { id: googleConnectionId },
    });
    if (!conn || conn.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Google connection not found" },
        { status: 404 }
      );
    }

    const rulesInput: any[] = Array.isArray(body?.rules) ? body.rules : [];
    const source = await db.$transaction(async (tx) => {
      const created = await tx.source.create({
        data: {
          organizationId,
          ownerUserId: user.id,
          googleConnectionId,
          schemaId: body?.schemaId || null,
          datasetId: body?.datasetId || null,
          name,
          description: body?.description ?? null,
          sourceType: body?.sourceType ?? "gmail",
          status: "active",
          runState: "idle",
          scheduleMode: body?.scheduleMode ?? "interval",
          scheduleExpr: body?.scheduleExpr ?? "6h",
          maxEmailsPerScan: typeof body?.maxEmailsPerScan === "number"
            ? Math.max(1, Math.min(2000, body.maxEmailsPerScan))
            : 100,
          config: body?.config ? JSON.stringify(body.config) : "{}",
        },
      });
      if (rulesInput.length > 0) {
        await tx.sourceRule.createMany({
          data: rulesInput.map((r, i) => ({
            sourceId: created.id,
            filterType: String(r.filterType ?? ""),
            operator: String(r.operator ?? ""),
            value: JSON.stringify(r.value ?? null),
            metadata: r.metadata ? JSON.stringify(r.metadata) : null,
            position: typeof r.position === "number" ? r.position : i,
          })),
        });
      }
      return created;
    });

    const { ensureDefaultDataset } = await import("@/lib/dataset-provisioner");
    await ensureDefaultDataset(source.id);

    const full = await db.source.findUnique({
      where: { id: source.id },
      include: {
        googleConnection: true,
        schema: { include: { fields: true } },
        dataset: { select: { id: true, name: true } },
        rules: { orderBy: { position: "asc" } },
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "source",
      entityId: source.id,
      after: { name, sourceType: body?.sourceType ?? "gmail", ruleCount: rulesInput.length },
    });

    return NextResponse.json(serializeSource(full), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create source" },
      { status: 500 }
    );
  }
}
