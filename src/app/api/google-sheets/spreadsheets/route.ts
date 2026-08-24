// GET /api/google-sheets/spreadsheets?sheetsAccountId=...&pageToken=...
// Lists Drive spreadsheets accessible by the Sheets account.
// Results are paginated (pageSize=50 by default).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { listSpreadsheets } from "@/lib/services/sheet-discovery";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const { searchParams } = new URL(req.url);
    const sheetsAccountId = searchParams.get("sheetsAccountId");
    const pageToken = searchParams.get("pageToken") || undefined;

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

    const result = await listSpreadsheets(sheetsAccountId, pageToken);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list spreadsheets" },
      { status: 500 }
    );
  }
}
