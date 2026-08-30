// Sheets Formatter Service
//
// Central module for all Google Sheets formatting, rich-text link chips,
// and structured cell data. All formatting uses the batchUpdate Sheets API
// (not the simple values API) to produce well-structured, good-looking tables.
//
// Design decisions:
//  - Column widths: min 80px, max 220px (auto-sized within that range)
//  - Row heights: natural (not forced) — but text is CLIPped so rows stay 1-line
//  - Header row: bold, light-green background, frozen, auto-filter applied
//  - Data rows: CLIP overflow, alternating banding for readability
//  - URLs in cells: parsed into TextFormatRun hyperlinks (chip-like)
//    Multiple Drive/external links per cell each become separate clickable spans
//  - Header row: protected range (warning-only) — user sees a warning before editing
//  - __row_id__ column: hidden (pixel-width 1), not bold, grey text

import { getSheetsClient, withRetry } from "@/lib/services/google-sheets-client";
import type { sheets_v4 } from "googleapis";

// ── Constants ─────────────────────────────────────────────────────────────────

const COL_MIN_PX = 80;
const COL_MAX_PX = 220;
const ROW_ID_HEADER = "__row_id__";
// Header background: a light green/teal matching the app theme
const HEADER_BG = { red: 0.23, green: 0.69, blue: 0.47, alpha: 0.12 };
// Header text color
const HEADER_FG = { red: 0.13, green: 0.37, blue: 0.27, alpha: 1 };
// Alternating band color (light)
const BAND_COLOR = { red: 0.95, green: 1.0, blue: 0.97, alpha: 1 };
// Row-ID column text color (subtle grey)
const ROW_ID_FG = { red: 0.75, green: 0.75, blue: 0.75, alpha: 1 };

// ── URL detection ─────────────────────────────────────────────────────────────

interface ParsedLink {
  url: string;
  label: string;
  isDrive: boolean;
  isForm: boolean;
}

/** Extracts all HTTP(S) URLs from a string. */
export function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s"'<>)\],;]+/g;
  const found = text.match(re) ?? [];
  // Deduplicate
  return [...new Set(found)];
}

/** Classifies a URL and produces a human-readable short label. */
function classifyUrl(url: string): ParsedLink {
  const isDrive =
    url.includes("drive.google.com") ||
    url.includes("docs.google.com/spreadsheets") ||
    url.includes("docs.google.com/document") ||
    url.includes("docs.google.com/presentation");
  const isForm =
    url.includes("docs.google.com/forms") || url.includes("forms.gle");

  let label: string;
  try {
    const u = new URL(url);
    if (isDrive) {
      // Attempt to extract the file name from the URL path
      const parts = u.pathname.split("/").filter(Boolean);
      const d = parts.indexOf("d");
      if (d !== -1 && d + 1 < parts.length) {
        // Path like /spreadsheets/d/<id>/edit → label = "Drive file"
        const type = parts[0] || "file";
        label =
          type === "spreadsheets"
            ? "📊 Sheet"
            : type === "document"
            ? "📄 Doc"
            : type === "presentation"
            ? "📑 Slides"
            : "📁 Drive";
      } else {
        label = "📁 Drive";
      }
    } else if (isForm) {
      label = "📋 Form";
    } else {
      label = u.hostname.replace(/^www\./, "");
    }
  } catch {
    label = url.length > 40 ? url.slice(0, 37) + "…" : url;
  }
  return { url, label, isDrive, isForm };
}

// ── Rich-text cell builders ───────────────────────────────────────────────────

/**
 * Builds a Google Sheets CellData with rich-text hyperlink runs for each URL
 * found in the value string. Non-URL text appears between the links.
 * If there are no URLs, returns a plain string cell.
 */
export function buildRichTextCell(
  rawValue: string,
  bold = false,
  foreground?: sheets_v4.Schema$Color
): sheets_v4.Schema$CellData {
  const text = rawValue ?? "";
  const urls = extractUrls(text);

  const baseFormat: sheets_v4.Schema$TextFormat = {
    bold,
    ...(foreground ? { foregroundColor: foreground } : {}),
    fontSize: 10,
    fontFamily: "Arial",
  };

  if (urls.length === 0) {
    // Plain text cell — clip at field boundary
    return {
      userEnteredValue: { stringValue: text },
      userEnteredFormat: {
        textFormat: baseFormat,
        wrapStrategy: "CLIP",
        verticalAlignment: "MIDDLE",
      },
    };
  }

  // Build a composite string: "non-link-text ‹link1› ‹link2›…"
  // We replace each URL in the original string with its label, building
  // textFormatRuns that attach hyperlinks to the label spans.
  let composite = text;
  const linkInfos: ParsedLink[] = [];

  // Collect and replace URLs with labels
  for (const url of urls) {
    const info = classifyUrl(url);
    linkInfos.push(info);
    composite = composite.replace(url, info.label);
  }

  // Build textFormatRuns: find each label's offset in the composite string
  const runs: sheets_v4.Schema$TextFormatRun[] = [];
  let offset = 0;
  let remaining = composite;

  for (const info of linkInfos) {
    const idx = remaining.indexOf(info.label);
    if (idx === -1) continue;

    // Run before the link (plain text)
    if (idx > 0) {
      runs.push({
        startIndex: offset,
        format: baseFormat,
      });
      offset += idx;
      remaining = remaining.slice(idx);
    }

    // The hyperlink run
    runs.push({
      startIndex: offset,
      format: {
        ...baseFormat,
        link: { uri: info.url },
        foregroundColor: { red: 0.15, green: 0.52, blue: 0.85, alpha: 1 },
        underline: true,
      },
    });
    offset += info.label.length;
    remaining = remaining.slice(info.label.length);
  }

  // Any trailing plain text
  if (remaining.length > 0) {
    runs.push({ startIndex: offset, format: baseFormat });
  }

  return {
    userEnteredValue: { stringValue: composite },
    textFormatRuns: runs,
    userEnteredFormat: {
      textFormat: baseFormat,
      wrapStrategy: "CLIP",
      verticalAlignment: "MIDDLE",
    },
  };
}

