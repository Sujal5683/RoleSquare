// Export Service
//
// Exports application dataset records to Google Sheets with full rich formatting:
//  - Bold frozen header row with auto-filter and header protection
//  - Rich-text link chips for URL/Drive cells (multiple chips per cell)
//  - Consistent column widths (80–220px), CLIP text overflow
//  - Alternating row banding for readability
//  - Hidden __row_id__ column appended for future sync linkage
//
// Supports four modes:
//   new_sheet     — create a new Google Spreadsheet + write data
//   new_tab       — add a new tab to an existing spreadsheet
//   replace_tab   — overwrite an existing tab's data
//   append_tab    — append rows to an existing tab

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  createSpreadsheet,
  addSheetTab,
  getSpreadsheetMeta,
  renameSheetTab,
} from "@/lib/services/sheet-discovery";
import { getCurrentColumns } from "@/lib/services/schema-versioning";
import {
  writeFormattedSheet,
  appendFormattedRows,
  applyTableFormatting,
} from "@/lib/services/sheets-formatter";
import { getSheetsClient, withRetry } from "@/lib/services/google-sheets-client";
import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExportMode = "new_sheet" | "new_tab" | "replace_tab" | "append_tab";

export interface ExportParams {
  datasetId: string;
  organizationId: string;
  userId: string;
  sheetsAccountId: string;
  mode: ExportMode;
  spreadsheetId?: string;    // required for new_tab / replace_tab / append_tab
  tabName?: string;          // required for replace_tab / append_tab
  newSheetTitle?: string;    // for new_sheet mode
  selectedColumnIds?: string[]; // if provided, only export these columns
}

export interface ExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  rowsExported: number;
}

// ── Main export function ──────────────────────────────────────────────────────

