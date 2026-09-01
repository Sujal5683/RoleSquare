// RoleSquare — Google OAuth & Token Utilities
//
// Provides:
//   buildGoogleOAuthUrl(state)        → consent URL string
//   exchangeCodeForTokens(code)       → { accessToken, refreshToken, expiresAt }
//   refreshAccessToken(encryptedRefreshToken) → { accessToken, expiresAt }
//   encryptToken(plaintext)           → hex string
//   decryptToken(hex)                 → plaintext string
//
// Token encryption uses AES-256-GCM with a random IV per call.
// The TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes).

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// Scopes required by the platform:
//   gmail.readonly         — list + read emails
//   drive.metadata.readonly — list Drive files for link resolution
//   drive.readonly         — read Drive file content (docs, sheets, etc.)
const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// ────────────────────────────────────────────────────────────────────────────
// Encryption helpers
// ────────────────────────────────────────────────────────────────────────────

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

/**
 * Encrypts a plain-text token string using AES-256-GCM.
 * Returns a hex string: iv(24 hex) + authTag(32 hex) + ciphertext(hex)
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv || authTag || ciphertext (all hex)
  return iv.toString("hex") + authTag.toString("hex") + encrypted.toString("hex");
}

/**
 * Decrypts a hex string produced by encryptToken().
 */
export function decryptToken(encryptedHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(encryptedHex.slice(0, 24), "hex");      // 12 bytes = 24 hex
  const authTag = Buffer.from(encryptedHex.slice(24, 56), "hex"); // 16 bytes = 32 hex
  const ciphertext = Buffer.from(encryptedHex.slice(56), "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

// ────────────────────────────────────────────────────────────────────────────
// OAuth URL builder
// ────────────────────────────────────────────────────────────────────────────

export interface OAuthState {
  userId: string;
  organizationId: string;
}

/**
 * Builds the Google OAuth consent URL.
 * @param state  An object with userId + organizationId, encrypted into the `state` param.
 */
export function buildGoogleOAuthUrl(state: OAuthState): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI must be set in .env");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    access_type: "offline",    // request refresh token
    prompt: "consent",          // always show consent to force refresh token issuance
    state: encryptToken(JSON.stringify(state)),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Decodes and validates the `state` parameter from the OAuth callback.
 */
export function decodeOAuthState(encryptedState: string): OAuthState {
  try {
    const decoded = JSON.parse(decryptToken(encryptedState));
    if (!decoded.userId || !decoded.organizationId) {
      throw new Error("Invalid state structure");
    }
    return decoded as OAuthState;
  } catch {
    throw new Error("Invalid or tampered OAuth state parameter");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Token exchange
// ────────────────────────────────────────────────────────────────────────────

export interface TokenSet {
  accessToken: string;    // plain-text (short-lived)
  refreshToken: string;   // plain-text (long-lived)
  expiresAt: Date;        // when accessToken expires
  googleEmail: string;    // user's Google email
}

/**
 * Exchanges a Google authorization code for an access + refresh token pair.
 * Also fetches the user's Google email via the userinfo endpoint.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { 
      "Content-Type": "application/x-www-form-urlencoded",
      "Connection": "close"
    },
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
    throw new Error(`Google token exchange failed: ${data.error_description || data.error || res.status}`);
  }

  const { access_token, refresh_token, expires_in } = data;
  if (!access_token) throw new Error("Google did not return an access token");
  if (!refresh_token) throw new Error("Google did not return a refresh token — ensure prompt=consent is set");

  const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000); // 1 min buffer

  // Fetch the user's Google email
  const userinfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { 
      Authorization: `Bearer ${access_token}`,
      "Connection": "close"
    },
    signal: AbortSignal.timeout(10000),
  });
  const userinfo = await userinfoRes.json();
  const googleEmail: string = userinfo.email || "";

  return { accessToken: access_token, refreshToken: refresh_token, expiresAt, googleEmail };
}

// ────────────────────────────────────────────────────────────────────────────
// Token refresh
// ────────────────────────────────────────────────────────────────────────────

export interface RefreshedTokens {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Uses a stored (encrypted) refresh token to obtain a fresh access token.
 * Returns the new plain-text access token and its expiry.
 */
export async function refreshAccessToken(encryptedRefreshToken: string): Promise<RefreshedTokens> {
  const refreshToken = decryptToken(encryptedRefreshToken);
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
    throw new Error(`Google token refresh failed: ${data.error_description || data.error || res.status}`);
  }

  const { access_token, expires_in } = data;
  if (!access_token) throw new Error("Google did not return a new access token during refresh");

  const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);
  return { accessToken: access_token, expiresAt };
}
