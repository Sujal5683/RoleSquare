// RoleSquare — Deterministic Email Parser
//
// Extracts structured fields from a Gmail message object with zero AI tokens.
// Returns a flat map of field name → value matching the Default Email Schema.

import type { gmail_v1 } from "googleapis";
import {
  extractEmailBody,
  extractAttachments,
  extractDriveLinks,
  getHeader,
  decodeBase64Url,
} from "@/lib/google-client";

export interface ParsedEmailFields {
  Date: string;
  Sender: string;
  To: string;
  CC: string;
  Subject: string;
  Body: string;
  Signature: string;
  "Attachments Summary": string;
  "Drive Links": string;
  "Form Links": string;
  "Other Links": string;
}

// ── Signature detection ───────────────────────────────────────────────────────
//
// Common signature delimiters used by email clients.
const SIG_PATTERNS = [
  /^--\s*$/m,                          // standard RFC 3676 sig delimiter
  /^_{3,}/m,                           // ___
  /^-{3,}/m,                           // ---
  /^(regards|sincerely|cheers|best|thanks?|warm regards)[,.]?\s*$/im,
  /^sent from my (iphone|ipad|android|samsung|gmail)/im,
];

/**
 * Splits body text into [main content, signature].
 */
function splitSignature(body: string): [string, string] {
  for (const pattern of SIG_PATTERNS) {
    const match = body.match(pattern);
    if (match && match.index !== undefined) {
      const splitAt = match.index;
      return [body.slice(0, splitAt).trim(), body.slice(splitAt).trim()];
    }
  }
  return [body.trim(), ""];
}

// ── Link categorisation ───────────────────────────────────────────────────────

function categoriseLinks(text: string): {
  driveLinks: string[];
  formLinks: string[];
  otherLinks: string[];
} {
  const allUrlPattern = /https?:\/\/[^\s"'<>)]+/g;
  const allUrls = [...new Set(text.match(allUrlPattern) ?? [])];

  const driveLinks: string[] = [];
  const formLinks: string[] = [];
  const otherLinks: string[] = [];

  for (const url of allUrls) {
    if (url.includes("docs.google.com/forms") || url.includes("forms.gle")) {
      formLinks.push(url);
    } else if (
      url.includes("docs.google.com") ||
      url.includes("drive.google.com") ||
      url.includes("sheets.google.com")
    ) {
      driveLinks.push(url);
    } else {
      otherLinks.push(url);
    }
  }

  return { driveLinks, formLinks, otherLinks };
}

// ── Attachment summary ────────────────────────────────────────────────────────

function buildAttachmentSummary(
  attachments: { filename: string; mimeType: string; size: number }[]
): string {
  if (attachments.length === 0) return "";
  const details = attachments
    .map((a) => {
      const ext = a.filename.split(".").pop()?.toLowerCase() ?? "file";
      const sizeKb = (a.size / 1024).toFixed(0);
      return `${a.filename} (${ext}, ${sizeKb}KB)`;
    })
    .join("; ");
  return `${attachments.length} attachment(s): ${details}`;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Deterministically parses a Gmail message into structured fields.
 * Requires zero AI tokens.
 */
export function parseEmailFields(
  msg: gmail_v1.Schema$Message
): ParsedEmailFields {
  const headers = msg.payload?.headers ?? [];

  const dateStr = getHeader(headers, "date");
  const sender = getHeader(headers, "from");
  const to = getHeader(headers, "to");
  const cc = getHeader(headers, "cc");
  const subject = getHeader(headers, "subject");

  // Parse ISO date
  let isoDate = "";
  try {
    isoDate = dateStr ? new Date(dateStr).toISOString() : "";
  } catch {
    isoDate = dateStr;
  }

  // Body
  const { text: bodyText, html: bodyHtml } = extractEmailBody(msg.payload);
  const rawBody = bodyText || bodyHtml;
  const [mainBody, signature] = splitSignature(rawBody);

  // Attachments
  const attachments = extractAttachments(msg.payload);
  const attachmentSummary = buildAttachmentSummary(attachments);

  // Links
  const fullText = bodyText + " " + bodyHtml;
  const { driveLinks, formLinks, otherLinks } = categoriseLinks(fullText);

  return {
    Date: isoDate,
    Sender: sender,
    To: to,
    CC: cc,
    Subject: subject,
    Body: mainBody,
    Signature: signature,
    "Attachments Summary": attachmentSummary,
    "Drive Links": driveLinks.join(", "),
    "Form Links": formLinks.join(", "),
    "Other Links": otherLinks.join(", "),
  };
}
