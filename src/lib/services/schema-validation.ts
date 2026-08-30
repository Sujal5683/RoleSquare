// Schema Validation Service
//
// Provides deterministic schema comparison between the application's stored
// column definitions and what is currently in the Google Sheet header row.
//
// The application schema is ALWAYS authoritative. The Google Sheet header row
// is the external representation. Changes are detected and surfaced to the user
// — never silently applied.

import { createHash } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ColumnSpec {
  columnId: string; // permanent app-side ID
  name: string;     // display name (= Google Sheet header)
  dataType: string;
  position: number;
  required: boolean;
}

export type SchemaDiffType =
  | "renamed"
  | "deleted"
  | "inserted"
  | "reordered"
  | "type_changed"
  | "duplicate"
  | "blank_header";

export interface SchemaDiff {
  type: SchemaDiffType;
  columnId?: string;   // app column ID (for known columns)
  name?: string;       // app column name
  oldValue?: string;   // before
  newValue?: string;   // after
  position?: number;   // affected position (0-based)
  affectedRows?: number;
  isDestructive: boolean;
  description: string; // human-readable description
}

export interface SchemaValidationResult {
  valid: boolean;
  diffs: SchemaDiff[];
  fingerprintMatch: boolean;
  expectedFingerprint: string;
  actualFingerprint: string;
}

// ── Fingerprint ───────────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 fingerprint for a column set.
 * The fingerprint changes whenever any column's ID, name, position, or type changes.
 */
export function computeSchemaFingerprint(columns: ColumnSpec[]): string {
  const sorted = [...columns].sort((a, b) => a.position - b.position);
  const serialized = sorted
    .map((c) => `${c.columnId}:${c.name}:${c.position}:${c.dataType}`)
    .join("|");
  return createHash("sha256").update(serialized).digest("hex");
}

// ── Schema diff ───────────────────────────────────────────────────────────────

/**
 * Compares the expected application columns against the actual Google Sheet headers.
 * Returns a list of diffs that need user action.
 *
 * @param expected  Application columns (authoritative)
 * @param actual    Google Sheet header row (current)
 * @param recordCount  Number of affected records (for impact messaging)
 */
export function validateSheetSchema(
  expected: ColumnSpec[],
  actual: string[],
  recordCount = 0
): SchemaValidationResult {
  const diffs: SchemaDiff[] = [];

  // Filter out the hidden __row_id__ column if present
  const actualHeaders = actual.filter((h) => h !== "__row_id__");

  // Compute expected fingerprint (used for DB storage / change detection)
  const expectedFingerprint = computeSchemaFingerprint(expected);
  // Actual fingerprint also computed for storage purposes (not for match logic)
  const actualAsColumns: ColumnSpec[] = actualHeaders.map((h, i) => ({
    columnId: `unknown_${i}`,
    name: h,
    dataType: "text",
    position: i,
    required: false,
  }));
  const actualFingerprint = computeSchemaFingerprint(actualAsColumns);

  // ── Fingerprint match: compare column NAMES in position order ────────────
  // The old code compared full ColumnSpecs including columnId, which always
  // differed (app uses stable UUIDs, sheet headers have none). The correct
  // comparison is: do the sheet headers match the app column names in order?
  const expectedNames = [...expected]
    .sort((a, b) => a.position - b.position)
    .map((c) => c.name.toLowerCase().trim());
  const actualNames = actualHeaders.map((h) => h.toLowerCase().trim());
  const fingerprintMatch =
    expectedNames.length === actualNames.length &&
    expectedNames.every((name, i) => name === actualNames[i]);

  // -- Check for blank headers
  actualHeaders.forEach((h, i) => {
    if (!h || !h.trim()) {
      diffs.push({
        type: "blank_header",
        position: i,
        isDestructive: false,
        description: `Column ${i + 1} has a blank header. This may cause sync errors.`,
      });
    }
  });

  // -- Check for duplicate headers
  const seen = new Map<string, number[]>();
  actualHeaders.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(i);
  });
  for (const [header, positions] of seen.entries()) {
    if (positions.length > 1) {
      diffs.push({
        type: "duplicate",
        name: header,
        isDestructive: false,
        description: `Column "${header}" appears ${positions.length} times in the Google Sheet. Column names must be unique.`,
      });
    }
  }

  // Build lookup maps
  const expectedByName = new Map(expected.map((c) => [c.name.toLowerCase(), c]));
  const actualSet = new Set(actualHeaders.map((h) => h.toLowerCase()));

  // -- Check for deleted expected columns (in app but not in sheet)
  for (const col of expected) {
    if (!actualSet.has(col.name.toLowerCase())) {
      // Check if it was renamed (heuristic: same position, different name)
      const actualAtSamePos = actualHeaders[col.position];
      if (
        actualAtSamePos &&
        actualAtSamePos !== col.name &&
        !expectedByName.has(actualAtSamePos.toLowerCase())
      ) {
        // Likely renamed
        diffs.push({
          type: "renamed",
          columnId: col.columnId,
          name: col.name,
          oldValue: col.name,
          newValue: actualAtSamePos,
          position: col.position,
          isDestructive: false,
          description: `Column "${col.name}" was renamed to "${actualAtSamePos}" in Google Sheets.`,
        });
      } else {
        // Deleted
        diffs.push({
          type: "deleted",
          columnId: col.columnId,
          name: col.name,
          position: col.position,
          affectedRows: recordCount,
          isDestructive: true,
          description: `Column "${col.name}" was deleted from Google Sheets. Continuing will remove this column and ${recordCount} associated values from the application.`,
        });
      }
    }
  }

  // -- Check for inserted columns (in sheet but not in app)
  for (const header of actualHeaders) {
    if (!expectedByName.has(header.toLowerCase()) && header !== "__row_id__") {
      diffs.push({
        type: "inserted",
        name: header,
        isDestructive: false,
        description: `New column "${header}" found in Google Sheets that does not exist in the application. You can map it to an existing column or add it as a new column.`,
      });
    }
  }

  // -- Check for reordering
  const expectedOrder = expected.map((c) => c.name.toLowerCase());
  const actualOrder = actualHeaders
    .map((h) => h.toLowerCase())
    .filter((h) => expectedByName.has(h));

  if (
    expectedOrder.length === actualOrder.length &&
    !expectedOrder.every((name, i) => name === actualOrder[i])
  ) {
    // Only report reorder if nothing else was changed (pure reorder)
    const hasRenames = diffs.some((d) => d.type === "renamed");
    const hasDeletes = diffs.some((d) => d.type === "deleted");
    if (!hasRenames && !hasDeletes) {
      diffs.push({
        type: "reordered",
        isDestructive: false,
        description:
          "Columns in Google Sheets are in a different order than the application schema. The application schema order takes precedence.",
      });
    }
  }

  return {
    valid: diffs.length === 0,
    diffs,
    fingerprintMatch,
    expectedFingerprint,
    actualFingerprint,
  };
}

