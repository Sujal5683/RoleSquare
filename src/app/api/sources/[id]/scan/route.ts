// POST /api/sources/[id]/scan — trigger an explicit scan. Same behavior as
//   POST /api/sources/[id]/runs but exposed as a distinct intent for UI
//   buttons. Optional body: { mode: "historical" | "incremental" }.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSourceRun } from "@/lib/serialize";
import { dispatchWebhookEvent } from "@/lib/webhook-dispatcher";

import { getJobTypeForSource } from "@/lib/types";
import { enqueueJob }          from "@/lib/queue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const source = await db.source.findUnique({ where: { id } });
    if (!source || source.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Source not found" },
        { status: 404 }
      );
    }

    if (source.datasetId) {
      const { verifyDatasetWriteAccess } = await import("@/lib/dataset-access");
      const canEdit = await verifyDatasetWriteAccess(source.datasetId, user.id, organizationId);
      if (!canEdit) {
        return NextResponse.json(
          { error: "You do not have write access to the dataset associated with this source." },
          { status: 403 }
        );
      }
    }

    // Note: Dataset is no longer required — ensureDefaultDataset is called
    // automatically during DETERMINISTIC_SYNC after the scan completes.
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "historical" ? "historical" : "incremental";

    if (source.runState === "scanning") {
      return NextResponse.json(
        { error: "A scan is already in progress for this source." },
        { status: 409 }
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

    const now = new Date();
    const run = await db.$transaction(async (tx) => {
      const updateResult = await tx.source.updateMany({ 
        where: { id, runState: { not: "scanning" } }, 
        data: { lastRunAt: now, runState: "scanning" } 
      });
      if (updateResult.count === 0) {
        throw new Error("A scan is already in progress for this source.");
      }
      return tx.sourceRun.create({
        data: { sourceId: id, status: "running", mode, progress: 0, startedAt: now },
      });
    });

    const jobId = await enqueueJob({
      organizationId,
      userId: user.id,
      type:   getJobTypeForSource(source.sourceType as any),
      payload: { sourceId: id, runId: run.id, mode, triggeredBy: "scan" },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "scan",
      entity: "source",
      entityId: id,
      after: { mode, runId: run.id, jobId },
    });

    dispatchWebhookEvent({
      event: "source.run_started",
      organizationId,
      data: { sourceId: id, runId: run.id, jobId, mode, triggeredBy: "scan" },
    });

    return NextResponse.json(serializeSourceRun(run), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger scan" },
      { status: 500 }
    );
  }
}
