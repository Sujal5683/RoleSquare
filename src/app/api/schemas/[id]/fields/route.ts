// POST /api/schemas/[id]/fields — add a single field to a schema.
//   Body: { name, type, description?, instructions?, required?, options?, position? }
// PUT /api/schemas/[id]/fields — reorder fields.
//   Body: { fieldIds: string[] } — assigns positions in the given order.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSchemaField } from "@/lib/serialize";

async function requireSchema(id: string, organizationId: string) {
  const s = await db.schema.findUnique({ where: { id } });
  if (!s || s.organizationId !== organizationId) return null;
  return s;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const schema = await requireSchema(id, organizationId);
    if (!schema) {
      return NextResponse.json(
        { error: "Schema not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }
    // Default position: append at end.
    const maxPos = await db.schemaField.aggregate({
      where: { schemaId: id },
      _max: { position: true },
    });
    const position =
      typeof body?.position === "number"
        ? body.position
        : (maxPos._max.position ?? -1) + 1;

    const field = await db.schemaField.create({
      data: {
        schemaId: id,
        name,
        type: String(body?.type ?? "text"),
        description: body?.description ?? null,
        instructions: body?.instructions ?? null,
        required: !!body?.required,
        options: body?.options ? JSON.stringify(body.options) : null,
        position,
        confidenceThreshold: typeof body?.confidenceThreshold === "number"
          ? Math.max(0, Math.min(1, body.confidenceThreshold))
          : 0.7,
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "schema",
      entityId: id,
      after: { field: { id: field.id, name, type: field.type } },
      reason: "add_field",
    });

    return NextResponse.json(serializeSchemaField(field), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add field" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const schema = await requireSchema(id, organizationId);
    if (!schema) {
      return NextResponse.json(
        { error: "Schema not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const fieldIds: string[] = Array.isArray(body?.fieldIds) ? body.fieldIds : [];
    if (fieldIds.length === 0) {
      return NextResponse.json(
        { error: "fieldIds must be a non-empty array" },
        { status: 400 }
      );
    }

    await db.$transaction(
      fieldIds.map((fid, i) =>
        db.schemaField.update({
          where: { id: fid },
          data: { position: i },
        })
      )
    );

    const fields = await db.schemaField.findMany({
      where: { schemaId: id },
      orderBy: { position: "asc" },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "schema",
      entityId: id,
      after: { order: fieldIds },
      reason: "reorder_fields",
    });

    return NextResponse.json(fields.map(serializeSchemaField));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reorder fields" },
      { status: 500 }
    );
  }
}