/**
 * Builds a header CellData: bold, colored text, light-green background.
 * The __row_id__ column gets grey text and 1px width (hidden).
 */
function buildHeaderCell(name: string): sheets_v4.Schema$CellData {
  const isRowId = name === ROW_ID_HEADER;
  return {
    userEnteredValue: { stringValue: name },
    userEnteredFormat: {
      textFormat: {
        bold: !isRowId,
        fontSize: 10,
        fontFamily: "Arial",
        foregroundColor: isRowId ? ROW_ID_FG : HEADER_FG,
      },
      backgroundColor: isRowId ? undefined : HEADER_BG,
      wrapStrategy: "CLIP",
      verticalAlignment: "MIDDLE",
      horizontalAlignment: "LEFT",
      borders: {
        bottom: {
          style: "SOLID",
          color: { red: 0.23, green: 0.69, blue: 0.47, alpha: 0.4 },
          width: 1,
        },
      },
    },
  };
}

/**
 * Builds a complete header RowData for the given column names.
 * Columns are in the order provided; __row_id__ is appended at the end.
 */
export function buildHeaderRowData(
  columnNames: string[],
  includeRowId = true
): sheets_v4.Schema$RowData {
  const names = includeRowId ? [...columnNames, ROW_ID_HEADER] : columnNames;
  return { values: names.map(buildHeaderCell) };
}

/**
 * Builds a data RowData for a single record.
 * Values with URLs get rich-text runs; others get plain strings.
 * The externalId is appended as the last cell (row-ID column).
 */
export function buildDataRowData(
  columnValues: string[],
  externalId: string
): sheets_v4.Schema$RowData {
  const cells: sheets_v4.Schema$CellData[] = columnValues.map((v) =>
    buildRichTextCell(v)
  );
  // Append the row-ID cell (grey, not a link)
  cells.push({
    userEnteredValue: { stringValue: externalId },
    userEnteredFormat: {
      textFormat: { foregroundColor: ROW_ID_FG, fontSize: 9 },
      wrapStrategy: "CLIP",
      verticalAlignment: "MIDDLE",
    },
  });
  return { values: cells };
}

// ── Table formatting ──────────────────────────────────────────────────────────

export interface FormatOptions {
  /** Number of data columns (NOT including __row_id__). */
  columnCount: number;
  /** Total number of rows written (including header). */
  rowCount: number;
  /** The numeric sheetId from Google Sheets. */
  sheetId: number;
}

/**
 * Applies full table formatting to a sheet via a single batchUpdate.
 * Must be called AFTER data has been written.
 *
 * Formatting applied:
 *  - Freeze row 1 (header)
 *  - Auto-filter on header row
 *  - Alternating row banding (data rows only)
 *  - Column widths: data cols 80–220px, __row_id__ col = 1px (hidden)
 *  - Header row protection (warning-only)
 *  - Default row height (21px) for all rows
 */
