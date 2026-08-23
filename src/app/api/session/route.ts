// GET /api/session — returns the current mock session user (alice@acme.io)
// and the list of organizations she belongs to with her role in each.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
      organizations: user.organizations,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load session" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    const body = await req.json().catch(() => ({}));
    if (typeof body.name === "string") {
      const { db } = await import("@/lib/db");
      await db.user.update({
        where: { id: user.id },
        data: { name: body.name.trim() },
      });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update profile" },
      { status: 500 }
    );
  }
}
