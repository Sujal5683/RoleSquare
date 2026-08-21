// Workspace Intelligence Platform — webhook event dispatcher.
//
// Sends HTTP POST notifications to all webhooks in the org that are
// subscribed to the given event. Failures are recorded on the webhook
// (failureCount, lastResponseCode) but do not block the calling operation.
//
// Events are dispatched asynchronously (fire-and-forget) so the caller
// doesn't wait for the HTTP request to complete.

import { db } from "@/lib/db";

export interface WebhookEvent {
  event: string;
  organizationId: string;
  data: Record<string, unknown>;
}

/**
 * Dispatches an event to all webhooks in the org that are subscribed
 * to it. Safe to call — catches all errors and never throws.
 *
 * Usage:
 *   dispatchWebhookEvent({
 *     event: "extraction.completed",
 *     organizationId,
 *     data: { jobId, schemaId, fieldsExtracted }
 *   });
 */
export function dispatchWebhookEvent(evt: WebhookEvent): void {
  // Fire and forget — don't await
  doDispatch(evt).catch((err) => {
    console.error("[webhook] dispatch failed:", err);
  });
}

async function doDispatch(evt: WebhookEvent): Promise<void> {
  // Find all active webhooks for this org that subscribe to this event
  const webhooks = await db.webhook.findMany({
    where: {
      organizationId: evt.organizationId,
      status: "active",
    },
  });

  const subscribed = webhooks.filter((w) => {
    const events = w.events.split(",").filter(Boolean);
    return events.includes(evt.event) || events.includes("*");
  });

  for (const webhook of subscribed) {
    await sendToWebhook(webhook, evt);
  }
}

async function sendToWebhook(
  webhook: {
    id: string;
    url: string;
    secret: string | null;
  },
  evt: WebhookEvent
): Promise<void> {
  const payload = {
    event: evt.event,
    timestamp: new Date().toISOString(),
    organizationId: evt.organizationId,
    webhookId: webhook.id,
    data: evt.data,
  };

  const startTime = Date.now();
  let statusCode = 0;
  let success = false;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "WIP-Webhook/1.0",
    };
    if (webhook.secret) {
      headers["X-WIP-Signature"] = webhook.secret;
    }

    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
    success = res.ok;
  } catch (err) {
    success = false;
    console.error(`[webhook] ${webhook.id} delivery failed:`, err);
  }

  const elapsed = Date.now() - startTime;

  // Update webhook stats
  await db.webhook
    .update({
      where: { id: webhook.id },
      data: {
        lastTriggeredAt: new Date(),
        lastResponseCode: statusCode || null,
        status: success ? "active" : "failing",
        failureCount: success ? 0 : { increment: 1 } as never,
      },
    })
    .catch(() => {
      // Ignore DB update errors — don't let webhook tracking break the caller
    });

  // Log the delivery as an audit event
  await db.auditLog
    .create({
      data: {
        organizationId: evt.organizationId,
        actorType: "system",
        action: "share",
        entity: "webhook",
        entityId: webhook.id,
        after: JSON.stringify({
          event: evt.event,
          statusCode,
          success,
          elapsed,
        }),
        reason: `Webhook delivery: ${evt.event}`,
      },
    })
    .catch(() => {
      // Ignore audit log errors
    });
}
