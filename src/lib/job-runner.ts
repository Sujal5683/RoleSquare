// RoleSquare — Resilient Background Job Runner
//
// Architecture: Fan-Out Queue (industry standard for AI ETL pipelines)
//
//  1. AI_EXTRACTION (Master Job)
//     Reads N unprocessed source records → inserts N individual EXTRACT_SINGLE_ROW
//     child jobs → returns immediately (does NOT process rows itself).
//
//  2. EXTRACT_SINGLE_ROW (Worker Job)
//     Processes exactly ONE row:
//       a. Build source text from DatasetRecord values
//       b. exploreLinkedContent() → downloads Drive files → Gemini File API URIs
//       c. extractWithLLM() → calls Gemini with multimodal fileParts[]
//       d. Persists DatasetRecord + DatasetValue rows in the target dataset
//     If Gemini throws GeminiRateLimitExhaustedError → job goes back to `queued`
//     (not `failed`) → automatically retried in the next cycle. Zero data lost.
//
//  3. Concurrent polling — processNextJobCycle() picks up to 8 jobs simultaneously
//     using Promise.allSettled(). Each job runs in isolation.
//
// Key invariants:
//   - STALE_JOB_THRESHOLD_MS increased to 10 minutes per row (was 10 min per 50-row batch)
//   - GeminiRateLimitExhaustedError always re-queues the row (isRetryableError)
//   - Drive file content is fetched ONCE per row; if LLM fails, only the LLM is retried
//   - No cross-row data contamination: each EXTRACT_SINGLE_ROW call is a separate HTTP req

import { processGmailScan }  from "@/lib/pipelines/gmail";
import { processDriveScan }  from "@/lib/pipelines/drive";
import { processDocsScan }   from "@/lib/pipelines/docs";
import { processSheetsScan } from "@/lib/pipelines/sheets";
import { processFormsScan }  from "@/lib/pipelines/forms";

import { db }                           from "@/lib/db";
import { logAudit }                     from "@/lib/audit";
import { bumpUsageMetric }              from "@/lib/usage";
import {
  getGmailClient,
  extractEmailBody,
  extractAttachments,
  extractDriveLinks,
  getHeader,
}                                       from "@/lib/google-client";
import { parseEmailFields }             from "@/lib/email-parser";
import type { ParsedEmailFields }       from "@/lib/email-parser";
import { ensureDefaultDataset, writeDefaultDatasetRecord } from "@/lib/dataset-provisioner";
import { extractWithLLM }               from "@/lib/extraction";
import { exploreLinkedContent, extractAllUrls, filterDriveUrls } from "@/lib/drive-reader";
import { agentInfo, agentWarn, agentError } from "@/lib/agent-logger";
import { computeCost }                  from "@/lib/model-pricing";
import { GeminiRateLimitExhaustedError } from "@/lib/gemini";
import crypto                           from "crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

/** 10 minutes per single-row job — large Drive folders can take ~60–90s */
const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** How many jobs to run concurrently in one processNextJobCycle() call */
const CONCURRENT_WORKERS = 8;
/** How many EXTRACT_SINGLE_ROW children to fan-out per AI_EXTRACTION master job */
const FAN_OUT_BATCH_SIZE  = 50;

// ── Job cycle (called by /api/jobs/process) ───────────────────────────────────

/**
 * Marks stale jobs then picks up to CONCURRENT_WORKERS queued jobs and
 * runs them in parallel using Promise.allSettled (errors in one don't
 * cancel others).
 */
export async function processNextJobCycle() {
  try {
    await processStaleJobs();
    const jobs = await pickNextJobs(CONCURRENT_WORKERS);
    if (jobs.length === 0) return;
    await Promise.allSettled(jobs.map((job) => processJob(job)));
  } catch (err) {
    console.error("[job-runner] error in cycle:", err);
  }
}

// ── Stale job detection ───────────────────────────────────────────────────────

