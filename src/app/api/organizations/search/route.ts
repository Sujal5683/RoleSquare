// GET /api/organizations/search?q=slug_or_name
// Returns a limited list of organizations matching the query.
// Only exposes: id, name, slug — no members, no connection details.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const orgs = await db.organization.findMany({
      where: {
        AND: [
          // Exclude the caller's own org
          { id: { not: organizationId } },
          {
            OR: [
              { slug: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: { id: true, name: true, slug: true },
      take: 10,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: orgs });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to search organizations" },
      { status: 500 }
    );
  }
}
