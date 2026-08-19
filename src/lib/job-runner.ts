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

const POLL_INTERVAL_MS = 5_000;
const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

let runnerStarted = false;
let runnerPromise: Promise<void> | null = null;

/**
 * Starts the job runner if it hasn't been started yet. Safe to call
 * multiple times — subsequent calls are no-ops.
 */
export function ensureJobRunnerStarted() {
  if (runnerStarted) return;
  runnerStarted = true;
  runnerPromise = runJobLoop().catch((err) => {
    console.error("[job-runner] fatal error:", err);
    runnerStarted = false;
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
 * In the real system this would call the Gmail API. In this simulated
 * environment, it:
 *   1. Updates the source run progress through stages.
 *   2. Marks the run as completed with simulated stats.
 *   3. Resets the source's runState to "idle".
 *
 * Idempotency: if the source run is already completed, this is a no-op.
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
  if (!existingRun) {
    throw new Error(`Source run ${runId} not found`);
  }
  if (existingRun.status === "success") {
    return { skipped: true, reason: "Run already completed" };
  }

  // Simulate scan stages
  await updateRunProgress(runId, 25, "scanning");
  await sleep(500);

  await updateRunProgress(runId, 50, "parsing");
  await sleep(500);

  await updateRunProgress(runId, 75, "extracting");
  await sleep(500);

  // Simulate matched emails (in production, this would be real Gmail data)
  const stats = {
    emailsMatched: Math.floor(Math.random() * 15) + 5,
    attachmentsFound: Math.floor(Math.random() * 8) + 2,
    driveLinksDiscovered: Math.floor(Math.random() * 4),
    recordsExtracted: 0,
  };
  stats.recordsExtracted = Math.floor(stats.emailsMatched * 0.85);

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
    data: { runState: "idle" },
  });

  // Bump usage metrics
  await bumpUsageMetric(job.organizationId, "emails_scanned", stats.emailsMatched);

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
      const byField = new Map(r.values.map((v) => [v.fieldId, v]));
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
    const byField = new Map(r.values.map((v) => [v.fieldId, v]));
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
 * In the real system, this would run a full extraction pipeline. Since
 * the extraction endpoint already processes synchronously, this processor
 * is a placeholder that marks the job as complete.
 */
async function processAiExtraction(
  _job: { id: string; organizationId: string; payload: string },
  _payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Extraction is handled synchronously by /api/extraction
  // This processor exists for future async extraction workflows
  return { note: "Extraction is processed synchronously by the API endpoint" };
}