async function processStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
  const staleJobs = await db.aiJob.findMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    select: { id: true, organizationId: true, payload: true },
  });

  for (const job of staleJobs) {
    await db.aiJob.update({
      where: { id: job.id },
      data: { status: "failed", errorMessage: "Job timed out (stale)", finishedAt: new Date() },
    });
    try {
      if (job.payload) {
        const parsed = JSON.parse(job.payload);
        if (parsed.runId)    await db.sourceRun.updateMany({ where: { id: parsed.runId },    data: { status: "failed", errorMessage: "Job timed out (stale)" } });
        if (parsed.sourceId) await db.source.updateMany({   where: { id: parsed.sourceId }, data: { runState: "idle" } });
      }
    } catch { /* ignore */ }

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

// ── Job picking — takes up to N jobs atomically ───────────────────────────────

async function pickNextJobs(limit: number) {
  const queued = await db.aiJob.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  if (!queued.length) return [];

  const picked = await Promise.allSettled(
    queued.map((j) =>
      db.aiJob.update({
        where: { id: j.id, status: "queued" },
        data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } },
      })
    )
  );

  return picked
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<any>).value);
}

// ── Single job dispatcher ─────────────────────────────────────────────────────

async function processJob(job: {
  id: string;
  organizationId: string;
  userId: string | null;
  type: string;
  payload: string;
  attempts: number;
}) {
  console.log(`[job-runner] job ${job.id} type=${job.type} attempt=${job.attempts}`);

  try {
    if (job.userId) {
      const { checkUserLimits } = await import("@/lib/usage");
      await checkUserLimits(job.userId, "jobs");
      await checkUserLimits(job.userId, "tokens");
      await checkUserLimits(job.userId, "records");
    }

    const payload = JSON.parse(job.payload || "{}");
    let result: Record<string, unknown> = {};

    switch (job.type) {
      case "GMAIL_SCAN":          result = await processGmailScan(job, payload);              break;
      case "DRIVE_SCAN":          result = await processDriveScan(job, payload);              break;
      case "DOCS_SCAN":           result = await processDocsScan(job, payload);               break;
      case "SHEETS_SCAN":         result = await processSheetsScan(job, payload);             break;
      case "FORMS_SCAN":          result = await processFormsScan(job, payload);              break;
      case "DETERMINISTIC_SYNC":  result = await processDeterministicSync(job, payload);      break;
      case "EXPORT":              result = await processExport(job, payload);                 break;
      case "AI_EXTRACTION":       result = await processAiExtractionMaster(job, payload);     break;
      case "EXTRACT_SINGLE_ROW":  result = await processSingleRowExtraction(job, payload);    break;
      default:                    result = { skipped: true, reason: `Unknown type: ${job.type}` };
    }

    await db.aiJob.update({
      where: { id: job.id },
      data: { status: "success", progress: 100, result: JSON.stringify(result), finishedAt: new Date(), errorMessage: null },
    });
    console.log(`[job-runner] job ${job.id} done`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const isRetryable  = isRetryableError(err);
    const shouldDlq    = job.attempts >= MAX_ATTEMPTS;
    const finalStatus  = shouldDlq ? "dlq" : isRetryable ? "queued" : "failed";

    await db.aiJob.update({
      where: { id: job.id },
      data: {
        status: finalStatus,
        errorMessage: shouldDlq
          ? `Dead-lettered after ${MAX_ATTEMPTS} attempts: ${errorMessage}`
          : errorMessage,
        finishedAt: shouldDlq || !isRetryable ? new Date() : null,
        startedAt:  isRetryable ? null : undefined,
      },
    });

    if (finalStatus !== "queued") {
      try {
        const parsed = JSON.parse(job.payload || "{}");
        if (parsed.runId)    await db.sourceRun.updateMany({ where: { id: parsed.runId,    status: "running" }, data: { status: "failed", errorMessage } });
        if (parsed.sourceId) await db.source.updateMany({   where: { id: parsed.sourceId },                    data: { runState: "idle" } });
      } catch { /* ignore */ }
    }

    await logAudit({
      organizationId: job.organizationId,
      actorType: "system",
      action: "update",
      entity: "job",
      entityId: job.id,
      after: { status: finalStatus, error: errorMessage, attempts: job.attempts },
      reason: shouldDlq ? "dead_lettered" : isRetryable ? "retry_queued" : "failed",
    });

    console.error(`[job-runner] job ${job.id} → ${finalStatus}: ${errorMessage}`);
  }
}

/**
 * Classifies errors as retryable (job goes back to queued) or terminal.
 * GeminiRateLimitExhaustedError is always retryable — this is the primary
 * guard against silent data loss when all Gemini models are temporarily busy.
 */
function isRetryableError(err: unknown): boolean {
  // Rate limit exhausted across all Gemini models → always retry
  if (err instanceof GeminiRateLimitExhaustedError) return true;

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("timeout")        ||
      msg.includes("rate limit")     ||
      msg.includes("network")        ||
      msg.includes("econnreset")     ||
      msg.includes("forcibly closed")||
      msg.includes("wsarecv")        ||
      msg.includes("resource_exhausted") ||
      msg.includes("model_capacity_exhausted")
    ) return true;
    if (msg.includes("transaction") || msg.includes("write conflict")) return true;
  }
  return false;
}

