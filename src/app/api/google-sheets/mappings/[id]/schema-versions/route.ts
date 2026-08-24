// GET  /api/google-sheets/mappings/[id]/schema-versions — list schema versions
// POST /api/google-sheets/mappings/[id]/schema-versions/[versionId]/rollback

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { getSchemaVersions } from "@/lib/services/schema-versioning";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sheetMappingId } = await params;
    const { organizationId } = await requireOrgContext(req);

    // IDOR: resolve mapping → datasetId
    const mapping = await db.sheetMapping.findFirst({
      where: { id: sheetMappingId, organizationId },
      select: { datasetId: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    const versions = await getSchemaVersions(mapping.datasetId);
    return NextResponse.json(versions);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get schema versions" },
      { status: 500 }
    );
  }
}