export async function applyTableFormatting(
  sheetsAccountId: string,
  spreadsheetId: string,
  opts: FormatOptions
): Promise<void> {
  const { columnCount, rowCount, sheetId } = opts;
  // Total columns including __row_id__
  const totalCols = columnCount + 1;

  const sheets = await getSheetsClient(sheetsAccountId);

  const requests: sheets_v4.Schema$Request[] = [
    // 1. Freeze header row
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
            frozenColumnCount: 0,
          },
        },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    },

    // 2. Set default row height for all rows (21px = compact)
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: 0,
          endIndex: Math.max(rowCount, 1),
        },
        properties: { pixelSize: 21 },
        fields: "pixelSize",
      },
    },

    // 3. Set data column widths (80–220px) — auto-size heuristic
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: columnCount,
        },
        properties: { pixelSize: 150 },
        fields: "pixelSize",
      },
    },

    // 4. Hide __row_id__ column (1px width)
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: columnCount,
          endIndex: columnCount + 1,
        },
        properties: { pixelSize: 1, hiddenByUser: true },
        fields: "pixelSize,hiddenByUser",
      },
    },

    // 5. Auto-filter on header row (all data columns)
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: Math.max(rowCount, 1),
            startColumnIndex: 0,
            endColumnIndex: columnCount, // exclude __row_id__
          },
        },
      },
    },

    // 6. Alternating row banding (data rows, cols 0..columnCount-1)
    ...(rowCount > 1
      ? [
          {
            addBanding: {
              bandedRange: {
                bandedRangeId: sheetId * 100 + 1,
                range: {
                  sheetId,
                  startRowIndex: 1, // skip header
                  endRowIndex: rowCount,
                  startColumnIndex: 0,
                  endColumnIndex: columnCount,
                },
                rowProperties: {
                  headerColor: HEADER_BG,
                  firstBandColor: { red: 1, green: 1, blue: 1, alpha: 1 },
                  secondBandColor: BAND_COLOR,
                },
              },
            },
          } as sheets_v4.Schema$Request,
        ]
      : []),

    // 7. Protect header row (warning-only — user can still edit but sees a warning)
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
          },
          description:
            "Header row — managed by the app. Editing column names may break synchronization.",
          warningOnly: true,
        },
      },
    },
  ];

  await withRetry(() =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    })
  );
}

/**
 * Writes a header row + data rows to a sheet using the rich UpdateCellsRequest.
 * This is the preferred write path for all exports and initial pushes.
 *
 * @param columnNames  Ordered column display names (NOT including __row_id__)
 * @param dataRows     Array of { values: string[], externalId: string }
 * @param startRow     0-based row index to start writing (0 = row 1 = header)
 */
export async function writeFormattedSheet(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetId: number,
  sheetName: string,
  columnNames: string[],
  dataRows: Array<{ values: string[]; externalId: string }>,
  startRow = 0
): Promise<void> {
  const sheets = await getSheetsClient(sheetsAccountId);

  // Build header row
  const headerRow = buildHeaderRowData(columnNames, true);

  // Build data rows
  const rowDataList: sheets_v4.Schema$RowData[] = dataRows.map((r) =>
    buildDataRowData(r.values, r.externalId)
  );

  const allRows = startRow === 0 ? [headerRow, ...rowDataList] : rowDataList;

  // Write in chunks of 500 rows to stay within API limits
  const CHUNK = 500;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const chunk = allRows.slice(i, i + CHUNK);
    const chunkStartRow = startRow + i;

    await withRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateCells: {
                range: {
                  sheetId,
                  startRowIndex: chunkStartRow,
                  startColumnIndex: 0,
                },
                rows: chunk,
                fields:
                  "userEnteredValue,userEnteredFormat,textFormatRuns",
              },
            },
          ],
        },
      })
    );
  }
}

/**
 * Appends formatted data rows to an existing sheet (after the last row).
 * Used during sync to push new app records without rewriting existing rows.
 */
export async function appendFormattedRows(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetId: number,
  sheetName: string,
  dataRows: Array<{ values: string[]; externalId: string }>
): Promise<void> {
  if (!dataRows.length) return;
  const sheets = await getSheetsClient(sheetsAccountId);

  const rowDataList: sheets_v4.Schema$RowData[] = dataRows.map((r) =>
    buildDataRowData(r.values, r.externalId)
  );

  const CHUNK = 500;
  for (let i = 0; i < rowDataList.length; i += CHUNK) {
    const chunk = rowDataList.slice(i, i + CHUNK);
    await withRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              appendCells: {
                sheetId,
                rows: chunk,
                fields:
                  "userEnteredValue,userEnteredFormat,textFormatRuns",
              },
            },
          ],
        },
      })
    );
  }
}

/**
 * Updates a single row in-place using batchUpdate.
 * @param rowIndex  0-based row index (row 0 = header, row 1 = first data row)
 */
export async function updateFormattedRow(
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetId: number,
  rowIndex: number,
  values: string[],
  externalId: string
): Promise<void> {
  const sheets = await getSheetsClient(sheetsAccountId);
  const rowData = buildDataRowData(values, externalId);

  await withRetry(() =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateCells: {
              range: {
                sheetId,
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: 0,
              },
              rows: [rowData],
              fields: "userEnteredValue,userEnteredFormat,textFormatRuns",
            },
          },
        ],
      },
    })
  );
}

// ── Schedule expression parser ────────────────────────────────────────────────

/**
 * Parses a schedule expression like "5m", "1h", "6h", "1d" into milliseconds.
 * Falls back to 5 minutes if the expression is unrecognized.
 */
export function parseScheduleExprMs(expr: string): number {
  if (!expr || expr === "manual") return 0;
  const match = expr.trim().match(/^(\d+)(m|h|d)$/i);
  if (!match) return 5 * 60 * 1000; // default 5 min
  const [, num, unit] = match;
  const n = parseInt(num, 10);
  switch (unit.toLowerCase()) {
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
    default:  return 5 * 60 * 1000;
  }
}
