// GET /api/google-sheets/mappings/[id]/history?limit=20&offset=0
// Returns sync event history for a SheetMapping.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireOrgContext(req);
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // IDOR: verify mapping belongs to this org
    const mapping = await db.sheetMapping.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    const [events, total] = await Promise.all([
      db.syncEvent.findMany({
        where: { sheetMappingId: id },
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.syncEvent.count({ where: { sheetMappingId: id } }),
    ]);

    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        status: e.status,
        direction: e.direction,
        triggeredBy: e.triggeredBy,
        rowsAdded: e.rowsAdded,
        rowsUpdated: e.rowsUpdated,
        rowsDeleted: e.rowsDeleted,
        conflicts: e.conflicts,
        errors: e.errors,
        schemaChanges: e.schemaChanges ? safeJson(e.schemaChanges) : null,
        errorDetail: e.errorDetail,
        startedAt: e.startedAt.toISOString(),
        finishedAt: e.finishedAt?.toISOString() ?? null,
        durationMs: e.finishedAt
          ? e.finishedAt.getTime() - e.startedAt.getTime()
          : null,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get sync history" },
      { status: 500 }
    );
  }
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
