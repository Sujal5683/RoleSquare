// POST /api/google-sheets/mappings/[id]/schema-versions/[versionId]/rollback
// Rolls back a dataset's schema to a previous version.
// DESTRUCTIVE — requires explicit confirmation from the UI.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { rollbackToVersion } from "@/lib/services/schema-versioning";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: sheetMappingId, versionId } = await params;
    const { user, organizationId } = await requireRole(req, "member");

    // IDOR: resolve mapping → datasetId
    const mapping = await db.sheetMapping.findFirst({
      where: { id: sheetMappingId, organizationId },
      select: { datasetId: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    // Require explicit confirmation field
    const body = await req.json().catch(() => ({}));
    if (body?.confirmed !== true) {
      return NextResponse.json(
        { error: "Rollback requires confirmed: true in request body" },
        { status: 400 }
      );
    }

    const result = await rollbackToVersion(
      mapping.datasetId,
      versionId,
      organizationId,
      user.id
    );

    return NextResponse.json({
      ok: true,
      newVersion: result.newVersion,
      columnCount: result.columns.length,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to rollback schema" },
      { status: 500 }
    );
  }
}
