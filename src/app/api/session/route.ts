// GET /api/session — returns the current mock session user (alice@acme.io)
// and the list of organizations she belongs to with her role in each.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          role: user.role,
          plan: user.plan,
          notificationPrefs: user.notificationPrefs,
          twoFactorEnabled: user.twoFactorEnabled,
        },
        organizations: user.organizations,
      },
      {
        headers: {
          // Cache the session in the browser for 30s. During this window
          // subsequent navigations within the same tab skip the network call.
          // Supabase Realtime handles org membership changes in real-time.
          // `private` ensures CDN/proxies never cache this response.
          "Cache-Control": "private, max-age=30",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load session" },
      { status: err.status || 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    const body = await req.json().catch(() => ({}));
    const dataToUpdate: any = {};
    if (typeof body.name === "string") {
      dataToUpdate.name = body.name.trim();
    }
    if (typeof body.avatarUrl === "string") {
      dataToUpdate.avatarUrl = body.avatarUrl;
    }
    if (body.notificationPrefs && typeof body.notificationPrefs === "object") {
      dataToUpdate.notificationPrefs = JSON.stringify(body.notificationPrefs);
    }
    if (typeof body.plan === "string") {
      dataToUpdate.plan = body.plan;
    }
    
    if (Object.keys(dataToUpdate).length > 0) {
      const { db } = await import("@/lib/db");
      await db.user.update({
        where: { id: user.id },
        data: dataToUpdate,
      });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update profile" },
      { status: err.status || 500 }
    );
  }
}
