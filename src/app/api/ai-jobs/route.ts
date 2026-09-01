// GET /api/ai-jobs?organizationId=...&type=...&status=...&page=...&pageSize=...
//   Lists AI jobs for the org, optionally filtered by type/status.
//   Supports pagination.

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { serializeAiJob } from "@/lib/serialize";
import { enqueueJob } from "@/lib/queue";

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

export async function POST(req: NextRequest) {
  try {
    const { organizationId, user } = await requireOrgContext(req);
    const body = await req.json();

    if (!body.type) {
      return NextResponse.json(
        { error: "type is required" },
        { status: 400 }
      );
    }

    try {
      const { checkUserLimits } = await import("@/lib/usage");
      // Run all three limit checks in parallel — they are independent queries.
      await Promise.all([
        checkUserLimits(user.id, "jobs"),
        checkUserLimits(user.id, "tokens"),
        checkUserLimits(user.id, "records"),
      ]);
    } catch (limitErr) {
      return NextResponse.json(
        { error: limitErr instanceof Error ? limitErr.message : "Usage limit exceeded" },
        { status: 403 }
      );
    }

    const jobId = await enqueueJob({
      organizationId,
      userId: user.id,
      type:   body.type,
      payload: body.payload ?? {},
    });

    const job = await db.aiJob.findUnique({ where: { id: jobId } });
    return NextResponse.json(serializeAiJob(job!));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create job" },
      { status: 500 }
    );
  }
}
