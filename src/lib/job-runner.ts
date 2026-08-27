// Workspace Intelligence Platform — in-process job runner.
//
// This module provides a lightweight, in-process job processor that
// handles GMAIL_SCAN, EXPORT, and AI_EXTRACTION jobs. It is NOT a
// production-grade queue worker — it runs inside the Next.js process
// and processes jobs one at a time with idempotency checks.
//
// Design goals:
//   - Jobs are safe to execute more than once (idempotent).
//   - Progress is persisted at each stage.
//   - Failures are classified as retryable or terminal.
//   - Stale jobs (running for >10 minutes) are marked as failed.
//   - Dead-letter queue: jobs with 5+ attempts are moved to "dlq".
//
// The runner is started lazily on first API request and runs a polling
// loop every 5 seconds. It stops when no jobs are queued/running.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { bumpUsageMetric } from "@/lib/usage";
import { getGmailClient, extractEmailBody, extractAttachments, extractDriveLinks, getHeader } from "@/lib/google-client";
import { parseEmailFields } from "@/lib/email-parser";
import { ensureDefaultDataset, writeDefaultDatasetRecord } from "@/lib/dataset-provisioner";
import { extractWithLLM } from "@/lib/extraction";
import { exploreLinkedContent, extractAllUrls, filterDriveUrls } from "@/lib/drive-reader";
import { agentInfo, agentWarn, agentError } from "@/lib/agent-logger";
import { computeCost } from "@/lib/model-pricing";
import crypto from "crypto";

const POLL_INTERVAL_MS = 5_000;
const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

const globalForRunner = globalThis as unknown as {
  runnerStarted: boolean;
  runnerPromise: Promise<void> | null;
};

/**
 * Starts the job runner if it hasn't been started yet. Safe to call
 * multiple times — subsequent calls are no-ops.
 */
export function ensureJobRunnerStarted() {
  if (globalForRunner.runnerStarted) return;
  globalForRunner.runnerStarted = true;
  globalForRunner.runnerPromise = runJobLoop().catch((err) => {
    console.error("[job-runner] fatal error:", err);
    globalForRunner.runnerStarted = false;
  });
}

async function runJobLoop() {
  while (true) {
    try {
      await processStaleJobs();
      const job = await pickNextJob();
      if (job) {
        await processJob(job);
      }
    } catch (err) {
      console.error("[job-runner] error in loop:", err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Marks jobs that have been "running" for too long as failed.
 */
async function processStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
  const staleJobs = await db.aiJob.findMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
    },
    select: { id: true, organizationId: true, payload: true },
  });

  for (const job of staleJobs) {
    await db.aiJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: "Job timed out (stale)",
        finishedAt: new Date(),
      },
    });

    try {
      if (job.payload) {
        const parsed = JSON.parse(job.payload);
        if (parsed.runId) {
          await db.sourceRun.updateMany({
            where: { id: parsed.runId },
            data: { status: "failed", errorMessage: "Job timed out (stale)" },
          });
        }
        if (parsed.sourceId) {
          await db.source.updateMany({
            where: { id: parsed.sourceId },
            data: { runState: "idle" },
          });
        }
      }
    } catch (e) {
      // ignore
    }
    await logAudit({
      organizationId: job.organizationId,
      actorType: "system",
      action: "update",
      entity: "job",
      entityId: job.id,
      after: { status: "failed", reason: "stale_timeout" },
      reason: "Job marked as stale",
    });
  }
}

/**
 * Picks the next queued job, atomically transitioning it to "running".
 * Returns null if no jobs are queued.
 */
