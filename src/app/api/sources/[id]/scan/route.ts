// POST /api/sources/[id]/scan — trigger an explicit scan. Same behavior as
//   POST /api/sources/[id]/runs but exposed as a distinct intent for UI
//   buttons. Optional body: { mode: "historical" | "incremental" }.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeSourceRun } from "@/lib/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const source = await db.source.findUnique({ where: { id } });
    if (!source || source.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Source not found" },
        { status: 404 }
      );
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
          type: "GMAIL_SCAN",
          status: "running",
          payload: JSON.stringify({ sourceId: id, runId: run.id, mode, triggeredBy: "scan" }),
          progress: 0,
          startedAt: now,
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

    return NextResponse.json(serializeSourceRun(created.run), {
      status: 201,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger scan" },
      { status: 500 }
    );
  }
}
