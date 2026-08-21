// GET /api/sharing/permissions?organizationId=... — list permissions for
//   org (include dataset name, organization name).
// POST /api/sharing/permissions — create a permission.
//   Body: { datasetId, level?, fieldScope?, rowFilter?, targetOrganizationId? }
// DELETE /api/sharing/permissions — revoke. Body: { id }.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSharingPermission } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const perms = await db.sharingPermission.findMany({
      where: { organizationId },
      include: { dataset: true, organization: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(perms.map(serializeSharingPermission));
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
    if (!datasetId) {
      return NextResponse.json(
        { error: "datasetId is required" },
        { status: 400 }
      );
    }
    // Verify the dataset belongs to this org.
    const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
    if (!dataset || dataset.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Dataset not found" },
        { status: 404 }
      );
    }
    const perm = await db.sharingPermission.create({
      data: {
        datasetId,
        organizationId,
        level: body?.level || "read",
        fieldScope: body?.fieldScope ? JSON.stringify(body.fieldScope) : null,
        rowFilter: body?.rowFilter ? JSON.stringify(body.rowFilter) : null,
      },
      include: { dataset: true, organization: true },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "share",
      entity: "dataset",
      entityId: datasetId,
      after: { permissionId: perm.id, level: perm.level },
      reason: "create_permission",
    });

    return NextResponse.json(serializeSharingPermission(perm), {
      status: 201,
    });
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
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }
    const existing = await db.sharingPermission.findUnique({
      where: { id },
    });
    if (!existing || existing.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Permission not found" },
        { status: 404 }
      );
    }
    await db.sharingPermission.delete({ where: { id } });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "delete",
      entity: "dataset",
      entityId: existing.datasetId,
      before: { permissionId: id, level: existing.level },
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
