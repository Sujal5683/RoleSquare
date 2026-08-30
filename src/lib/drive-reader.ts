// RoleSquare — Google Drive Content Reader (Gemini File API Edition)
//
// Provides exploreLinkedContent() — discovers files from Drive/Doc/Sheet/Slide
// links in a dataset row, downloads them via the Google Drive API, and returns
// two things:
//
//   1. fileParts[]  — Gemini File API URIs (uploadBufferToGemini() uploads each
//                     raw buffer so Gemini reads PDFs/images natively via vision)
//
//   2. plainText    — lightweight fallback text for Google Workspace native types
//                     (Docs/Sheets exported as plain text — free, no upload needed)
//
// This replaces the old approach of running pdf-parse + mammoth on the server,
// which:
//   - Destroyed visual layout/table structure → poor LLM accuracy
//   - Consumed excessive server RAM for large PDFs
//   - Required a double Gemini call (OCR then extract) for images and XLSX
//
// Architecture:
//   Google Workspace types (Docs, Sheets, Slides)
//     → Drive API export as plain text → injected as text (free, fast)
//   Binary types (PDF, DOCX, XLSX, PPTX, images)
//     → Drive API download → uploadBufferToGemini() → fileUri in fileParts[]
//   External URLs
//     → fetch() with HTML stripping → injected as text (capped at 10 KB)
//
// Per-row data isolation is guaranteed: exploreLinkedContent() is called once
// per source record. The returned fileParts[] are passed directly into that
// row's Gemini extraction call and nowhere else.

import { google, type drive_v3 } from "googleapis";
import { db } from "@/lib/db";
import { decryptToken, encryptToken, refreshAccessToken } from "@/lib/google-auth";
import { uploadBufferToGemini, type GeminiFilePart } from "@/lib/gemini-file-api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DriveExplorationResult {
  /**
   * Gemini File API parts (PDFs, images, DOCX, XLSX).
   * Inject directly into the Gemini prompt's parts[] array.
   */
  fileParts: GeminiFilePart[];
  /**
   * Plain-text content from Google Workspace exports and external URLs.
   * Injected as the text portion of the Gemini prompt.
   */
  plainText: string;
  /** Human-readable names of files that were successfully read */
  filesRead: string[];
  /** Files that failed with the reason */
  failedFiles: string[];
  /** True if content was truncated at the byte limit */
  truncated: boolean;
  /** Total characters of plain text before truncation */
  totalChars: number;
}

export interface DriveExploreOptions {
  /** Maximum bytes of combined plain text (default: 200_000 — ~200 KB) */
  maxBytes?: number;
  /** Maximum files to read per Drive folder (default: 20) */
  maxFilesPerFolder?: number;
  /** Google connection ID for Drive API access */
  connectionId?: string;
  /** Used to find fallback connection if connectionId not supplied */
  organizationId?: string;
}

// ── MIME type constants ───────────────────────────────────────────────────────

// Google Workspace native types → exported as plain text/CSV (no upload needed)
const GOOGLE_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document":     "text/plain",
  "application/vnd.google-apps.spreadsheet":  "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

// Binary types uploaded to Gemini File API for native vision reading
const UPLOAD_TO_GEMINI_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // XLSX
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
  "application/msword",   // DOC
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);

// Plain-text types decoded directly (no upload)
const PLAIN_TEXT_MIMES = new Set([
  "text/plain",
  "text/csv",
  "text/html",
]);

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function resolveAccessToken(connectionId: string): Promise<string> {
  const conn = await db.googleConnection.findUnique({
    where: { id: connectionId },
    select: { accessToken: true, refreshToken: true, tokenExpiresAt: true, status: true },
  });
  if (!conn) throw new Error(`GoogleConnection ${connectionId} not found`);
  if (conn.status === "revoked") throw new Error("Google connection revoked");

  const isExpired = !conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() < Date.now() + 2 * 60 * 1000;
  if (!isExpired && conn.accessToken) return decryptToken(conn.accessToken);

  if (!conn.refreshToken) {
    await db.googleConnection.update({ where: { id: connectionId }, data: { status: "degraded" } });
    throw new Error("Google connection has no refresh token — please re-authorize");
  }
  const { accessToken: newToken, expiresAt } = await refreshAccessToken(conn.refreshToken);
  await db.googleConnection.update({
    where: { id: connectionId },
    data: { accessToken: encryptToken(newToken), tokenExpiresAt: expiresAt, status: "active", lastSyncAt: new Date() },
  });
  return newToken;
}

async function findOrgDriveConnection(organizationId: string): Promise<string | null> {
  const conn = await db.googleConnection.findFirst({
    where: { organizationId, status: "active" },
    orderBy: { lastSyncAt: "desc" },
    select: { id: true },
  });
  return conn?.id ?? null;
}

