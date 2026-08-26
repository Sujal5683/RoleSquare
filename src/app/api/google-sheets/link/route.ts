// POST /api/google-sheets/link
// Creates (or re-uses) a SpreadsheetConnection, then creates a SheetMapping
// for the specified tab. Optionally triggers an initial push to the sheet.
//
// Body: {
//   datasetId: string,
//   sheetsAccountId: string,
//   spreadsheetId: string,
//   spreadsheetName?: string,
//   sheetId?: number,
//   sheetName: string,
//   direction?: "bidirectional" | "to_sheet" | "from_sheet",
//   conflictStrategy?: "flag" | "app_wins" | "sheet_wins",
//   doPush?: boolean,
//   columnMappings?: Array<{ appColumnId?: string | null; sheetHeader: string; dataType?: string; isNewColumn?: boolean; confidence?: number }>
// }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { runSync } from "@/lib/services/sync-engine";
import { createColumnsFromMappings } from "@/lib/services/import-service";

const VALID_DIRECTIONS = ["bidirectional", "to_sheet", "from_sheet"];
const VALID_STRATEGIES = ["flag", "app_wins", "sheet_wins"];

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));

    const {
      datasetId,
      sheetsAccountId,
      spreadsheetId,
      spreadsheetName = "Untitled",
      sheetId = 0,
      sheetName,
      direction = "bidirectional",
      conflictStrategy = "flag",
      scheduleExpr = "5m",
      doPush = false,
      columnMappings = [],
    } = body;

    if (!datasetId || !sheetsAccountId || !spreadsheetId || !sheetName) {
      return NextResponse.json(
        { error: "datasetId, sheetsAccountId, spreadsheetId, and sheetName are required" },
        { status: 400 }
      );
    }

    if (!VALID_DIRECTIONS.includes(direction)) {
      return NextResponse.json(
        { error: `direction must be one of: ${VALID_DIRECTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!VALID_STRATEGIES.includes(conflictStrategy)) {
      return NextResponse.json(
        { error: `conflictStrategy must be one of: ${VALID_STRATEGIES.join(", ")}` },
        { status: 400 }
      );
    }

    // IDOR: verify dataset belongs to this org
    const dataset = await db.dataset.findFirst({
      where: { id: datasetId, organizationId },
      select: { id: true, name: true },
    });
    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    // IDOR: verify Sheets account belongs to this org
    const account = await db.googleSheetsAccount.findFirst({
      where: { id: sheetsAccountId, organizationId },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json({ error: "Sheets account not found" }, { status: 404 });
    }

    // Transactionally: upsert SpreadsheetConnection + create SheetMapping + SyncState
    const mapping = await db.$transaction(async (tx) => {
      // Upsert the spreadsheet-level connection (idempotent — same spreadsheet
      // can be linked by multiple tabs/datasets in the same org).
      const conn = await tx.spreadsheetConnection.upsert({
        where: {
          organizationId_spreadsheetId: { organizationId, spreadsheetId },
        },
        create: {
          organizationId,
          sheetsAccountId,
          spreadsheetId,
          spreadsheetName,
        },
        update: {
          spreadsheetName,
          // update account binding if re-linking with a different account
          sheetsAccountId,
        },
      });

      // Guard: reject if this exact tab is already linked
      const existing = await tx.sheetMapping.findFirst({
        where: {
          datasetId,
          spreadsheetConnectionId: conn.id,
          sheetName,
          status: { not: "unlinked" },
        },
        select: { id: true },
      });
      if (existing) {
        throw new Error("ALREADY_LINKED");
      }

      const m = await tx.sheetMapping.create({
        data: {
          organizationId,
          datasetId,
          spreadsheetConnectionId: conn.id,
          sheetId: Number(sheetId),
          sheetName,
          direction,
          status: "active",
        },
      });

      // Create SyncState for scheduling/tracking
      await tx.syncState.create({
        data: {
          sheetMappingId: m.id,
          enabled: true,
          conflictStrategy,
          scheduleMode: scheduleExpr === "manual" ? "manual" : "interval",
          scheduleExpr: scheduleExpr === "manual" ? "5m" : scheduleExpr,
        },
      });

      return m;
    });

    // Run column creation outside transaction to avoid nesting issues with schema versions
    if (columnMappings && columnMappings.length > 0) {
      const hasNewColumns = columnMappings.some((m: any) => m.isNewColumn);
      if (hasNewColumns) {
        await createColumnsFromMappings(datasetId, columnMappings, user.id, {
          datasetName: dataset.name,
          organizationId,
        });
      }
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "sheet_mapping",
      entityId: mapping.id,
      after: { datasetId, spreadsheetId, sheetName, direction },
    });

    // Optionally push existing records to sheet (fire-and-forget)
    if (doPush) {
      runSync(mapping.id, "manual").catch((err) =>
        console.error(`[link] Initial push failed for ${mapping.id}:`, err)
      );
    }

    return NextResponse.json({ sheetMappingId: mapping.id }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    if (err instanceof Error && err.message === "ALREADY_LINKED") {
      return NextResponse.json(
        { error: "This tab is already linked to the dataset" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to link dataset" },
      { status: 500 }
    );
  }
}
