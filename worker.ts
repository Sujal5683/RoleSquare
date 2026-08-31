// ── BullMQ Worker — Standalone Process ────────────────────────────────────────
//
// Run this with:   pnpm worker
// Dev watch mode:  pnpm worker:watch
//
// This is the heart of the async job system. It connects to Redis, listens
// to the "ai-jobs" queue, and processes jobs with concurrency=7.
//
// Each job:
//   1. Updates db.aiJob to status="running"
//   2. Calls processJob() from job-runner.ts
//   3. On success: updates db.aiJob to status="success"
//   4. On failure: updates db.aiJob to status="failed" / "queued" (retry) / "dlq"
//
// Graceful shutdown:
//   SIGTERM/SIGINT → worker.close() → drains active jobs → exits cleanly
//   No job is lost on restart — BullMQ re-queues jobs that were processing
//   when the worker exited (using BullMQ's "stalled" job detection).

import IORedis from "ioredis";
import { Worker, type Job } from "bullmq";
import http from "http";
import { db }         from "./src/lib/db";
import { processJob } from "./src/lib/job-runner";
import { logAudit }   from "./src/lib/audit";
import { GeminiRateLimitExhaustedError } from "./src/lib/gemini";

// ── Config ────────────────────────────────────────────────────────────────────

const QUEUE_NAME          = "ai-jobs";
const CONCURRENT_WORKERS  = 7;
const MAX_ATTEMPTS        = 5;
const STALE_LOCK_MS       = 10 * 60 * 1000 + 5000; // slightly above 10 min job timeout

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ── Worker-specific Redis connection ──────────────────────────────────────────
// BullMQ requires a SEPARATE connection for the Worker vs the Queue.
// This is a BullMQ architectural requirement (not optional).

const workerRedis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
});

workerRedis.on("connect",       () => console.log("[worker] Redis connected"));
workerRedis.on("ready",         () => console.log("[worker] Redis ready"));
workerRedis.on("reconnecting",  () => console.warn("[worker] Redis reconnecting…"));
workerRedis.on("error", (err)   => console.error("[worker] Redis error:", err.message));

// ── Error classification (mirrors job-runner.ts isRetryableError) ─────────────

