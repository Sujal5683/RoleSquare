// Workspace Intelligence Platform — Google Drive Content Reader
//
// Provides utilities to explore Google Drive links found in dataset records:
//   - List all files in a Drive folder (recursively)
//   - Download/export each file and extract its text content
//   - Handle PDFs, DOCX, Google Docs/Sheets/Slides, images (via Gemini OCR), plain text, CSV
//   - Fall back gracefully on any per-file failure (log warning, continue)
//
// Usage (from job-runner):
//   const result = await exploreLinkedContent(urls, connectionId, jobId, orgId, opts);
//   // result.combinedText is injected into the LLM prompt

import { google, type drive_v3 } from "googleapis";
import { db } from "@/lib/db";
import { decryptToken, encryptToken, refreshAccessToken } from "@/lib/google-auth";
import { callGeminiWithFallback } from "@/lib/gemini";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface DriveExplorationResult {
  /** Combined plain-text content from all explored files/links */
  combinedText: string;
  /** Human-readable list of successfully read files */
  filesRead: string[];
  /** Files that failed to read (name + error) */
  failedFiles: string[];
  /** True if content was truncated due to maxBytes limit */
  truncated: boolean;
  /** Total characters before truncation */
  totalChars: number;
}

export interface DriveExploreOptions {
  /** Maximum total bytes of combined text (default: 500_000 ~500 KB) */
  maxBytes?: number;
  /** Maximum files to read per folder (default: 50) */
  maxFilesPerFolder?: number;
  /** Google connection ID to use for Drive API; falls back to org's first active connection */
  connectionId?: string;
  /** Organization ID (used to find fallback connection) */
  organizationId?: string;
}

// Supported Google export MIME types
const GDOC_EXPORT_MIME = "text/plain";
const GSHEET_EXPORT_MIME = "text/csv";
const GSLIDE_EXPORT_MIME = "text/plain";

// Google Workspace native MIME types
const GOOGLE_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": GDOC_EXPORT_MIME,
  "application/vnd.google-apps.spreadsheet": GSHEET_EXPORT_MIME,
  "application/vnd.google-apps.presentation": GSLIDE_EXPORT_MIME,
};

// Binary types we attempt to read
const READABLE_BINARY_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // XLSX
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
  "application/msword",  // DOC
  "text/plain",
  "text/csv",
  "text/html",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// ────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ────────────────────────────────────────────────────────────────────────────

async function resolveAccessToken(connectionId: string): Promise<string> {
  const conn = await db.googleConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, accessToken: true, refreshToken: true, tokenExpiresAt: true, status: true },
  });
  if (!conn) throw new Error(`GoogleConnection ${connectionId} not found`);
  if (conn.status === "revoked") throw new Error("Google connection has been revoked");

  const isExpired = !conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() < Date.now() + 2 * 60 * 1000;
  if (!isExpired && conn.accessToken) {
    return decryptToken(conn.accessToken);
  }
  if (!conn.refreshToken) {
    await db.googleConnection.update({ where: { id: connectionId }, data: { status: "degraded" } });
    throw new Error("Google connection has no refresh token. Please re-authorize.");
  }
  const { accessToken: newToken, expiresAt } = await refreshAccessToken(conn.refreshToken);
  await db.googleConnection.update({
    where: { id: connectionId },
    data: { accessToken: encryptToken(newToken), tokenExpiresAt: expiresAt, status: "active", lastSyncAt: new Date() },
  });
  return newToken;
}

/**
 * Returns an authenticated Drive v3 client for a Google connection.
 */
