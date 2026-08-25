// AI Column Mapping Service
//
// Uses Gemini to suggest column mappings between Google Sheet headers and
// application columns (DatasetColumnDef / SchemaField rows).
//
// The AI is ADVISORY ONLY:
//   - AI proposes mappings with confidence scores
//   - High confidence (≥ 0.85) can be auto-selected in the UI
//   - Low confidence MUST require user confirmation
//   - AI NEVER directly modifies the schema or data
//   - All execution happens after explicit user approval and backend validation

import { callGeminiWithFallback } from "@/lib/gemini";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppColumnHint {
  columnId: string;
  name: string;
  dataType: string;
  required: boolean;
}

export interface ColumnMappingSuggestion {
  sheetHeader: string;
  appColumnId: string | null; // null = no match found / new column needed
  appColumnName: string | null;
  confidence: number; // 0.0 – 1.0
  reason: string;
  suggestedDataType: string;
  isAutoSelected: boolean; // true if confidence >= AUTO_SELECT_THRESHOLD
}

export interface AIMappingResult {
  mappings: ColumnMappingSuggestion[];
  modelUsed: string;
  unmappedAppColumns: AppColumnHint[]; // app columns not mapped to any sheet header
  proposedDatasetName?: string;        // when creating a new dataset from scratch
}

const AUTO_SELECT_THRESHOLD = 0.85;

// ── Main mapping function ─────────────────────────────────────────────────────

/**
 * Analyzes Google Sheet headers + sample data and suggests mappings to app columns.
 *
 * @param sheetHeaders     Column headers from the Google Sheet
 * @param sampleRows       First 5-10 rows of data (for type inference)
 * @param appColumns       Existing application column definitions (empty for new datasets)
 * @param datasetName      Optional dataset name hint for context
 */
