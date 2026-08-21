// Workspace Intelligence Platform — usage metric helpers.
//
// Tracks monthly usage per organization. The current month's window is
// computed on demand so callers don't need to pass dates.

import { db } from "@/lib/db";

function monthWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
    0,
    0,
    0,
    0
  );
  return { start, end };
}

/**
 * Returns (creating if necessary) the current-month UsageMetric row for the
 * given org + metric type. Returns the updated row after incrementing by
 * `by` (defaults to 0 — useful to ensure the row exists without changing it).
 */
export async function bumpUsageMetric(
  organizationId: string,
  metricType: string,
  by: number = 0
) {
  const { start, end } = monthWindow();
  const existing = await db.usageMetric.findFirst({
    where: {
      organizationId,
      metricType,
      periodStart: start,
      periodEnd: end,
    },
  });
  if (existing) {
    if (by === 0) return existing;
    return db.usageMetric.update({
      where: { id: existing.id },
      data: { value: { increment: by } },
    });
  }
  return db.usageMetric.create({
    data: {
      organizationId,
      metricType,
      value: by,
      periodStart: start,
      periodEnd: end,
    },
  });
}

/**
 * Returns all usage metrics for the org within the current month window.
 */
export async function currentMonthUsage(organizationId: string) {
  const { start, end } = monthWindow();
  return db.usageMetric.findMany({
    where: {
      organizationId,
      periodStart: start,
      periodEnd: end,
    },
    orderBy: { metricType: "asc" },
  });
}
