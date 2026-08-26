// POST /api/google-sheets/auth
//
// Generates the Google OAuth consent URL for Sheets access.
// This is separate from the existing Gmail/Drive OAuth at /api/google/callback.
//
// Body (JSON): { returnTo?: string }
// Returns: { authorizeUrl: string }
//
// The frontend should navigate `window.location.href` to the returned URL
// (never expose the URL to end users as a clickable link that skips consent).

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { buildSheetsOAuthUrl } from "@/lib/services/google-sheets-oauth";

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
    const body = await req.json().catch(() => ({}));
    const returnTo = typeof body?.returnTo === "string" ? body.returnTo : "/";

    const authorizeUrl = buildSheetsOAuthUrl({
      userId: user.id,
      organizationId,
      purpose: "sheets",
      returnTo,
    });

    return NextResponse.json({ authorizeUrl });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start Google Sheets authorization" },
      { status: 500 }
    );
  }
}