function isRetryableError(err: unknown): boolean {
  if (err instanceof GeminiRateLimitExhaustedError) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("timeout")                 ||
      msg.includes("rate limit")              ||
      msg.includes("network")                 ||
      msg.includes("econnreset")              ||
      msg.includes("forcibly closed")         ||
      msg.includes("wsarecv")                 ||
      msg.includes("resource_exhausted")      ||
      msg.includes("model_capacity_exhausted")||
      msg.includes("transaction")             ||
      msg.includes("write conflict")
    );
  }
  return false;
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processBullJob(bullJob: Job): Promise<void> {
  const dbJobId        = bullJob.id!;                         // set to AiJob.id in enqueueJob
  const organizationId = bullJob.data._organizationId as string;
  const userId         = bullJob.data._userId         as string | null;
  const jobType        = bullJob.name;                        // BullMQ job name = job type

  // Reconstruct the payload that processJob() expects (strip internal _ fields)
  const payload = { ...bullJob.data };
  delete payload._dbJobId;
  delete payload._organizationId;
  delete payload._userId;

  console.log(`[worker] processing ${jobType} job ${dbJobId} (attempt ${bullJob.attemptsMade + 1})`);

  // 1. Mark as running in Postgres
  await db.aiJob.update({
    where: { id: dbJobId },
    data:  { status: "running", startedAt: new Date(), attempts: { increment: 1 } },
  });

  try {
    // 2. Run the actual job logic
    const result = await processJob({
      id:             dbJobId,
      organizationId,
      userId:         userId ?? null,
      type:           jobType,
      payload:        JSON.stringify(payload),
      attempts:       bullJob.attemptsMade + 1,
    });

    // 3. Success → update Postgres
    await db.aiJob.update({
      where: { id: dbJobId },
      data: {
        status:       "success",
        progress:     100,
        result:       JSON.stringify(result),
        finishedAt:   new Date(),
        errorMessage: null,
      },
    });

    console.log(`[worker] ✓ ${jobType} job ${dbJobId} completed`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const retryable    = isRetryableError(err);
    const attempts     = bullJob.attemptsMade + 1;
    const isDlq        = attempts >= MAX_ATTEMPTS && !retryable;

    const finalStatus = isDlq ? "dlq" : retryable ? "queued" : "failed";

    // Update Postgres — if retryable, BullMQ will retry via its own backoff
    await db.aiJob.update({
      where: { id: dbJobId },
      data: {
        status:       finalStatus,
        errorMessage: isDlq
          ? `Dead-lettered after ${MAX_ATTEMPTS} attempts: ${errorMessage}`
          : errorMessage,
        finishedAt:   isDlq || !retryable ? new Date() : null,
        startedAt:    retryable ? null : undefined,
      },
    });

    // Propagate run/source status on terminal failures
    if (finalStatus !== "queued") {
      try {
        const parsed = typeof bullJob.data === "object" ? bullJob.data : {};
        if (parsed.runId)    await db.sourceRun.updateMany({ where: { id: parsed.runId as string,    status: "running" }, data: { status: "failed", errorMessage } });
        if (parsed.sourceId) await db.source.updateMany({   where: { id: parsed.sourceId as string }, data: { runState: "idle" } });
      } catch { /* ignore */ }
    }

    await logAudit({
      organizationId,
      actorType: "system",
      action:    "update",
      entity:    "job",
      entityId:  dbJobId,
      after:     { status: finalStatus, error: errorMessage, attempts },
      reason:    isDlq ? "dead_lettered" : retryable ? "retry_queued" : "failed",
    });

    console.error(`[worker] ✗ ${jobType} job ${dbJobId} → ${finalStatus}: ${errorMessage}`);

    // Re-throw so BullMQ knows the job failed and can apply its retry backoff
    // For retryable errors: BullMQ retries with exponential backoff
    // For terminal errors: BullMQ moves to failed set (no more retries)
    throw err;
  }
}

// ── Worker instance ───────────────────────────────────────────────────────────

const worker = new Worker(QUEUE_NAME, processBullJob, {
  connection:       workerRedis,
  concurrency:      CONCURRENT_WORKERS,
  stalledInterval:  30_000,          // check for stalled jobs every 30s
  maxStalledCount:  2,               // max times a job can be re-run after being stalled
  lockDuration:     STALE_LOCK_MS,   // how long worker holds the lock per job
});

worker.on("active",    (job) => console.log(`[worker] → active: ${job.name} ${job.id}`));
worker.on("completed", (job) => console.log(`[worker] ✓ done:   ${job.name} ${job.id}`));
worker.on("failed",    (job, err) => console.error(`[worker] ✗ failed: ${job?.name} ${job?.id} — ${err.message}`));
worker.on("error",     (err)      => console.error(`[worker] ✗ error:  ${err.message}`));

console.log(`[worker] Started — queue="${QUEUE_NAME}", concurrency=${CONCURRENT_WORKERS}, redis=${REDIS_URL}`);

// ── HTTP Server for Render Health Checks & Keep-Alive ─────────────────────────
// Render requires Web Services to bind to process.env.PORT within 60s.
// We use a simple native HTTP server to reply to `/ping` requests.

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  if (req.url === "/ping" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Worker is awake and processing jobs.\n");
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[worker] HTTP server listening on port ${PORT} (for health checks)`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`\n[worker] ${signal} received — draining active jobs…`);
  
  // Close HTTP server
  server.close();
  
  // Close BullMQ worker and Redis connection
  await worker.close();
  await workerRedis.quit();
  
  console.log("[worker] Shutdown complete.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
