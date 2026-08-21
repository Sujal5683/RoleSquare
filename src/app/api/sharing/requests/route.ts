// GET /api/sharing/requests?organizationId=... — list sharing requests
//   for org (include dataset name, requester name).
// POST /api/sharing/requests — create a sharing request.
//   Body: { datasetId?, level?, reason?, fieldScope?, rowFilter? }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSharingRequest } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const requests = await db.sharingRequest.findMany({
      where: { organizationId },
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
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));
    const request = await db.sharingRequest.create({
      data: {
        organizationId,
        datasetId: body?.datasetId || null,
        requestedBy: user.id,
        status: "pending",
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
