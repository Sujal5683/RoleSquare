// GET /api/audit?organizationId=...&entity=...&action=...&limit=...&page=...
//   Lists audit logs for the org (include actor name). Paginated.


export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { serializeAuditLog } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const url = new URL(req.url);
    const entity = url.searchParams.get("entity");
    const action = url.searchParams.get("action");
    const entityId = url.searchParams.get("entityId");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.max(
      1,
      Math.min(
        200,
        Number(url.searchParams.get("limit") ?? url.searchParams.get("pageSize") ?? 50)
      )
    );

    const where: any = { organizationId };
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (entityId) where.entityId = entityId;

    const [total, logs] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      data: logs.map(serializeAuditLog),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list audit logs" },
      { status: 500 }
    );
  }
}
