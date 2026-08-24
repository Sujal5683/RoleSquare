// Sheet Discovery Service
//
// Provides all operations for discovering and reading Google Sheets content:
//   listSpreadsheets    — list Drive spreadsheet files (paginated)
//   getSpreadsheetMeta  — get spreadsheet name + all tab names
//   getSheetPreview     — read first N rows from a tab
//   getSheetAllRows     — read all rows (batched for large sheets)
//   writeRowsToSheet    — batch-write rows to a tab
//   protectHeaderRow    — apply Google Sheets protected range on row 1

import { db } from "@/lib/db";
import { getSheetsClient, getDriveClientForSheets, withRetry } from "@/lib/services/google-sheets-client";
import type { sheets_v4 } from "googleapis";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpreadsheetListItem {
  id: string;
  name: string;
  webViewLink: string | null;
  modifiedTime: string | null;
  ownerEmail: string | null;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  url: string | null;
  tabs: SheetTabInfo[];
}

export interface SheetPreviewResult {
  headers: string[];
  rows: string[][];
  totalRowsEstimate: number;
}

// ── List spreadsheets ─────────────────────────────────────────────────────────

export async function listSpreadsheets(
  sheetsAccountId: string,
  pageToken?: string,
  pageSize = 50
): Promise<{ items: SpreadsheetListItem[]; nextPageToken?: string }> {
  const drive = await getDriveClientForSheets(sheetsAccountId);

  const res = await withRetry(() =>
    drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields:
        "nextPageToken,files(id,name,webViewLink,modifiedTime,owners)",
      pageSize,
      pageToken,
      orderBy: "modifiedTime desc",
    })
  );

  const items: SpreadsheetListItem[] = (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name || "Untitled Spreadsheet",
    webViewLink: f.webViewLink || null,
    modifiedTime: f.modifiedTime || null,
    ownerEmail: f.owners?.[0]?.emailAddress || null,
  }));

  return { items, nextPageToken: res.data.nextPageToken || undefined };
}

// ── Spreadsheet metadata ──────────────────────────────────────────────────────

export async function getSpreadsheetMeta(
  sheetsAccountId: string,
  spreadsheetId: string
): Promise<SpreadsheetMeta> {
  const sheets = await getSheetsClient(sheetsAccountId);

  const res = await withRetry(() =>
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: "spreadsheetId,properties.title,spreadsheetUrl,sheets(properties)",
    })
  );

  const spread = res.data;
  const tabs: SheetTabInfo[] = (spread.sheets || []).map((s) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title || "Sheet1",
    index: s.properties?.index ?? 0,
    rowCount: s.properties?.gridProperties?.rowCount ?? 0,
    columnCount: s.properties?.gridProperties?.columnCount ?? 0,
  }));

  return {
    spreadsheetId: spread.spreadsheetId || spreadsheetId,
    title: spread.properties?.title || "Untitled",
    url: spread.spreadsheetUrl || null,
    tabs,
  };
}

// ── Sheet preview ─────────────────────────────────────────────────────────────

/**
 * Returns the header row + first `limit` data rows from a sheet tab.
 * Used in the import wizard and link wizard for previewing data.
 */
export async function getSheetPreview(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetName: string,
  limit = 20
): Promise<SheetPreviewResult> {
  const sheets = await getSheetsClient(sheetsAccountId);

  // Read limit+1 rows: row 1 = headers, rows 2..limit+1 = data
  const range = `'${sheetName}'!A1:ZZ${limit + 1}`;

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "FORMATTED_VALUE",
    })
  );

  const values = res.data.values || [];
  const headers = values[0]?.map((h) => String(h ?? "")) || [];
  const rows = values.slice(1).map((row) =>
    headers.map((_, i) => String(row[i] ?? ""))
  );

  // Estimate total rows
  const metaRes = await withRetry(() =>
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties)",
    })
  );
  const tab = (metaRes.data.sheets || []).find(
    (s) => s.properties?.title === sheetName
  );
  const totalRowsEstimate = Math.max(
    0,
    (tab?.properties?.gridProperties?.rowCount ?? rows.length) - 1
  );

  return { headers, rows, totalRowsEstimate };
}

// ── Read all rows (batched) ───────────────────────────────────────────────────

const BATCH_SIZE = 1000; // rows per API call

/**
 * Reads all data rows from a sheet tab in batches of 1000.
 * Returns headers separately from data rows.
 * Handles large sheets without loading everything into memory at once.
 */