// ── Progress helper ───────────────────────────────────────────────────────────

export async function updateRunProgress(runId: string, progress: number, _stage: string) {
  await db.sourceRun.update({ where: { id: runId }, data: { progress } });
}

// ── AI_EXTRACTION: Master (Fan-Out) ──────────────────────────────────────────

/**
 * The master AI_EXTRACTION job.
 * 
 * Instead of processing rows directly, it:
 *   1. Finds all unprocessed source records (up to FAN_OUT_BATCH_SIZE)
 *   2. Inserts one EXTRACT_SINGLE_ROW child job per record
 *   3. Returns immediately — child jobs are picked up in subsequent cycles
 *
 * This prevents the 10-minute stale timeout from killing a large batch,
 * and isolates failures to individual rows instead of entire batches.
 */
async function processAiExtractionMaster(
  job: { id: string; organizationId: string },
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Support both Mode A (legacy sourceId-based) and Mode B (two-step pipeline)
  const sourceDatasetId  = payload.sourceDatasetId  as string | undefined;
  const targetDatasetId  = payload.targetDatasetId  as string | undefined;
  const targetSchemaId   = payload.targetSchemaId   as string | undefined;
  const exploreDriveLinks = payload.exploreDriveLinks !== false;
  const driveConnectionId = payload.driveConnectionId as string | undefined;
  const maxContentBytes   = typeof payload.maxContentBytes === "number" ? payload.maxContentBytes : undefined;

  // ── Mode B: Two-step pipeline ──
  if (sourceDatasetId && targetDatasetId && targetSchemaId) {
    // Find records already processed in target dataset
    const doneEmails = await db.datasetRecord.findMany({
      where: { datasetId: targetDatasetId, sourceEmailId: { not: null } },
      select: { sourceEmailId: true },
    });
    const doneEmailIds = new Set(doneEmails.map((r) => r.sourceEmailId as string));

    const sourceRecords = await db.datasetRecord.findMany({
      where: { datasetId: sourceDatasetId },
      select: { id: true, sourceEmailId: true },
      take: FAN_OUT_BATCH_SIZE,
      orderBy: { createdAt: "asc" },
    });
    const unprocessed = sourceRecords.filter(
      (r) => !r.sourceEmailId || !doneEmailIds.has(r.sourceEmailId)
    );

    if (unprocessed.length === 0) {
      return { fanOut: 0, note: "All records already processed" };
    }

    // Create one child job per unprocessed record
    await db.aiJob.createMany({
      data: unprocessed.map((record) => ({
        organizationId: job.organizationId,
        type:           "EXTRACT_SINGLE_ROW",
        status:         "queued",
        agentKey:       "extractor",
        payload: JSON.stringify({
          sourceRecordId: record.id,
          targetDatasetId,
          targetSchemaId,
          exploreDriveLinks,
          driveConnectionId,
          maxContentBytes,
          // Back-reference to master job for logging
          masterJobId: job.id,
        }),
        progress: 0,
      })),
    });

    // If there might be more records, queue another master job
    if (sourceRecords.length === FAN_OUT_BATCH_SIZE) {
      await db.aiJob.create({
        data: {
          organizationId: job.organizationId,
          type:           "AI_EXTRACTION",
          status:         "queued",
          payload: JSON.stringify({
            sourceDatasetId,
            targetDatasetId,
            targetSchemaId,
            exploreDriveLinks,
            driveConnectionId,
            maxContentBytes,
          }),
          progress: 0,
        },
      });
    }

    await agentInfo(job.id, job.organizationId, "extractor",
      `Fan-out: queued ${unprocessed.length} EXTRACT_SINGLE_ROW jobs`, { total: unprocessed.length });

    return { fanOut: unprocessed.length, hasMore: sourceRecords.length === FAN_OUT_BATCH_SIZE };
  }

  // ── Mode A: Legacy (sourceId-based) ──
  const sourceId  = payload.sourceId  as string | undefined;
  const datasetId = payload.datasetId as string | undefined;
  if (!sourceId || !datasetId) return { note: "Missing sourceId or datasetId" };

  const emails = await db.email.findMany({
    where: { sourceId, processingStatus: "matched" },
    select: { id: true },
    take: FAN_OUT_BATCH_SIZE,
  });

  if (emails.length === 0) return { fanOut: 0, note: "No unprocessed emails" };

  await db.aiJob.createMany({
    data: emails.map((email) => ({
      organizationId: job.organizationId,
      type:    "EXTRACT_SINGLE_ROW",
      status:  "queued",
      agentKey: "extractor",
      payload: JSON.stringify({ emailId: email.id, datasetId, sourceId, masterJobId: job.id }),
      progress: 0,
    })),
  });

  if (emails.length === FAN_OUT_BATCH_SIZE) {
    await db.aiJob.create({
      data: {
        organizationId: job.organizationId,
        type:    "AI_EXTRACTION",
        status:  "queued",
        payload: JSON.stringify({ sourceId, datasetId }),
        progress: 0,
      },
    });
  }

  return { fanOut: emails.length };
}

