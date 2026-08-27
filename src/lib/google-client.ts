// Workspace Intelligence Platform — Google API Client Factory
//
// Provides authenticated Gmail and Drive client instances, auto-refreshing
// expired access tokens using the stored encrypted refresh token.
//
// Usage:
//   const gmail = await getGmailClient(connectionId);
//   const messages = await gmail.users.messages.list({ userId: "me", ... });

import { google, type gmail_v1 } from "googleapis";
import { db } from "@/lib/db";
import { decryptToken, encryptToken, refreshAccessToken } from "@/lib/google-auth";

// ────────────────────────────────────────────────────────────────────────────
// Internal: resolve a valid (non-expired) access token for a connection
// ────────────────────────────────────────────────────────────────────────────

async function resolveAccessToken(connectionId: string): Promise<string> {
  const conn = await db.googleConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      status: true,
    },
  });

  if (!conn) throw new Error(`GoogleConnection ${connectionId} not found`);
  if (conn.status === "revoked") throw new Error("Google connection has been revoked");

  // If the access token is still valid (with 2-min buffer), decrypt and return it
  const isExpired =
    !conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() < Date.now() + 2 * 60 * 1000;

  if (!isExpired && conn.accessToken) {
    return decryptToken(conn.accessToken);
  }

  // Access token is expired or missing — refresh it
  if (!conn.refreshToken) {
    // Mark connection as degraded so the UI prompts re-authorization
    await db.googleConnection.update({
      where: { id: connectionId },
      data: { status: "degraded" },
    });
    throw new Error(
      "Google connection has no refresh token. Please re-authorize the connection."
    );
  }

  const { accessToken: newAccessToken, expiresAt } = await refreshAccessToken(conn.refreshToken);

  // Persist the refreshed access token
  await db.googleConnection.update({
    where: { id: connectionId },
    data: {
      accessToken: encryptToken(newAccessToken),
      tokenExpiresAt: expiresAt,
      status: "active",
      lastSyncAt: new Date(),
    },
  });

  return newAccessToken;
}

// ────────────────────────────────────────────────────────────────────────────
// Gmail client
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns an authenticated Gmail API client for the given GoogleConnection ID.
 * Automatically refreshes an expired access token.
 */
export async function getGmailClient(connectionId: string): Promise<gmail_v1.Gmail> {
  const accessToken = await resolveAccessToken(connectionId);
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

// ────────────────────────────────────────────────────────────────────────────
// Gmail helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Decodes a base64url-encoded Gmail message part body.
 */
export function decodeBase64Url(encoded: string): string {
  if (!encoded) return "";
  // Gmail uses base64url (replaces + with - and / with _)
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Extracts a header value from a Gmail message's headers array.
 */
export function getHeader(
  headers: { name?: string | null; value?: string | null }[],
  name: string
): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/**
 * Recursively extracts text/plain and text/html parts from a MIME message.
 */
export function extractEmailBody(
  payload: gmail_v1.Schema$MessagePart | undefined
): { text: string; html: string } {
  if (!payload) return { text: "", html: "" };

  const mimeType = payload.mimeType ?? "";
  const bodyData = payload.body?.data ?? "";

  if (mimeType === "text/plain") {
    return { text: decodeBase64Url(bodyData), html: "" };
  }
  if (mimeType === "text/html") {
    return { text: "", html: decodeBase64Url(bodyData) };
  }

  // multipart/* — recurse into parts
  if (mimeType.startsWith("multipart/") && payload.parts) {
    let text = "";
    let html = "";
    for (const part of payload.parts) {
      const { text: t, html: h } = extractEmailBody(part);
      if (t) text = t;
      if (h) html = h;
    }
    return { text, html };
  }

  return { text: "", html: "" };
}

/**
 * Collects attachment metadata from a MIME message payload.
 * Returns { filename, mimeType, size, attachmentId } for each attachment.
 */
export function extractAttachments(
  payload: gmail_v1.Schema$MessagePart | undefined
): { filename: string; mimeType: string; size: number; attachmentId: string }[] {
  if (!payload) return [];
  const results: { filename: string; mimeType: string; size: number; attachmentId: string }[] = [];

  function walk(part: gmail_v1.Schema$MessagePart) {
    const isAttachment = part.filename && part.filename.length > 0 && part.body?.attachmentId;
    if (isAttachment) {
      results.push({
        filename: part.filename!,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body?.size ?? 0,
        attachmentId: part.body!.attachmentId!,
      });
    }
    for (const child of part.parts ?? []) {
      walk(child);
    }
  }

  walk(payload);
  return results;
}

/**
 * Extracts Google Drive / Docs / Sheets URLs from email body text.
 */
export function extractDriveLinks(text: string): string[] {
  const pattern = /https?:\/\/(?:docs|drive|sheets|forms)\.google\.com\/[^\s"'>)]+/g;
  return [...new Set(text.match(pattern) ?? [])];
}
