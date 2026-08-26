// GET  /api/sharing/permissions?organizationId=... — list all DatasetAccess grants
//   where this org is the owner (what we've shared out) OR the grantee (what's been shared in).
// POST /api/sharing/permissions — directly grant access to a dataset (owner only).
//   Body: { datasetId, granteeOrgId?, granteeUserId?, granteeEmail?, level? }
// DELETE /api/sharing/permissions — revoke access. Body: { id }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeDatasetAccess } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "all"; // "owned" | "received" | "all"

    const [owned, received] = await Promise.all([
      // What this org has granted to others
      view !== "received"
        ? db.datasetAccess.findMany({
            where: { ownerOrgId: organizationId },
            include: {
              dataset: { select: { id: true, name: true } },
              ownerOrg: { select: { id: true, name: true } },
              granteeOrg: { select: { id: true, name: true } },
              granteeUser: { select: { id: true, email: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
          })
        : [],
      // What this org/user has received
      view !== "owned"
        ? db.datasetAccess.findMany({
            where: {
              status: "active",
              OR: [
                { granteeOrgId: organizationId },
                { granteeUserId: user.id },
              ],
            },
            include: {
              dataset: { select: { id: true, name: true } },
              ownerOrg: { select: { id: true, name: true } },
              granteeOrg: { select: { id: true, name: true } },
              granteeUser: { select: { id: true, email: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
          })
        : [],
    ]);

    return NextResponse.json({
      owned: owned.map(serializeDatasetAccess),
      received: received.map(serializeDatasetAccess),
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list permissions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));

    const datasetId = String(body?.datasetId ?? "").trim();
    const granteeOrgId = String(body?.granteeOrgId ?? "").trim() || null;
    const granteeEmail = String(body?.granteeEmail ?? "").trim().toLowerCase() || null;
    let granteeUserId = String(body?.granteeUserId ?? "").trim() || null;
    const level = String(body?.level ?? "read");

    if (!datasetId) {
      return NextResponse.json({ error: "datasetId is required" }, { status: 400 });
    }
    if (!granteeOrgId && !granteeEmail && !granteeUserId) {
      return NextResponse.json(
        { error: "granteeOrgId or granteeEmail is required" },
        { status: 400 }
      );
    }

    // Verify dataset belongs to this org
    const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
    if (!dataset || dataset.organizationId !== organizationId) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    // Resolve granteeEmail → granteeUserId
    if (granteeEmail && !granteeUserId) {
      const targetUser = await db.user.findUnique({
        where: { email: granteeEmail },
        select: { id: true },
      });
      if (!targetUser) {
        return NextResponse.json(
          { error: `No registered user found with email ${granteeEmail}` },
          { status: 404 }
        );
      }
      granteeUserId = targetUser.id;
    }

    const access = await db.datasetAccess.create({
      data: {
        datasetId,
        ownerOrgId: organizationId,
        granteeOrgId,
        granteeUserId,
        level,
        status: "active",
      },
      include: {
        dataset: { select: { id: true, name: true } },
        ownerOrg: { select: { id: true, name: true } },
        granteeOrg: { select: { id: true, name: true } },
        granteeUser: { select: { id: true, email: true, name: true } },
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "share",
      entity: "dataset",
      entityId: datasetId,
      after: { accessId: access.id, level, granteeOrgId, granteeUserId },
      reason: "create_permission",
    });

    return NextResponse.json(serializeDatasetAccess(access), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create permission" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await db.datasetAccess.findUnique({ where: { id } });
    
    if (!existing) {
      return NextResponse.json({ error: "Permission not found" }, { status: 404 });
    }

    const isOwner = existing.ownerOrgId === organizationId;
    const isGranteeOrg = existing.granteeOrgId === organizationId;
    const isGranteeUser = existing.granteeUserId === user.id;

    if (!isOwner && !isGranteeOrg && !isGranteeUser) {
      return NextResponse.json({ error: "Permission not found or unauthorized" }, { status: 403 });
    }
    // Soft-delete: mark as revoked rather than hard delete (preserves audit trail)
    await db.datasetAccess.update({
      where: { id },
      data: { status: "revoked" },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "delete",
      entity: "dataset",
      entityId: existing.datasetId,
      before: { accessId: id, level: existing.level, status: "active" },
      after: { accessId: id, status: "revoked" },
      reason: "revoke_permission",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to revoke permission" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    const isPaused = body?.isPaused;
    const level = body?.level ? String(body.level) : undefined;

    if (!id || (typeof isPaused !== "boolean" && !level)) {
      return NextResponse.json(
        { error: "id and at least one of isPaused boolean or level string are required" },
        { status: 400 }
      );
    }

    const existing = await db.datasetAccess.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Permission not found" }, { status: 404 });
    }

    // Only the owner org can update
    if (existing.ownerOrgId !== organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const dataToUpdate: any = {};
    if (typeof isPaused === "boolean") dataToUpdate.isPaused = isPaused;
    if (level) dataToUpdate.level = level;

    const access = await db.datasetAccess.update({
      where: { id },
      data: dataToUpdate,
      include: {
        dataset: { select: { id: true, name: true } },
        ownerOrg: { select: { id: true, name: true } },
        granteeOrg: { select: { id: true, name: true } },
        granteeUser: { select: { id: true, email: true, name: true } },
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "dataset",
      entityId: existing.datasetId,
      before: { accessId: id, isPaused: existing.isPaused, level: existing.level },
      after: { accessId: id, isPaused: dataToUpdate.isPaused ?? existing.isPaused, level: dataToUpdate.level ?? existing.level },
      reason: level ? "update_permission_level" : (dataToUpdate.isPaused ? "pause_permission" : "resume_permission"),
    });

    return NextResponse.json(serializeDatasetAccess(access));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update permission" },
      { status: 500 }
    );
  }
}

