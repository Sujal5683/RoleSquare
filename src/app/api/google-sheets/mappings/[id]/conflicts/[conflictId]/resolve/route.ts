// POST /api/google-sheets/mappings/[id]/conflicts/[conflictId]/resolve
// Resolves a single sync conflict.
//
// Body: { resolution: "keep_app" | "keep_sheet" | "manual", manualValue?: unknown }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { resolveConflict, type ConflictResolution } from "@/lib/services/conflict-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; conflictId: string }> }
) {
  try {
    const { id: sheetMappingId, conflictId } = await params;
    const { user, organizationId } = await requireOrgContext(req);

    // IDOR: verify mapping belongs to org
    const mapping = await db.sheetMapping.findFirst({
      where: { id: sheetMappingId, organizationId },
      select: { id: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    // Verify conflict belongs to this mapping
    const conflict = await db.syncConflict.findFirst({
      where: { id: conflictId, sheetMappingId },
      select: { id: true, status: true },
    });
    if (!conflict) {
      return NextResponse.json({ error: "Conflict not found" }, { status: 404 });
    }
    if (conflict.status !== "pending") {
      return NextResponse.json(
        { error: "Conflict already resolved" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const resolution = body?.resolution as ConflictResolution;
    if (!["keep_app", "keep_sheet", "manual"].includes(resolution)) {
      return NextResponse.json(
        { error: "resolution must be keep_app, keep_sheet, or manual" },
        { status: 400 }
      );
    }

    const result = await resolveConflict(
      conflictId,
      resolution,
      user.id,
      organizationId,
      body?.manualValue
    );

    return NextResponse.json({ ok: true, resolvedValue: result.resolvedValue });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resolve conflict" },
      { status: 500 }
    );
  }
}
