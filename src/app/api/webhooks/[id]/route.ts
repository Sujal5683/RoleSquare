// PATCH /api/webhooks/[id] — update webhook (url, secret, events, status)
// DELETE /api/webhooks/[id] — delete webhook

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const { id } = await params;
    const body = await req.json();

    const existing = await db.webhook.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.url !== undefined) data.url = String(body.url);
    if (body.secret !== undefined) data.secret = body.secret ? String(body.secret) : null;
    if (body.status !== undefined) data.status = String(body.status);
    if (Array.isArray(body.events)) data.events = body.events.join(",");

    const updated = await db.webhook.update({
      where: { id },
      data,
    });

    await logAudit({
      organizationId,
      actorType: "user",
      actorId: user.id,
      action: "update",
      entity: "webhook",
      entityId: id,
      before: { url: existing.url, status: existing.status },
      after: data,
      reason: "Webhook updated",
    });

    return NextResponse.json({
      ...updated,
      events: updated.events.split(",").filter(Boolean),
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update webhook" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const { id } = await params;

    const existing = await db.webhook.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    await db.webhook.delete({ where: { id } });

    await logAudit({
      organizationId,
      actorType: "user",
      actorId: user.id,
      action: "delete",
      entity: "webhook",
      entityId: id,
      before: { url: existing.url },
      reason: "Webhook deleted",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete webhook" },
      { status: 500 }
    );
  }
}
