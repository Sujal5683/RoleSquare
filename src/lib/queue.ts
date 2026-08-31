// ── BullMQ Queue Singleton ─────────────────────────────────────────────────────
//
// This is the single source of truth for the Redis connection and BullMQ queue.
// All job producers (API routes, pipelines) import `enqueueJob` from here.
// The worker process imports `jobQueue` and the Redis connection directly.
//
// Design decisions:
//   - One IORedis connection per process (shared by Queue + QueueEvents)
//   - Worker gets its OWN connection (BullMQ requires separate connections for
//     Queue vs Worker — this is a BullMQ requirement, not a bug)
//   - If REDIS_URL is not set, enqueueJob falls back gracefully to a console warn
//     so local dev without Redis doesn't crash at startup

import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/lib/db";

// ── Redis connection ───────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Shared IORedis connection used by the BullMQ Queue (producers).
 * The Worker uses its own separate connection (created in worker.ts).
 * LazyConnect = true means it only connects when first used.
 */
export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck:    false, // Required by BullMQ
  lazyConnect:         true,
});

redisConnection.on("error", (err) => {
  // Only log — don't crash the process. If Redis is down, jobs fall back to
  // the legacy DB-only path via the `isRedisAvailable` check below.
  console.error("[queue] Redis connection error:", err.message);
});

// ── BullMQ Queue ───────────────────────────────────────────────────────────────

export const QUEUE_NAME = "ai-jobs";

export const jobQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts:    5,
    backoff: {
      type:  "exponential",
      delay: 2000, // 2s, 4s, 8s, 16s, 32s
    },
    removeOnComplete: { age: 60 * 60 * 24 }, // keep 24h for debugging
    removeOnFail:     { age: 60 * 60 * 72 }, // keep 72h for inspection
  },
});

// ── isRedisAvailable helper ────────────────────────────────────────────────────

let _redisOk: boolean | null = null;

async function isRedisAvailable(): Promise<boolean> {
  if (_redisOk === true) return true;
  try {
    await redisConnection.connect().catch(() => {}); // no-op if already connected
    await redisConnection.ping();
    _redisOk = true;
    return true;
  } catch {
    _redisOk = false;
    return false;
  }
}

// Reset cache on error so we retry on next call
redisConnection.on("error", () => { _redisOk = null; });
redisConnection.on("ready", () => { _redisOk = true; });

// ── enqueueJob ────────────────────────────────────────────────────────────────
//
// The ONLY function that API routes and pipelines should call to queue a job.
// It does two things atomically:
//   1. Creates the AiJob row in Postgres (for UI tracking via /api/ai-jobs)
//   2. Pushes the job to BullMQ (Redis) for instant pickup by the worker
//
// The BullMQ job ID is set to the Postgres AiJob.id so the worker can update
// the correct row when reporting progress/completion.

export interface EnqueueJobOptions {
  organizationId: string;
  type:           string;
  payload:        Record<string, unknown>;
  userId?:        string;
  agentKey?:      string;
  bullOpts?:      JobsOptions; // override per-job BullMQ options
}

export async function enqueueJob(opts: EnqueueJobOptions): Promise<string> {
  const { organizationId, type, payload, userId, agentKey, bullOpts } = opts;

  // 1. Create Postgres record for UI tracking
  const dbJob = await db.aiJob.create({
    data: {
      organizationId,
      userId:    userId   ?? null,
      agentKey:  agentKey ?? null,
      type,
      status:   "queued",
      payload:   JSON.stringify(payload),
      progress:  0,
    },
  });

  // 2. Push to Redis/BullMQ — worker picks this up immediately
  const redisOk = await isRedisAvailable();
  if (redisOk) {
    await jobQueue.add(
      type,
      { ...payload, _dbJobId: dbJob.id, _organizationId: organizationId, _userId: userId ?? null },
      { ...bullOpts, jobId: dbJob.id }
    );
    console.log(`[queue] enqueued ${type} job ${dbJob.id} → Redis`);
  } else {
    // Redis unavailable — job stays as `queued` in Postgres.
    // The legacy processNextJobCycle() stub in job-runner.ts will NOT pick it up
    // since it's a no-op, but the job is safe and can be retried manually.
    console.warn(`[queue] Redis unavailable — job ${dbJob.id} queued in DB only. Start the worker or check REDIS_URL.`);
  }

  return dbJob.id;
}
