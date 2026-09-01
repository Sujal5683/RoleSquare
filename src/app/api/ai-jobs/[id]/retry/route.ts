// POST /api/ai-jobs/[id]/retry — reset job to queued AND re-push to BullMQ/Redis.
//
// CRITICAL: The BullMQ worker only picks up jobs from Redis, NOT from Postgres.
// Simply setting status="queued" in Postgres is not enough — we must also call
// jobQueue.add() so the worker actually processes the job again.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeAiJob } from "@/lib/serialize";
import { jobQueue } from "@/lib/queue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const existing = await db.aiJob.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    try {
      const { checkUserLimits } = await import("@/lib/usage");
      await checkUserLimits(user.id, ["jobs", "tokens", "records"]);
    } catch (limitErr) {
      return NextResponse.json(
        { error: limitErr instanceof Error ? limitErr.message : "Usage limit exceeded" },
        { status: 403 }
      );
    }

    // Parse original payload
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(existing.payload as string || "{}"); } catch { /* ignore */ }

    // 1. Update DB row back to queued state
    const job = await db.aiJob.update({
      where: { id },
      data: {
        status:       "queued",
        attempts:     { increment: 1 },
        errorMessage: null,
        progress:     0,
        startedAt:    null,
        finishedAt:   null,
      },
    });

    // 2. Re-push to BullMQ/Redis so the worker actually picks it up.
    //    Use the existing job's DB id as the BullMQ job id (same convention as enqueueJob).
    try {
      await jobQueue.add(
        existing.type,
        {
          ...payload,
          _dbJobId:        id,
          _organizationId: organizationId,
          _userId:         user.id,
        },
        {
          jobId:    id,    // reuse same id so BullMQ deduplicates if already queued
          attempts: 5,
          backoff:  { type: "exponential", delay: 2000 },
        }
      );
    } catch (redisErr) {
      // Redis unavailable — the job is queued in Postgres but won't run until Redis recovers.
      console.warn(`[retry] Redis unavailable for job ${id}:`, redisErr instanceof Error ? redisErr.message : redisErr);
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action:  "update",
      entity:  "job",
      entityId: id,
      before: { status: existing.status, attempts: existing.attempts },
      after:  { status: "queued", attempts: job.attempts },
      reason: "retry",
    });

    return NextResponse.json(serializeAiJob(job));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to retry job" },
      { status: 500 }
    );
  }
}
