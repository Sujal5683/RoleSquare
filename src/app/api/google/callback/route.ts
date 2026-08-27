// GET /api/google/callback?code=...&state=...
//
// Handles the Google OAuth redirect after user consent.
// Decodes the state → gets userId + organizationId.
// Exchanges the authorization code for access + refresh tokens.
// Fetches the user's Google email via userinfo.
// Creates or updates the GoogleConnection row with encrypted tokens.
// Redirects back to the application.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  decodeOAuthState,
  exchangeCodeForTokens,
  encryptToken,
} from "@/lib/google-auth";
import { offsetDate, serializeGoogleConnection } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // User denied access on the consent screen
  if (errorParam) {
    console.error("[google/callback] OAuth error from Google:", errorParam);
    return NextResponse.redirect(`${origin}/?error=google_denied`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${origin}/?error=google_callback_invalid`);
  }

  try {
    // 1. Decode state → userId + organizationId
    const { userId, organizationId } = decodeOAuthState(stateParam);

    const currentUser = await getCurrentUser();
    if (currentUser.id !== userId) {
      console.error("[google/callback] OAuth state user ID mismatch");
      return NextResponse.redirect(`${origin}/?error=google_user_mismatch`);
    }

    const membership = currentUser.memberships.find(m => m.organizationId === organizationId && m.status === "active");
    if (!membership) {
      return NextResponse.redirect(`${origin}/?error=google_org_not_found`);
    }

    const ROLE_LEVEL: Record<string, number> = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1 };
    if ((ROLE_LEVEL[membership.role] ?? 0) < 2) {
      return NextResponse.redirect(`${origin}/?error=google_insufficient_role`);
    }

    // 2. Exchange code for real tokens
    const { accessToken, refreshToken, expiresAt, googleEmail } =
      await exchangeCodeForTokens(code);

    // 3. Encrypt tokens before persisting
    const encryptedAccess = encryptToken(accessToken);
    const encryptedRefresh = encryptToken(refreshToken);

    // 4. Upsert GoogleConnection (update if already connected with this email)
    const existingConn = await db.googleConnection.findFirst({
      where: { userId, organizationId, googleEmail },
    });

    const now = new Date();

    let connection;
    if (existingConn) {
      connection = await db.googleConnection.update({
        where: { id: existingConn.id },
        data: {
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          status: "active",
          scopes: "gmail.readonly,drive.metadata.readonly,drive.readonly",
          watchExpiresAt: offsetDate(7, now),
          lastSyncAt: now,
        },
      });
    } else {
      connection = await db.googleConnection.create({
        data: {
          userId,
          organizationId,
          googleEmail,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          status: "active",
          scopes: "gmail.readonly,drive.metadata.readonly,drive.readonly",
          watchExpiresAt: offsetDate(7, now),
          lastSyncAt: now,
        },
      });
    }

    await logAudit({
      organizationId,
      actorId: userId,
      actorType: "user",
      action: "create",
      entity: "connection",
      entityId: connection.id,
      after: {
        googleEmail,
        status: "active",
        action: existingConn ? "re-authorized" : "created",
      },
    });

    console.log(
      `[google/callback] Connection ${connection.id} ${existingConn ? "re-authorized" : "created"} for ${googleEmail}`
    );

    // 5. Redirect back to the app
    let redirectOrigin = origin;
    if (redirectOrigin.includes("0.0.0.0")) {
      redirectOrigin = redirectOrigin.replace("0.0.0.0", "localhost");
    }
    return NextResponse.redirect(`${redirectOrigin}/workspace`);
  } catch (err) {
    console.error("[google/callback] Error:", err);
    const message = err instanceof Error ? encodeURIComponent(err.message) : "unknown";
    return NextResponse.redirect(`${origin}/?error=google_callback_failed&detail=${message}`);
  }
}
