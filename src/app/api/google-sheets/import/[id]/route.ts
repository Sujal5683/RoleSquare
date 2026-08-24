// GET /api/google-sheets/import/[id] — poll import job status + progress

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

    // IDOR: verify job belongs to this org
    const job = await db.importJob.findFirst({
      where: { id, organizationId },
      include: {
        mappings: {
          select: {
            id: true,
            sheetHeader: true,
            columnId: true,
            columnName: true,
            dataType: true,
            isNewColumn: true,
            confidence: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Import job not found" }, { status: 404 });
    }

    const progress = job.totalRows > 0
      ? Math.round((job.processedRows / job.totalRows) * 100)
      : null;

    return NextResponse.json({
      id: job.id,
      status: job.status,
      datasetId: job.datasetId,
      newDatasetName: job.newDatasetName,
      spreadsheetId: job.spreadsheetId,
      spreadsheetName: job.spreadsheetName,
      sheetName: job.sheetName,
      importMode: job.importMode,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      insertedRows: job.insertedRows,
      updatedRows: job.updatedRows,
      skippedRows: job.skippedRows,
      errorRows: job.errorRows,
      progressPercent: progress,
      errors: job.errors ? safeJson(job.errors) : [],
      mappings: job.mappings,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get import status" },
      { status: 500 }
    );
  }
}

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return []; }
}
