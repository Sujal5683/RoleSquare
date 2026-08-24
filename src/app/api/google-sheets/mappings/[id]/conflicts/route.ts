// GET  /api/google-sheets/mappings/[id]/conflicts — list unresolved conflicts
// POST /api/google-sheets/mappings/[id]/conflicts/[conflictId]/resolve — resolve a conflict

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import {
  getUnresolvedConflicts,
  resolveConflict,
} from "@/lib/services/conflict-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireOrgContext(req);

    // IDOR
    const mapping = await db.sheetMapping.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    const conflicts = await getUnresolvedConflicts(id);
    return NextResponse.json(conflicts);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get conflicts" },
      { status: 500 }
    );
  }
}
