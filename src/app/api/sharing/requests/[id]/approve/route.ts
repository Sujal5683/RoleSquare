// POST /api/sharing/requests/[id]/approve — set status=approved, decidedBy=
//   current user, decidedAt=now. Also creates a SharingPermission so the
//   share takes effect immediately.
//   Requires: admin+ role.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
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
    const { user, organizationId, membership } = await requireRole(req, "member");

    const existing = await db.sharingRequest.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return NextResponse.json({ error: "Sharing request not found" }, { status: 404 });
    }

    const isTargetOrg = existing.targetOrganizationId === organizationId;
    const isTargetUser = existing.targetUserId === user.id || existing.targetEmail === user.email;

    if (!isTargetOrg && !isTargetUser) {
      return NextResponse.json({ error: "Not authorized to approve this request" }, { status: 403 });
    }

    if (isTargetOrg) {
      if ((ROLE_LEVEL[membership.role] ?? 0) < ROLE_LEVEL.manager) {
        return NextResponse.json({ error: `Approving requests requires manager role or higher. You are a ${membership.role}.` }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const datasetId = body.datasetId || existing.datasetId;

    if (!datasetId) {
      return NextResponse.json({ error: "A dataset must be selected to approve this request." }, { status: 400 });
    }

    if (existing.shareType === 'request') {
      const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
      if (!dataset || dataset.organizationId !== organizationId) {
        return NextResponse.json({ error: "You can only share datasets that belong to your organization." }, { status: 403 });
      }
    }

    const now = new Date();
    const updated = await db.$transaction(async (tx) => {
      const req2 = await tx.sharingRequest.update({
        where: { id },
        data: {
          status: "approved",
          decidedBy: user.id,
          decidedAt: now,
          datasetId: datasetId,
        },
        include: { dataset: true, requester: true },
      });

      const ownerOrgId = existing.shareType === 'request' ? organizationId : existing.organizationId;
      const granteeOrgId = existing.shareType === 'request' ? existing.organizationId : existing.targetOrganizationId;
      const granteeUserId = existing.shareType === 'request' ? null : existing.targetUserId;

      await tx.datasetAccess.create({
        data: {
          datasetId: req2.datasetId!,
          ownerOrgId,
          granteeOrgId: granteeOrgId || null,
          granteeUserId: granteeUserId || null,
          level: req2.level,
          fieldScope: req2.fieldScope,
          rowFilter: req2.rowFilter,
          status: "active",
          sourceRequestId: req2.id,
        },
      });
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
