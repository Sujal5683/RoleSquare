// POST /api/google-sheets/ai-mapping
//
// AI-powered column mapping suggestion.
// ADVISORY ONLY — never modifies data. Returns confidence-scored suggestions
// that must be reviewed and confirmed by the user before being applied.
//
// Body: {
//   sheetHeaders: string[],
//   sampleRows: string[][],
//   datasetId?: string,       // if provided, maps to existing dataset columns
// }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { suggestColumnMappings, type AppColumnHint } from "@/lib/services/ai-column-mapping";
import { getCurrentColumns } from "@/lib/services/schema-versioning";

export async function POST(req: NextRequest) {
  try {
    const { organizationId } = await requireRole(req, "member");
    const body = await req.json().catch(() => ({}));

    const { sheetHeaders, sampleRows = [], datasetId } = body;

    if (!Array.isArray(sheetHeaders) || !sheetHeaders.length) {
      return NextResponse.json(
        { error: "sheetHeaders is required and must be a non-empty array" },
        { status: 400 }
      );
    }

    let appColumns: AppColumnHint[] = [];
    let datasetName: string | undefined;

    if (datasetId) {
      // IDOR: verify dataset belongs to org
      const dataset = await db.dataset.findFirst({
        where: { id: datasetId, organizationId },
        select: { id: true, name: true },
      });
      if (!dataset) {
        return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
      }
      datasetName = dataset.name;

      // Try schema-based columns first
      const schemaCols = await getCurrentColumns(datasetId);
      if (schemaCols.length > 0) {
        appColumns = schemaCols.map((c) => ({
          columnId: c.columnId,
          name: c.name,
          dataType: c.dataType,
          required: c.required,
        }));
      } else {
        // Fallback: use DatasetColumnDef rows directly (imported datasets without a Schema link)
        const rawCols = await db.datasetColumnDef.findMany({
          where: { datasetId, isDeleted: false },
          orderBy: { position: "asc" },
          select: {
            columnId: true,
            name: true,
            dataType: true,
            required: true,
          },
        });
        appColumns = rawCols.map((c) => ({
          columnId: c.columnId,
          name: c.name,
          dataType: c.dataType,
          required: c.required,
        }));
      }
    }

    const result = await suggestColumnMappings(
      sheetHeaders,
      sampleRows,
      appColumns,
      datasetName
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("[ai-mapping] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate AI mapping" },
      { status: 500 }
    );
  }
}
