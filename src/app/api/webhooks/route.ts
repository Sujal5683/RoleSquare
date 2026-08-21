// GET /api/webhooks — list all webhooks for the current org
// POST /api/webhooks — create a new webhook

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const webhooks = await db.webhook.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      webhooks.map((w) => ({
        ...w,
        events: w.events.split(",").filter(Boolean),
      }))
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list webhooks" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json();
    const url = String(body?.url ?? "").trim();
    const secret = body?.secret ? String(body.secret) : null;
    const events = Array.isArray(body?.events)
      ? body.events.join(",")
      : "source.run_completed,extraction.completed,review.needed,job.failed";

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    if (!/^https?:\/\//.test(url)) {
      return NextResponse.json(
        { error: "url must start with http:// or https://" },
        { status: 400 }
      );
    }

    const webhook = await db.webhook.create({
      data: {
        organizationId,
        url,
        secret,
        events,
        status: "active",
      },
    });

    await logAudit({
      organizationId,
      actorType: "user",
      actorId: user.id,
      action: "create",
      entity: "webhook",
      entityId: webhook.id,
      after: { url, events },
      reason: "Webhook created",
    });

    return NextResponse.json({
      ...webhook,
      events: webhook.events.split(",").filter(Boolean),
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create webhook" },
      { status: 500 }
    );
  }
}
