// GET /api/google-sheets/spreadsheets/[id]/preview
// Returns the first N rows and headers of a sheet tab.
// Query params: sheetsAccountId, tab (tab/sheet name), limit (default 10)

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSpreadsheetMeta, getSheetPreview } from "@/lib/services/sheet-discovery";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: spreadsheetId } = await params;
    const { organizationId } = await requireOrgContext(req);
    const url = new URL(req.url);
    const sheetsAccountId = url.searchParams.get("sheetsAccountId") ?? "";
    const tab = url.searchParams.get("tab") ?? "";
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "10", 10),
      100
    );

    if (!sheetsAccountId || !tab) {
      return NextResponse.json(
        { error: "sheetsAccountId and tab are required" },
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

    const preview = await getSheetPreview(sheetsAccountId, spreadsheetId, tab, limit);

    if (!preview || !preview.headers.length) {
      return NextResponse.json({ headers: [], rows: [], totalRowsEstimate: 0 });
    }

    // Get row estimate from sheet metadata
    let totalRowsEstimate = 0;
    try {
      const meta = await getSpreadsheetMeta(sheetsAccountId, spreadsheetId);
      const tabMeta = meta.tabs.find((t) => t.title === tab);
      totalRowsEstimate = Math.max(0, tabMeta?.rowCount ?? 0);
    } catch {}

    return NextResponse.json({
      headers: preview.headers,
      rows: preview.rows,
      totalRowsEstimate,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch preview" },
      { status: 500 }
    );
  }
}
