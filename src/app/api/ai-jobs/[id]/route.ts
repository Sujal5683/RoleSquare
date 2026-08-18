// GET /api/ai-jobs/[id] — job detail with ai_outputs.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { serializeAiJob, serializeAiOutput } from "@/lib/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireOrgContext(req);
    const job = await db.aiJob.findUnique({
      where: { id },
      include: { outputs: { orderBy: { createdAt: "desc" } } },
    });
    if (!job || job.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ...serializeAiJob(job),
      outputs: job.outputs.map(serializeAiOutput),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load job" },
      { status: 500 }
    );
  }
}