async function getDriveClient(connectionId: string): Promise<drive_v3.Drive> {
  const accessToken = await resolveAccessToken(connectionId);
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

/**
 * Finds the best available Google connection for Drive access within an org.
 * Returns the connectionId string or null if none available.
 */
async function findOrgDriveConnection(organizationId: string): Promise<string | null> {
  const conn = await db.googleConnection.findFirst({
    where: { organizationId, status: "active" },
    orderBy: { lastSyncAt: "desc" },
    select: { id: true },
  });
  return conn?.id ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// URL parsing utilities
// ────────────────────────────────────────────────────────────────────────────

interface DriveUrlInfo {
  type: "folder" | "file" | "doc" | "sheet" | "slide" | "form" | "external";
  resourceId?: string;
  url: string;
}

function parseDriveUrl(url: string): DriveUrlInfo {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const path = u.pathname;

    // Google Drive folder: drive.google.com/drive/folders/{folderId}
    const folderMatch = path.match(/\/drive\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) return { type: "folder", resourceId: folderMatch[1], url };

    // Google Drive file: drive.google.com/file/d/{fileId}
    const fileMatch = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return { type: "file", resourceId: fileMatch[1], url };

    // Google Docs: docs.google.com/document/d/{docId}
    const docMatch = path.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (host.includes("docs.google.com") && docMatch) return { type: "doc", resourceId: docMatch[1], url };

    // Google Sheets: docs.google.com/spreadsheets/d/{sheetId}
    const sheetMatch = path.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (sheetMatch) return { type: "sheet", resourceId: sheetMatch[1], url };

    // Google Slides: docs.google.com/presentation/d/{slideId}
    const slideMatch = path.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    if (slideMatch) return { type: "slide", resourceId: slideMatch[1], url };

    // Google Forms: docs.google.com/forms/d/{formId}
    const formMatch = path.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
    if (formMatch) return { type: "form", resourceId: formMatch[1], url };

    return { type: "external", url };
  } catch {
    return { type: "external", url };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// File listing
// ────────────────────────────────────────────────────────────────────────────

interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
}

/**
 * Lists files in a Drive folder (non-recursive, capped at maxFiles).
 */
async function listFolderFiles(
  drive: drive_v3.Drive,
  folderId: string,
  maxFiles: number
): Promise<DriveFileInfo[]> {
  const files: DriveFileInfo[] = [];
  let pageToken: string | undefined;

  do {
    const resp = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: Math.min(maxFiles - files.length, 100),
      pageToken,
    });

    for (const f of resp.data.files ?? []) {
      if (f.id && f.name && f.mimeType) {
        files.push({ id: f.id, name: f.name, mimeType: f.mimeType });
      }
    }
    pageToken = resp.data.nextPageToken ?? undefined;
  } while (pageToken && files.length < maxFiles);

  return files;
}

// ────────────────────────────────────────────────────────────────────────────
// File content extraction per MIME type
// ────────────────────────────────────────────────────────────────────────────

async function extractFileContent(
  drive: drive_v3.Drive,
  file: DriveFileInfo
): Promise<string> {
  const { id, name, mimeType } = file;

  // ── Google Workspace native types (export as text) ──
  const exportMime = GOOGLE_MIME_TYPES[mimeType];
  if (exportMime) {
    const resp = await drive.files.export(
      { fileId: id, mimeType: exportMime },
      { responseType: "text" }
    );
    const text = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
    return `[${name}]\n${text.trim()}`;
  }

  // ── Skip unsupported types ──
  if (!READABLE_BINARY_TYPES.has(mimeType)) {
    return `[${name}] (skipped — unsupported type: ${mimeType})`;
  }

  // ── Download binary content ──
  const resp = await drive.files.get(
    { fileId: id, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(resp.data as ArrayBuffer);

  // Plain text / CSV / HTML
  if (mimeType === "text/plain" || mimeType === "text/csv" || mimeType === "text/html") {
    const text = buffer.toString("utf8");
    // Strip HTML tags for HTML content
    const clean = mimeType === "text/html" ? text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : text;
    return `[${name}]\n${clean}`;
  }

  // PDF — use pdf-parse (dynamically imported to avoid SSR issues)
  if (mimeType === "application/pdf") {
    try {
      // pdf-parse v2 exports as an ESM module — use the named export directly
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
      const data = await pdfParse(buffer);
      return `[${name} (PDF)]\n${data.text.trim()}`;
    } catch (err) {
      console.warn(`[drive-reader] pdf-parse failed for ${name}:`, err instanceof Error ? err.message : err);
      // Fallback: send to Gemini as inline PDF for OCR
      return await extractWithGeminiVision(buffer, mimeType, name);
    }
  }

  // DOCX — use mammoth
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    try {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer });
      return `[${name} (DOCX)]\n${result.value.trim()}`;
    } catch (err) {
      console.warn(`[drive-reader] mammoth failed for ${name}:`, err instanceof Error ? err.message : err);
      return `[${name}] (DOCX extraction failed — ${err instanceof Error ? err.message : "unknown error"})`;
    }
  }

  // XLSX / PPTX / other Office formats — use Gemini Vision as best-effort
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return await extractWithGeminiVision(buffer, mimeType, name);
  }

  // Images — use Gemini Vision for OCR
  if (mimeType.startsWith("image/")) {
    return await extractWithGeminiVision(buffer, mimeType, name);
  }

  return `[${name}] (could not extract text from ${mimeType})`;
}

