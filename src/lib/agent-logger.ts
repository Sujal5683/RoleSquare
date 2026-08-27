// RoleSquare — Agent Logger
//
// Writes structured AgentLog rows to the database.
// Each log entry is tagged with an agentKey so users can filter logs
// by which AI agent produced them (extractor, analyst, validator, etc.).
//
// Also emits console.log in development for easy debugging.

import { db } from "@/lib/db";

export type AgentKey =
  | "extractor"
  | "analyst"
  | "validator"
  | "transformer"
  | "researcher"
  | "assistant"
  | "system";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface AgentLogDTO {
  id: string;
  jobId: string;
  organizationId: string;
  agentKey: AgentKey;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Writes a structured log entry for an AI agent step.
 * Non-blocking — errors are silently swallowed to avoid disrupting the pipeline.
 */
export async function agentLog(
  jobId: string,
  organizationId: string,
  agentKey: AgentKey,
  level: LogLevel,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const tag = `[${agentKey.toUpperCase()}] [${level.toUpperCase()}]`;
  const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : "";

  if (process.env.NODE_ENV !== "production") {
    console.log(`[agent-logger] ${tag} ${message}${metaStr}`);
  }

  try {
    await db.agentLog.create({
      data: {
        jobId,
        organizationId,
        agentKey,
        level,
        message,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (err) {
    // Never let logging failures break the pipeline
    console.warn("[agent-logger] Failed to write log entry:", err instanceof Error ? err.message : err);
  }
}

/**
 * Convenience helpers for common log levels.
 */
export const agentInfo = (jobId: string, orgId: string, key: AgentKey, msg: string, meta?: Record<string, unknown>) =>
  agentLog(jobId, orgId, key, "info", msg, meta);

export const agentWarn = (jobId: string, orgId: string, key: AgentKey, msg: string, meta?: Record<string, unknown>) =>
  agentLog(jobId, orgId, key, "warn", msg, meta);

export const agentError = (jobId: string, orgId: string, key: AgentKey, msg: string, meta?: Record<string, unknown>) =>
  agentLog(jobId, orgId, key, "error", msg, meta);

export const agentDebug = (jobId: string, orgId: string, key: AgentKey, msg: string, meta?: Record<string, unknown>) =>
  agentLog(jobId, orgId, key, "debug", msg, meta);
