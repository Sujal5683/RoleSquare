// GET /api/sharing/requests?organizationId=... — list sharing requests
//   for org (include dataset name, requester name).
// POST /api/sharing/requests — create a sharing request.
//   Body: { datasetId?, level?, reason?, fieldScope?, rowFilter? }


export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSharingRequest } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const direction = req.nextUrl.searchParams.get("direction");

    const whereClause: any = {};
    if (direction === "incoming") {
      whereClause.targetOrganizationId = organizationId;
    } else if (direction === "outgoing") {
      whereClause.organizationId = organizationId;
    } else {
      whereClause.OR = [
        { organizationId },
        { targetOrganizationId: organizationId }
      ];
    }

    const requests = await db.sharingRequest.findMany({
      where: whereClause,
      include: { dataset: true, requester: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(requests.map(serializeSharingRequest));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list requests" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
    const body = await req.json().catch(() => ({}));
    
    let targetOrganizationId = body?.targetOrganizationId || null;
    
    if (body?.datasetId) {
      const dataset = await db.dataset.findUnique({ where: { id: body.datasetId } });
      if (!dataset) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
      targetOrganizationId = dataset.organizationId;
    }

    // Prevent duplicate pending requests
    const existing = await db.sharingRequest.findFirst({
      where: {
        organizationId,
        datasetId: body?.datasetId || null,
        targetOrganizationId,
        status: "pending",
        direction: "outgoing"
      }
    });

    if (existing) {
      return NextResponse.json({ error: "A pending request for this dataset already exists." }, { status: 409 });
    }

    const request = await db.sharingRequest.create({
      data: {
        organizationId,
        targetOrganizationId,
        datasetId: body?.datasetId || null,
        requestedBy: user.id,
        status: "pending",
        direction: "outgoing",
        level: body?.level || "read",
        reason: body?.reason ?? null,
        fieldScope: body?.fieldScope ? JSON.stringify(body.fieldScope) : null,
        rowFilter: body?.rowFilter ? JSON.stringify(body.rowFilter) : null,
      },
      include: { dataset: true, requester: true },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "share",
      entity: "dataset",
      entityId: request.datasetId ?? undefined,
      after: { requestId: request.id, level: request.level, status: "pending" },
      reason: "create_request",
    });

    return NextResponse.json(serializeSharingRequest(request), {
      status: 201,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create request" },
      { status: 500 }
    );
  }
}
