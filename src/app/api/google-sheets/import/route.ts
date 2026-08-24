// POST /api/google-sheets/import — start a new import job
//
// Body: {
//   sheetsAccountId: string,
//   spreadsheetId: string,
//   spreadsheetName?: string,
//   sheetName: string,
//   datasetId?: string,          // existing dataset — null to create new
//   newDatasetName?: string,     // if datasetId is null
//   importMode: "append" | "update_existing" | "append_update" | "replace",
//   matchField?: string,         // columnId for update_existing mode
//   columnMappings: Array<{
//     sheetHeader: string,
//     columnId?: string | null,
//     columnName?: string,
//     dataType?: string,
//     isNewColumn?: boolean,
//   }>
// }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { processImport } from "@/lib/services/import-service";

const VALID_MODES = ["append", "update_existing", "append_update", "replace"];

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));

    const {
      sheetsAccountId,
      spreadsheetId,
      spreadsheetName,
      sheetName,
      datasetId,
      newDatasetName,
      importMode = "append",
      matchField,
      columnMappings = [],
    } = body;

    if (!sheetsAccountId || !spreadsheetId || !sheetName) {
      return NextResponse.json(
        { error: "sheetsAccountId, spreadsheetId, and sheetName are required" },
        { status: 400 }
      );
    }

    if (!VALID_MODES.includes(importMode)) {
      return NextResponse.json(
        { error: `importMode must be one of: ${VALID_MODES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!datasetId && !newDatasetName) {
      return NextResponse.json(
        { error: "Either datasetId or newDatasetName is required" },
        { status: 400 }
      );
    }

    // IDOR: verify Sheets account belongs to this org
    const account = await db.googleSheetsAccount.findFirst({
      where: { id: sheetsAccountId, organizationId },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json({ error: "Sheets account not found" }, { status: 404 });
    }

    // IDOR: verify dataset belongs to this org (if provided)
    if (datasetId) {
      const dataset = await db.dataset.findFirst({
        where: { id: datasetId, organizationId },
        select: { id: true },
      });
      if (!dataset) {
        return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
      }
    }

    // Create ImportJob record
    const importJob = await db.importJob.create({
      data: {
        organizationId,
        userId: user.id,
        datasetId: datasetId || null,
        newDatasetName: newDatasetName || null,
        sheetsAccountId,
        spreadsheetId,
        spreadsheetName: spreadsheetName || null,
        sheetName,
        importMode,
        matchField: matchField || null,
        status: "pending",
        mappings: {
          create: columnMappings.map((m: {
            sheetHeader: string;
            columnId?: string | null;
            columnName?: string;
            dataType?: string;
            isNewColumn?: boolean;
            confidence?: number;
          }) => ({
            sheetHeader: m.sheetHeader,
            columnId: m.columnId || null,
            columnName: m.columnName || null,
            dataType: m.dataType || null,
            isNewColumn: m.isNewColumn ?? false,
            confidence: m.confidence ?? 0,
          })),
        },
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "import_job",
      entityId: importJob.id,
      after: {
        spreadsheetId,
        sheetName,
        importMode,
        datasetId: datasetId || null,
      },
    });

    // Start processing asynchronously
    processImport({ importJobId: importJob.id, organizationId, userId: user.id }).catch((err) =>
      console.error(`[import] Job ${importJob.id} failed:`, err)
    );

    return NextResponse.json(
      { importJobId: importJob.id, status: "pending" },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start import" },
      { status: 500 }
    );
  }
}
