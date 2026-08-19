// GET /api/schemas/[id] — schema with fields.
// PATCH /api/schemas/[id] — update name / description / promptTemplate.
//   Bumps version on each patch.
// DELETE /api/schemas/[id] — delete schema (cascades fields).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSchema } from "@/lib/serialize";

async function requireSchema(id: string, organizationId: string) {
  const s = await db.schema.findUnique({
    where: { id },
    include: { fields: { orderBy: { position: "asc" } } },
  });
  if (!s || s.organizationId !== organizationId) return null;
  return s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireOrgContext(req);
    const schema = await requireSchema(id, organizationId);
    if (!schema) {
      return NextResponse.json(
        { error: "Schema not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(serializeSchema(schema));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load schema" },
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
    const { user, organizationId } = await requireOrgContext(req);
    const before = await requireSchema(id, organizationId);
    if (!before) {
      return NextResponse.json(
        { error: "Schema not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const data: any = { version: before.version + 1 };
    if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body?.description === "string") data.description = body.description || null;
    if (typeof body?.promptTemplate === "string") data.promptTemplate = body.promptTemplate || null;

    await db.schema.update({ where: { id }, data });
    const updated = await requireSchema(id, organizationId);

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "schema",
      entityId: id,
      before: { name: before.name, version: before.version },
      after: data,
    });

    return NextResponse.json(serializeSchema(updated));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update schema" },
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
    const { user, organizationId } = await requireOrgContext(req);
    const before = await requireSchema(id, organizationId);
    if (!before) {
      return NextResponse.json(
        { error: "Schema not found" },
        { status: 404 }
      );
    }
    await db.schema.delete({ where: { id } });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "delete",
      entity: "schema",
      entityId: id,
      before: { name: before.name },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete schema" },
      { status: 500 }
    );
  }
}
