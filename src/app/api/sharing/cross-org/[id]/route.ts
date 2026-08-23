// PATCH /api/sharing/cross-org/[id] — approve, reject, or revoke a cross-org share request
// Body: { action: "approve" | "reject" | "revoke" }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSharingRequest } from "@/lib/serialize";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "") as "approve" | "reject" | "revoke";

    if (!["approve", "reject", "revoke"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve', 'reject', or 'revoke'" },
        { status: 400 }
      );
    }

    const shareRequest = await db.sharingRequest.findUnique({
      where: { id },
      include: {
        dataset: { select: { id: true, name: true, organizationId: true } },
        requester: { select: { id: true, name: true } },
      },
    });

    if (!shareRequest) {
      return NextResponse.json({ error: "Share request not found" }, { status: 404 });
    }

    // Authorization checks:
    // - Approve/reject: the target org (the one being asked) must be ours
    // - Revoke: either the requester org OR the target org can revoke
    const isTargetOrg = shareRequest.targetOrganizationId === organizationId;
    const isRequesterOrg = shareRequest.organizationId === organizationId;

    if (action === "approve" || action === "reject") {
      if (!isTargetOrg) {
        return NextResponse.json(
          { error: "Only the target organization can approve or reject this request" },
          { status: 403 }
        );
      }
    }

    if (action === "revoke" && !isTargetOrg && !isRequesterOrg) {
      return NextResponse.json(
        { error: "Only the target or requester organization can revoke this share" },
        { status: 403 }
      );
    }

    const newStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked";

    const updated = await db.sharingRequest.update({
      where: { id },
      data: {
        status: newStatus,
        decidedBy: user.id,
        decidedAt: new Date(),
      },
      include: {
        dataset: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true } },
      },
    });

    // On approval: create CrossOrgPermission to grant actual access
    if (action === "approve" && shareRequest.targetOrganizationId) {
      await db.crossOrgPermission.create({
        data: {
          datasetId: shareRequest.datasetId!,
          ownerOrganizationId: shareRequest.dataset!.organizationId,
          granteeOrgId: shareRequest.targetOrganizationId,
          granteeUserId: shareRequest.targetUserId,
          level: shareRequest.level,
          status: "active",
        },
      });
    }

    // On revoke: deactivate any CrossOrgPermission
    if (action === "revoke" && shareRequest.targetOrganizationId && shareRequest.datasetId) {
      await db.crossOrgPermission.updateMany({
        where: {
          datasetId: shareRequest.datasetId,
          granteeOrgId: shareRequest.targetOrganizationId,
          status: "active",
        },
        data: { status: "revoked" },
      });
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: action === "approve" ? "approve" : "update",
      entity: "dataset",
      entityId: shareRequest.datasetId ?? undefined,
      after: { shareRequestId: id, action, newStatus },
    });

    return NextResponse.json(serializeSharingRequest(updated));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update share request" },
      { status: 500 }
    );
  }
}
