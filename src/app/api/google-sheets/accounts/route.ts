// GET /api/google-sheets/accounts — list Sheets accounts for this org
// Tokens are NEVER returned in the response.
//
// GET ?organizationId=<id>
// Returns: GoogleSheetsAccountDTO[]

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);

    const accounts = await db.googleSheetsAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        googleEmail: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        scopes: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
        // Never include accessToken or refreshToken
        _count: {
          select: { spreadsheetConnections: true, importJobs: true },
        },
      },
    });

    return NextResponse.json(
      accounts.map((a) => ({
        id: a.id,
        googleEmail: a.googleEmail,
        displayName: a.displayName,
        avatarUrl: a.avatarUrl,
        status: a.status,
        scopes: a.scopes.split(","),
        tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
        spreadsheetCount: a._count.spreadsheetConnections,
        importJobCount: a._count.importJobs,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }))
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list Sheets accounts" },
      { status: 500 }
    );
  }
}
