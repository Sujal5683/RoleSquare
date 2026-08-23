// GET /api/ai-jobs/[id]/outputs — returns real AiOutput rows for a specific job.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { serializeAiOutput } from "@/lib/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const { id: jobId } = await params;

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(200, parseInt(url.searchParams.get("pageSize") ?? "50", 10));

    // Verify the job belongs to this org
    const job = await db.aiJob.findUnique({
      where: { id: jobId },
      select: { id: true, organizationId: true },
    });
    if (!job || job.organizationId !== organizationId) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const [outputs, total] = await Promise.all([
      db.aiOutput.findMany({
        where: { jobId },
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.aiOutput.count({ where: { jobId } }),
    ]);

    return NextResponse.json({
      data: outputs.map(serializeAiOutput),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch AI outputs" },
      { status: 500 }
    );
  }
}
