// GET /api/datasets?organizationId=... — list datasets for org + shared datasets.
//   Returns owned datasets AND datasets shared into the org/user via DatasetAccess.
// POST /api/datasets — create a dataset.
//   Body: { name, description?, schemaId? }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeDataset } from "@/lib/serialize";
import { getAccessibleDatasetIds } from "@/lib/dataset-access";

export async function GET(req: NextRequest) {
  try {
    const { user, organizationId, membership } = await requireOrgContext(req);
    
    let orgAccessLevel: "owner" | "edit" | "read" = "read";
    if (["owner", "admin", "manager"].includes(membership.role)) {
      orgAccessLevel = "owner";
    } else if (membership.role === "member") {
      orgAccessLevel = "edit";
    }

    // Get owned + shared dataset IDs
    const { ownedIds, sharedAccesses } = await getAccessibleDatasetIds(
      user.id,
      organizationId
    );

    // Fetch owned datasets
    const ownedDatasets = await db.dataset.findMany({
      where: { organizationId },
      include: {
        schema: { include: { fields: true } },
        sources: { select: { id: true } },
        sheetMappings: {
          where: { status: { not: "unlinked" } },
          take: 1,
          select: {
            id: true,
            status: true,
            syncState: { select: { lastSyncAt: true } },
            _count: { select: { syncConflicts: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch shared datasets (only if there are any)
    const sharedDatasets =
      sharedAccesses.length > 0
        ? await db.dataset.findMany({
            where: {
              id: { in: sharedAccesses.map((a) => a.datasetId) },
            },
            include: {
              schema: { include: { fields: true } },
              sources: { select: { id: true } },
              organization: { select: { id: true, name: true } },
              sheetMappings: {
                where: { status: { not: "unlinked" } },
                take: 1,
                select: {
                  id: true,
                  status: true,
                  syncState: { select: { lastSyncAt: true } },
                  _count: { select: { syncConflicts: { where: { status: "pending" } } } },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          })
        : [];

    // Build response — owned first, then shared
    const result = [
      ...ownedDatasets.map((d) => ({
        ...serializeDataset(d),
        accessLevel: orgAccessLevel,
        isShared: false,
      })),
      ...sharedDatasets.map((d) => {
        const access = sharedAccesses.find((a) => a.datasetId === d.id);
        return {
          ...serializeDataset(d),
          accessLevel: (access?.level ?? "read") as "read" | "comment" | "edit",
          isShared: true,
          ownerOrgId: d.organizationId,
          ownerOrgName: (d as any).organization?.name ?? undefined,
        };
      }),
    ];

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list datasets" },
      { status: 500 }
    );
  }
}



export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
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
      include: {
        schema: { include: { fields: true } },
        sources: { select: { id: true } },
      },
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
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create dataset" },
      { status: 500 }
    );
  }
}