async function getDriveClient(connectionId: string): Promise<drive_v3.Drive> {
  const accessToken = await resolveAccessToken(connectionId);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

// ── URL parsing ───────────────────────────────────────────────────────────────

type DriveUrlType = "folder" | "file" | "doc" | "sheet" | "slide" | "form" | "external";

interface DriveUrlInfo {
  type: DriveUrlType;
  resourceId?: string;
  url: string;
}

function parseDriveUrl(url: string): DriveUrlInfo {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const host = u.hostname;

    const folderMatch = path.match(/\/drive\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) return { type: "folder", resourceId: folderMatch[1], url };

    const fileMatch = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return { type: "file", resourceId: fileMatch[1], url };

    const docMatch = path.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (host.includes("docs.google.com") && docMatch) return { type: "doc", resourceId: docMatch[1], url };

    const sheetMatch = path.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (sheetMatch) return { type: "sheet", resourceId: sheetMatch[1], url };

    const slideMatch = path.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    if (slideMatch) return { type: "slide", resourceId: slideMatch[1], url };

    const formMatch = path.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
    if (formMatch) return { type: "form", resourceId: formMatch[1], url };

    return { type: "external", url };
  } catch {
    return { type: "external", url };
  }
}

// ── File listing ──────────────────────────────────────────────────────────────

interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
}

async function listFolderFiles(drive: drive_v3.Drive, folderId: string, max: number): Promise<DriveFileInfo[]> {
  const files: DriveFileInfo[] = [];
  let pageToken: string | undefined;
  do {
    const resp = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: Math.min(max - files.length, 100),
      pageToken,
    });
    for (const f of resp.data.files ?? []) {
      if (f.id && f.name && f.mimeType) files.push({ id: f.id, name: f.name, mimeType: f.mimeType });
    }
    pageToken = resp.data.nextPageToken ?? undefined;
  } while (pageToken && files.length < max);
  return files;
}

// ── Per-file content extraction ───────────────────────────────────────────────

/**
 * Extracts content from a single Drive file.
 * Returns either:
 *   { kind: "text", text }     — for Workspace exports and plain-text files
 *   { kind: "filePart", part } — for PDFs, images, DOCX, XLSX (Gemini File API)
 *   { kind: "skip" }           — unsupported type
 */
type FileContent =
  | { kind: "text";     text: string  }
  | { kind: "filePart"; part: GeminiFilePart }
  | { kind: "skip" };

