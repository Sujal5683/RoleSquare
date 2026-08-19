// POST /api/sharing/requests/[id]/reject — set status=rejected, decidedBy=
//   current user, decidedAt=now.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSharingRequest } from "@/lib/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const existing = await db.sharingRequest.findUnique({
      where: { id },
    });
    if (!existing || existing.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Sharing request not found" },
        { status: 404 }
      );
    }

    const updated = await db.sharingRequest.update({
      where: { id },
      data: {
        status: "rejected",
        decidedBy: user.id,
        decidedAt: new Date(),
      },
      include: { dataset: true, requester: true },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "dataset",
      entityId: updated.datasetId ?? undefined,
      before: { status: existing.status },
      after: { status: "rejected" },
      reason: "reject_request",
    });

    return NextResponse.json(serializeSharingRequest(updated));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reject request" },
      { status: 500 }
    );
  }
}
