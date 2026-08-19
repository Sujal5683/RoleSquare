// Workspace Intelligence Platform — audit log helper.
//
// Inserts a row into the AuditLog table, capturing before/after state as
// JSON strings. Safe to call inside a Prisma `$transaction` callback.

import { db } from "@/lib/db";

export interface AuditInput {
  organizationId: string;
  actorType?: "user" | "system" | "ai";
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export async function logAudit(input: AuditInput) {
  await db.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorType: input.actorType ?? "user",
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: input.before !== undefined ? JSON.stringify(input.before) : null,
      after: input.after !== undefined ? JSON.stringify(input.after) : null,
      reason: input.reason ?? null,
    },
  });
}