export async function getSheetAllRows(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetName: string,
  onProgress?: (fetched: number) => void
): Promise<{ headers: string[]; rows: string[][] }> {
  const sheets = await getSheetsClient(sheetsAccountId);

  // First, get headers
  const headerRes = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!1:1`,
      valueRenderOption: "FORMATTED_VALUE",
    })
  );
  const headers = (headerRes.data.values?.[0] || []).map((h) => String(h ?? ""));
  if (!headers.length) return { headers: [], rows: [] };

  // Batch-read data rows
  const allRows: string[][] = [];
  let startRow = 2;

  while (true) {
    const endRow = startRow + BATCH_SIZE - 1;
    const range = `'${sheetName}'!A${startRow}:ZZ${endRow}`;

    const res = await withRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: "FORMATTED_VALUE",
      })
    );

    const batch = res.data.values || [];
    if (!batch.length) break;

    const normalized = batch.map((row) =>
      headers.map((_, i) => String(row[i] ?? ""))
    );
    allRows.push(...normalized);
    onProgress?.(allRows.length);

    if (batch.length < BATCH_SIZE) break;
    startRow += BATCH_SIZE;
  }

  return { headers, rows: allRows };
}

// ── Write rows to sheet ───────────────────────────────────────────────────────

/**
 * Batch-writes rows to a sheet. `startRow` is 1-based row index.
 * Used by the sync engine to push app changes to Google Sheets.
 */
export async function writeRowsToSheet(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetName: string,
  rows: string[][],
  startRow: number
): Promise<void> {
  if (!rows.length) return;
  const sheets = await getSheetsClient(sheetsAccountId);

  const range = `'${sheetName}'!A${startRow}`;
  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    })
  );
}

/**
 * Appends rows to the end of a sheet.
 */
export async function appendRowsToSheet(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetName: string,
  rows: string[][]
): Promise<void> {
  if (!rows.length) return;
  const sheets = await getSheetsClient(sheetsAccountId);

  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    })
  );
}

/**
 * Clears specific rows (by 1-based row indices) from a sheet.
 * Used when deleting records that originated from the app.
 */
export async function clearSheetRow(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number // 1-based
): Promise<void> {
  const sheets = await getSheetsClient(sheetsAccountId);
  await withRetry(() =>
    sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${sheetName}'!A${rowIndex}:ZZ${rowIndex}`,
    })
  );
}

/**
 * Deletes a row from the sheet by shifting rows up.
 * Uses batchUpdate with DeleteDimensionRequest.
 */
export async function deleteSheetRow(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetId: number,
  rowIndex: number // 0-based startIndex
): Promise<void> {
  const sheets = await getSheetsClient(sheetsAccountId);
  await withRetry(() =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      },
    })
  );
}

// ── Header row protection ─────────────────────────────────────────────────────

/**
 * Applies a "protected range" on row 1 (the header row) to prevent accidental edits.
 * Note: protection is advisory — the sync engine also validates schema on every sync.
 */
export async function protectHeaderRow(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetId: number
): Promise<void> {
  try {
    const sheets = await getSheetsClient(sheetsAccountId);
    await withRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addProtectedRange: {
                protectedRange: {
                  range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                  },
                  description: "Header row — managed by Workspace Intelligence Platform",
                  warningOnly: true, // show warning but don't block
                },
              },
            },
          ],
        },
      })
    );
  } catch {
    // Non-fatal — protection is best-effort
    console.warn("[sheet-discovery] Could not apply header row protection");
  }
}

// ── Create spreadsheet / tab ──────────────────────────────────────────────────

export async function createSpreadsheet(
  sheetsAccountId: string,
  title: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const sheets = await getSheetsClient(sheetsAccountId);
  const res = await withRetry(() =>
    sheets.spreadsheets.create({
      requestBody: { properties: { title } },
      fields: "spreadsheetId,spreadsheetUrl",
    })
  );
  return {
    spreadsheetId: res.data.spreadsheetId!,
    spreadsheetUrl: res.data.spreadsheetUrl || "",
  };
}

export async function addSheetTab(
  sheetsAccountId: string,
  spreadsheetId: string,
  tabTitle: string
): Promise<{ sheetId: number; title: string }> {
  const sheets = await getSheetsClient(sheetsAccountId);
  const res = await withRetry(() =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabTitle } } }],
      },
    })
  );
  const newSheet = res.data.replies?.[0]?.addSheet?.properties;
  return {
    sheetId: newSheet?.sheetId ?? 0,
    title: newSheet?.title ?? tabTitle,
  };
}

// ── Header initialization ─────────────────────────────────────────────────────

/**
 * Writes the header row (column names) to row 1 of the sheet.
 * Called during initial link or after schema changes.
 */
export async function writeSheetHeaders(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetName: string,
  headers: string[]
): Promise<void> {
  const sheets = await getSheetsClient(sheetsAccountId);
  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    })
  );
}

// ── Formula detection ─────────────────────────────────────────────────────────

/**
 * Reads a cell range with FORMULA render mode to detect formula cells.
 * Formula cells should not be overwritten with static values.
 */
export async function detectFormulaCells(
  sheetsAccountId: string,
  spreadsheetId: string,
  range: string
): Promise<boolean[][]> {
  const sheets = await getSheetsClient(sheetsAccountId);
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "FORMULA",
    })
  );
  return (res.data.values || []).map((row) =>
    row.map((cell) => typeof cell === "string" && cell.startsWith("="))
  );
}