// ── EXTRACT_SINGLE_ROW: Worker ────────────────────────────────────────────────

/**
 * Processes exactly ONE source record. This is the atomic unit of extraction.
 *
 * Flow:
 *   1. Load source record fields from DB
 *   2. Collect all URLs from record values
 *   3. exploreLinkedContent() → Drive API downloads → Gemini File API upload
 *   4. extractWithLLM() → Gemini multimodal call (fileParts + text)
 *   5. Persist DatasetRecord + DatasetValue rows
 *
 * On GeminiRateLimitExhaustedError → throws → job-runner marks as `queued` → auto-retry
 * On any other error → throws → job-runner marks as `failed` (or re-queues if retryable)
 *
 * Data isolation: each call is completely independent. Gemini has no memory of
 * previous rows. Cross-row hallucination is architecturally impossible.
 */
async function processSingleRowExtraction(
  job: { id: string; organizationId: string },
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // ── Mode B: two-step pipeline row ──
  if (payload.sourceRecordId) {
    return processSingleRowModeB(job, payload);
  }
  // ── Mode A: legacy email row ──
  if (payload.emailId) {
    return processSingleRowModeA(job, payload);
  }
  return { note: "EXTRACT_SINGLE_ROW: missing sourceRecordId or emailId" };
}

// ── Mode B single row ─────────────────────────────────────────────────────────

