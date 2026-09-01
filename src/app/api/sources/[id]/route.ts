// GET /api/sources/[id] — source detail with rules + relations.
// PATCH /api/sources/[id] — update name / status / schedule fields.
// DELETE /api/sources/[id] — delete source (cascades rules + runs).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSource } from "@/lib/serialize";

async function loadSourceInOrg(id: string, organizationId: string) {
  const source = await db.source.findUnique({
    where: { id },
    include: {
      googleConnection: true,
      schema: { select: { id: true, name: true, version: true } },
      dataset: { select: { id: true, name: true } },
      rules: { orderBy: { position: "asc" } },
    },
  });
  if (!source || source.organizationId !== organizationId) return null;
  return source;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireOrgContext(req);
    const source = await loadSourceInOrg(id, organizationId);
    if (!source) {
      return NextResponse.json(
        { error: "Source not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(serializeSource(source));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load source" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const before = await loadSourceInOrg(id, organizationId);
    if (!before) {
      return NextResponse.json(
        { error: "Source not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));

    if (body?.datasetId !== undefined && body.datasetId !== before.datasetId) {
      if (body.datasetId) {
        const { verifyDatasetWriteAccess } = await import("@/lib/dataset-access");
        const canEdit = await verifyDatasetWriteAccess(body.datasetId, user.id, organizationId);
        if (!canEdit) {
          return NextResponse.json(
            { error: "You do not have write access to the selected dataset." },
            { status: 403 }
          );
        }
      }
    }

    const data: any = {};
    if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body?.status === "string") data.status = body.status;
    if (typeof body?.runState === "string") data.runState = body.runState;
    if (typeof body?.scheduleMode === "string") data.scheduleMode = body.scheduleMode;
    if (typeof body?.scheduleExpr === "string") data.scheduleExpr = body.scheduleExpr;
    if (typeof body?.description === "string") data.description = body.description || null;
    if (body?.schemaId !== undefined) {
      const schemaId = body.schemaId || null;
      if (schemaId) {
        const schema = await db.schema.findFirst({
          where: { id: schemaId, organizationId },
        });
        if (!schema) {
          return NextResponse.json({ error: "Schema not found" }, { status: 404 });
        }
      }
      data.schemaId = schemaId;
    }
    if (body?.datasetId !== undefined) data.datasetId = body.datasetId || null;
    if (typeof body?.maxEmailsPerScan === "number") {
      data.maxEmailsPerScan = Math.max(1, Math.min(2000, body.maxEmailsPerScan));
    }

    const updated = await db.source.update({
      where: { id },
      data,
      include: {
        googleConnection: true,
        schema: { include: { fields: true } },
        dataset: { select: { id: true, name: true } },
        rules: { orderBy: { position: "asc" } },
      },
    });
    if (!updated || updated.organizationId !== organizationId) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "source",
      entityId: id,
      before: { name: before.name, status: before.status, scheduleExpr: before.scheduleExpr },
      after: data,
    });

    return NextResponse.json(serializeSource(updated));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update source" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const before = await loadSourceInOrg(id, organizationId);
    if (!before) {
      return NextResponse.json(
        { error: "Source not found" },
        { status: 404 }
      );
    }
    await db.source.delete({ where: { id } });

    // Cancel any active jobs for this source
    await db.aiJob.updateMany({
      where: {
        type: { in: ["GMAIL_SCAN", "DRIVE_SCAN", "DOCS_SCAN", "SHEETS_SCAN", "FORMS_SCAN"] },
        payload: { contains: id },
        status: { in: ["queued", "running", "retry"] },
      },
      data: {
        status: "cancelled",
        errorMessage: "Source was deleted",
        finishedAt: new Date(),
      }
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "delete",
      entity: "source",
      entityId: id,
      before: { name: before.name },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete source" },
      { status: 500 }
    );
  }
}
