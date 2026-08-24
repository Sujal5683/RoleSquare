// POST /api/google-sheets/export
//
// Exports a dataset to Google Sheets.
// Body: {
//   datasetId: string,
//   sheetsAccountId: string,
//   mode: "new_sheet" | "new_tab" | "replace_tab" | "append_tab",
//   spreadsheetId?: string,     // required for new_tab | replace_tab | append_tab
//   tabName?: string,           // required for replace_tab | append_tab
//   newSheetTitle?: string,     // for new_sheet mode
//   selectedColumnIds?: string[], // optional column filter
// }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { exportDataset, type ExportMode } from "@/lib/services/export-service";

const VALID_MODES: ExportMode[] = ["new_sheet", "new_tab", "replace_tab", "append_tab"];

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));

    const {
      datasetId,
      sheetsAccountId,
      mode,
      spreadsheetId,
      tabName,
      newSheetTitle,
      selectedColumnIds,
    } = body;

    if (!datasetId || !sheetsAccountId || !mode) {
      return NextResponse.json(
        { error: "datasetId, sheetsAccountId, and mode are required" },
        { status: 400 }
      );
    }

    if (!VALID_MODES.includes(mode)) {
      return NextResponse.json(
        { error: `mode must be one of: ${VALID_MODES.join(", ")}` },
        { status: 400 }
      );
    }

    // IDOR: verify dataset belongs to this org
    const dataset = await db.dataset.findFirst({
      where: { id: datasetId, organizationId },
      select: { id: true },
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

    const result = await exportDataset({
      datasetId,
      organizationId,
      userId: user.id,
      sheetsAccountId,
      mode: mode as ExportMode,
      spreadsheetId,
      tabName,
      newSheetTitle,
      selectedColumnIds,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to export dataset" },
      { status: 500 }
    );
  }
}
