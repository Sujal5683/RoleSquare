// POST /api/schemas/[id]/clone — clones a schema (including its fields)
// with a new name and version 1.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSchema } from "@/lib/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const newName = body.name || "Cloned Schema";

    // Fetch the schema with its fields
    const original = await db.schema.findFirst({
      where: { id, organizationId },
      include: { fields: true },
    });

    if (!original) {
      return NextResponse.json({ error: "Schema not found" }, { status: 404 });
    }

    // Create the cloned schema with all fields copied
    const cloned = await db.schema.create({
      data: {
        organizationId,
        createdBy: user.id,
        name: newName,
        description: original.description
          ? `${original.description} (cloned)`
          : "Cloned schema",
        version: 1,
        promptTemplate: original.promptTemplate,
        fields: {
          create: original.fields.map((f) => ({
            name: f.name,
            type: f.type,
            description: f.description,
            instructions: f.instructions,
            required: f.required,
            options: f.options,
            position: f.position,
          })),
        },
      },
      include: { fields: true },
    });

    await logAudit({
      organizationId,
      actorType: "user",
      actorId: user.id,
      action: "create",
      entity: "schema",
      entityId: cloned.id,
      after: { name: cloned.name, clonedFrom: id },
      reason: `Cloned schema from ${original.name}`,
    });

    return NextResponse.json(serializeSchema(cloned));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clone schema" },
      { status: 500 }
    );
  }
}
