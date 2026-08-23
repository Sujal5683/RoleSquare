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
    const { user, organizationId, membership } = await requireOrgContext(req);
    const ROLE_LEVEL: Record<string, number> = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1 };

    const existing = await db.sharingRequest.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return NextResponse.json({ error: "Sharing request not found" }, { status: 404 });
    }

    const isTargetOrg = existing.targetOrganizationId === organizationId;
    const isTargetUser = existing.targetUserId === user.id || existing.targetEmail === user.email;

    if (!isTargetOrg && !isTargetUser) {
      return NextResponse.json({ error: "Not authorized to reject this request" }, { status: 403 });
    }

    if (isTargetOrg) {
      if ((ROLE_LEVEL[membership.role] ?? 0) < ROLE_LEVEL.manager) {
        return NextResponse.json({ error: `Rejecting requests requires manager role or higher. You are a ${membership.role}.` }, { status: 403 });
      }
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
