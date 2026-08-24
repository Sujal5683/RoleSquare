// Google Sheets OAuth Service
//
// Provides OAuth 2.0 for Sheets-specific access — completely separate from
// the existing GoogleConnection (Gmail/Drive). This allows users to connect
// a different Google account for Sheets (e.g. work@company.com) without
// affecting their app login or Gmail connection.
//
// Scopes used:
//   spreadsheets          — read + write spreadsheets
//   drive.readonly        — list spreadsheet files in Drive picker
//   userinfo.email        — identify which account was connected

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const SHEETS_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// ── Encryption (reuses same key as google-auth.ts) ───────────────────────────

function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length < 64) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  return Buffer.from(keyHex.slice(0, 64), "hex");
}

export function encryptSheetsToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + authTag.toString("hex") + encrypted.toString("hex");
}

export function decryptSheetsToken(encryptedHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(encryptedHex.slice(0, 24), "hex");
  const authTag = Buffer.from(encryptedHex.slice(24, 56), "hex");
  const ciphertext = Buffer.from(encryptedHex.slice(56), "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

// ── OAuth State ───────────────────────────────────────────────────────────────

export interface SheetsOAuthState {
  userId: string;
  organizationId: string;
  purpose: "sheets";
  returnTo?: string; // path to redirect back to after auth
}

export function buildSheetsOAuthUrl(state: SheetsOAuthState): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  // Use a separate redirect URI for Sheets to not conflict with Gmail callback
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/google-sheets/auth/callback`;

  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID must be set in .env");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SHEETS_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always show consent to force refresh token
    state: Buffer.from(JSON.stringify(state)).toString("base64url"),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function decodeSheetsOAuthState(stateB64: string): SheetsOAuthState {
  try {
    const decoded = JSON.parse(Buffer.from(stateB64, "base64url").toString("utf8"));
    if (!decoded.userId || !decoded.organizationId || decoded.purpose !== "sheets") {
      throw new Error("Invalid state shape");
    }
    return decoded as SheetsOAuthState;
  } catch {
    throw new Error("Invalid or tampered Sheets OAuth state parameter");
  }
}

// ── Token Exchange ────────────────────────────────────────────────────────────

export interface SheetsTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  googleEmail: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export async function exchangeSheetsCode(code: string): Promise<SheetsTokenSet> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/google-sheets/auth/callback`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Connection: "close" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(
      `Google Sheets token exchange failed: ${data.error_description || data.error || res.status}`
    );
  }

  const { access_token, refresh_token, expires_in } = data;
  if (!access_token) throw new Error("Google did not return an access token");
  if (!refresh_token)
    throw new Error(
      "Google did not return a refresh token — ensure prompt=consent is set"
    );

  const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);

  // Fetch user info
  const userinfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}`, Connection: "close" },
    signal: AbortSignal.timeout(10000),
  });
  const userinfo = await userinfoRes.json();

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt,
    googleEmail: userinfo.email || "",
    displayName: userinfo.name || null,
    avatarUrl: userinfo.picture || null,
  };
}

// ── Token Refresh ─────────────────────────────────────────────────────────────

export interface RefreshedSheetsTokens {
  accessToken: string;
  expiresAt: Date;
}

export async function refreshSheetsToken(
  encryptedRefreshToken: string
): Promise<RefreshedSheetsTokens> {
  const refreshToken = decryptSheetsToken(encryptedRefreshToken);
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const isRevoked =
      data.error === "invalid_grant" ||
      (data.error_description || "").includes("revoked");
    throw Object.assign(
      new Error(
        `Google Sheets token refresh failed: ${data.error_description || data.error || res.status}`
      ),
      { isRevoked }
    );
  }

  const { access_token, expires_in } = data;
  if (!access_token)
    throw new Error("Google did not return a new access token during refresh");

  const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);
  return { accessToken: access_token, expiresAt };
}

// ── Token Revocation ──────────────────────────────────────────────────────────

export async function revokeSheetsToken(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best-effort — failure to revoke at Google side is non-fatal
  }
}

// ── SHA-256 Fingerprint Helper ────────────────────────────────────────────────

export function computeFingerprint(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}
