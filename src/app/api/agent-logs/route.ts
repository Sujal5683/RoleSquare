// GET /api/agent-logs?agentKey=&level=&page=&pageSize=
// Returns organization-wide structured AgentLog entries.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { serializeAgentLog } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const url = new URL(req.url);
    const agentKey = url.searchParams.get("agentKey") || undefined;
    const level = url.searchParams.get("level") || undefined;
    const jobId = url.searchParams.get("jobId") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(200, parseInt(url.searchParams.get("pageSize") ?? "50", 10));

    const where: Record<string, unknown> = { organizationId };
    if (agentKey) where.agentKey = agentKey;
    if (level) where.level = level;
    if (jobId) where.jobId = jobId;

    const [logs, total] = await Promise.all([
      db.agentLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
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
      { error: err instanceof Error ? err.message : "Failed to fetch agent logs" },
      { status: 500 }
    );
  }
}
