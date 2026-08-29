// Google Sheets API Client Factory
//
// Returns an authenticated googleapis Sheets client for a GoogleSheetsAccount.
// Auto-refreshes expired access tokens using the stored encrypted refresh token.
// On irrecoverable token failure, marks the account as "degraded" and throws a
// user-friendly error.

import { google, type sheets_v4, type drive_v3 } from "googleapis";
import { db } from "@/lib/db";
import {
  decryptSheetsToken,
  encryptSheetsToken,
  refreshSheetsToken,
} from "@/lib/services/google-sheets-oauth";

// ── Token resolution (with auto-refresh) ─────────────────────────────────────

export async function resolveAccessToken(sheetsAccountId: string): Promise<string> {
  const account = await db.googleSheetsAccount.findUnique({
    where: { id: sheetsAccountId },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      status: true,
    },
  });

  if (!account) {
    throw new Error(`GoogleSheetsAccount ${sheetsAccountId} not found`);
  }
  if (account.status === "revoked") {
    throw new GoogleSheetsAuthError(
      "Google Sheets access was revoked. Please reconnect your Google account in Settings → Integrations."
    );
  }

  // Check if access token is still valid (with 2-min buffer)
  const isExpired =
    !account.tokenExpiresAt ||
    account.tokenExpiresAt.getTime() < Date.now() + 2 * 60 * 1000;

  if (!isExpired && account.accessToken) {
    return decryptSheetsToken(account.accessToken);
  }

  // Token expired — refresh it
  if (!account.refreshToken) {
    await db.googleSheetsAccount.update({
      where: { id: sheetsAccountId },
      data: { status: "degraded" },
    });
    throw new GoogleSheetsAuthError(
      "Google Sheets session expired. Please reconnect your Google account in Settings → Integrations."
    );
  }

  try {
    const { accessToken: newToken, expiresAt } = await refreshSheetsToken(
      account.refreshToken
    );

    await db.googleSheetsAccount.update({
      where: { id: sheetsAccountId },
      data: {
        accessToken: encryptSheetsToken(newToken),
        tokenExpiresAt: expiresAt,
        status: "active",
      },
    });

    return newToken;
  } catch (err: unknown) {
    const isRevoked = (err as { isRevoked?: boolean }).isRevoked;
    await db.googleSheetsAccount.update({
      where: { id: sheetsAccountId },
      data: { status: isRevoked ? "revoked" : "degraded" },
    });
    throw new GoogleSheetsAuthError(
      isRevoked
        ? "Google Sheets permission was revoked. Reconnect the Google account to continue synchronization."
        : "Failed to refresh Google Sheets token. Please reconnect your Google account."
    );
  }
}

// ── Client factories ──────────────────────────────────────────────────────────

function buildAuth(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

/** Returns an authenticated Google Sheets API client. */
export async function getSheetsClient(
  sheetsAccountId: string
): Promise<sheets_v4.Sheets> {
  const accessToken = await resolveAccessToken(sheetsAccountId);
  const auth = buildAuth(accessToken);
  return google.sheets({ version: "v4", auth });
}

/** Returns an authenticated Google Drive API client (for listing spreadsheets). */
export async function getDriveClientForSheets(
  sheetsAccountId: string
): Promise<drive_v3.Drive> {
  const accessToken = await resolveAccessToken(sheetsAccountId);
  const auth = buildAuth(accessToken);
  return google.drive({ version: "v3", auth });
}

// ── Custom error class ────────────────────────────────────────────────────────

export class GoogleSheetsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSheetsAuthError";
    Object.setPrototypeOf(this, GoogleSheetsAuthError.prototype);
  }

  static [Symbol.hasInstance](instance: any) {
    return instance?.name === "GoogleSheetsAuthError";
  }
}

// ── Rate-limit aware wrapper ──────────────────────────────────────────────────

/** Wraps a Google API call with exponential backoff on 429/503 errors. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = String((err as Error)?.message || err);
      const isRetryable =
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("503") ||
        msg.includes("Rate Limit");

      if (!isRetryable || attempt === maxAttempts) break;

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 500;
      console.warn(
        `[sheets-client] Retryable error on attempt ${attempt}/${maxAttempts}. Retrying in ${Math.round(delay + jitter)}ms.`
      );
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }
  throw lastError;
}