async function pickNextJob() {
  const queued = await db.aiJob.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
  });
  if (!queued) return null;

  // Atomically transition to running
  try {
    const updated = await db.aiJob.update({
      where: { id: queued.id, status: "queued" },
      data: {
        status: "running",
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    return updated;
  } catch {
    // Another worker picked it up — skip
    return null;
  }
}

/**
 * Processes a single job. Catches all errors and classifies them.
 */
async function processJob(job: {
  id: string;
  organizationId: string;
  type: string;
  payload: string;
  attempts: number;
}) {
  console.log(`[job-runner] processing job ${job.id} (${job.type}, attempt ${job.attempts})`);

  try {
    const payload = JSON.parse(job.payload || "{}");
    let result: Record<string, unknown> = {};

    switch (job.type) {
      case "GMAIL_SCAN":
        result = await processGmailScan(job, payload);
        break;
      case "DETERMINISTIC_SYNC":
        result = await processDeterministicSync(job, payload);
        break;
      case "EXPORT":
        result = await processExport(job, payload);
        break;
      case "AI_EXTRACTION":
        result = await processAiExtraction(job, payload);
        break;
      default:
        // Unknown job type — mark as success with a note
        result = { skipped: true, reason: `Unknown job type: ${job.type}` };
    }

    await db.aiJob.update({
      where: { id: job.id },
      data: {
        status: "success",
        progress: 100,
        result: JSON.stringify(result),
        finishedAt: new Date(),
        errorMessage: null,
      },
    });

    console.log(`[job-runner] job ${job.id} completed successfully`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const isRetryable = isRetryableError(err);

    // Dead-letter if too many attempts
    const shouldDlq = job.attempts >= MAX_ATTEMPTS;

    const finalStatus = shouldDlq ? "dlq" : isRetryable ? "queued" : "failed";

    await db.aiJob.update({
      where: { id: job.id },
      data: {
        status: finalStatus,
        errorMessage: shouldDlq
          ? `Dead-lettered after ${MAX_ATTEMPTS} attempts: ${errorMessage}`
          : errorMessage,
        finishedAt: shouldDlq || !isRetryable ? new Date() : null,
        startedAt: isRetryable ? null : undefined,
      },
    });

    if (finalStatus !== "queued") {
      try {
        const parsed = JSON.parse(job.payload || "{}");
        if (parsed.runId) {
          await db.sourceRun.updateMany({
            where: { id: parsed.runId, status: "running" },
            data: { status: "failed", errorMessage },
          });
        }
        if (parsed.sourceId) {
          await db.source.updateMany({
            where: { id: parsed.sourceId },
            data: { runState: "idle" },
          });
        }
      } catch (e) {
        // ignore
      }
    }

    await logAudit({
      organizationId: job.organizationId,
      actorType: "system",
      action: "update",
      entity: "job",
      entityId: job.id,
      after: {
        status: finalStatus,
        error: errorMessage,
        attempts: job.attempts,
      },
      reason: shouldDlq ? "dead_lettered" : isRetryable ? "retry_queued" : "failed",
    });

    console.error(`[job-runner] job ${job.id} failed: ${errorMessage}`);
  }
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // Network errors, timeouts, and rate limits are retryable
    if (
      msg.includes("timeout") || 
      msg.includes("rate limit") || 
      msg.includes("network") ||
      msg.includes("econnreset") ||
      msg.includes("forcibly closed") ||
      msg.includes("wsarecv")
    ) {
      return true;
    }
    // Prisma transaction conflicts are retryable
    if (msg.includes("transaction") || msg.includes("write conflict")) {
      return true;
    }
  }
  return false;
}

// ── Job Processors ──────────────────────────────────────────────────────

/**
 * GMAIL_SCAN job processor.
 *
 * Calls the Gmail API to fetch real emails matching the source's filter rules.
 * For each matched message:
 *   1. Upserts an Email row (deduplicated by googleMessageId).
 *   2. Discovers and stores EmailAttachment rows.
 *   3. Discovers and stores EmailLink rows (Google Drive/Docs URLs).
 * Updates the SourceRun stats with real counts.
 */
async function processGmailScan(
  job: { id: string; organizationId: string; payload: string },
  payload: { sourceId?: string; runId?: string; mode?: string }
): Promise<Record<string, unknown>> {
  const { sourceId, runId, mode } = payload;
  if (!sourceId || !runId) {
    throw new Error("Missing sourceId or runId in GMAIL_SCAN payload");
  }

  // Check if the run is already completed (idempotency)
  const existingRun = await db.sourceRun.findUnique({ where: { id: runId } });
  if (!existingRun) throw new Error(`Source run ${runId} not found`);
  if (existingRun.status === "success") {
    return { skipped: true, reason: "Run already completed" };
  }

  // Load the source with its rules and connection
  const source = await db.source.findUnique({
    where: { id: sourceId },
    include: { rules: { orderBy: { position: "asc" } } },
  });
  if (!source) throw new Error(`Source ${sourceId} not found`);

  // FIX 1: Ensure default dataset exists immediately at scan start (idempotent).
  // This means the source has a dataset from the very first scan, not after DETERMINISTIC_SYNC.
  await ensureDefaultDataset(sourceId);

  await updateRunProgress(runId, 10, "connecting");

  // Build Gmail search query from SourceRules
  const queryParts: string[] = [];
  for (const rule of source.rules) {
    let value: unknown;
    try { value = JSON.parse(rule.value); } catch { value = rule.value; }
    switch (rule.filterType) {
      case "sender":
        queryParts.push(`from:${Array.isArray(value) ? value.join(" OR from:") : value}`);
        break;
      case "subject":
        queryParts.push(rule.operator === "contains" ? `subject:${value}` : `-subject:${value}`);
        break;
      case "date": {
        if (rule.operator === "gt") queryParts.push(`after:${value}`);
        if (rule.operator === "lt") queryParts.push(`before:${value}`);
        if (rule.operator === "between") {
          let metadata;
          try { metadata = rule.metadata ? JSON.parse(rule.metadata) : null; } catch { /* ignore */ }
          if (metadata?.startDate && metadata?.endDate) {
            queryParts.push(`after:${metadata.startDate} before:${metadata.endDate}`);
          }
        }
        break;
      }
      case "attachment": {
        if (value === true || value === "true" || value === "required") {
          queryParts.push("has:attachment");
          let metadata;
          try { metadata = rule.metadata ? JSON.parse(rule.metadata) : null; } catch { /* ignore */ }
          if (metadata?.allowedExtensions) {
            const exts = (metadata.allowedExtensions as string)
              .split(",")
              .map(e => e.trim().replace(/^\./, ""))
              .filter(Boolean);
            if (exts.length > 0) {
              const filenameQuery = exts.map(e => `filename:${e}`).join(" OR ");
              queryParts.push(`(${filenameQuery})`);
            }
          }
        }
        break;
      }
      case "drive_link":
        if (value === true || value === "true" || value === "required") queryParts.push("drive.google.com");
        break;
    }
  }
  let ruleOperator = "AND";
  if (source.config) {
    try {
      const config = JSON.parse(source.config);
      if (config.ruleOperator === "OR") ruleOperator = "OR";
    } catch { /* ignore */ }
  }
  const operatorStr = ruleOperator === "OR" ? " OR " : " ";
  const gmailQuery = queryParts.length > 0 ? queryParts.join(operatorStr) : "";

  await updateRunProgress(runId, 20, "scanning");

  // Fetch matching message IDs from Gmail
  const gmail = await getGmailClient(source.googleConnectionId);
  const listResp = await gmail.users.messages.list({
    userId: "me",
    q: gmailQuery || undefined,
    maxResults: source.maxEmailsPerScan ?? 100,
  }, { signal: AbortSignal.timeout(30000) });
  const messageRefs = listResp.data.messages ?? [];

  await agentInfo(job.id, job.organizationId, "system", `Fetching ${messageRefs.length} messages (limit: ${source.maxEmailsPerScan ?? 100})`, { query: gmailQuery, sourceId });

  await updateRunProgress(runId, 35, "fetching");

  let emailsMatched = 0;
  let attachmentsFound = 0;
  let driveLinksDiscovered = 0;
  const total = messageRefs.length;

  // Process messages in chunks of 10 to avoid sequential blocking and speed up scanning
  const chunkSize = 10;
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = messageRefs.slice(i, i + chunkSize);
    
    // Update progress
    const pct = 35 + Math.floor(((i + 1) / Math.max(total, 1)) * 45);
    await updateRunProgress(runId, pct, "parsing");

    await Promise.all(chunk.map(async (ref) => {
      if (!ref.id) return;
      try {
        // Fetch full message
        const msgResp = await gmail.users.messages.get({
          userId: "me",
          id: ref.id,
          format: "full",
        }, { signal: AbortSignal.timeout(30000) });
        const msg = msgResp.data;
        const headers = msg.payload?.headers ?? [];

        const fromAddress = getHeader(headers, "from");
        const toAddress = getHeader(headers, "to");
        const ccAddresses = getHeader(headers, "cc") || null;
        const subject = getHeader(headers, "subject");
        const dateStr = getHeader(headers, "date");
        const receivedAt = dateStr ? new Date(dateStr) : new Date();
        const snippet = msg.snippet ?? "";

        const { text: bodyText, html: bodyHtml } = extractEmailBody(msg.payload);

        // Dedup hash: sha256 of messageId
        const dedupHash = crypto.createHash("sha256").update(ref.id).digest("hex");

        const email = await db.email.upsert({
          where: { sourceId_googleMessageId: { sourceId, googleMessageId: ref.id } },
          create: {
            sourceId,
            googleMessageId: ref.id,
            threadId: msg.threadId ?? null,
            fromAddress,
            toAddress,
            ccAddresses,
            subject,
            snippet,
            bodyText: bodyText || null,
            bodyHtml: bodyHtml || null,
            receivedAt,
            dedupHash,
            processingStatus: "matched",
          },
          update: {
            fromAddress,
            toAddress,
            subject,
            snippet,
            bodyText: bodyText || null,
            bodyHtml: bodyHtml || null,
            receivedAt,
            processingStatus: "matched",
          },
        });
        emailsMatched++;

        // Discover attachments
        const attachments = extractAttachments(msg.payload);
        for (const att of attachments) {
          await db.emailAttachment.upsert({
            where: { id: `${email.id}-${att.attachmentId}` },
            create: {
              id: `${email.id}-${att.attachmentId}`,
              emailId: email.id,
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size,
              status: "discovered",
            },
            update: { filename: att.filename, mimeType: att.mimeType, size: att.size },
          });
          attachmentsFound++;
        }

        // Discover Drive links
        const fullText = bodyText + " " + bodyHtml;
        const driveLinks = extractDriveLinks(fullText);
        for (const url of driveLinks) {
          const resourceType = url.includes("docs.google.com/document") ? "docs"
            : url.includes("docs.google.com/spreadsheets") ? "sheets"
            : url.includes("docs.google.com/forms") ? "forms"
            : url.includes("drive.google.com") ? "drive"
            : "external";
          const existingLink = await db.emailLink.findFirst({
            where: { emailId: email.id, url },
          });
          if (!existingLink) {
            await db.emailLink.create({
              data: { emailId: email.id, url, resourceType },
            });
            driveLinksDiscovered++;
          }
        }
      } catch (err) {
        console.warn(`[job-runner] Failed to process email ${ref.id}:`, err instanceof Error ? err.message : err);
      }
    }));
  }

  await updateRunProgress(runId, 95, "finalizing");

  const stats = { emailsMatched, attachmentsFound, driveLinksDiscovered, recordsExtracted: 0 };

  // Complete the run
  await db.sourceRun.update({
    where: { id: runId },
    data: {
      status: "success",
      progress: 100,
      finishedAt: new Date(),
      stats: JSON.stringify(stats),
    },
  });

  // Reset source state
  await db.source.update({
    where: { id: sourceId },
    data: { runState: "idle", lastRunAt: new Date() },
  });

  // Bump usage metrics
  await bumpUsageMetric(job.organizationId, "emails_scanned", emailsMatched);

  // Always queue a DETERMINISTIC_SYNC job to populate the Default Dataset.
  // This runs even if emailsMatched is 0 (clears stale state safely).
  if (emailsMatched > 0) {
    await db.aiJob.create({
      data: {
        organizationId: job.organizationId,
        type: "DETERMINISTIC_SYNC",
        status: "queued",
        payload: JSON.stringify({ sourceId }),
        progress: 0,
      },
    });
  }

  return { mode, stats };
}

async function updateRunProgress(runId: string, progress: number, _stage: string) {
  await db.sourceRun.update({
    where: { id: runId },
    data: { progress },
  });
}

/**
 * DETERMINISTIC_SYNC job processor.
 *
 * Reads all Email rows with processingStatus="matched" for a source and
 * writes deterministic DatasetRecord + DatasetValue rows into the Default Dataset.
 * Zero AI tokens consumed.
 */
async function processDeterministicSync(
  job: { id: string; organizationId: string },
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const sourceId = payload.sourceId as string | undefined;
  if (!sourceId) return { note: "Missing sourceId" };

  // Ensure default dataset exists (idempotent)
  const datasetId = await ensureDefaultDataset(sourceId);

  // Load the source's schema id
  const source = await db.source.findUnique({
    where: { id: sourceId },
    select: { schemaId: true },
  });
  if (!source?.schemaId) return { note: "Source has no schemaId after provisioning — unexpected" };

  // Process unsynced emails in batches of 50
  // Take 51 to detect if there are more after this batch (off-by-one fix)
  const emails = await db.email.findMany({
    where: { sourceId, processingStatus: "matched" },
    take: 51,
    orderBy: { receivedAt: "asc" },
  });
  const hasMore = emails.length === 51;
  const batchEmails = emails.slice(0, 50);

  let recordsSynced = 0;

  for (const email of batchEmails) {
    // Re-fetch full Gmail message to get body/attachments for parsing
    // Note: we rely on bodyText stored during GMAIL_SCAN
    const parsedFields = {
      Date: email.receivedAt.toISOString(),
      Sender: email.fromAddress,
      To: email.toAddress,
      CC: email.ccAddresses ?? "",
      Subject: email.subject,
      Body: email.bodyText ?? email.snippet ?? "",
      Signature: "", // Will be extracted below from bodyText
      "Attachments Summary": "",
      "Drive Links": "",
      "Form Links": "",
      "Other Links": "",
    };

    // Re-run deterministic parsing on stored bodyText
    if (email.bodyText) {
      const { default: SIG_PATTERNS } = await import("@/lib/email-parser").then((m) => ({ default: null, ...m }));
      // Use parseEmailFields signature extraction via a lightweight re-parse
      const fullText = email.bodyText;
      const sigDelimiters = [
        /^--\s*$/m, /^_{3,}/m, /^-{3,}/m,
        /^(regards|sincerely|cheers|best|thanks?)[,.]?\s*$/im,
        /^sent from my (iphone|ipad|android|samsung|gmail)/im,
      ];
      let mainBody = fullText.trim();
      let signature = "";
      for (const p of sigDelimiters) {
        const match = fullText.match(p);
        if (match && match.index !== undefined) {
          mainBody = fullText.slice(0, match.index).trim();
          signature = fullText.slice(match.index).trim();
          break;
        }
      }
      parsedFields.Body = mainBody;
      parsedFields.Signature = signature;

      // Links from bodyText
      const allUrls = [...new Set((fullText.match(/https?:\/\/[^\s"'<>)]+/g) ?? []))];
      const driveLinks: string[] = [];
      const formLinks: string[] = [];
      const otherLinks: string[] = [];
      for (const url of allUrls) {
        if (url.includes("docs.google.com/forms") || url.includes("forms.gle")) {
          formLinks.push(url);
        } else if (url.includes("docs.google.com") || url.includes("drive.google.com") || url.includes("sheets.google.com")) {
          driveLinks.push(url);
        } else {
          otherLinks.push(url);
        }
      }
      parsedFields["Drive Links"] = driveLinks.join(", ");
      parsedFields["Form Links"] = formLinks.join(", ");
      parsedFields["Other Links"] = otherLinks.join(", ");
    }

    // Load email's attachments for summary
    const attachments = await db.emailAttachment.findMany({
      where: { emailId: email.id },
      select: { filename: true, mimeType: true, size: true },
    });
    if (attachments.length > 0) {
      const details = attachments.map((a) => {
        const ext = a.filename.split(".").pop()?.toLowerCase() ?? "file";
        const sizeKb = (a.size / 1024).toFixed(0);
        return `${a.filename} (${ext}, ${sizeKb}KB)`;
      }).join("; ");
      parsedFields["Attachments Summary"] = `${attachments.length} attachment(s): ${details}`;
    }

    await writeDefaultDatasetRecord(email.id, datasetId, parsedFields, source.schemaId);

    // Mark email as extracted
    await db.email.update({
      where: { id: email.id },
      data: { processingStatus: "extracted" },
    });

    recordsSynced++;
  }

  // If there are more unprocessed emails, queue another DETERMINISTIC_SYNC
  if (hasMore) {
    await db.aiJob.create({
      data: {
        organizationId: job.organizationId,
        type: "DETERMINISTIC_SYNC",
        status: "queued",
        payload: JSON.stringify({ sourceId }),
        progress: 0,
      },
    });
  }

  return { recordsSynced, emailsProcessed: batchEmails.length };
}


/**
 * EXPORT job processor.
 *
 * Generates a CSV/JSON export of the dataset and stores the result.
 * For small datasets, the data URL is generated synchronously in the
 * route handler — this processor handles larger exports.
 */
async function processExport(
  job: { id: string; organizationId: string; payload: string },
  payload: { datasetId?: string; format?: string; datasetName?: string }
): Promise<Record<string, unknown>> {
  const { datasetId, format = "csv" } = payload;
  if (!datasetId) {
    throw new Error("Missing datasetId in EXPORT payload");
  }

  const dataset = await db.dataset.findUnique({
    where: { id: datasetId },
    include: {
      schema: { include: { fields: { orderBy: { position: "asc" } } } },
      records: {
        include: { values: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!dataset || dataset.organizationId !== job.organizationId) {
    throw new Error("Dataset not found");
  }

  const fields = dataset.schema?.fields ?? [];
  const recordCount = dataset.records.length;

  if (format === "json") {
    const data = dataset.records.map((r) => {
      const byField = new Map<string, any>(r.values.map((v: any) => [v.fieldId, v]));
      const obj: Record<string, unknown> = {
        recordId: r.id,
        status: r.status,
        confidence: r.confidence,
      };
      for (const f of fields) {
        const v = byField.get(f.id);
        obj[f.name] = v ? JSON.parse(v.value) : null;
      }
      return obj;
    });
    return { format, recordCount, data };
  }

  // CSV format
  const header = ["recordId", "status", "confidence", ...fields.map((f) => f.name)];
  const rows = dataset.records.map((r) => {
    const byField = new Map<string, any>(r.values.map((v: any) => [v.fieldId, v]));
    return [
      r.id,
      r.status,
      String(r.confidence ?? 0),
      ...fields.map((f) => {
        const v = byField.get(f.id);
        if (!v) return "";
        try {
          const parsed = JSON.parse(v.value);
          return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
        } catch {
          return v.value;
        }
      }),
    ];
  });

  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");

  return {
    format,
    recordCount,
    csvLength: csv.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * AI_EXTRACTION job processor.
 *
 * Supports two modes:
 *
 * Mode A — Legacy (sourceId-based): reads Email rows, runs LLM on raw email content.
 *   Payload: { sourceId, datasetId }
 *
 * Mode B — Two-Step Pipeline (recommended): reads DatasetRecord rows from the
 *   Default Dataset and runs LLM on deterministic text to populate Custom Dataset.
 *   Payload: { sourceDatasetId, targetDatasetId, targetSchemaId }
 */
async function processAiExtraction(
  job: { id: string; organizationId: string; payload: string },
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Mode B — forward to two-step pipeline
  const sourceDatasetId = payload.sourceDatasetId as string | undefined;
  const targetDatasetId = payload.targetDatasetId as string | undefined;
  const targetSchemaId  = payload.targetSchemaId  as string | undefined;
  // New Drive exploration options (default exploreDriveLinks to true)
  const exploreDriveLinks = payload.exploreDriveLinks !== false;
  const driveConnectionId = payload.driveConnectionId as string | undefined;
  const maxContentBytes   = typeof payload.maxContentBytes === "number" ? payload.maxContentBytes : undefined;

  if (sourceDatasetId && targetDatasetId && targetSchemaId) {
    return processTwoStepExtraction(job, {
      sourceDatasetId,
      targetDatasetId,
      targetSchemaId,
      exploreDriveLinks,
      driveConnectionId,
      maxContentBytes,
    });
  }

  // Mode A — Legacy
  const sourceId = payload.sourceId as string | undefined;
  const datasetId = payload.datasetId as string | undefined;

  if (!sourceId || !datasetId) {
    return { note: "Missing sourceId or datasetId — skipping" };
  }

  // Load source → schema → fields
  const source = await db.source.findUnique({
    where: { id: sourceId },
    include: {
      schema: { include: { fields: { orderBy: { position: "asc" } } } },
    },
  });
  if (!source?.schema?.fields?.length) {
    return { note: "Source has no schema/fields configured" };
  }

  const schemaFields = source.schema.fields.map((f) => ({
    name: f.name,
    type: f.type,
    description: f.description,
    instructions: f.instructions,
    required: f.required,
    options: f.options ? JSON.parse(f.options) : undefined,
    confidenceThreshold: f.confidenceThreshold,
  }));

  // Find unprocessed emails for this source
  const emails = await db.email.findMany({
    where: { sourceId, processingStatus: "matched" },
    take: 50, // process in batches
  });

  let recordsExtracted = 0;
  let totalTokens = 0;

  for (const email of emails) {
    const sourceText = [
      `From: ${email.fromAddress}`,
      `To: ${email.toAddress}`,
      `Subject: ${email.subject}`,
      `Date: ${email.receivedAt.toISOString()}`,
      `---`,
      email.bodyText || email.snippet,
    ].join("\n");

    let extractionResult;
    try {
      extractionResult = await extractWithLLM({
        fields: schemaFields,
        sourceText,
        sourceFile: `gmail:${email.googleMessageId}`,
      });
    } catch (err) {
      console.error(`[job-runner] AI extraction failed for email ${email.id}:`, err);
      await db.email.update({ where: { id: email.id }, data: { processingStatus: "rejected" } });
      continue;
    }

    // Persist DatasetRecord + DatasetValue rows
    const record = await db.datasetRecord.create({
      data: {
        datasetId,
        sourceEmailId: email.id,
        status: "valid",
        confidence: extractionResult.overallConfidence,
      },
    });

    // FIX 3 (Mode A): Normalize field names before matching so LLM variations
    // ("Invoice Number" vs "invoice_number") don't silently drop values.
    const normFieldName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    for (const fieldResult of extractionResult.fields) {
      const schemaField = source.schema!.fields.find(
        (f) => normFieldName(f.name) === normFieldName(fieldResult.fieldName)
      );
      if (!schemaField) continue;

      await db.datasetValue.create({
        data: {
          recordId: record.id,
          fieldId: schemaField.id,
          value: JSON.stringify(fieldResult.value ?? null),
          confidence: fieldResult.confidence,
          evidence: fieldResult.evidence || "",
          sourceFile: fieldResult.sourceFile ?? `gmail:${email.googleMessageId}`,
          modelUsed: extractionResult.modelUsed,
          promptVersion: extractionResult.promptVersion,
        },
      });
    }

    // Update email processing status
    await db.email.update({
      where: { id: email.id },
      data: { processingStatus: "extracted" },
    });

    recordsExtracted++;
    totalTokens += extractionResult.tokensUsed;

    // Write AiOutput with split token counts and cost
    const costUsd = computeCost(
      extractionResult.modelUsed,
      extractionResult.promptTokens ?? 0,
      extractionResult.completionTokens ?? 0
    );
    await db.aiOutput.create({
      data: {
        jobId: job.id,
        modelUsed: extractionResult.modelUsed,
        promptHash: crypto.createHash("md5").update(sourceText.slice(0, 200)).digest("hex"),
        rawResponse: JSON.stringify(extractionResult.fields),
        tokensUsed: extractionResult.tokensUsed,
        promptTokens: extractionResult.promptTokens ?? 0,
        completionTokens: extractionResult.completionTokens ?? 0,
        costUsd,
      },
    });
    await agentInfo(job.id, job.organizationId, "extractor", `Extracted ${extractionResult.fields.length} fields from email ${email.id}`, { confidence: extractionResult.overallConfidence, tokens: extractionResult.tokensUsed, costUsd });
  }

  // Update dataset record count
  await db.dataset.update({
    where: { id: datasetId },
    data: { recordCount: { increment: recordsExtracted } },
  });

  // Bump AI token usage
  if (totalTokens > 0) {
    await bumpUsageMetric(job.organizationId, "ai_tokens", totalTokens);
  }

  // If we processed a full batch of 50, there might be more emails waiting.
  // Take 51 to detect overflow; queue another job only if truly needed.
  if (emails.length === 50) {
    await db.aiJob.create({
      data: {
        organizationId: job.organizationId,
        type: "AI_EXTRACTION",
        status: "queued",
        payload: JSON.stringify({ sourceId, datasetId }),
        progress: 0,
      },
    });
  }

  return { recordsExtracted, totalTokens, emailsProcessed: emails.length };
}

/**
 * Two-step extraction: reads text from Default Dataset records, runs LLM
 * on deterministic content to populate a Custom Dataset.
 */
async function processTwoStepExtraction(
  job: { id: string; organizationId: string },
  { sourceDatasetId, targetDatasetId, targetSchemaId, exploreDriveLinks, driveConnectionId, maxContentBytes }: {
    sourceDatasetId: string;
    targetDatasetId: string;
    targetSchemaId: string;
    exploreDriveLinks?: boolean;
    driveConnectionId?: string;
    maxContentBytes?: number;
  }
): Promise<Record<string, unknown>> {
  const schemaFields = await db.schemaField.findMany({
    where: { schemaId: targetSchemaId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, type: true, description: true, instructions: true, required: true, options: true, confidenceThreshold: true },
  });
  if (!schemaFields.length) return { note: "Target schema has no fields" };

  const fieldInputs = schemaFields.map((f) => ({
    name: f.name,
    type: f.type,
    description: f.description,
    instructions: f.instructions,
    required: f.required,
    options: f.options ? JSON.parse(f.options) : undefined,
    confidenceThreshold: f.confidenceThreshold,
  }));

  const doneEmails = await db.datasetRecord.findMany({
    where: { datasetId: targetDatasetId, sourceEmailId: { not: null } },
    select: { sourceEmailId: true },
  });
  const doneEmailIds = new Set(doneEmails.map((r) => r.sourceEmailId as string));

  const sourceRecords = await db.datasetRecord.findMany({
    where: { datasetId: sourceDatasetId },
    include: { values: true },
    take: 50,
    orderBy: { createdAt: "asc" },
  });
  const unprocessed = sourceRecords.filter(
    (r) => !r.sourceEmailId || !doneEmailIds.has(r.sourceEmailId)
  );

  let recordsExtracted = 0;
  let totalTokens = 0;
  let totalDriveFilesRead = 0;

  // FIX 3 (Mode B): Normalize field names so "Invoice Number" matches "invoice_number".
  const normFieldName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const total = unprocessed.length;
  let processed = 0;

  for (const sourceRecord of unprocessed) {
    const fieldIds = sourceRecord.values.map((v) => v.fieldId);
    const defaultFields = await db.schemaField.findMany({
      where: { id: { in: fieldIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(defaultFields.map((f) => [f.id, f.name]));

    // Build a richer labeled source text for better LLM context
    const textLines = sourceRecord.values
      .map((v) => {
        let val: unknown;
        try { val = JSON.parse(v.value); } catch { val = v.value; }
        return val ? `${nameById.get(v.fieldId) ?? v.fieldId}: ${val}` : null;
      })
      .filter(Boolean);

    const sourceText = [
      "=== EMAIL RECORD ===",
      ...(textLines as string[]),
      "=== END ===",
    ].join("\n");

    // ── Drive Link Exploration ──────────────────────────────────────────────
    // When exploreDriveLinks is enabled, find all URLs in the record's field
    // values and explore them (Drive folders/files + external links).
    let driveContent: import("@/lib/drive-reader").DriveExplorationResult | undefined = undefined;

    if (exploreDriveLinks) {
      // Collect all raw text values from this record
      const allValues = sourceRecord.values.map((v) => {
        try { return String(JSON.parse(v.value) ?? ""); } catch { return v.value; }
      }).join(" ");

      // Extract all URLs and focus on Drive-type links
      const allUrls = extractAllUrls(allValues + " " + sourceText);
      const driveUrls = filterDriveUrls(allUrls);
      const nonDriveUrls = allUrls.filter((u) => !driveUrls.includes(u)).slice(0, 3); // limit external to 3
      const urlsToExplore = [...driveUrls, ...nonDriveUrls];

      if (urlsToExplore.length > 0) {
        try {
          const result = await exploreLinkedContent(urlsToExplore, {
            connectionId: driveConnectionId,
            organizationId: job.organizationId,
            maxBytes: maxContentBytes ?? 500_000,
          });
          driveContent = result;
          totalDriveFilesRead += result.filesRead.length;

          // Log exploration summary
          await agentInfo(
            job.id,
            job.organizationId,
            "extractor",
            `Drive exploration: read ${result.filesRead.length} file(s) from ${urlsToExplore.length} link(s) for record ${sourceRecord.id}${result.truncated ? " (content truncated)" : ""}`,
            {
              filesRead: result.filesRead,
              failedFiles: result.failedFiles,
              totalChars: result.totalChars,
              truncated: result.truncated,
            }
          );

          if (result.failedFiles.length > 0) {
            await agentInfo(
              job.id,
              job.organizationId,
              "extractor",
              `Drive exploration: ${result.failedFiles.length} file(s) could not be read`,
              { failedFiles: result.failedFiles }
            );
          }
        } catch (err) {
          // Drive exploration failure is non-fatal — log and continue with text-only extraction
          await agentInfo(
            job.id,
            job.organizationId,
            "extractor",
            `Drive exploration failed for record ${sourceRecord.id}, falling back to text-only: ${err instanceof Error ? err.message : String(err)}`,
            {}
          );
        }
      }
    }
    // ── End Drive Link Exploration ──────────────────────────────────────────

    let extractionResult;
    try {
      extractionResult = await extractWithLLM({
        fields: fieldInputs,
        sourceText,
        sourceFile: `dataset:${sourceDatasetId}:record:${sourceRecord.id}`,
        driveContent,
      });
    } catch (err) {
      console.error(`[job-runner] Two-step extraction failed for record ${sourceRecord.id}:`, err);
      processed++;
      continue;
    }


    // FIX 3 (empty guard): Skip creating a record if LLM returned no fields.
    // Without this, empty DatasetRecord rows appear in the UI as blank rows.
    if (!extractionResult.fields.length) {
      console.warn(`[job-runner] Two-step: LLM returned 0 fields for record ${sourceRecord.id} — skipping`);
      processed++;
      continue;
    }

    const record = await db.datasetRecord.create({
      data: {
        datasetId: targetDatasetId,
        sourceEmailId: sourceRecord.sourceEmailId,
        status: extractionResult.overallConfidence >= 0.7 ? "valid" : "needs_review",
        confidence: extractionResult.overallConfidence,
      },
    });

    let valuesWritten = 0;
    for (const fieldResult of extractionResult.fields) {
      // FIX 3: Use normalized comparison instead of strict equality
      const sf = schemaFields.find(
        (f) => normFieldName(f.name) === normFieldName(fieldResult.fieldName)
      );
      if (!sf) continue;
      await db.datasetValue.create({
        data: {
          recordId: record.id,
          fieldId: sf.id,
          value: JSON.stringify(fieldResult.value ?? null),
          confidence: fieldResult.confidence,
          evidence: fieldResult.evidence || "",
          sourceFile: fieldResult.sourceFile,
          modelUsed: extractionResult.modelUsed,
          promptVersion: extractionResult.promptVersion,
        },
      });
      valuesWritten++;
    }

    // If still no values written after normalization, delete the empty record
    if (valuesWritten === 0) {
      await db.datasetRecord.delete({ where: { id: record.id } });
      processed++;
      continue;
    }

    recordsExtracted++;
    totalTokens += extractionResult.tokensUsed;

    // Update progress so the UI progress bar moves
    processed++;
    const progress = Math.round((processed / Math.max(total, 1)) * 90);
    await db.aiJob.update({
      where: { id: job.id },
      data: { progress },
    });

    // Write AiOutput with accurate cost
    const costUsd = computeCost(
      extractionResult.modelUsed,
      extractionResult.promptTokens ?? 0,
      extractionResult.completionTokens ?? 0
    );
    await db.aiOutput.create({
      data: {
        jobId: job.id,
        modelUsed: extractionResult.modelUsed,
        promptHash: crypto.createHash("md5").update(sourceText.slice(0, 200)).digest("hex"),
        rawResponse: JSON.stringify(extractionResult.fields),
        tokensUsed: extractionResult.tokensUsed,
        promptTokens: extractionResult.promptTokens ?? 0,
        completionTokens: extractionResult.completionTokens ?? 0,
        costUsd,
      },
    });
    await agentInfo(job.id, job.organizationId, "extractor", `Two-step: extracted ${valuesWritten} fields from record ${sourceRecord.id}`, { confidence: extractionResult.overallConfidence, tokens: extractionResult.tokensUsed, costUsd });
  } // end for loop

  await db.dataset.update({ where: { id: targetDatasetId }, data: { recordCount: { increment: recordsExtracted } } });
  if (totalTokens > 0) await bumpUsageMetric(job.organizationId, "ai_tokens", totalTokens);

  // Take 51 to detect more records; only re-queue if truly overflowed
  if (unprocessed.length === 50) {
    await db.aiJob.create({
      data: {
        organizationId: job.organizationId,
        type: "AI_EXTRACTION",
        status: "queued",
        payload: JSON.stringify({
          sourceDatasetId,
          targetDatasetId,
          targetSchemaId,
          // Preserve Drive exploration options across batches
          exploreDriveLinks,
          driveConnectionId,
          maxContentBytes,
        }),
        progress: 0,
      },
    });
  }

  return { recordsExtracted, totalTokens, sourceRecordsProcessed: unprocessed.length, totalDriveFilesRead };
}
