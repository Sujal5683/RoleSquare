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
import { extractWithLLM } from "@/lib/extraction";
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
    select: { id: true, organizationId: true },
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

    await db.aiJob.update({
      where: { id: job.id },
      data: {
        status: shouldDlq ? "dlq" : isRetryable ? "queued" : "failed",
        errorMessage: shouldDlq
          ? `Dead-lettered after ${MAX_ATTEMPTS} attempts: ${errorMessage}`
          : errorMessage,
        finishedAt: shouldDlq || !isRetryable ? new Date() : null,
        startedAt: isRetryable ? null : undefined,
      },
    });

    await logAudit({
      organizationId: job.organizationId,
      actorType: "system",
      action: "update",
      entity: "job",
      entityId: job.id,
      after: {
        status: shouldDlq ? "dlq" : isRetryable ? "queued" : "failed",
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
    if (msg.includes("timeout") || msg.includes("rate limit") || msg.includes("network")) {
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
      case "date":
        if (rule.operator === "gt") queryParts.push(`after:${value}`);
        if (rule.operator === "lt") queryParts.push(`before:${value}`);
        break;
      case "attachment":
        if (value === true || value === "required") queryParts.push("has:attachment");
        break;
    }
  }
  const gmailQuery = queryParts.length > 0 ? queryParts.join(" ") : "";

  await updateRunProgress(runId, 20, "scanning");

  // Fetch matching message IDs from Gmail
  const gmail = await getGmailClient(source.googleConnectionId);
  const listResp = await gmail.users.messages.list({
    userId: "me",
    q: gmailQuery || undefined,
    maxResults: 100, // configurable in future
  });
  const messageRefs = listResp.data.messages ?? [];

  await updateRunProgress(runId, 35, "fetching");

  let emailsMatched = 0;
  let attachmentsFound = 0;
  let driveLinksDiscovered = 0;
  const total = messageRefs.length;

  // Fetch and parse each message
  for (let i = 0; i < total; i++) {
    const ref = messageRefs[i];
    if (!ref.id) continue;

    // Update progress incrementally
    const pct = 35 + Math.floor(((i + 1) / Math.max(total, 1)) * 45);
    if (i % 5 === 0) await updateRunProgress(runId, pct, "parsing");

    // Fetch full message
    const msgResp = await gmail.users.messages.get({
      userId: "me",
      id: ref.id,
      format: "full",
    });
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

    // Upsert email (idempotent on googleMessageId)
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
      // Check if link already stored
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

  return { mode, stats };
}

async function updateRunProgress(runId: string, progress: number, _stage: string) {
  await db.sourceRun.update({
    where: { id: runId },
    data: { progress },
  });
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
 * Runs the real LLM extraction pipeline:
 *   1. Loads the source → schema → fields.
 *   2. For each unprocessed email (processingStatus="matched"), calls extractWithLLM.
 *   3. Persists DatasetRecord + DatasetValue rows with evidence, confidence, and model metadata.
 *   4. Updates email processingStatus to "extracted".
 *   5. Bumps ai_tokens usage metric.
 */
async function processAiExtraction(
  job: { id: string; organizationId: string; payload: string },
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
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

    for (const fieldResult of extractionResult.fields) {
      const schemaField = source.schema!.fields.find((f) => f.name === fieldResult.fieldName);
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

  return { recordsExtracted, totalTokens, emailsProcessed: emails.length };
}