/**
 * Uses Gemini's multimodal capability to extract text from binary file content
 * (images, PDFs, Office files). Falls back gracefully on failure.
 */
async function extractWithGeminiVision(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("No Gemini API key configured");

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const base64Data = buffer.toString("base64");
    const result = await model.generateContent([
      {
        inlineData: { data: base64Data, mimeType },
      },
      "Extract and return all text content visible in this document or image. Return only the extracted text, no commentary.",
    ]);

    const text = result.response.text();
    return `[${fileName} (OCR/Vision)]\n${text.trim()}`;
  } catch (err) {
    console.warn(`[drive-reader] Gemini Vision failed for ${fileName}:`, err instanceof Error ? err.message : err);
    return `[${fileName}] (Vision extraction failed — ${err instanceof Error ? err.message : "unknown error"})`;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// External URL fetcher (non-Google links)
// ────────────────────────────────────────────────────────────────────────────

async function fetchExternalUrl(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WorkspaceIntelligenceBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    const contentType = resp.headers.get("content-type") ?? "";
    const text = await resp.text();

    if (contentType.includes("html")) {
      // Strip HTML tags and collapse whitespace
      return text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 10000); // cap external pages at 10KB
    }
    return text.slice(0, 10000);
  } catch (err) {
    throw new Error(`Failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────────────────────

/**
 * Explores all Drive links (and other URLs) found in a list of URLs.
 * Reads files/folders, extracts text, and returns a combined result.
 *
 * @param urls       List of URLs to explore (from dataset record values)
 * @param opts       Options (connection ID, content limits)
 * @returns          Combined exploration result ready for LLM injection
 */
export async function exploreLinkedContent(
  urls: string[],
  opts: DriveExploreOptions = {}
): Promise<DriveExplorationResult> {
  const maxBytes = opts.maxBytes ?? 500_000;
  const maxFilesPerFolder = opts.maxFilesPerFolder ?? 50;

  const filesRead: string[] = [];
  const failedFiles: string[] = [];
  const parts: string[] = [];
  let totalChars = 0;
  let truncated = false;

  // Resolve a Drive client (may be null if no connection available)
  let drive: drive_v3.Drive | null = null;
  let resolvedConnectionId = opts.connectionId;

  if (!resolvedConnectionId && opts.organizationId) {
    const fallback = await findOrgDriveConnection(opts.organizationId);
    resolvedConnectionId = fallback ?? undefined;
  }

  if (resolvedConnectionId) {
    try {
      drive = await getDriveClient(resolvedConnectionId);
    } catch (err) {
      console.warn("[drive-reader] Could not initialize Drive client:", err instanceof Error ? err.message : err);
      drive = null;
    }
  }

  // Deduplicate URLs
  const uniqueUrls = [...new Set(urls)];

  for (const url of uniqueUrls) {
    if (totalChars >= maxBytes) {
      truncated = true;
      break;
    }

    const urlInfo = parseDriveUrl(url);

    // ── External URL (non-Google) ──
    if (urlInfo.type === "external") {
      try {
        const text = await fetchExternalUrl(url);
        const label = `[External: ${url}]\n${text}`;
        const remaining = maxBytes - totalChars;
        const chunk = label.slice(0, remaining);
        parts.push(chunk);
        totalChars += chunk.length;
        filesRead.push(`External URL: ${url}`);
        if (chunk.length < label.length) { truncated = true; break; }
      } catch (err) {
        failedFiles.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }

    // ── Google Drive (requires Drive client) ──
    if (!drive) {
      failedFiles.push(`${url}: No Google Drive connection available`);
      continue;
    }

    if (urlInfo.type === "folder" && urlInfo.resourceId) {
      // List and read all files in the folder
      try {
        const folderFiles = await listFolderFiles(drive, urlInfo.resourceId, maxFilesPerFolder);
        parts.push(`\n=== Google Drive Folder (${folderFiles.length} file(s)) ===`);

        for (const file of folderFiles) {
          if (totalChars >= maxBytes) { truncated = true; break; }
          try {
            const text = await extractFileContent(drive, file);
            const remaining = maxBytes - totalChars;
            const chunk = text.slice(0, remaining);
            parts.push(chunk);
            totalChars += chunk.length;
            filesRead.push(`${file.name} (${file.mimeType})`);
            if (chunk.length < text.length) { truncated = true; break; }
          } catch (err) {
            failedFiles.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        failedFiles.push(`Drive folder ${urlInfo.resourceId}: ${err instanceof Error ? err.message : String(err)}`);
      }

    } else if (urlInfo.resourceId) {
      // Single file: doc, sheet, slide, or generic file
      const mimeTypeMap: Record<string, string> = {
        doc: "application/vnd.google-apps.document",
        sheet: "application/vnd.google-apps.spreadsheet",
        slide: "application/vnd.google-apps.presentation",
        form: "application/vnd.google-apps.form",
      };

      const guessedMime = mimeTypeMap[urlInfo.type];
      let fileInfo: DriveFileInfo;

      if (guessedMime) {
        fileInfo = { id: urlInfo.resourceId, name: `${urlInfo.type}:${urlInfo.resourceId}`, mimeType: guessedMime };
      } else {
        // Fetch file metadata for generic drive files
        try {
          const meta = await drive.files.get({ fileId: urlInfo.resourceId, fields: "id,name,mimeType" });
          if (!meta.data.id || !meta.data.name || !meta.data.mimeType) {
            failedFiles.push(`${url}: Could not fetch file metadata`);
            continue;
          }
          fileInfo = { id: meta.data.id, name: meta.data.name, mimeType: meta.data.mimeType };
        } catch (err) {
          failedFiles.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
      }

      try {
        const text = await extractFileContent(drive, fileInfo);
        const remaining = maxBytes - totalChars;
        const chunk = text.slice(0, remaining);
        parts.push(chunk);
        totalChars += chunk.length;
        filesRead.push(`${fileInfo.name} (${fileInfo.mimeType})`);
        if (chunk.length < text.length) { truncated = true; }
      } catch (err) {
        failedFiles.push(`${fileInfo.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (truncated) break;
  }

  return {
    combinedText: parts.join("\n\n"),
    filesRead,
    failedFiles,
    truncated,
    totalChars,
  };
}

/**
 * Extracts all URLs (Drive and external) from a plain-text string.
 */
export function extractAllUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
  return [...new Set(matches)];
}

/**
 * Filters a URL list down to only Google Drive/Docs/Sheets/Slides URLs.
 * Use this to restrict exploration to Drive links only.
 */
export function filterDriveUrls(urls: string[]): string[] {
  return urls.filter((url) =>
    /https?:\/\/(?:docs|drive|sheets|forms)\.google\.com/.test(url)
  );
}