export async function exportDataset(params: ExportParams): Promise<ExportResult> {
  const {
    datasetId,
    organizationId,
    userId,
    sheetsAccountId,
    mode,
    spreadsheetId,
    tabName,
    newSheetTitle,
    selectedColumnIds,
  } = params;

  // 1. Load dataset + records
  const dataset = await db.dataset.findUnique({
    where: { id: datasetId },
    include: { records: { include: { values: true } } },
  });
  if (!dataset) throw new Error("Dataset not found");

  // 2. Get column definitions
  let columns = await getCurrentColumns(datasetId);
  if (!columns.length) {
    // Fall back to SchemaField if no DatasetColumnDef yet
    const schema = await db.schema.findFirst({
      where: { id: dataset.schemaId ?? undefined },
      include: { fields: { orderBy: { position: "asc" } } },
    });
    columns = (schema?.fields ?? []).map((f, i) => ({
      columnId: f.id,
      name: f.name,
      dataType: f.type,
      position: i,
      required: f.required,
    }));
  }

  // Apply column filter
  const exportColumns =
    selectedColumnIds && selectedColumnIds.length > 0
      ? columns.filter((c) => selectedColumnIds.includes(c.columnId))
      : columns;

  if (!exportColumns.length) throw new Error("No columns to export");

  // 3. Build row data — each record becomes { values: string[], externalId: string }
  const columnNames = exportColumns.map((c) => c.name);

  const dataRows = dataset.records.map((record) => {
    const values = exportColumns.map((col) => {
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

  // 4. Resolve destination spreadsheet + sheetId
  let targetSpreadsheetId: string;
  let targetSheetName: string;
  let targetSheetId: number;
  let spreadsheetUrl: string;

  switch (mode) {
    case "new_sheet": {
      const title =
        newSheetTitle || `${dataset.name} — ${new Date().toLocaleDateString()}`;
      const created = await createSpreadsheet(sheetsAccountId, title);
      targetSpreadsheetId = created.spreadsheetId;
      spreadsheetUrl = created.spreadsheetUrl;
      targetSheetName = "Sheet1";

      // Rename default "Sheet1" tab to dataset name
      try {
        const meta = await getSpreadsheetMeta(sheetsAccountId, targetSpreadsheetId);
        const defaultTab = meta.tabs[0];
        if (defaultTab?.title === "Sheet1" && defaultTab?.sheetId !== undefined) {
          const safeTabName = dataset.name.slice(0, 100);
          await renameSheetTab(
            sheetsAccountId,
            targetSpreadsheetId,
            defaultTab.sheetId,
            safeTabName
          );
          targetSheetName = safeTabName;
          targetSheetId = defaultTab.sheetId;
        } else {
          targetSheetId = defaultTab?.sheetId ?? 0;
        }
      } catch {
        console.warn("[export] Could not rename Sheet1 tab; writing to 'Sheet1'");
        targetSheetId = 0;
      }
      break;
    }

    case "new_tab": {
      if (!spreadsheetId) throw new Error("spreadsheetId required for new_tab mode");
      targetSpreadsheetId = spreadsheetId;
      const newTabTitle =
        tabName || `${dataset.name} ${new Date().toLocaleDateString()}`;
      const tab = await addSheetTab(sheetsAccountId, spreadsheetId, newTabTitle);
      targetSheetName = tab.title;
      targetSheetId = tab.sheetId;
      const meta = await getSpreadsheetMeta(sheetsAccountId, spreadsheetId);
      spreadsheetUrl =
        meta.url || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      break;
    }

    case "replace_tab":
    case "append_tab": {
      if (!spreadsheetId || !tabName) {
        throw new Error(
          "spreadsheetId and tabName required for replace_tab/append_tab"
        );
      }
      targetSpreadsheetId = spreadsheetId;
      targetSheetName = tabName;
      const meta = await getSpreadsheetMeta(sheetsAccountId, spreadsheetId);
      spreadsheetUrl =
        meta.url || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      const matchTab = meta.tabs.find(
        (t) => t.title === tabName
      );
      if (!matchTab) {
        throw new Error(
          `Tab "${tabName}" not found in spreadsheet. Available tabs: ${meta.tabs.map((t) => t.title).join(", ")}`
        );
      }
      targetSheetId = matchTab.sheetId;
      break;
    }

    default:
      throw new Error(`Unknown export mode: ${mode}`);
  }

  // 5. Write data using rich formatting
  if (mode === "replace_tab") {
    // Clear existing content first
    const sheets = await getSheetsClient(sheetsAccountId);
    await withRetry(() =>
      sheets.spreadsheets.values.clear({
        spreadsheetId: targetSpreadsheetId,
        range: `'${targetSheetName}'`,
      })
    );
    // Write header + all rows from row 0
    await writeFormattedSheet(
      sheetsAccountId,
      targetSpreadsheetId,
      targetSheetId,
      targetSheetName,
      columnNames,
      dataRows,
      0
    );
  } else if (mode === "append_tab") {
    // Append rows only (no header re-write)
    await appendFormattedRows(
      sheetsAccountId,
      targetSpreadsheetId,
      targetSheetId,
      targetSheetName,
      dataRows
    );
  } else {
    // new_sheet or new_tab — write header + rows from row 0
    await writeFormattedSheet(
      sheetsAccountId,
      targetSpreadsheetId,
      targetSheetId,
      targetSheetName,
      columnNames,
      dataRows,
      0
    );
  }

  // 6. Apply table formatting (freeze, filter, banding, column widths, protection)
  //    Only apply for modes that wrote a full header row
  if (mode !== "append_tab") {
    try {
      await applyTableFormatting(sheetsAccountId, targetSpreadsheetId, {
        columnCount: exportColumns.length,
        rowCount: dataRows.length + 1, // +1 for header
        sheetId: targetSheetId,
      });
    } catch (err) {
      // Non-fatal — formatting failures don't invalidate the data export
      console.warn("[export] Table formatting failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  }

  // 7. Audit log
  await logAudit({
    organizationId,
    actorId: userId,
    action: "export",
    entity: "dataset",
    entityId: datasetId,
    after: {
      mode,
      spreadsheetId: targetSpreadsheetId,
      sheetName: targetSheetName,
      rowsExported: dataRows.length,
      columnsExported: exportColumns.length,
    },
  });

  return {
    spreadsheetId: targetSpreadsheetId,
    spreadsheetUrl,
    sheetName: targetSheetName,
    rowsExported: dataRows.length,
  };
}
