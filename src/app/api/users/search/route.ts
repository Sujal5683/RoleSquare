// GET /api/users/search?q=<query> — search users by email or name.
//
// Used by the sharing dialog to find users to share datasets with.
// Returns basic public info only (no sensitive fields).
// Requires authentication; excludes the caller from results.
//
// Query params:
//   q    — search string (min 2 chars). Matched against email and name.
//   limit — max results (default 10, max 20)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, AuthError, authErrorResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 20);

    if (q.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const users = await db.user.findMany({
      where: {
        AND: [
          { id: { not: user.id } }, // exclude self
          {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
      },
      orderBy: [
        // Prefer exact email matches
        { email: "asc" },
      ],
      take: limit,
    });

    return NextResponse.json({ data: users });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to search users" },
      { status: 500 }
    );
  }
}
