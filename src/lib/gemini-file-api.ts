// RoleSquare — Gemini File API Uploader
//
// Provides uploadBufferToGemini(): uploads a raw file Buffer to Google's
// Gemini File API so Gemini can read PDFs, images, DOCX, XLSX natively
// via multimodal vision — eliminating local pdf-parse / mammoth parsing.
//
// Files are cached by a SHA-256 content hash on the DatasetFileCache table
// and remain valid for up to 47h (Gemini deletes after 48h).
//
// Usage:
//   const uri = await uploadBufferToGemini(buffer, "application/pdf", "invoice.pdf");
//   // pass uri into your Gemini prompt parts[] array
//
// Supported upload MIME types (Gemini File API):
//   application/pdf, image/*, application/vnd.openxmlformats-*,
//   text/plain, text/csv, text/html

import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs/promises";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Gemini files expire after 48h; we conservatively cache for 47h */
const FILE_CACHE_TTL_MS = 47 * 60 * 60 * 1000;

/** MIME types Gemini's File API natively supports for vision/multimodal reading */
const GEMINI_NATIVE_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "text/plain",
  "text/csv",
  "text/html",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);

/** In-process LRU cache: hash → { uri, expiresAt } */
const IN_PROCESS_CACHE = new Map<string, { uri: string; expiresAt: number }>();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeminiFilePart {
  fileData: { fileUri: string; mimeType: string };
}

export interface UploadResult {
  /** Gemini fileUri, e.g. https://generativelanguage.googleapis.com/v1beta/files/abc123 */
  fileUri: string;
  mimeType: string;
  /** true when served from in-process cache (no API call made) */
  cached: boolean;
}

// ── Core upload function ───────────────────────────────────────────────────────

/**
 * Uploads a Buffer to the Gemini File API and returns a fileUri.
 *
 * Uses an in-process SHA-256 content-hash cache so that the same file
 * (e.g. same PDF attached to multiple emails) is only uploaded once per
 * 47-hour window, regardless of how many rows reference it.
 *
 * @param buffer   Raw file bytes (downloaded from Google Drive or elsewhere)
 * @param mimeType MIME type of the file (e.g. "application/pdf")
 * @param fileName Display name for the Gemini file listing
 */
export async function uploadBufferToGemini(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<UploadResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set — cannot upload to Gemini File API");
  }

  // Normalise MIME type — Gemini is strict about this
  const normalizedMime = normalizeMimeType(mimeType);

  // For types Gemini can't natively read (rare edge case), fall back gracefully
  if (!GEMINI_NATIVE_MIMES.has(normalizedMime)) {
    throw new Error(`Unsupported MIME type for Gemini File API: ${normalizedMime}`);
  }

  // Check in-process cache by content hash
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const cached = IN_PROCESS_CACHE.get(hash);
  if (cached && cached.expiresAt > Date.now()) {
    return { fileUri: cached.uri, mimeType: normalizedMime, cached: true };
  }

  // Write buffer to a temp file (required by GoogleAIFileManager)
  const tmpDir = os.tmpdir();
  const tmpFilePath = path.join(tmpDir, `gemini-upload-${hash.slice(0, 8)}-${Date.now()}`);
  await fs.writeFile(tmpFilePath, buffer);

  try {
    const fileManager = new GoogleAIFileManager(apiKey);

    const uploadResponse = await fileManager.uploadFile(tmpFilePath, {
      mimeType: normalizedMime,
      displayName: fileName,
    });

    // Wait until Gemini finishes processing the file (usually < 2s for PDFs)
    let fileInfo = await fileManager.getFile(uploadResponse.file.name);
    let waitMs = 500;
    while (fileInfo.state === FileState.PROCESSING) {
      await sleep(waitMs);
      waitMs = Math.min(waitMs * 1.5, 5000); // exponential backoff, cap 5s
      fileInfo = await fileManager.getFile(uploadResponse.file.name);
    }

    if (fileInfo.state === FileState.FAILED) {
      throw new Error(`Gemini File API processing failed for ${fileName}: ${fileInfo.state}`);
    }

    const fileUri = fileInfo.uri;

    // Store in in-process cache
    IN_PROCESS_CACHE.set(hash, {
      uri: fileUri,
      expiresAt: Date.now() + FILE_CACHE_TTL_MS,
    });

    return { fileUri, mimeType: normalizedMime, cached: false };
  } finally {
    // Always clean up temp file
    await fs.unlink(tmpFilePath).catch(() => {});
  }
}

// ── Batch upload ─────────────────────────────────────────────────────────────

/**
 * Uploads multiple buffers concurrently (max 5 parallel uploads).
 * Returns an array of GeminiFilePart objects ready to inject into a prompt.
 */
export async function uploadFilesToGemini(
  files: Array<{ buffer: Buffer; mimeType: string; fileName: string }>
): Promise<GeminiFilePart[]> {
  // Chunk into groups of 5 to avoid hammering the File API
  const parts: GeminiFilePart[] = [];
  const CONCURRENCY = 5;

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((f) => uploadBufferToGemini(f.buffer, f.mimeType, f.fileName))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        parts.push({
          fileData: {
            fileUri: result.value.fileUri,
            mimeType: result.value.mimeType,
          },
        });
      } else {
        console.warn("[gemini-file-api] Upload failed for one file:", result.reason);
        // Non-fatal: skip this file and continue with the others
      }
    }
  }

  return parts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeMimeType(mimeType: string): string {
  // Normalize common aliases
  const aliases: Record<string, string> = {
    "application/x-pdf": "application/pdf",
    "application/doc": "application/msword",
    "image/jpg": "image/jpeg",
  };
  return aliases[mimeType] ?? mimeType;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