// ── Data type validation ──────────────────────────────────────────────────────

type AppDataType =
  | "text"
  | "number"
  | "integer"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "url"
  | "currency"
  | "enum";

export interface CellValidationResult {
  valid: boolean;
  error?: string;
  coercedValue?: unknown;
}

/**
 * Validates and coerces a string cell value from Google Sheets against the
 * expected application data type. Returns the coerced value on success, or
 * an error message on failure.
 */
export function validateCellValue(
  rawValue: string,
  dataType: AppDataType
): CellValidationResult {
  const v = rawValue.trim();

  if (!v) {
    return { valid: true, coercedValue: null }; // empty = null
  }

  switch (dataType) {
    case "text":
    case "enum":
      return { valid: true, coercedValue: v };

    case "number":
    case "decimal":
    case "currency": {
      // Strip currency symbols and commas
      const cleaned = v.replace(/[$,£€¥]/g, "").trim();
      const n = parseFloat(cleaned);
      if (isNaN(n)) {
        return {
          valid: false,
          error: `Expected a number, got "${v}"`,
        };
      }
      return { valid: true, coercedValue: n };
    }

    case "integer": {
      const cleaned = v.replace(/,/g, "").trim();
      const n = parseInt(cleaned, 10);
      if (isNaN(n) || String(n) !== cleaned) {
        return { valid: false, error: `Expected an integer, got "${v}"` };
      }
      return { valid: true, coercedValue: n };
    }

    case "boolean": {
      const lower = v.toLowerCase();
      if (["true", "yes", "1", "y"].includes(lower)) {
        return { valid: true, coercedValue: true };
      }
      if (["false", "no", "0", "n"].includes(lower)) {
        return { valid: true, coercedValue: false };
      }
      return { valid: false, error: `Expected true/false, got "${v}"` };
    }

    case "date": {
      const d = new Date(v);
      if (isNaN(d.getTime())) {
        return { valid: false, error: `Expected a date (YYYY-MM-DD), got "${v}"` };
      }
      return { valid: true, coercedValue: d.toISOString().split("T")[0] };
    }

    case "datetime": {
      const d = new Date(v);
      if (isNaN(d.getTime())) {
        return {
          valid: false,
          error: `Expected a date-time (ISO 8601), got "${v}"`,
        };
      }
      return { valid: true, coercedValue: d.toISOString() };
    }

    case "email": {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(v)) {
        return { valid: false, error: `Expected an email address, got "${v}"` };
      }
      return { valid: true, coercedValue: v };
    }

    case "url": {
      try {
        new URL(v);
        return { valid: true, coercedValue: v };
      } catch {
        return { valid: false, error: `Expected a URL, got "${v}"` };
      }
    }

    default:
      return { valid: true, coercedValue: v };
  }
}
