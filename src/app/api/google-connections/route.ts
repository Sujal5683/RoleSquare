// GET /api/google-connections?organizationId=... — list connections for org.
// POST /api/google-connections — create a new connection (simulated OAuth).
//   Body: { googleEmail, scopes?, organizationId? }
//   Stores: status=active, watchExpiresAt=now+7d, lastSyncAt=now.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { offsetDate, serializeGoogleConnection } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const connections = await db.googleConnection.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(connections.map(serializeGoogleConnection));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list connections" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));
    const googleEmail = String(body?.googleEmail ?? "").trim();
    if (!googleEmail) {
      return NextResponse.json(
        { error: "googleEmail is required" },
        { status: 400 }
      );
    }
    const scopesRaw = body?.scopes;
    const scopes = Array.isArray(scopesRaw)
      ? scopesRaw.join(",")
      : typeof scopesRaw === "string"
        ? scopesRaw
        : "gmail.readonly,drive.metadata.readonly";

    const now = new Date();
    const connection = await db.googleConnection.create({
      data: {
        userId: user.id,
        organizationId,
        googleEmail,
        scopes,
        status: "active",
        watchExpiresAt: offsetDate(7, now),
        lastSyncAt: now,
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "create",
      entity: "connection",
      entityId: connection.id,
      after: { googleEmail, status: "active" },
    });

    return NextResponse.json(serializeGoogleConnection(connection), {
      status: 201,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create connection" },
      { status: 500 }
    );
  }
}