export async function suggestColumnMappings(
  sheetHeaders: string[],
  sampleRows: string[][],
  appColumns: AppColumnHint[],
  datasetName?: string
): Promise<AIMappingResult> {
  const isNewDataset = appColumns.length === 0;

  // Format sample data — only include first 5 rows, max 8 columns for brevity
  const sampleText = sampleRows
    .slice(0, 5)
    .map((row, ri) =>
      `Row ${ri + 1}: ` +
      sheetHeaders
        .slice(0, 8)
        .map((h, i) => `${h}="${row[i] ?? ""}"`)
        .join(", ")
    )
    .join("\n");

  const appColumnsText = appColumns
    .map((c) =>
      `  { "columnId": "${c.columnId}", "name": "${c.name}", "dataType": "${c.dataType}", "required": ${c.required} }`
    )
    .join(",\n");

  // System instruction — strict JSON mode
  const systemInstruction = `You are a data integration expert. Your only job is to map column headers from a Google Sheet to application dataset columns.
You must respond with ONLY a valid JSON object — no markdown, no explanations, no code fences.
The JSON must match the exact schema provided. If you cannot determine a match, set appColumnId to null.`;

  const prompt = `Map these Google Sheet column headers to the application dataset columns.

SHEET HEADERS (${sheetHeaders.length} total):
${sheetHeaders.map((h, i) => `  ${i + 1}. "${h}"`).join("\n")}

SAMPLE DATA (first ${Math.min(sampleRows.length, 5)} rows):
${sampleText || "  (no sample data available)"}

APPLICATION COLUMNS${datasetName ? ` for dataset "${datasetName}"` : ""}${isNewDataset ? " (none yet — creating new dataset)" : ` (${appColumns.length} columns)`}:
${isNewDataset ? "  (none)" : `[\n${appColumnsText}\n]`}

${isNewDataset
    ? "Since no application columns exist yet, propose a dataset name and suggest data types for each sheet header."
    : `Match each sheet header to the most semantically similar application column.
A "semantic match" means the column represents the same real-world concept, even if the name differs.
Examples of valid matches:
  - "Mobile No." → "Phone" (same concept, different label)
  - "Sr No" → "ID" (row identifier)
  - "Emp Name" → "Employee Name" (abbreviation)
  - "DOB" → "Date of Birth" (acronym expansion)
  - "Amt" → "Amount" / "Price" (abbreviation)
Do NOT match columns that represent different concepts.`}

Respond with ONLY this JSON (no markdown, no text before or after):
{
  ${isNewDataset ? '"proposedDatasetName": "<name based on content>",\n  ' : ""}"mappings": [
    {
      "sheetHeader": "<exact header string>",
      "appColumnId": "<columnId from application columns, or null if no match>",
      "appColumnName": "<matching column name, or null if no match>",
      "confidence": <0.0 to 1.0>,
      "reason": "<one sentence explanation>",
      "suggestedDataType": "<one of: text|number|integer|decimal|boolean|date|datetime|email|url|currency|enum>"
    }
  ]
}

Confidence scoring:
- 0.95–1.0: Exact name match or universally understood equivalent (e.g., "Name" → "Name")
- 0.85–0.94: Strong semantic match, obvious equivalence (e.g., "Phone No." → "Phone")
- 0.70–0.84: Good semantic match, requires domain knowledge (e.g., "Emp ID" → "Employee ID")
- 0.50–0.69: Possible match, some ambiguity
- 0.00–0.49: No confident match — set appColumnId to null

IMPORTANT: Return exactly ${sheetHeaders.length} entries in "mappings", one per sheet header, in the same order.`;

  let raw: string;
  let modelUsed: string;

  try {
    const result = await callGeminiWithFallback(
      [{ role: "user", content: prompt }],
      {
        system: systemInstruction,
        temperature: 0.05, // Very low temperature — mapping is deterministic, not creative
        maxOutputTokens: 4096,
      }
    );
    raw = result.text;
    modelUsed = result.modelUsed;
  } catch (err) {
    console.error("[ai-column-mapping] Gemini call failed:", err);
    // Return fallback result — user will map manually
    return buildFallbackResult(sheetHeaders, appColumns);
  }

  // ── Parse AI response ─────────────────────────────────────────────────────

  try {
    // Strip markdown code fences and any leading/trailing whitespace
    const cleaned = extractJSON(raw);
    const parsed = JSON.parse(cleaned) as {
      proposedDatasetName?: string;
      mappings: Array<{
        sheetHeader: string;
        appColumnId: string | null;
        appColumnName: string | null;
        confidence: number;
        reason: string;
        suggestedDataType: string;
      }>;
    };

    if (!Array.isArray(parsed.mappings)) {
      throw new Error("Response missing 'mappings' array");
    }

    // Build a lookup for fast header → AI result matching
    const aiByHeader = new Map(
      parsed.mappings.map((m) => [m.sheetHeader.toLowerCase().trim(), m])
    );

    // Process each header in original order; fall back if AI missed any
    const mappings: ColumnMappingSuggestion[] = sheetHeaders.map((header) => {
      // Try exact match first, then case-insensitive
      const aiEntry =
        parsed.mappings.find(
          (m) => m.sheetHeader === header
        ) ??
        aiByHeader.get(header.toLowerCase().trim());

      if (!aiEntry) {
        // AI skipped this header — try exact name match locally
        const exact = appColumns.find(
          (c) => c.name.toLowerCase() === header.toLowerCase()
        );
        return {
          sheetHeader: header,
          appColumnId: exact?.columnId ?? null,
          appColumnName: exact?.name ?? null,
          confidence: exact ? 1.0 : 0,
          reason: exact ? "Exact name match (AI skipped)" : "No match found",
          suggestedDataType: exact?.dataType ?? inferDataType(header),
          isAutoSelected: !!exact,
        };
      }

      // Validate that the columnId actually exists in appColumns
      const validColumnId = aiEntry.appColumnId
        ? appColumns.find((c) => c.columnId === aiEntry.appColumnId)?.columnId ?? null
        : null;

      const confidence = Math.max(0, Math.min(1, aiEntry.confidence || 0));

      return {
        sheetHeader: header,
        appColumnId: validColumnId,
        appColumnName: validColumnId
          ? (appColumns.find((c) => c.columnId === validColumnId)?.name ?? aiEntry.appColumnName)
          : null,
        confidence,
        reason: aiEntry.reason || "",
        suggestedDataType: aiEntry.suggestedDataType || inferDataType(header),
        isAutoSelected: confidence >= AUTO_SELECT_THRESHOLD && validColumnId !== null,
      };
    });

    // Find unmapped app columns
    const mappedColumnIds = new Set(mappings.map((m) => m.appColumnId).filter(Boolean));
    const unmappedAppColumns = appColumns.filter(
      (c) => !mappedColumnIds.has(c.columnId)
    );

    console.info(
      `[ai-column-mapping] ${modelUsed}: mapped ${mappings.filter((m) => m.appColumnId).length}/${sheetHeaders.length} headers`
    );

    return {
      mappings,
      modelUsed,
      unmappedAppColumns,
      proposedDatasetName: parsed.proposedDatasetName,
    };
  } catch (parseErr) {
    console.error(
      "[ai-column-mapping] Failed to parse AI response:",
      parseErr,
      "\nRaw response:",
      raw.slice(0, 500)
    );
    // Fall back to exact-match
    return buildFallbackResult(sheetHeaders, appColumns);
  }
}

