// AI Column Mapping Service
//
// Uses the application's existing Gemini AI infrastructure to suggest
// column mappings between Google Sheet headers and application columns.
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
  // Format sample data for the prompt
  const sampleText = sampleRows
    .slice(0, 5)
    .map((row) =>
      sheetHeaders
        .map((h, i) => `${h}: ${row[i] ?? ""}`)
        .join(", ")
    )
    .join("\n");

  const appColumnsText =
    appColumns.length > 0
      ? appColumns
          .map((c) => `- ${c.name} (id: ${c.columnId}, type: ${c.dataType}, required: ${c.required})`)
          .join("\n")
      : "(none — creating a new dataset)";

  const isNewDataset = appColumns.length === 0;

  const prompt = `You are a data mapping expert. Analyze the following Google Sheet headers and sample data, then suggest the best mapping to application columns.

GOOGLE SHEET HEADERS:
${sheetHeaders.join(", ")}

SAMPLE DATA (first 5 rows):
${sampleText || "(no sample data)"}

APPLICATION COLUMNS${datasetName ? ` (dataset: "${datasetName}")` : ""}:
${appColumnsText}

${isNewDataset ? "Since no application columns exist, also propose a dataset name and suggest appropriate data types for each column." : ""}

TASK: For each Google Sheet header, either:
1. Map it to an existing application column (if semantically equivalent)
2. Mark it as needing a new column (if no match exists)

RESPONSE FORMAT: Return ONLY a valid JSON object with this exact structure:
{
  ${isNewDataset ? '"proposedDatasetName": "<name based on sheet content>",\n  ' : ""}"mappings": [
    {
      "sheetHeader": "<exact header name>",
      "appColumnId": "<columnId or null>",
      "appColumnName": "<column name or null>",
      "confidence": <0.0-1.0>,
      "reason": "<brief explanation>",
      "suggestedDataType": "<text|number|integer|decimal|boolean|date|datetime|email|url|currency|enum>"
    }
  ]
}

RULES:
- confidence 0.9-1.0: exact or near-exact semantic match
- confidence 0.7-0.89: strong semantic match (e.g., "Mobile No." → "Phone")
- confidence 0.5-0.69: possible match but ambiguous
- confidence < 0.5: set appColumnId to null (no confident match)
- Never match a header to multiple app columns
- Always suggest a data type based on sample values
- For email columns: suggest "email" type
- For phone: suggest "text"
- For dates: suggest "date" or "datetime"
- For monetary values: suggest "currency"
- For true/false/yes/no: suggest "boolean"`;

  let raw: string;
  let modelUsed: string;

  try {
    const result = await callGeminiWithFallback(
      [{ role: "user", content: prompt }],
      { temperature: 0.1, maxOutputTokens: 2048 }
    );
    raw = result.text;
    modelUsed = result.modelUsed;
  } catch (err) {
    console.error("[ai-column-mapping] Gemini call failed:", err);
    // Return empty mappings — user will map manually
    return buildFallbackResult(sheetHeaders, appColumns);
  }

  // Parse AI response
  try {
    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
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

    const mappings: ColumnMappingSuggestion[] = (parsed.mappings || []).map((m) => ({
      sheetHeader: m.sheetHeader,
      appColumnId: m.appColumnId || null,
      appColumnName: m.appColumnName || null,
      confidence: Math.max(0, Math.min(1, m.confidence || 0)),
      reason: m.reason || "",
      suggestedDataType: m.suggestedDataType || "text",
      isAutoSelected: (m.confidence || 0) >= AUTO_SELECT_THRESHOLD,
    }));

    // Find unmapped app columns
    const mappedColumnIds = new Set(mappings.map((m) => m.appColumnId).filter(Boolean));
    const unmappedAppColumns = appColumns.filter(
      (c) => !mappedColumnIds.has(c.columnId)
    );

    return {
      mappings,
      modelUsed,
      unmappedAppColumns,
      proposedDatasetName: parsed.proposedDatasetName,
    };
  } catch (parseErr) {
    console.error("[ai-column-mapping] Failed to parse AI response:", parseErr, "\nRaw:", raw);
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

// ── Fallback (no AI) ──────────────────────────────────────────────────────────

function buildFallbackResult(
  sheetHeaders: string[],
  appColumns: AppColumnHint[]
): AIMappingResult {
  // Simple exact-match fallback
  const mappings: ColumnMappingSuggestion[] = sheetHeaders.map((header) => {
    const exactMatch = appColumns.find(
      (c) => c.name.toLowerCase() === header.toLowerCase()
    );
    return {
      sheetHeader: header,
      appColumnId: exactMatch?.columnId || null,
      appColumnName: exactMatch?.name || null,
      confidence: exactMatch ? 1.0 : 0,
      reason: exactMatch ? "Exact name match" : "No match found",
      suggestedDataType: exactMatch?.dataType || "text",
      isAutoSelected: !!exactMatch,
    };
  });

  const mappedColumnIds = new Set(mappings.map((m) => m.appColumnId).filter(Boolean));
  const unmappedAppColumns = appColumns.filter((c) => !mappedColumnIds.has(c.columnId));

  return { mappings, modelUsed: "fallback", unmappedAppColumns };
}
