// GET /api/ai-jobs?organizationId=...&type=...&status=...&page=...&pageSize=...
//   Lists AI jobs for the org, optionally filtered by type/status.
//   Supports pagination.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { serializeAiJob } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.max(
      1,
      Math.min(200, Number(url.searchParams.get("pageSize") ?? 25))
    );

    const where: any = { organizationId };
    if (type) where.type = type;
    if (status) where.status = status;

    const [total, jobs] = await Promise.all([
      db.aiJob.count({ where }),
      db.aiJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      data: jobs.map(serializeAiJob),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list jobs" },
      { status: 500 }
    );
  }
}
