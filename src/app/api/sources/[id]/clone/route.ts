// POST /api/sources/[id]/clone — clones a source (including its rules)
// with a new name. The cloned source starts in "paused" status so the
// user can review and activate it.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSource } from "@/lib/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const newName = body.name || "Cloned Source";

    // Fetch the source with its rules
    const original = await db.source.findFirst({
      where: { id, organizationId },
      include: { rules: true },
    });

    if (!original) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Create the cloned source with all the same config, but paused
    const cloned = await db.source.create({
      data: {
        organizationId,
        ownerUserId: user.id,
        googleConnectionId: original.googleConnectionId,
        schemaId: original.schemaId,
        datasetId: original.datasetId,
        name: newName,
        description: original.description
          ? `${original.description} (cloned)`
          : "Cloned source",
        sourceType: original.sourceType,
        status: "paused", // Always start paused so user can review
        runState: "idle",
        scheduleMode: original.scheduleMode,
        scheduleExpr: original.scheduleExpr,
        config: original.config,
        rules: {
          create: original.rules.map((r) => ({
            filterType: r.filterType,
            operator: r.operator,
            value: r.value,
            position: r.position,
          })),
        },
      },
      include: {
        rules: true,
        googleConnection: true,
        schema: { include: { fields: true } },
        dataset: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      organizationId,
      actorType: "user",
      actorId: user.id,
      action: "create",
      entity: "source",
      entityId: cloned.id,
      after: { name: cloned.name, clonedFrom: id },
      reason: `Cloned source from ${original.name}`,
    });

    return NextResponse.json(serializeSource(cloned));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clone source" },
      { status: 500 }
    );
  }
}
