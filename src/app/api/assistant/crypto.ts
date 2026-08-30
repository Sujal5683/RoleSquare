/**
 * assistant/crypto.ts
 *
 * AES-256-GCM symmetric encryption helpers for AI assistant message content.
 *
 * WHY: All message content written to the AssistantMessage table must be
 * encrypted so that even if the Supabase DB is compromised, raw conversation
 * text is not readable without the server-side secret key.
 *
 * HOW: Each plaintext is encrypted with a fresh 12-byte random IV. The
 * ciphertext and IV are both base64-encoded and joined with ":" so a single
 * column stores everything needed for decryption.
 *
 * KEY: Loaded from ASSISTANT_ENCRYPTION_KEY env var (32 hex-encoded bytes =
 * 64 hex chars). Generate with: `openssl rand -hex 32`
 *
 * NOTE: This is server-only code. Never import from client components.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ── Constants ──────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // bytes — recommended for GCM
const AUTH_TAG_LENGTH = 16; // bytes — GCM default

// ── Key loading ────────────────────────────────────────────────────────────

/**
 * Loads and validates the encryption key from the environment.
 * Throws at call-time (not module load) so Next.js build doesn't fail
 * when the env var isn't set in build environments.
 */
function getEncryptionKey(): Buffer {
  const hex = process.env.ASSISTANT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ASSISTANT_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). " +
      "Generate with: openssl rand -hex 32"
    );
  }
  return Buffer.from(hex, "hex");
}

// ── Encrypt ────────────────────────────────────────────────────────────────

/**
 * Encrypts `plaintext` with AES-256-GCM.
 *
 * Returns a string in the format: `<ciphertext_b64>:<iv_b64>:<authtag_b64>`
 * This format is self-contained — all three pieces needed for decryption
 * are stored in one column.
 *
 * @param plaintext - The raw string to encrypt (message content or JSON blob)
 * @returns Opaque encrypted string safe to store in the DB
 */
export function encryptContent(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    encrypted.toString("base64"),
    iv.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

// ── Decrypt ────────────────────────────────────────────────────────────────

/**
 * Decrypts a value previously produced by `encryptContent`.
 *
 * @param ciphertextBlob - The `ciphertext:iv:authtag` string from the DB
 * @returns The original plaintext string
 * @throws If the key is wrong, or the blob is corrupted (GCM auth tag mismatch)
 */
export function decryptContent(ciphertextBlob: string): string {
  const key = getEncryptionKey();
  const parts = ciphertextBlob.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted content format — expected ciphertext:iv:authtag");
  }

  const [ciphertextB64, ivB64, authTagB64] = parts;
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

// ── Safe decrypt (for reads) ───────────────────────────────────────────────

/**
 * Like `decryptContent` but returns `null` instead of throwing when decryption
 * fails. Useful when reading historical messages that may have been encrypted
 * with a rotated key — they surface as `[encrypted]` rather than crashing.
 */
export function safeDecryptContent(ciphertextBlob: string): string | null {
  try {
    return decryptContent(ciphertextBlob);
  } catch {
    return null;
  }
}
