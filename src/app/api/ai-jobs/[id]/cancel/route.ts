// POST /api/ai-jobs/[id]/cancel — request cancellation of a job.
//   Sets status to "cancelled" (distinct from "failed").
//   If the job is already running, the runner will detect the cancelled
//   state on its next progress check and stop processing.

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

    // Can only cancel queued or running jobs
    if (!["queued", "running"].includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot cancel a job that is already ${existing.status}` },
        { status: 400 }
      );
    }

    const job = await db.aiJob.update({
      where: { id },
      data: {
        status: "cancelled",
        errorMessage: "Cancelled by user",
        finishedAt: new Date(),
      },
    });

    // Also cancel any associated source run or child jobs
    if (existing.type === "GMAIL_SCAN" || existing.type === "DRIVE_SCAN" || existing.type === "DOCS_SCAN" || existing.type === "SHEETS_SCAN" || existing.type === "FORMS_SCAN") {
      try {
        const payload = JSON.parse(existing.payload || "{}");
        if (payload.runId) {
          await db.sourceRun.update({
            where: { id: payload.runId },
            data: {
              status: "failed",
              errorMessage: "Cancelled by user",
              finishedAt: new Date(),
            },
          });
          // Reset source runState
          if (payload.sourceId) {
            await db.source.update({
              where: { id: payload.sourceId },
              data: { runState: "idle" },
            });
          }
        }
      } catch {
        // Payload parse error — ignore
      }
    } else if (existing.type === "AI_EXTRACTION") {
      // Cancel all fan-out child jobs to prevent runaway LLM costs
      await db.aiJob.updateMany({
        where: {
          type: "EXTRACT_SINGLE_ROW",
          payload: { contains: id }, // `id` is the master job ID
          status: { in: ["queued", "running", "retry"] },
        },
        data: {
          status: "cancelled",
          errorMessage: "Master job was cancelled",
          finishedAt: new Date(),
        },
      });
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "job",
      entityId: id,
      before: { status: existing.status },
      after: { status: "cancelled", errorMessage: "Cancelled by user" },
      reason: "cancel",
    });

    return NextResponse.json(serializeAiJob(job));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to cancel job" },
      { status: 500 }
    );
  }
}
