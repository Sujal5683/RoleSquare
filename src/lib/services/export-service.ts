// Export Service
//
// Exports application dataset records to Google Sheets.
// Supports:
//   new_sheet     — create a new Google Spreadsheet + write data
//   new_tab       — add a new tab to an existing spreadsheet
//   replace_tab   — overwrite an existing tab's data
//   append_tab    — append rows to an existing tab

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  createSpreadsheet,
  addSheetTab,
  writeSheetHeaders,
  appendRowsToSheet,
  writeRowsToSheet,
  getSpreadsheetMeta,
} from "@/lib/services/sheet-discovery";
import { getCurrentColumns } from "@/lib/services/schema-versioning";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExportMode = "new_sheet" | "new_tab" | "replace_tab" | "append_tab";

export interface ExportParams {
  datasetId: string;
  organizationId: string;
  userId: string;
  sheetsAccountId: string;
  mode: ExportMode;
  spreadsheetId?: string;    // required for new_tab / replace_tab / append_tab
  tabName?: string;          // required for new_tab / replace_tab / append_tab
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

  // 3. Build row data
  const headers = exportColumns.map((c) => c.name);
  const rows: string[][] = dataset.records.map((record) =>
    exportColumns.map((col) => {
      const val = record.values.find((v) => v.fieldId === col.columnId);
      if (!val) return "";
      try {
        const parsed = JSON.parse(val.value);
        return parsed == null ? "" : String(parsed);
      } catch {
        return String(val.value ?? "");
      }
    })
  );

  // 4. Resolve destination
  let targetSpreadsheetId: string;
  let targetSheetName: string;
  let spreadsheetUrl: string;

  switch (mode) {
    case "new_sheet": {
      const title =
        newSheetTitle || `${dataset.name} — ${new Date().toLocaleDateString()}`;
      const created = await createSpreadsheet(sheetsAccountId, title);
      targetSpreadsheetId = created.spreadsheetId;
      targetSheetName = dataset.name.slice(0, 100); // Sheet tab title max 100 chars
      spreadsheetUrl = created.spreadsheetUrl;

      // Rename the default "Sheet1" tab
      const meta = await getSpreadsheetMeta(sheetsAccountId, targetSpreadsheetId);
      if (meta.tabs[0]?.title === "Sheet1") {
        // We'll just write to it
      }
      break;
    }

    case "new_tab": {
      if (!spreadsheetId) throw new Error("spreadsheetId required for new_tab mode");
      targetSpreadsheetId = spreadsheetId;
      const newTabTitle = tabName || `${dataset.name} ${new Date().toLocaleDateString()}`;
      const tab = await addSheetTab(sheetsAccountId, spreadsheetId, newTabTitle);
      targetSheetName = tab.title;
      const meta = await getSpreadsheetMeta(sheetsAccountId, spreadsheetId);
      spreadsheetUrl = meta.url || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      break;
    }

    case "replace_tab":
    case "append_tab": {
      if (!spreadsheetId || !tabName) {
        throw new Error("spreadsheetId and tabName required for replace_tab/append_tab");
      }
      targetSpreadsheetId = spreadsheetId;
      targetSheetName = tabName;
      const meta = await getSpreadsheetMeta(sheetsAccountId, spreadsheetId);
      spreadsheetUrl = meta.url || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      break;
    }

    default:
      throw new Error(`Unknown export mode: ${mode}`);
  }

  // 5. Write data
  if (mode === "replace_tab") {
    // Clear existing data + write headers + write rows
    await writeSheetHeaders(sheetsAccountId, targetSpreadsheetId, targetSheetName, headers);
    if (rows.length > 0) {
      await appendRowsToSheet(sheetsAccountId, targetSpreadsheetId, targetSheetName, rows);
    }
  } else if (mode === "append_tab") {
    // Just append rows (no headers)
    if (rows.length > 0) {
      await appendRowsToSheet(sheetsAccountId, targetSpreadsheetId, targetSheetName, rows);
    }
  } else {
    // new_sheet or new_tab — write headers first, then rows
    await writeSheetHeaders(sheetsAccountId, targetSpreadsheetId, targetSheetName, headers);
    if (rows.length > 0) {
      await appendRowsToSheet(sheetsAccountId, targetSpreadsheetId, targetSheetName, rows);
    }
  }

  // 6. Audit log
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
      rowsExported: rows.length,
      columnsExported: exportColumns.length,
    },
  });

  return {
    spreadsheetId: targetSpreadsheetId,
    spreadsheetUrl,
    sheetName: targetSheetName,
    rowsExported: rows.length,
  };
}
