// GET /api/search?q=<query> — global search across sources, datasets,
// schemas, and records. Returns a grouped result set so the frontend
// can render them by category in the command palette or a search page.


export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import {
  serializeSource,
  serializeDataset,
  serializeSchema,
  attachFieldsToRecords,
  fieldsByIdMap,
  serializeDatasetRecord,
} from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

    if (!q || q.length < 2) {
      return NextResponse.json({
        query: q,
        results: {
          sources: [],
          datasets: [],
          schemas: [],
          records: [],
        },
        total: 0,
      });
    }

    // Use Prisma's search-insensitive contains() for SQLite (LIKE %q%)
    const [sources, datasets, schemas, records] = await Promise.all([
      db.source.findMany({
        where: {
          organizationId,
          OR: [
            { name: { contains: q } },
            { description: { contains: q } },
          ],
        },
        take: limit,
        include: {
          googleConnection: true,
          schema: { select: { id: true, name: true, version: true } },
          dataset: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.dataset.findMany({
        where: {
          organizationId,
          OR: [
            { name: { contains: q } },
            { description: { contains: q } },
          ],
        },
        take: limit,
        include: { schema: { select: { id: true, name: true, version: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.schema.findMany({
        where: {
          organizationId,
          OR: [
            { name: { contains: q } },
            { description: { contains: q } },
          ],
        },
        take: limit,
        include: { fields: true },
        orderBy: { createdAt: "desc" },
      }),
      // Search records by matching the stringified value of any
      // DatasetValue row. SQLite doesn't have JSONB operators, so we
      // use a LIKE on the raw `value` text column.
      db.datasetRecord.findMany({
        where: {
          dataset: { organizationId },
          values: {
            some: { value: { contains: q } },
          },
        },
        take: limit,
        include: {
          values: true,
          dataset: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Attach schema field metadata to record values so the frontend can
    // show field names alongside the matched values.
    const orgFields = await db.schemaField.findMany({
      where: { schema: { organizationId } },
    });
    const fieldsMap = fieldsByIdMap(orgFields);
    const enrichedRecords = attachFieldsToRecords(records, fieldsMap);

    const results = {
      sources: sources.map(serializeSource),
      datasets: datasets.map(serializeDataset),
      schemas: schemas.map(serializeSchema),
      records: enrichedRecords.map((r) => ({
        ...serializeDatasetRecord(r),
        dataset: r.dataset,
      })),
    };

    const total =
      results.sources.length +
      results.datasets.length +
      results.schemas.length +
      results.records.length;

    return NextResponse.json({
      query: q,
      results,
      total,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
