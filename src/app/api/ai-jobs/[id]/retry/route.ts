// POST /api/ai-jobs/[id]/retry — reset job status to queued, increment
//   attempts, clear errorMessage.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeAiJob } from "@/lib/serialize";

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
      await checkUserLimits(user.id, "jobs");
      await checkUserLimits(user.id, "tokens");
      await checkUserLimits(user.id, "records");
    } catch (limitErr) {
      return NextResponse.json(
        { error: limitErr instanceof Error ? limitErr.message : "Usage limit exceeded" },
        { status: 403 }
      );
    }

    const job = await db.aiJob.update({
      where: { id },
      data: {
        status: "queued",
        attempts: { increment: 1 },
        errorMessage: null,
        progress: 0,
        startedAt: null,
        finishedAt: null,
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "job",
      entityId: id,
      before: { status: existing.status, attempts: existing.attempts },
      after: { status: "queued", attempts: job.attempts },
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
