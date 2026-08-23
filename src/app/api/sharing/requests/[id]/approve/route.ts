// POST /api/sharing/requests/[id]/approve — set status=approved, decidedBy=
//   current user, decidedAt=now. Also creates a SharingPermission so the
//   share takes effect immediately.
//   Requires: admin+ role.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSharingRequest } from "@/lib/serialize";
import { dispatchWebhookEvent } from "@/lib/webhook-dispatcher";

const ROLE_LEVEL: Record<string, number> = {
  owner: 5, admin: 4, manager: 3, member: 2, viewer: 1,
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId, membership } = await requireOrgContext(req);

    // Role check: only admin+ can approve sharing requests
    if ((ROLE_LEVEL[membership.role] ?? 0) < ROLE_LEVEL.admin) {
      return NextResponse.json(
        { error: `Approving sharing requests requires admin role or higher. You are a ${membership.role}.` },
        { status: 403 }
      );
    }

    const existing = await db.sharingRequest.findUnique({
      where: { id },
    });
    if (!existing || existing.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Sharing request not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    const updated = await db.$transaction(async (tx) => {
      const req2 = await tx.sharingRequest.update({
        where: { id },
        data: {
          status: "approved",
          decidedBy: user.id,
          decidedAt: now,
        },
        include: { dataset: true, requester: true },
      });
      if (req2.datasetId) {
        // Write to the unified DatasetAccess table (replaces old SharingPermission)
        await tx.datasetAccess.create({
          data: {
            datasetId: req2.datasetId,
            ownerOrgId: organizationId,
            granteeOrgId: req2.targetOrganizationId ?? null,
            granteeUserId: req2.targetUserId ?? null,
            level: req2.level,
            fieldScope: req2.fieldScope,
            rowFilter: req2.rowFilter,
            status: "active",
            sourceRequestId: req2.id,
          },
        });
      }
      return req2;
    });


    await logAudit({
      organizationId,
      actorId: user.id,
      action: "approve",
      entity: "dataset",
      entityId: updated.datasetId ?? undefined,
      before: { status: existing.status },
      after: { status: "approved", level: updated.level },
      reason: "approve_request",
    });

    // Dispatch webhook event for sharing approval
    dispatchWebhookEvent({
      event: "sharing.approved",
      organizationId,
      data: {
        requestId: id,
        datasetId: updated.datasetId,
        level: updated.level,
        approvedBy: user.id,
      },
    });

    return NextResponse.json(serializeSharingRequest(updated));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to approve request" },
      { status: 500 }
    );
  }
}
