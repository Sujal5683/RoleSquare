// GET /api/ai-jobs/[id]/logs?agentKey=&level=&page=&pageSize=
// Returns structured AgentLog entries for a specific job.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { serializeAgentLog } from "@/lib/serialize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const { id: jobId } = await params;
    const url = new URL(req.url);
    const agentKey = url.searchParams.get("agentKey") || undefined;
    const level = url.searchParams.get("level") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(200, parseInt(url.searchParams.get("pageSize") ?? "100", 10));

    // Verify the job belongs to this org
    const job = await db.aiJob.findUnique({
      where: { id: jobId },
      select: { id: true, organizationId: true },
    });
    if (!job || job.organizationId !== organizationId) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const where: Record<string, unknown> = { jobId };
    if (agentKey) where.agentKey = agentKey;
    if (level) where.level = level;

    const [logs, total] = await Promise.all([
      db.agentLog.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.agentLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs.map(serializeAgentLog),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch logs" },
      { status: 500 }
    );
  }
}
