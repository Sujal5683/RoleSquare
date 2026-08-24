// GET /api/google-sheets/spreadsheets/[id]/tabs?sheetsAccountId=...
// Lists all tabs (sheets) in a spreadsheet.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { getSpreadsheetMeta } from "@/lib/services/sheet-discovery";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: spreadsheetId } = await params;
    const { organizationId } = await requireOrgContext(req);
    const { searchParams } = new URL(req.url);
    const sheetsAccountId = searchParams.get("sheetsAccountId");

    if (!sheetsAccountId) {
      return NextResponse.json(
        { error: "sheetsAccountId is required" },
        { status: 400 }
      );
    }

    // IDOR: verify account belongs to this org
    const account = await db.googleSheetsAccount.findFirst({
      where: { id: sheetsAccountId, organizationId },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const meta = await getSpreadsheetMeta(sheetsAccountId, spreadsheetId);
    return NextResponse.json(meta);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get spreadsheet metadata" },
      { status: 500 }
    );
  }
}