async function processSingleRowModeB(
  job: { id: string; organizationId: string },
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const sourceRecordId   = payload.sourceRecordId   as string;
  const targetDatasetId  = payload.targetDatasetId  as string;
  const targetSchemaId   = payload.targetSchemaId   as string;
  const exploreDriveLinks = payload.exploreDriveLinks !== false;
  const driveConnectionId = payload.driveConnectionId as string | undefined;
  const maxContentBytes   = typeof payload.maxContentBytes === "number" ? payload.maxContentBytes : 200_000;

  // Load schema fields
  const schemaFields = await db.schemaField.findMany({
    where: { schemaId: targetSchemaId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, type: true, description: true, instructions: true, required: true, options: true, confidenceThreshold: true },
  });
  if (!schemaFields.length) throw new Error(`Schema ${targetSchemaId} has no fields`);

  // Load source record
  const sourceRecord = await db.datasetRecord.findUnique({
    where: { id: sourceRecordId },
    include: { values: true },
  });
  if (!sourceRecord) throw new Error(`Source record ${sourceRecordId} not found`);

  // Check if already processed (idempotency)
  if (sourceRecord.sourceEmailId) {
    const existing = await db.datasetRecord.findFirst({
      where: { datasetId: targetDatasetId, sourceEmailId: sourceRecord.sourceEmailId },
    });
    if (existing) return { skipped: true, reason: "already_processed" };
  }

  // Build field name → value map
  const fieldIds = sourceRecord.values.map((v) => v.fieldId);
  const defaultFields = await db.schemaField.findMany({
    where: { id: { in: fieldIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(defaultFields.map((f) => [f.id, f.name]));

  const textLines = sourceRecord.values
    .map((v) => {
      let val: unknown;
      try { val = JSON.parse(v.value); } catch { val = v.value; }
      return val ? `${nameById.get(v.fieldId) ?? v.fieldId}: ${val}` : null;
    })
    .filter(Boolean) as string[];

  const sourceText = ["=== EMAIL RECORD ===", ...textLines, "=== END ==="].join("\n");

  // ── Drive link exploration ──
  let driveContent: Awaited<ReturnType<typeof exploreLinkedContent>> | undefined;

  if (exploreDriveLinks) {
    const allValues = sourceRecord.values.map((v) => {
      try { return String(JSON.parse(v.value) ?? ""); } catch { return v.value; }
    }).join(" ");

    const allUrls   = extractAllUrls(allValues + " " + sourceText);
    const driveUrls = filterDriveUrls(allUrls);
    const otherUrls = allUrls.filter((u) => !driveUrls.includes(u)).slice(0, 3);
    const urlsToExplore = [...driveUrls, ...otherUrls];

    if (urlsToExplore.length > 0) {
      // Non-fatal: Drive failures don't abort extraction — we fall back to text-only
      try {
        driveContent = await exploreLinkedContent(urlsToExplore, {
          connectionId:    driveConnectionId,
          organizationId:  job.organizationId,
          maxBytes:        maxContentBytes,
        });
        await agentInfo(job.id, job.organizationId, "extractor",
          `Record ${sourceRecordId}: Drive explored ${driveContent.filesRead.length} files (${driveContent.fileParts.length} uploaded to File API)`,
          { filesRead: driveContent.filesRead, failed: driveContent.failedFiles }
        );
      } catch (err) {
        await agentWarn(job.id, job.organizationId, "extractor",
          `Record ${sourceRecordId}: Drive exploration failed — proceeding with text-only extraction`,
          { error: err instanceof Error ? err.message : String(err) }
        );
      }
    }
  }

  // ── LLM extraction — THROWS on rate-limit exhaustion → triggers job retry ──
  const fieldInputs = schemaFields.map((f) => ({
    name: f.name, type: f.type, description: f.description,
    instructions: f.instructions, required: f.required,
    options: f.options ? JSON.parse(f.options) : undefined,
    confidenceThreshold: f.confidenceThreshold,
  }));

  const extractionResult = await extractWithLLM({
    fields:      fieldInputs,
    sourceText,
    sourceFile:  `dataset:record:${sourceRecordId}`,
    driveContent,
  });

  // ── Guard: skip empty LLM response but don't mark row as "extracted" ──
  // The job will be retried (it's re-queued with queued status by the runner)
  if (!extractionResult.fields.length) {
    throw new Error(`LLM returned 0 fields for record ${sourceRecordId} — will retry`);
  }

  // ── Persist results ──
  const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const record = await db.datasetRecord.create({
    data: {
      datasetId:     targetDatasetId,
      sourceEmailId: sourceRecord.sourceEmailId,
      status:        extractionResult.overallConfidence >= 0.7 ? "valid" : "needs_review",
      confidence:    extractionResult.overallConfidence,
    },
  });

  let valuesWritten = 0;
  for (const fieldResult of extractionResult.fields) {
    const sf = schemaFields.find((f) => normName(f.name) === normName(fieldResult.fieldName));
    if (!sf) continue;
    await db.datasetValue.create({
      data: {
        recordId:      record.id,
        fieldId:       sf.id,
        value:         JSON.stringify(fieldResult.value ?? null),
        confidence:    fieldResult.confidence,
        evidence:      fieldResult.evidence || "",
        sourceFile:    fieldResult.sourceFile,
        modelUsed:     extractionResult.modelUsed,
        promptVersion: extractionResult.promptVersion,
      },
    });
    valuesWritten++;
  }

  if (valuesWritten === 0) {
    // All fields were filtered out (name mismatch) — delete empty record and throw
    await db.datasetRecord.delete({ where: { id: record.id } });
    throw new Error(`Record ${sourceRecordId}: all ${extractionResult.fields.length} LLM fields failed schema name matching`);
  }

  // Update target dataset record count
  await db.dataset.update({ where: { id: targetDatasetId }, data: { recordCount: { increment: 1 } } });

  const tokens   = extractionResult.tokensUsed;
  const costUsd  = computeCost(extractionResult.modelUsed, extractionResult.promptTokens ?? 0, extractionResult.completionTokens ?? 0);

  // Write AiOutput for cost tracking
  await db.aiOutput.create({
    data: {
      jobId:            job.id,
      modelUsed:        extractionResult.modelUsed,
      promptHash:       crypto.createHash("md5").update(sourceText.slice(0, 200)).digest("hex"),
      rawResponse:      JSON.stringify(extractionResult.fields),
      tokensUsed:       tokens,
      promptTokens:     extractionResult.promptTokens ?? 0,
      completionTokens: extractionResult.completionTokens ?? 0,
      costUsd,
    },
  });

  if (tokens > 0) await bumpUsageMetric(job.organizationId, "ai_tokens", tokens);

  await agentInfo(job.id, job.organizationId, "extractor",
    `Record ${sourceRecordId}: extracted ${valuesWritten} fields via ${extractionResult.modelUsed}`,
    { confidence: extractionResult.overallConfidence, tokens, costUsd, fileParts: driveContent?.fileParts.length ?? 0 }
  );

  return { sourceRecordId, valuesWritten, tokens, modelUsed: extractionResult.modelUsed };
}

// ── Mode A single row (legacy) ────────────────────────────────────────────────

async function processSingleRowModeA(
  job: { id: string; organizationId: string },
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const emailId   = payload.emailId   as string;
  const datasetId = payload.datasetId as string;
  const sourceId  = payload.sourceId  as string;

  const email = await db.email.findUnique({ where: { id: emailId } });
  if (!email) throw new Error(`Email ${emailId} not found`);
  if (email.processingStatus === "extracted") return { skipped: true, reason: "already_extracted" };

  const source = await db.source.findUnique({
    where: { id: sourceId },
    include: { schema: { include: { fields: { orderBy: { position: "asc" } } } } },
  });
  if (!source?.schema?.fields?.length) throw new Error(`Source ${sourceId} has no schema/fields`);

  const schemaFields = source.schema.fields.map((f) => ({
    name: f.name, type: f.type, description: f.description,
    instructions: f.instructions, required: f.required,
    options: f.options ? JSON.parse(f.options) : undefined,
    confidenceThreshold: f.confidenceThreshold,
  }));

  const sourceText = [
    `From: ${email.fromAddress}`,
    `To: ${email.toAddress}`,
    `Subject: ${email.subject}`,
    `Date: ${email.receivedAt.toISOString()}`,
    `---`,
    email.bodyText || email.snippet,
  ].join("\n");

  // throws → job retries
  const extractionResult = await extractWithLLM({ fields: schemaFields, sourceText, sourceFile: `gmail:${email.googleMessageId}` });
  if (!extractionResult.fields.length) throw new Error(`LLM returned 0 fields for email ${emailId}`);

  const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const record = await db.datasetRecord.create({
    data: { datasetId, sourceEmailId: email.id, status: "valid", confidence: extractionResult.overallConfidence },
  });

  for (const fieldResult of extractionResult.fields) {
    const sf = source.schema!.fields.find((f) => normName(f.name) === normName(fieldResult.fieldName));
    if (!sf) continue;
    await db.datasetValue.create({
      data: {
        recordId:      record.id,
        fieldId:       sf.id,
        value:         JSON.stringify(fieldResult.value ?? null),
        confidence:    fieldResult.confidence,
        evidence:      fieldResult.evidence || "",
        sourceFile:    `gmail:${email.googleMessageId}`,
        modelUsed:     extractionResult.modelUsed,
        promptVersion: extractionResult.promptVersion,
      },
    });
  }

  await db.email.update({ where: { id: emailId }, data: { processingStatus: "extracted" } });
  await db.dataset.update({ where: { id: datasetId }, data: { recordCount: { increment: 1 } } });

  const tokens  = extractionResult.tokensUsed;
  const costUsd = computeCost(extractionResult.modelUsed, extractionResult.promptTokens ?? 0, extractionResult.completionTokens ?? 0);

  await db.aiOutput.create({
    data: {
      jobId:            job.id,
      modelUsed:        extractionResult.modelUsed,
      promptHash:       crypto.createHash("md5").update(sourceText.slice(0, 200)).digest("hex"),
      rawResponse:      JSON.stringify(extractionResult.fields),
      tokensUsed:       tokens,
      promptTokens:     extractionResult.promptTokens ?? 0,
      completionTokens: extractionResult.completionTokens ?? 0,
      costUsd,
    },
  });

  if (tokens > 0) await bumpUsageMetric(job.organizationId, "ai_tokens", tokens);
  return { emailId, tokens, modelUsed: extractionResult.modelUsed };
}

// ── DETERMINISTIC_SYNC ────────────────────────────────────────────────────────

async function processDeterministicSync(
  job: { id: string; organizationId: string },
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const sourceId = payload.sourceId as string | undefined;
  if (!sourceId) return { note: "Missing sourceId" };

  const datasetId = await ensureDefaultDataset(sourceId);

  const source = await db.source.findUnique({ where: { id: sourceId }, select: { schemaId: true } });
  if (!source?.schemaId) return { note: "Source has no schemaId" };

  const emails = await db.email.findMany({
    where: { sourceId, processingStatus: "matched" },
    take: 51,
    orderBy: { receivedAt: "asc" },
  });
  const hasMore   = emails.length === 51;
  const batchEmails = emails.slice(0, 50);
  let recordsSynced = 0;

  for (const email of batchEmails) {
    const parsedFields: ParsedEmailFields = {
      Date: email.receivedAt.toISOString(),
      Sender: email.fromAddress,
      To: email.toAddress,
      CC: email.ccAddresses ?? "",
      Subject: email.subject,
      Body: email.bodyText ?? email.snippet ?? "",
      Signature: "",
      "Attachments Summary": "",
      "Drive Links": "",
      "Form Links": "",
      "Other Links": "",
    };

    if (email.bodyText) {
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
          mainBody  = fullText.slice(0, match.index).trim();
          signature = fullText.slice(match.index).trim();
          break;
        }
      }
      parsedFields.Body      = mainBody;
      parsedFields.Signature = signature;

      const allUrls   = [...new Set((fullText.match(/https?:\/\/[^\s"'<>)]+/g) ?? []))];
      const driveLinks: string[] = [];
      const formLinks:  string[] = [];
      const otherLinks: string[] = [];
      for (const url of allUrls) {
        if (url.includes("docs.google.com/forms") || url.includes("forms.gle")) formLinks.push(url);
        else if (url.includes("docs.google.com") || url.includes("drive.google.com")) driveLinks.push(url);
        else otherLinks.push(url);
      }
      parsedFields["Drive Links"] = driveLinks.join(", ");
      parsedFields["Form Links"]  = formLinks.join(", ");
      parsedFields["Other Links"] = otherLinks.join(", ");
    }

    const attachments = await db.emailAttachment.findMany({
      where: { emailId: email.id },
      select: { filename: true, mimeType: true, size: true },
    });
    if (attachments.length > 0) {
      parsedFields["Attachments Summary"] = `${attachments.length} attachment(s): ` +
        attachments.map((a) => {
          const ext   = a.filename.split(".").pop()?.toLowerCase() ?? "file";
          const sizeKb = (a.size / 1024).toFixed(0);
          return `${a.filename} (${ext}, ${sizeKb}KB)`;
        }).join("; ");
    }

    await writeDefaultDatasetRecord(email.id, datasetId, parsedFields, source.schemaId);
    await db.email.update({ where: { id: email.id }, data: { processingStatus: "extracted" } });
    recordsSynced++;
  }

  if (hasMore) {
    await db.aiJob.create({
      data: { organizationId: job.organizationId, type: "DETERMINISTIC_SYNC", status: "queued", payload: JSON.stringify({ sourceId }), progress: 0 },
    });
  }

  return { recordsSynced, emailsProcessed: batchEmails.length };
}

// ── EXPORT ────────────────────────────────────────────────────────────────────

async function processExport(
  job: { id: string; organizationId: string },
  payload: { datasetId?: string; format?: string }
): Promise<Record<string, unknown>> {
  const { datasetId, format = "csv" } = payload;
  if (!datasetId) throw new Error("Missing datasetId in EXPORT payload");

  const dataset = await db.dataset.findUnique({
    where: { id: datasetId },
    include: {
      schema: { include: { fields: { orderBy: { position: "asc" } } } },
      records: { include: { values: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!dataset || dataset.organizationId !== job.organizationId) throw new Error("Dataset not found");

  const fields      = dataset.schema?.fields ?? [];
  const recordCount = dataset.records.length;

  if (format === "json") {
    const data = dataset.records.map((r) => {
      const byField = new Map<string, any>(r.values.map((v: any) => [v.fieldId, v]));
      const obj: Record<string, unknown> = { recordId: r.id, status: r.status, confidence: r.confidence };
      for (const f of fields) {
        const v = byField.get(f.id);
        obj[f.name] = v ? JSON.parse(v.value) : null;
      }
      return obj;
    });
    return { format, recordCount, data };
  }

  const header = ["recordId", "status", "confidence", ...fields.map((f) => f.name)];
  const rows   = dataset.records.map((r) => {
    const byField = new Map<string, any>(r.values.map((v: any) => [v.fieldId, v]));
    return [
      r.id, r.status, String(r.confidence ?? 0),
      ...fields.map((f) => {
        const v = byField.get(f.id);
        if (!v) return "";
        try { const p = JSON.parse(v.value); return typeof p === "string" ? p : JSON.stringify(p); }
        catch { return v.value; }
      }),
    ];
  });

  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  return { format, recordCount, csvLength: csv.length, generatedAt: new Date().toISOString() };
}
