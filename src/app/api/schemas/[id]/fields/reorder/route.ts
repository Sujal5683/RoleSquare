import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    
    // Quick check if schema exists
    const schema = await db.schema.findUnique({
      where: { id },
      select: { organizationId: true },
    });

    if (!schema) {
      return NextResponse.json({ error: "Schema not found" }, { status: 404 });
    }

    if (schema.organizationId !== organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { orderedFieldIds } = await req.json();

    if (!Array.isArray(orderedFieldIds)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Update positions transactionally
    await db.$transaction(
      orderedFieldIds.map((fieldId, index) =>
        db.schemaField.update({
          where: { id: fieldId },
          data: { position: index },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json({ error: "Failed to reorder fields" }, { status: 500 });
  }
}
