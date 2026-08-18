// POST /api/ai-jobs/[id]/retry — reset job status to queued, increment
//   attempts, clear errorMessage.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeAiJob } from "@/lib/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const existing = await db.aiJob.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to retry job" },
      { status: 500 }
    );
  }
}
