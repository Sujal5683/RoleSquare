// POST /api/sharing/requests/[id]/approve — set status=approved, decidedBy=
//   current user, decidedAt=now. Also creates a SharingPermission so the
//   share takes effect immediately.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
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
        await tx.sharingPermission.create({
          data: {
            datasetId: req2.datasetId,
            organizationId,
            level: req2.level,
            fieldScope: req2.fieldScope,
            rowFilter: req2.rowFilter,
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

    return NextResponse.json(serializeSharingRequest(updated));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to approve request" },
      { status: 500 }
    );
  }
}