async function extractFileContent(drive: drive_v3.Drive, file: DriveFileInfo): Promise<FileContent> {
  const { id, name, mimeType } = file;

  // ── Google Workspace types → export as text (no binary download, no upload) ──
  const exportMime = GOOGLE_MIME_TYPES[mimeType];
  if (exportMime) {
    const resp = await drive.files.export({ fileId: id, mimeType: exportMime }, { responseType: "text" });
    const text = typeof resp.data === "string" ? resp.data.trim() : JSON.stringify(resp.data);
    return { kind: "text", text: `[${name}]\n${text}` };
  }

  // ── Plain text / CSV / HTML → download and decode ──
  if (PLAIN_TEXT_MIMES.has(mimeType)) {
    const resp = await drive.files.get({ fileId: id, alt: "media" }, { responseType: "arraybuffer" });
    const buffer = Buffer.from(resp.data as ArrayBuffer);
    let text = buffer.toString("utf8");
    if (mimeType === "text/html") {
      text = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return { kind: "text", text: `[${name}]\n${text}` };
  }

  // ── Binary types → download then upload to Gemini File API ──
  if (UPLOAD_TO_GEMINI_MIMES.has(mimeType)) {
    const resp = await drive.files.get({ fileId: id, alt: "media" }, { responseType: "arraybuffer" });
    const buffer = Buffer.from(resp.data as ArrayBuffer);
    // uploadBufferToGemini is content-hash cached — same PDF attached to
    // multiple rows is only uploaded once per 47h window
    const upload = await uploadBufferToGemini(buffer, mimeType, name);
    return { kind: "filePart", part: { fileData: { fileUri: upload.fileUri, mimeType: upload.mimeType } } };
  }

  return { kind: "skip" };
}

// ── External URL fetcher ──────────────────────────────────────────────────────

async function fetchExternalUrl(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; WorkspaceIntelligenceBot/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  const contentType = resp.headers.get("content-type") ?? "";
  const text = await resp.text();
  if (contentType.includes("html")) {
    return text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10_000);
  }
  return text.slice(0, 10_000);
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Explores all Drive / Doc / Sheet / Slide links and external URLs found in a
 * dataset row. Downloads files via the Drive API and returns:
 *
 *   fileParts[]  — Gemini File API URIs for native multimodal reading
 *   plainText    — concatenated text for Workspace exports and external pages
 *
 * This function is called ONCE PER ROW in processSingleRowExtraction().
 * Data isolation is guaranteed — the returned parts are never shared across rows.
 */
export async function exploreLinkedContent(
  urls: string[],
  opts: DriveExploreOptions = {}
): Promise<DriveExplorationResult> {
  const maxBytes          = opts.maxBytes          ?? 200_000;
  const maxFilesPerFolder = opts.maxFilesPerFolder  ?? 20;

  const fileParts:   GeminiFilePart[] = [];
  const plainParts:  string[]          = [];
  const filesRead:   string[]          = [];
  const failedFiles: string[]          = [];
  let totalChars = 0;
  let truncated  = false;

  // ── Resolve Drive client ──
  let drive: drive_v3.Drive | null = null;
  let resolvedConnectionId = opts.connectionId;
  if (!resolvedConnectionId && opts.organizationId) {
    resolvedConnectionId = (await findOrgDriveConnection(opts.organizationId)) ?? undefined;
  }
  if (resolvedConnectionId) {
    try { drive = await getDriveClient(resolvedConnectionId); }
    catch (err) {
      console.warn("[drive-reader] Could not init Drive client:", err instanceof Error ? err.message : err);
    }
  }

  const uniqueUrls = [...new Set(urls)];

  for (const url of uniqueUrls) {
    if (totalChars >= maxBytes) { truncated = true; break; }

    const urlInfo = parseDriveUrl(url);

    // ── External URL ──────────────────────────────────────────────────────────
    if (urlInfo.type === "external") {
      try {
        const text = await fetchExternalUrl(url);
        const label = `[External: ${url}]\n${text}`;
        const remaining = maxBytes - totalChars;
        const chunk = label.slice(0, remaining);
        plainParts.push(chunk);
        totalChars += chunk.length;
        filesRead.push(`External URL: ${url}`);
        if (chunk.length < label.length) { truncated = true; break; }
      } catch (err) {
        failedFiles.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }

    // ── Google Drive (requires Drive client) ──────────────────────────────────
    if (!drive) {
      failedFiles.push(`${url}: No active Google Drive connection`);
      continue;
    }

    // Folder → list then process each file
    if (urlInfo.type === "folder" && urlInfo.resourceId) {
      try {
        const folderFiles = await listFolderFiles(drive, urlInfo.resourceId, maxFilesPerFolder);
        for (const file of folderFiles) {
          if (totalChars >= maxBytes) { truncated = true; break; }
          try {
            const content = await extractFileContent(drive, file);
            if (content.kind === "filePart") {
              fileParts.push(content.part);
              filesRead.push(`${file.name} (${file.mimeType}) [File API]`);
            } else if (content.kind === "text") {
              const remaining = maxBytes - totalChars;
              const chunk = content.text.slice(0, remaining);
              plainParts.push(chunk);
              totalChars += chunk.length;
              filesRead.push(`${file.name} (${file.mimeType})`);
              if (chunk.length < content.text.length) { truncated = true; break; }
            }
            // kind === "skip" → silently ignored
          } catch (err) {
            failedFiles.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        failedFiles.push(`Drive folder ${urlInfo.resourceId}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (truncated) break;
      continue;
    }

    // Single file: doc, sheet, slide, or generic Drive file
    if (urlInfo.resourceId) {
      const guessedMimeMap: Record<string, string> = {
        doc:   "application/vnd.google-apps.document",
        sheet: "application/vnd.google-apps.spreadsheet",
        slide: "application/vnd.google-apps.presentation",
        form:  "application/vnd.google-apps.form",
      };
      const guessedMime = guessedMimeMap[urlInfo.type];
      let fileInfo: DriveFileInfo;

      if (guessedMime) {
        fileInfo = { id: urlInfo.resourceId, name: `${urlInfo.type}:${urlInfo.resourceId}`, mimeType: guessedMime };
      } else {
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
        const content = await extractFileContent(drive, fileInfo);
        if (content.kind === "filePart") {
          fileParts.push(content.part);
          filesRead.push(`${fileInfo.name} (${fileInfo.mimeType}) [File API]`);
        } else if (content.kind === "text") {
          const remaining = maxBytes - totalChars;
          const chunk = content.text.slice(0, remaining);
          plainParts.push(chunk);
          totalChars += chunk.length;
          filesRead.push(`${fileInfo.name} (${fileInfo.mimeType})`);
          if (chunk.length < content.text.length) truncated = true;
        }
      } catch (err) {
        failedFiles.push(`${fileInfo.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (truncated) break;
  }

  return {
    fileParts,
    plainText: plainParts.join("\n\n"),
    filesRead,
    failedFiles,
    truncated,
    totalChars,
  };
}

// ── Utility exports ───────────────────────────────────────────────────────────

/**
 * Extracts all HTTP/HTTPS URLs from a plain-text string.
 * Deduplicates results.
 */
export function extractAllUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
  return [...new Set(matches)];
}

/**
 * Filters a URL list to only Google Drive / Docs / Sheets / Slides URLs.
 */
export function filterDriveUrls(urls: string[]): string[] {
  return urls.filter((url) =>
    /https?:\/\/(?:docs|drive|sheets|forms)\.google\.com/.test(url)
  );
}
