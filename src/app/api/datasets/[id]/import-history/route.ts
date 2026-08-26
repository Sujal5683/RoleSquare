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

    const [events, total] = await Promise.all([
      db.importJob.findMany({
        where: { datasetId: id, organizationId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.importJob.count({ where: { datasetId: id, organizationId } }),
    ]);

    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        status: e.status,
        direction: "import",
        triggeredBy: e.userId,
        rowsAdded: e.insertedRows,
        rowsUpdated: e.updatedRows,
        rowsDeleted: 0,
        conflicts: 0,
        errors: e.errorRows,
        schemaChanges: null,
        errorDetail: e.errors ? formatErrors(e.errors) : null,
        startedAt: e.startedAt?.toISOString() || e.createdAt.toISOString(),
        finishedAt: e.finishedAt?.toISOString() ?? null,
        durationMs: e.finishedAt && e.startedAt
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
      { error: err instanceof Error ? err.message : "Failed to load history" },
      { status: 500 }
    );
  }
}

function formatErrors(errorsJson: string): string {
  try {
    const parsed = JSON.parse(errorsJson);
    if (Array.isArray(parsed)) {
      return parsed.map(e => `Row ${e.row}: ${e.message}`).join("\n");
    }
    return String(errorsJson);
  } catch {
    return errorsJson;
  }
}
