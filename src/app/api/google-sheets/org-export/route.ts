// POST /api/google-sheets/org-export
//
// Exports all selected datasets from an organization into a single Google
// Spreadsheet. Each dataset gets its own tab named after the dataset.
//
// Improvements over previous version:
//  - Data is written immediately using rich formatting (not deferred to runSync)
//  - DB mappings are created AFTER data is written (not before) to avoid
//    incomplete states if the write fails
//  - Uses `after()` (Next.js 15 lifecycle) for post-response tasks
//  - applyTableFormatting called per tab after data is written
//
// Body: {
//   sheetsAccountId: string,
//   spreadsheetId?: string | null,   // null = create new
//   spreadsheetName?: string,         // name for the new spreadsheet
//   createNew: boolean,
//   datasetIds: string[],
//   direction?: "bidirectional" | "to_sheet" | "from_sheet",
//   conflictStrategy?: "flag" | "app_wins" | "sheet_wins",
//   scheduleExpr?: string,            // e.g. "5m", "1h", "manual"
// }
//
// Response: { spreadsheetUrl: string, tabsCreated: number }

import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { getSheetsClient, withRetry } from "@/lib/services/google-sheets-client";

import {
  writeFormattedSheet,
  applyTableFormatting,
} from "@/lib/services/sheets-formatter";

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
    const body = await req.json().catch(() => ({}));

    const {
      sheetsAccountId,
      spreadsheetId: existingSpreadsheetId,
      spreadsheetName,
      createNew = true,
      datasetIds = [],
      direction = "bidirectional",
      conflictStrategy = "flag",
      scheduleExpr = "5m",
    } = body;

    if (!sheetsAccountId || !Array.isArray(datasetIds) || datasetIds.length === 0) {
      return NextResponse.json(
        { error: "sheetsAccountId and at least one datasetId are required" },
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

    // Load all requested datasets (only those in this org)
    const datasets = await db.dataset.findMany({
      where: { id: { in: datasetIds }, organizationId },
      include: {
        columnDefs: {
          where: { isDeleted: false },
          orderBy: { position: "asc" },
        },
        records: {
          include: { values: true },
        },
      },
    });

    if (!datasets.length) {
      return NextResponse.json({ error: "No matching datasets found" }, { status: 404 });
    }

    // ── Step 1: Create or open the spreadsheet ──────────────────────────────
    let finalSpreadsheetId: string;
    let spreadsheetUrl: string;

    // Map to store sheetId per tabTitle
    const sheetIdMap = new Map<string, number>();
    const sheets = await getSheetsClient(sheetsAccountId);

    if (createNew || !existingSpreadsheetId) {
      const sheetTitles = datasets.map((d) =>
        d.name.slice(0, 100).replace(/[\\\/\?\*\[\]]/g, "_")
      );

      const created = await withRetry(() =>
        sheets.spreadsheets.create({
          requestBody: {
            properties: {
              title: spreadsheetName || "Organization Datasets Export",
            },
            sheets: sheetTitles.map((title, i) => ({
              properties: { title, index: i },
            })),
          },
        })
      );

      finalSpreadsheetId = created.data.spreadsheetId!;
      spreadsheetUrl =
        created.data.spreadsheetUrl ??
        `https://docs.google.com/spreadsheets/d/${finalSpreadsheetId}`;

      created.data.sheets?.forEach((s) => {
        if (s.properties?.title && s.properties?.sheetId != null) {
          sheetIdMap.set(s.properties.title, s.properties.sheetId as number);
        }
      });
    } else {
      finalSpreadsheetId = existingSpreadsheetId;
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${finalSpreadsheetId}`;

      const spreadsheet = await withRetry(() =>
        sheets.spreadsheets.get({ spreadsheetId: finalSpreadsheetId })
      );

      const existingSheets = spreadsheet.data.sheets || [];
      const existingTitles = new Set(existingSheets.map((s) => s.properties?.title));

      existingSheets.forEach((s) => {
        if (s.properties?.title && s.properties?.sheetId != null) {
          sheetIdMap.set(s.properties.title, s.properties.sheetId as number);
        }
      });

      const requests = datasets
        .map((d) => d.name.slice(0, 100).replace(/[\\\/\?\*\[\]]/g, "_"))
        .filter((title) => !existingTitles.has(title))
        .map((title) => ({ addSheet: { properties: { title } } }));

      if (requests.length > 0) {
        const batchRes = await withRetry(() =>
          sheets.spreadsheets.batchUpdate({
            spreadsheetId: finalSpreadsheetId,
            requestBody: { requests },
          })
        );

        batchRes.data.replies?.forEach((reply) => {
          if (
            reply.addSheet?.properties?.title &&
            reply.addSheet?.properties?.sheetId != null
          ) {
            sheetIdMap.set(
              reply.addSheet.properties.title,
              reply.addSheet.properties.sheetId as number
            );
          }
        });
      }
    }

    // ── Step 2: Write data + formatting to each tab immediately ────────────
    // This ensures data is visible in the sheet even before any sync runs.
    const { randomUUID } = await import("crypto");
    const tabsCreated: string[] = [];
    const tabDataMap: Map<string, { columnNames: string[]; dataRows: Array<{ values: string[]; externalId: string }> }> = new Map();

    for (const dataset of datasets) {
      const tabTitle = dataset.name.slice(0, 100).replace(/[\\\/\?\*\[\]]/g, "_");
      const sheetId = sheetIdMap.get(tabTitle);
      if (sheetId === undefined) continue;

      // Get column definitions (pre-loaded)
      const columns = dataset.columnDefs.map((c) => ({
        columnId: c.columnId,
        name: c.name,
        dataType: c.dataType,
        position: c.position,
        required: c.required,
      }));

      if (!columns.length) {
        console.warn(`[org-export] Dataset ${dataset.id} has no columns, skipping data write`);
        tabsCreated.push(tabTitle);
        continue;
      }

      const columnNames = columns.map((c) => c.name);
      const dataRows = dataset.records.map((record) => {
        const values = columns.map((col) => {
          const val = record.values.find((v) => v.fieldId === col.columnId);
          if (!val) return "";
          try {
            const parsed = JSON.parse(val.value);
            return parsed == null ? "" : String(parsed);
          } catch {
            return String(val.value ?? "");
          }
        });
        return { values, externalId: randomUUID() };
      });

      tabDataMap.set(tabTitle, { columnNames, dataRows });

      // Write formatted data to the tab
      try {
        await writeFormattedSheet(
          sheetsAccountId,
          finalSpreadsheetId,
          sheetId,
          tabTitle,
          columnNames,
          dataRows,
          0
        );

        await applyTableFormatting(sheetsAccountId, finalSpreadsheetId, {
          columnCount: columns.length,
          rowCount: dataRows.length + 1,
          sheetId,
        });

        tabsCreated.push(tabTitle);
      } catch (err) {
        console.error(
          `[org-export] Failed to write data for tab "${tabTitle}":`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // ── Step 3: Create DB Mappings after data is written ────────────────────
    // Using `after()` to run DB writes after response is sent, keeping the
    // response fast. This is safe because data is already in the sheet.
    after(async () => {
      try {
        const conn = await db.spreadsheetConnection.upsert({
          where: {
            organizationId_spreadsheetId: {
              organizationId,
              spreadsheetId: finalSpreadsheetId,
            },
          },
          create: {
            organizationId,
            sheetsAccountId,
            spreadsheetId: finalSpreadsheetId,
            spreadsheetName: spreadsheetName || "Organization Datasets Export",
          },
          update: { sheetsAccountId },
        });

        for (const dataset of datasets) {
          const tabTitle = dataset.name.slice(0, 100).replace(/[\\\/\?\*\[\]]/g, "_");
          const sheetId = sheetIdMap.get(tabTitle);
          if (sheetId === undefined) continue;

          // Only create mapping if not already linked
          const existing = await db.sheetMapping.findFirst({
            where: {
              datasetId: dataset.id,
              spreadsheetConnectionId: conn.id,
              sheetName: tabTitle,
              status: { not: "unlinked" },
            },
            select: { id: true },
          });
          if (existing) continue;

          const tabData = tabDataMap.get(tabTitle);

          const m = await db.sheetMapping.create({
            data: {
              organizationId,
              datasetId: dataset.id,
              spreadsheetConnectionId: conn.id,
              sheetId,
              sheetName: tabTitle,
              direction,
              status: "active",
            },
          });

          const parsedScheduleExpr = scheduleExpr === "manual" ? "5m" : scheduleExpr;
          await db.syncState.create({
            data: {
              sheetMappingId: m.id,
              enabled: true,
              conflictStrategy,
              scheduleMode: scheduleExpr === "manual" ? "manual" : "interval",
              scheduleExpr: parsedScheduleExpr,
            },
          });

            // Create external ID mappings for all written rows
          if (tabData) {
            const externalIdPayloads: any[] = [];
            for (let i = 0; i < dataset.records.length && i < tabData.dataRows.length; i++) {
              externalIdPayloads.push({
                datasetId: dataset.id,
                recordId: dataset.records[i].id,
                sheetMappingId: m.id,
                externalId: tabData.dataRows[i].externalId,
                sheetRowIndex: i + 2, // 1-based, row 1 = header
                lastSyncedAt: new Date(),
              });
            }

            if (externalIdPayloads.length > 0) {
              await db.datasetRowExternalId.createMany({
                data: externalIdPayloads,
              });
            }

            await db.sheetMapping.update({
              where: { id: m.id },
              data: { rowIdColumnIndex: dataset.columnDefs.length },
            });
          }
        }
      } catch (err) {
        console.error("[org-export] Background DB mapping creation failed:", err);
      }
    });

    return NextResponse.json({
      spreadsheetUrl,
      spreadsheetId: finalSpreadsheetId,
      tabsCreated: tabsCreated.length,
      datasetsExported: tabsCreated.length,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("[org-export] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
