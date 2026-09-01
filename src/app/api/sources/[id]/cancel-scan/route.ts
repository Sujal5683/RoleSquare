import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");

    const source = await db.source.findUnique({ where: { id } });
    if (!source || source.organizationId !== organizationId) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Find running jobs for this source
    // We look for aiJobs of type GMAIL_SCAN (or others) in this org that are running or queued
    // where payload contains this sourceId
    const activeJobs = await db.aiJob.findMany({
      where: {
        organizationId,
        status: { in: ["queued", "running"] },
        type: { in: ["GMAIL_SCAN", "NOTION_SCAN", "GDRIVE_SCAN"] }
      }
    });

    const jobToCancel = activeJobs.find((j: any) => {
      try {
        const payload = JSON.parse(j.payload || "{}");
        return payload.sourceId === id;
      } catch {
        return false;
      }
    });

    if (!jobToCancel) {
      // If no job is found but source runState is scanning, reset it
      if (source.runState !== "idle") {
        await db.source.update({
          where: { id },
          data: { runState: "idle" },
        });
      }
      return NextResponse.json({ message: "No active scan found, source reset" });
    }

    // Cancel the job, source run, and reset source state in parallel
    const promises: Promise<any>[] = [
      db.aiJob.update({
        where: { id: jobToCancel.id },
        data: {
          status: "cancelled",
          errorMessage: "Cancelled by user",
          finishedAt: new Date(),
        },
      })
    ];

    try {
      const payload = JSON.parse(jobToCancel.payload || "{}");
      if (payload.runId) {
        promises.push(
          db.sourceRun.update({
            where: { id: payload.runId },
            data: {
              status: "failed",
              errorMessage: "Cancelled by user",
              finishedAt: new Date(),
            },
          })
        );
      }
    } catch {}

    promises.push(
      db.source.update({
        where: { id },
        data: { runState: "idle" },
      })
    );

    await Promise.all(promises);

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "source",
      entityId: id,
      before: { status: jobToCancel.status },
      after: { status: "cancelled" },
      reason: "cancel scan",
    });

    return NextResponse.json({ message: "Scan cancelled" });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to cancel scan" },
      { status: 500 }
    );
  }
}
