// GET /api/usage?organizationId=... — list usage metrics for the org for
//   the current month.

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { currentMonthUsage } from "@/lib/usage";
import { serializeUsageMetric } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const metrics = await currentMonthUsage(organizationId);
    return NextResponse.json(metrics.map(serializeUsageMetric));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load usage" },
      { status: 500 }
    );
  }
}
