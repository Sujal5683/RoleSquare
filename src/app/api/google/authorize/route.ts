// GET /api/google/authorize?organizationId=...
//
// Initiates the Google OAuth flow by redirecting the browser to Google's
// consent screen. The authenticated user's ID and the target organizationId
// are encoded into the `state` parameter so they can be recovered in the
// callback without relying on session cookies.

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { buildGoogleOAuthUrl } from "@/lib/google-auth";

export async function GET(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");

    const url = buildGoogleOAuthUrl({ userId: user.id, organizationId });

    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start Google authorization" },
      { status: 500 }
    );
  }
}
