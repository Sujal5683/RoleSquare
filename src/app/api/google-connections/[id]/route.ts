// PATCH /api/google-connections/[id] — refresh/reconnect a connection.
//   Sets status=active, watchExpiresAt=now+7d, lastSyncAt=now.
// DELETE /api/google-connections/[id] — revoke (status=revoked).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { offsetDate, serializeGoogleConnection } from "@/lib/serialize";

async function requireConnection(id: string, organizationId: string) {
  const c = await db.googleConnection.findUnique({ where: { id } });
  if (!c || c.organizationId !== organizationId) return null;
  return c;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const before = await requireConnection(id, organizationId);
    if (!before) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }
    let watchExpirePref = before.watchExpirePref;
    try {
      const body = await req.json();
      if (body && body.watchExpirePref) {
        watchExpirePref = body.watchExpirePref;
      }
    } catch {
      // no body, ignore
    }

    let days = 7;
    if (watchExpirePref === "monthly") days = 30;
    else if (watchExpirePref === "yearly") days = 365;
    else if (watchExpirePref === "never") days = 3650; // 10 years

    const now = new Date();
    const connection = await db.googleConnection.update({
      where: { id },
      data: {
        status: "active",
        watchExpiresAt: watchExpirePref === "never" ? null : offsetDate(days, now),
        watchExpirePref,
        lastSyncAt: now,
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "connection",
      entityId: id,
      before: { status: before.status, watchExpirePref: before.watchExpirePref },
      after: { status: "active", watchExpiresAt: connection.watchExpiresAt, watchExpirePref },
      reason: "refresh",
    });

    return NextResponse.json(serializeGoogleConnection(connection));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to refresh connection" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const before = await requireConnection(id, organizationId);
    if (!before) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }
    const connection = await db.googleConnection.update({
      where: { id },
      data: { status: "revoked", watchExpiresAt: null },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "delete",
      entity: "connection",
      entityId: id,
      before: { status: before.status },
      after: { status: "revoked" },
      reason: "revoke",
    });

    return NextResponse.json(serializeGoogleConnection(connection));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to revoke connection" },
      { status: 500 }
    );
  }
}