// ── Propose new dataset structure ─────────────────────────────────────────────

/**
 * When importing into a new dataset, the AI proposes column names and data types
 * based on the sheet headers and sample data.
 */
export async function proposeNewDatasetStructure(
  sheetHeaders: string[],
  sampleRows: string[][],
  spreadsheetName?: string,
  tabName?: string
): Promise<{
  datasetName: string;
  columns: Array<{ name: string; dataType: string; required: boolean }>;
  modelUsed: string;
}> {
  const result = await suggestColumnMappings(
    sheetHeaders,
    sampleRows,
    [], // no existing columns
    tabName || spreadsheetName
  );

  return {
    datasetName:
      result.proposedDatasetName ||
      tabName ||
      spreadsheetName ||
      "Imported Dataset",
    columns: result.mappings.map((m) => ({
      name: m.sheetHeader,
      dataType: m.suggestedDataType,
      required: false,
    })),
    modelUsed: result.modelUsed,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts the first JSON object from a string that may contain markdown fences
 * or surrounding prose.
 */
function extractJSON(raw: string): string {
  // Remove markdown code fences
  let s = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Find first '{' and last '}' to handle leading/trailing prose
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }

  return s;
}

/**
 * Simple heuristic data type inference from column header name.
 * Used as fallback when AI doesn't suggest a type.
 */
function inferDataType(header: string): string {
  const h = header.toLowerCase();
  if (/email|e-?mail/.test(h)) return "email";
  if (/phone|mobile|tel|contact/.test(h)) return "text";
  if (/date|dob|birth|created|updated|timestamp/.test(h)) return "date";
  if (/time/.test(h)) return "datetime";
  if (/url|link|website|http/.test(h)) return "url";
  if (/amount|price|cost|salary|fee|revenue|budget|total/.test(h)) return "currency";
  if (/count|qty|quantity|num|no\.|number|id|age|year/.test(h)) return "integer";
  if (/rate|ratio|score|percent|pct/.test(h)) return "decimal";
  if (/is_|has_|active|enabled|verified|status/.test(h)) return "boolean";
  return "text";
}

// ── Fallback (no AI) ──────────────────────────────────────────────────────────

function buildFallbackResult(
  sheetHeaders: string[],
  appColumns: AppColumnHint[]
): AIMappingResult {
  const mappings: ColumnMappingSuggestion[] = sheetHeaders.map((header) => {
    // Exact match
    const exactMatch = appColumns.find(
      (c) => c.name.toLowerCase() === header.toLowerCase()
    );
    if (exactMatch) {
      return {
        sheetHeader: header,
        appColumnId: exactMatch.columnId,
        appColumnName: exactMatch.name,
        confidence: 1.0,
        reason: "Exact name match",
        suggestedDataType: exactMatch.dataType,
        isAutoSelected: true,
      };
    }

    // Partial / fuzzy match
    const fuzzy = appColumns.find((c) => {
      const cn = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const hn = header.toLowerCase().replace(/[^a-z0-9]/g, "");
      return cn.includes(hn) || hn.includes(cn);
    });
    if (fuzzy) {
      return {
        sheetHeader: header,
        appColumnId: fuzzy.columnId,
        appColumnName: fuzzy.name,
        confidence: 0.75,
        reason: "Partial name match (AI unavailable)",
        suggestedDataType: fuzzy.dataType,
        isAutoSelected: false,
      };
    }

    return {
      sheetHeader: header,
      appColumnId: null,
      appColumnName: null,
      confidence: 0,
      reason: "No match found",
      suggestedDataType: inferDataType(header),
      isAutoSelected: false,
    };
  });

  const mappedColumnIds = new Set(mappings.map((m) => m.appColumnId).filter(Boolean));
  const unmappedAppColumns = appColumns.filter((c) => !mappedColumnIds.has(c.columnId));

  return { mappings, modelUsed: "fallback", unmappedAppColumns };
}
