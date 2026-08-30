// GET /api/sources/[id]/runs — list runs for a source.
// POST /api/sources/[id]/runs — create a new run (mode: historical |
//   incremental) plus a corresponding AI_JOB of type GMAIL_SCAN. The run
//   starts in status=running, progress=0 (simulated async).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSourceRun } from "@/lib/serialize";

import { getJobTypeForSource } from "@/lib/types";

async function requireSource(id: string, organizationId: string) {
  const s = await db.source.findUnique({ where: { id } });
  if (!s || s.organizationId !== organizationId) return null;
  return s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireOrgContext(req);
    const source = await requireSource(id, organizationId);
    if (!source) {
      return NextResponse.json(
        { error: "Source not found" },
        { status: 404 }
      );
    }
    const runs = await db.sourceRun.findMany({
      where: { sourceId: id },
      orderBy: { startedAt: "desc" },
    });
    return NextResponse.json(runs.map(serializeSourceRun));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list runs" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const source = await requireSource(id, organizationId);
    if (!source) {
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

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "historical" ? "historical" : "incremental";

    const created = await db.$transaction(async (tx) => {
      const now = new Date();
      const run = await tx.sourceRun.create({
        data: {
          sourceId: id,
          status: "running",
          mode,
          progress: 0,
          startedAt: now,
        },
      });
      const job = await tx.aiJob.create({
        data: {
          organizationId,
          userId: user.id,
          type: getJobTypeForSource(source.sourceType as any),
          status: "queued", // Job runner picks up "queued" jobs
          payload: JSON.stringify({ sourceId: id, runId: run.id, mode }),
          progress: 0,
        },
      });
      await tx.source.update({
        where: { id },
        data: { lastRunAt: now, runState: "scanning" },
      });
      return { run, job };
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "scan",
      entity: "source",
      entityId: id,
      after: { mode, runId: created.run.id, jobId: created.job.id },
    });

    fetch(new URL("/api/jobs/process", req.url).toString(), { method: "POST" }).catch(() => {});

    return NextResponse.json(serializeSourceRun(created.run), {
      status: 201,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create run" },
      { status: 500 }
    );
  }
}
