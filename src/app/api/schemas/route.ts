// GET /api/schemas?organizationId=... — list schemas for org (include fields).
// POST /api/schemas — create a schema with its fields (transactional).
//   Body: { name, description?, promptTemplate?, fields: [{ name, type,
//     description?, instructions?, required?, options?, position? }] }

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSchema } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const schemas = await db.schema.findMany({
      where: { organizationId },
      include: { fields: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(schemas.map(serializeSchema));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list schemas" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }
    const fieldsInput: any[] = Array.isArray(body?.fields) ? body.fields : [];

    const schema = await db.$transaction(async (tx) => {
      const created = await tx.schema.create({
        data: {
          organizationId,
          createdBy: user.id,
          name,
          description: body?.description ?? null,
          promptTemplate: body?.promptTemplate ?? null,
          version: 1,
        },
      });
      if (fieldsInput.length > 0) {
        await tx.schemaField.createMany({
          data: fieldsInput.map((f, i) => ({
            schemaId: created.id,
            name: String(f.name ?? ""),
            type: String(f.type ?? "text"),
            description: f.description ?? null,
            instructions: f.instructions ?? null,
            required: !!f.required,
            options: f.options ? JSON.stringify(f.options) : null,
            position: typeof f.position === "number" ? f.position : i,
          })),
        });
      }
      return created;
    });

    const full = await db.schema.findUnique({
      where: { id: schema.id },
      include: { fields: { orderBy: { position: "asc" } } },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "schema",
      entityId: schema.id,
      after: { name, fieldCount: fieldsInput.length },
    });

    return NextResponse.json(serializeSchema(full), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create schema" },
      { status: 500 }
    );
  }
}
