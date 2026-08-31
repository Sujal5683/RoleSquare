// PATCH /api/schemas/[id]/fields/[fieldId] — update a field.
// DELETE /api/schemas/[id]/fields/[fieldId] — delete a field (blocked for isDefault schemas).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSchemaField } from "@/lib/serialize";

async function requireField(id: string, fieldId: string, organizationId: string) {
  const schema = await db.schema.findUnique({ where: { id } });
  if (!schema || schema.organizationId !== organizationId) return null;
  const field = await db.schemaField.findUnique({ where: { id: fieldId } });
  if (!field || field.schemaId !== id) return null;
  return { field, schema };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> }
) {
  try {
    const { id, fieldId } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const result = await requireField(id, fieldId, organizationId);
    if (!result) {
      return NextResponse.json(
        { error: "Field not found" },
        { status: 404 }
      );
    }
    const { field: before, schema } = result;
    const body = await req.json().catch(() => ({}));
    const data: any = {};

    // For default schemas, only allow toggling isHidden, description and required.
    // Name, type, instructions, options, and validation are system-owned and locked.
    if (schema.isDefault) {
      if (typeof body?.isHidden === "boolean") data.isHidden = body.isHidden;
      if (typeof body?.description === "string") data.description = body.description || null;
      if (typeof body?.required === "boolean") data.required = body.required;
    } else {
      // Full edit for non-default schemas
      if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
      if (typeof body?.type === "string") data.type = body.type;
      if (typeof body?.description === "string") data.description = body.description || null;
      if (typeof body?.instructions === "string") data.instructions = body.instructions || null;
      if (typeof body?.required === "boolean") data.required = body.required;
      if (body?.options !== undefined) {
        data.options = body.options ? JSON.stringify(body.options) : null;
      }
      if (body?.validation !== undefined) {
        data.validation = body.validation ? JSON.stringify(body.validation) : null;
      }
      if (typeof body?.position === "number") data.position = body.position;
      if (typeof body?.confidenceThreshold === "number") {
        data.confidenceThreshold = Math.max(0, Math.min(1, body.confidenceThreshold));
      }
      if (typeof body?.isHidden === "boolean") data.isHidden = body.isHidden;
    }

    const field = await db.schemaField.update({ where: { id: fieldId }, data });

    await db.schema.update({
      where: { id },
      data: { version: { increment: 1 } },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "schema",
      entityId: id,
      before: { name: before.name, type: before.type },
      after: data,
      reason: "update_field",
    });

    return NextResponse.json(serializeSchemaField(field));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update field" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> }
) {
  try {
    const { id, fieldId } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const result = await requireField(id, fieldId, organizationId);
    if (!result) {
      return NextResponse.json(
        { error: "Field not found" },
        { status: 404 }
      );
    }
    const { field: before, schema } = result;

    // Block deletion on default schemas — fields must be hidden instead
    if (schema.isDefault) {
      return NextResponse.json(
        { error: "Fields in the Default Schema cannot be deleted. Use the visibility toggle to hide them instead." },
        { status: 403 }
      );
    }

    // Delete the schema field.
    // IMPORTANT: DatasetValue rows that reference this fieldId are NOT deleted —
    // they remain in the database and continue to display using the per-dataset
    // DatasetColumnDef snapshot (which is independent of the schema). The column
    // definition in each dataset that used this schema is preserved.
    await db.schemaField.delete({ where: { id: fieldId } });

    await db.schema.update({
      where: { id },
      data: { version: { increment: 1 } },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "delete",
      entity: "schema",
      entityId: id,
      before: { fieldId, name: before.name },
      reason: "delete_field",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete field" },
      { status: 500 }
    );
  }
}
