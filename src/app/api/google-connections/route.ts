// GET /api/google-connections?organizationId=... — list connections for org.
// POST /api/google-connections — returns the OAuth authorization URL.
//   The client should navigate to the returned `authorizeUrl` to start the
//   real Google OAuth flow (consent screen → /api/google/callback).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { buildGoogleOAuthUrl } from "@/lib/google-auth";
import { serializeGoogleConnection } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const connections = await db.googleConnection.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(connections.map(serializeGoogleConnection));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list connections" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireRole(req, "member");

    // Build the real Google OAuth consent URL.
    // The frontend should redirect the browser (window.location.href) to this URL.
    const authorizeUrl = buildGoogleOAuthUrl({ userId: user.id, organizationId });

    return NextResponse.json({ authorizeUrl }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start Google authorization" },
      { status: 500 }
    );
  }
}
