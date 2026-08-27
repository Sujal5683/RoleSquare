// GET /api/google-sheets/auth/callback?code=...&state=...
//
// Handles the Google OAuth redirect for Sheets access.
// Public route — no auth required (user arrives from Google's consent screen).
// Exchanges code for tokens, stores encrypted tokens in GoogleSheetsAccount,
// then redirects back to the application.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  decodeSheetsOAuthState,
  exchangeSheetsCode,
  encryptSheetsToken,
} from "@/lib/services/google-sheets-oauth";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // Normalize origin (dev server on 0.0.0.0)
  const safeOrigin = origin.includes("0.0.0.0")
    ? origin.replace("0.0.0.0", "localhost")
    : origin;

  if (errorParam) {
    console.error("[google-sheets/auth/callback] OAuth error:", errorParam);
    return NextResponse.redirect(`${safeOrigin}/?error=sheets_denied`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${safeOrigin}/?error=sheets_callback_invalid`);
  }

  try {
    // 1. Decode state
    const { userId, organizationId, returnTo } = decodeSheetsOAuthState(stateParam);

    // 1b. Verify state user matches current session to prevent CSRF / State tampering
    const { getCurrentUser } = await import("@/lib/auth");
    const currentUser = await getCurrentUser();
    if (currentUser.id !== userId) {
      console.error("[google-sheets/auth/callback] OAuth state user ID mismatch");
      return NextResponse.redirect(`${safeOrigin}/?error=sheets_user_mismatch`);
    }

    // 2. Exchange code for tokens
    const { accessToken, refreshToken, expiresAt, googleEmail, displayName, avatarUrl } =
      await exchangeSheetsCode(code);

    // 3. Encrypt tokens before storing
    const encryptedAccess = encryptSheetsToken(accessToken);
    const encryptedRefresh = encryptSheetsToken(refreshToken);

    // 4. Upsert GoogleSheetsAccount (allow reconnecting same email)
    const existing = await db.googleSheetsAccount.findFirst({
      where: { organizationId, googleEmail },
    });

    let account;
    const now = new Date();

    if (existing) {
      account = await db.googleSheetsAccount.update({
        where: { id: existing.id },
        data: {
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          displayName: displayName ?? existing.displayName,
          avatarUrl: avatarUrl ?? existing.avatarUrl,
          status: "active",
          scopes: "spreadsheets,drive.readonly",
          updatedAt: now,
        },
      });
    } else {
      account = await db.googleSheetsAccount.create({
        data: {
          userId,
          organizationId,
          googleEmail,
          displayName,
          avatarUrl,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          status: "active",
          scopes: "spreadsheets,drive.readonly",
        },
      });
    }

    await logAudit({
      organizationId,
      actorId: userId,
      actorType: "user",
      action: existing ? "reconnect" : "create",
      entity: "google_sheets_account",
      entityId: account.id,
      after: {
        googleEmail,
        status: "active",
        action: existing ? "re-authorized" : "created",
      },
    });

    console.log(
      `[google-sheets/auth/callback] Account ${account.id} ${existing ? "re-authorized" : "created"} for ${googleEmail}`
    );

    // 5. Redirect back to app with success indicator
    const redirect = `${safeOrigin}${returnTo || "/"}${returnTo?.includes("?") ? "&" : "?"}sheetsConnected=true&accountId=${account.id}`;
    return NextResponse.redirect(redirect);
  } catch (err) {
    console.error("[google-sheets/auth/callback] Error:", err);
    const message =
      err instanceof Error ? encodeURIComponent(err.message) : "unknown";
    return NextResponse.redirect(
      `${safeOrigin}/?error=sheets_callback_failed&detail=${message}`
    );
  }
}
