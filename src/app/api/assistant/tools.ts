/**
 * assistant/tools.ts
 *
 * Shared tool executor for the AI assistant.
 *
 * This module is the SINGLE source of truth for every tool the assistant can
 * call. Both the streaming chat route (/api/assistant/chat) and the confirmed-
 * action route (/api/assistant/confirm) import `executeTool` from here so tool
 * logic is never duplicated.
 *
 * TOOL CATEGORIES
 * ─────────────────────────────────────────────────────────────────────────────
 * READ tools:   Safe to call without confirmation. Return data.
 * WRITE tools:  Modify the DB. The chat route MUST NOT execute these directly —
 *               it must emit a "pending" event so the UI asks for confirmation.
 *               Only the /confirm route executes write tools.
 *
 * SECURITY
 * ─────────────────────────────────────────────────────────────────────────────
 * Every tool validates that the target entity belongs to `organizationId`.
 * Cross-org reads/writes are impossible — a missing or mismatched org throws.
 *
 * ADDING A NEW TOOL
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Define it in TOOL_DEFINITIONS (name, description, risk, isWrite).
 * 2. Add a case in executeTool() below.
 * 3. Update the system prompt in chat/route.ts to document it for the model.
 */

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// ── Tool metadata ──────────────────────────────────────────────────────────

export type ToolRisk = "low" | "medium" | "high";

export interface ToolDefinition {
  name: string;
  description: string;
  /** Whether this tool writes/mutates data. Write tools require confirmation. */
  isWrite: boolean;
  risk: ToolRisk;
}

/** Master list of all available assistant tools with metadata. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // ── READ tools ──────────────────────────────────────────────────────────
  { name: "navigate",            description: "Navigate to a view in the app", isWrite: false, risk: "low" },
  { name: "get_dashboard",       description: "KPI snapshot: sources, datasets, jobs, review queue", isWrite: false, risk: "low" },
  { name: "list_sources",        description: "List sources with status and last-run info", isWrite: false, risk: "low" },
  { name: "get_source_detail",   description: "Full source config and recent scan runs", isWrite: false, risk: "low" },
  { name: "list_datasets",       description: "List all datasets for the org", isWrite: false, risk: "low" },
  { name: "get_dataset_detail",  description: "Dataset metadata and column definitions", isWrite: false, risk: "low" },
  { name: "get_dataset_records", description: "Fetch sample records from a dataset", isWrite: false, risk: "low" },
  { name: "list_schemas",        description: "List all schemas", isWrite: false, risk: "low" },
  { name: "get_schema_detail",   description: "Full schema with all field definitions", isWrite: false, risk: "low" },
  { name: "list_ai_jobs",        description: "List AI jobs with optional type/status filter", isWrite: false, risk: "low" },
  { name: "get_audit_log",       description: "Recent audit log entries for the org", isWrite: false, risk: "low" },
  { name: "list_members",        description: "Org member list with roles", isWrite: false, risk: "low" },
  { name: "get_usage",           description: "Token and cost usage metrics", isWrite: false, risk: "low" },
  { name: "search",              description: "Full-text search across sources, datasets, and schemas", isWrite: false, risk: "low" },
  { name: "get_model_status",      description: "Live Gemini model chain status", isWrite: false, risk: "low" },
  { name: "suggest_schema_fields", description: "Generate AI-suggested schema fields from a description — does NOT create anything", isWrite: false, risk: "low" },
  { name: "test_extraction",       description: "Run a test AI extraction against sample text", isWrite: false, risk: "low" },
  { name: "get_record_detail",     description: "Fetch a single dataset record with all its field values", isWrite: false, risk: "low" },

  // ── WRITE tools — require confirmation before execution ──────────────────
  { name: "trigger_scan",          description: "Trigger a Gmail/Drive scan for a source", isWrite: true, risk: "low" },
  { name: "pause_source",          description: "Pause an active source (stops scheduled scans)", isWrite: true, risk: "low" },
  { name: "resume_source",         description: "Resume a paused source", isWrite: true, risk: "low" },
  { name: "retry_job",             description: "Retry a failed AI job", isWrite: true, risk: "low" },
  { name: "cancel_job",            description: "Cancel a queued AI job", isWrite: true, risk: "medium" },
  { name: "create_schema",         description: "Create a new schema with field definitions", isWrite: true, risk: "medium" },
  { name: "update_schema",         description: "Update schema name, description, or prompt template", isWrite: true, risk: "medium" },
  { name: "add_schema_field",      description: "Add a new field to an existing schema", isWrite: true, risk: "medium" },
  { name: "update_schema_field",   description: "Update an existing field's properties (e.g. required, name, description)", isWrite: true, risk: "medium" },
  { name: "delete_schema_field",   description: "Delete an existing field from a schema", isWrite: true, risk: "medium" },
  { name: "delete_schema",         description: "Permanently delete a schema (unlinks datasets)", isWrite: true, risk: "high" },
  { name: "create_dataset",        description: "Create a new dataset", isWrite: true, risk: "medium" },
  { name: "update_dataset",        description: "Update dataset name or schema assignment", isWrite: true, risk: "medium" },
  { name: "delete_dataset",        description: "Permanently delete a dataset and all its records", isWrite: true, risk: "high" },
  { name: "update_member_role",    description: "Change a member's role in the organization", isWrite: true, risk: "high" },
];

/** Look up tool metadata by name. */
export function getToolDef(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

// ── Tool executor ──────────────────────────────────────────────────────────

/**
 * Executes a tool by name with the given arguments.
 *
 * @param toolName     - Must match a key in TOOL_DEFINITIONS
 * @param args         - Caller-supplied arguments (validated per tool)
 * @param organizationId - The caller's org — used to scope all DB queries
 * @param userId       - The caller's user ID — used for audit logging on writes
 * @param appOrigin    - Base URL for internal service calls (e.g. /api/jobs/process)
 * @returns            Arbitrary JSON result
 * @throws             Error with a descriptive message on failure
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  organizationId: string,
  userId: string,
  appOrigin: string
): Promise<unknown> {
  switch (toolName) {

    // ── Navigation (client-side, just echo intent) ─────────────────────────

    case "navigate":
      return { navigateTo: args.view, status: "ok" };

    // ── Dashboard ─────────────────────────────────────────────────────────

    case "get_dashboard": {
      const [sources, datasets, jobs, records] = await Promise.all([
        db.source.count({ where: { organizationId } }),
        db.dataset.count({ where: { organizationId } }),
        db.aiJob.count({ where: { organizationId, status: { in: ["queued", "running"] } } }),
        db.datasetRecord.count({
          where: { dataset: { organizationId }, status: "needs_review" },
        }),
      ]);
      return { activeSources: sources, datasets, runningJobs: jobs, reviewQueue: records };
    }

    // ── Sources ────────────────────────────────────────────────────────────

    case "list_sources": {
      const limit = Math.min(Number(args.limit ?? 10), 50);
      return db.source.findMany({
        where: { organizationId },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, name: true, sourceType: true, status: true,
          runState: true, lastRunAt: true, scheduleMode: true, scheduleExpr: true,
        },
      });
    }

    case "get_source_detail": {
      const sourceId = requireString(args.sourceId, "sourceId");
      const source = await db.source.findUnique({
        where: { id: sourceId },
        include: {
          runs: { take: 5, orderBy: { startedAt: "desc" }, select: { id: true, status: true, mode: true, startedAt: true, finishedAt: true, progress: true } },
        },
      });
      if (!source || source.organizationId !== organizationId) throw new Error(`Source ${sourceId} not found`);
      return source;
    }

    case "trigger_scan": {
      const sourceId = requireString(args.sourceId, "sourceId");
      const mode = args.mode === "historical" ? "historical" : "incremental";
      const source = await db.source.findUnique({ where: { id: sourceId } });
      if (!source || source.organizationId !== organizationId) throw new Error(`Source ${sourceId} not found`);
      const now = new Date();
      const run = await db.sourceRun.create({
        data: { sourceId, status: "running", mode, progress: 0, startedAt: now },
      });
      await db.aiJob.create({
        data: {
          organizationId, type: "GMAIL_SCAN", status: "queued",
          payload: JSON.stringify({ sourceId, runId: run.id, mode, triggeredBy: "assistant" }),
          progress: 0,
        },
      });
      await db.source.update({ where: { id: sourceId }, data: { lastRunAt: now, runState: "scanning" } });
      // Kick the job processor (fire-and-forget)
      fetch(new URL("/api/jobs/process", appOrigin).toString(), { method: "POST" }).catch(() => {});
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "trigger_scan", entity: "source", entityId: sourceId });
      return { runId: run.id, sourceId, mode, status: "queued" };
    }

    // ── Datasets ───────────────────────────────────────────────────────────

    case "list_datasets": {
      const limit = Math.min(Number(args.limit ?? 10), 50);
      return db.dataset.findMany({
        where: { organizationId },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, recordCount: true, createdAt: true, schemaId: true },
      });
    }

    case "get_dataset_detail": {
      const datasetId = requireString(args.datasetId, "datasetId");
      const dataset = await db.dataset.findUnique({
        where: { id: datasetId },
        include: { schema: { include: { fields: { orderBy: { position: "asc" } } } } },
      });
      if (!dataset || dataset.organizationId !== organizationId) throw new Error(`Dataset ${datasetId} not found`);
      return dataset;
    }

    case "get_dataset_records": {
      const datasetId = requireString(args.datasetId, "datasetId");
      const limit = Math.min(Number(args.limit ?? 10), 50);
      const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
      if (!dataset || dataset.organizationId !== organizationId) throw new Error(`Dataset ${datasetId} not found`);
      const records = await db.datasetRecord.findMany({
        where: { datasetId },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, confidence: true, createdAt: true },
      });
      return { datasetId, name: dataset.name, records };
    }

    case "create_dataset": {
      const name = requireString(args.name, "name");
      const schemaId = typeof args.schemaId === "string" ? args.schemaId : null;
      // Validate schema belongs to org if provided
      if (schemaId) {
        const schema = await db.schema.findFirst({ where: { id: schemaId, organizationId } });
        if (!schema) throw new Error(`Schema ${schemaId} not found`);
      }
      const dataset = await db.dataset.create({
        data: { organizationId, createdBy: userId, name, description: typeof args.description === "string" ? args.description : null, schemaId, recordCount: 0 },
      });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "create", entity: "dataset", entityId: dataset.id, after: { name, schemaId } });
      return { id: dataset.id, name: dataset.name, createdAt: dataset.createdAt };
    }

    case "update_dataset": {
      const datasetId = requireString(args.datasetId, "datasetId");
      const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
      if (!dataset || dataset.organizationId !== organizationId) throw new Error(`Dataset ${datasetId} not found`);
      const schemaId = typeof args.schemaId === "string" ? args.schemaId : undefined;
      if (schemaId) {
        const schema = await db.schema.findFirst({ where: { id: schemaId, organizationId } });
        if (!schema) throw new Error(`Schema ${schemaId} not found`);
      }
      await db.dataset.update({ where: { id: datasetId }, data: { ...(schemaId ? { schemaId } : {}), ...(typeof args.name === "string" ? { name: args.name } : {}) } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "update", entity: "dataset", entityId: datasetId, before: { schemaId: dataset.schemaId }, after: args });
      return { ok: true, datasetId };
    }

    case "delete_dataset": {
      const datasetId = requireString(args.datasetId, "datasetId");
      const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
      if (!dataset || dataset.organizationId !== organizationId) throw new Error(`Dataset ${datasetId} not found`);
      await db.dataset.delete({ where: { id: datasetId } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "delete", entity: "dataset", entityId: datasetId, before: { name: dataset.name } });
      // Dataset deletes are NOT undoable — records cascade-deleted permanently
      return { ok: true, deletedId: datasetId, name: dataset.name };
    }

    // ── Schemas ────────────────────────────────────────────────────────────

    case "list_schemas": {
      const limit = Math.min(Number(args.limit ?? 10), 50);
      return db.schema.findMany({
        where: { organizationId },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, version: true, createdAt: true },
      });
    }

    case "get_schema_detail": {
      const schemaId = requireString(args.schemaId, "schemaId");
      const schema = await db.schema.findUnique({
        where: { id: schemaId },
        include: { fields: { orderBy: { position: "asc" } } },
      });
      if (!schema || schema.organizationId !== organizationId) throw new Error(`Schema ${schemaId} not found`);
      return schema;
    }

    case "suggest_schema_fields": {
      // This is a pure AI call — no DB write. Returns a structured suggestion
      // the user can review before the real create_schema is called.
      const description = requireString(args.description, "description");
      const { callGeminiWithFallback } = await import("@/lib/gemini");
      const result = await callGeminiWithFallback(
        [{ role: "user", content: `Based on this description, suggest a list of schema fields in JSON array format. Each field: { name, type (text|number|date|boolean|enum|array), description, required: bool }. Description: ${description}` }],
        { temperature: 0.3, maxOutputTokens: 1024 }
      );
      // Parse the JSON from the model response
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return { suggestion: result.text, parsed: false };
      try {
        const fields = JSON.parse(jsonMatch[0]);
        return { fields, parsed: true, modelUsed: result.modelUsed };
      } catch {
        return { suggestion: result.text, parsed: false };
      }
    }

    case "create_schema": {
      const name = requireString(args.name, "name");
      const fieldsInput: any[] = Array.isArray(args.fields) ? args.fields : [];
      const schema = await db.$transaction(async (tx) => {
        const created = await tx.schema.create({
          data: { organizationId, createdBy: userId, name, description: typeof args.description === "string" ? args.description : null, promptTemplate: typeof args.promptTemplate === "string" ? args.promptTemplate : null, version: 1 },
        });
        if (fieldsInput.length > 0) {
          await tx.schemaField.createMany({
            data: fieldsInput.map((f, i) => ({
              schemaId: created.id,
              name: String(f.name ?? ""),
              type: String(f.type ?? "text"),
              description: f.description ?? null,
              instructions: f.instructions ?? null,
              required: !!f.required,
              options: f.options ? JSON.stringify(f.options) : null,
              position: typeof f.position === "number" ? f.position : i,
            })),
          });
        }
        return created;
      });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "create", entity: "schema", entityId: schema.id, after: { name, fieldCount: fieldsInput.length } });
      return { id: schema.id, name: schema.name, fieldCount: fieldsInput.length };
    }

    case "update_schema": {
      const schemaId = requireString(args.schemaId, "schemaId");
      const schema = await db.schema.findUnique({ where: { id: schemaId } });
      if (!schema || schema.organizationId !== organizationId) throw new Error(`Schema ${schemaId} not found`);
      const data: any = { version: schema.version + 1 };
      if (typeof args.name === "string" && args.name.trim()) data.name = args.name.trim();
      if (typeof args.description === "string") data.description = args.description || null;
      if (typeof args.promptTemplate === "string") data.promptTemplate = args.promptTemplate || null;
      await db.schema.update({ where: { id: schemaId }, data });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "update", entity: "schema", entityId: schemaId, before: { name: schema.name, version: schema.version }, after: data });
      return { ok: true, schemaId, updatedFields: Object.keys(data).filter(k => k !== "version") };
    }

    case "add_schema_field": {
      const schemaId = requireString(args.schemaId, "schemaId");
      const name = requireString(args.name, "name");
      const type = requireString(args.type, "type");
      const schema = await db.schema.findUnique({ where: { id: schemaId } });
      if (!schema || schema.organizationId !== organizationId) throw new Error(`Schema ${schemaId} not found`);
      const field = await db.schemaField.create({
        data: {
          schemaId,
          name,
          type,
          description: typeof args.description === "string" ? args.description : null,
          instructions: typeof args.instructions === "string" ? args.instructions : null,
          required: !!args.required,
          options: args.options ? JSON.stringify(args.options) : null,
          position: typeof args.position === "number" ? args.position : 999,
        }
      });
      await db.schema.update({ where: { id: schemaId }, data: { version: schema.version + 1 } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "add_field", entity: "schema", entityId: schemaId, after: { fieldName: name } });
      return { ok: true, fieldId: field.id };
    }

    case "update_schema_field": {
      const fieldId = requireString(args.fieldId, "fieldId");
      const field = await db.schemaField.findUnique({ where: { id: fieldId }, include: { schema: true } });
      if (!field || field.schema.organizationId !== organizationId) throw new Error(`Schema field ${fieldId} not found`);
      const data: any = {};
      if (typeof args.name === "string") data.name = args.name;
      if (typeof args.type === "string") data.type = args.type;
      if (typeof args.description === "string") data.description = args.description;
      if (typeof args.instructions === "string") data.instructions = args.instructions;
      if (typeof args.required === "boolean") data.required = args.required;
      if (args.options !== undefined) data.options = args.options ? JSON.stringify(args.options) : null;
      if (typeof args.position === "number") data.position = args.position;
      await db.schemaField.update({ where: { id: fieldId }, data });
      await db.schema.update({ where: { id: field.schemaId }, data: { version: field.schema.version + 1 } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "update_field", entity: "schema", entityId: field.schemaId, before: field, after: data });
      return { ok: true, fieldId };
    }

    case "delete_schema_field": {
      const fieldId = requireString(args.fieldId, "fieldId");
      const field = await db.schemaField.findUnique({ where: { id: fieldId }, include: { schema: true } });
      if (!field || field.schema.organizationId !== organizationId) throw new Error(`Schema field ${fieldId} not found`);
      await db.schemaField.delete({ where: { id: fieldId } });
      await db.schema.update({ where: { id: field.schemaId }, data: { version: field.schema.version + 1 } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "delete_field", entity: "schema", entityId: field.schemaId, before: field });
      return { ok: true, deletedFieldId: fieldId };
    }

    case "delete_schema": {
      const schemaId = requireString(args.schemaId, "schemaId");
      const schema = await db.schema.findUnique({ where: { id: schemaId }, include: { fields: true } });
      if (!schema || schema.organizationId !== organizationId) throw new Error(`Schema ${schemaId} not found`);
      const affectedDatasets = await db.dataset.count({ where: { schemaId } });
      if (affectedDatasets > 0) await db.dataset.updateMany({ where: { schemaId }, data: { schemaId: null } });
      await db.schema.delete({ where: { id: schemaId } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "delete", entity: "schema", entityId: schemaId, before: { name: schema.name, fields: schema.fields } });
      // Return enough data to build an undo token for schema re-creation
      return { ok: true, deletedId: schemaId, name: schema.name, affectedDatasets, _undoData: { name: schema.name, fields: schema.fields } };
    }

    // ── AI Jobs ────────────────────────────────────────────────────────────

    case "list_ai_jobs": {
      const limit = Math.min(Number(args.limit ?? 20), 50);
      return db.aiJob.findMany({
        where: {
          organizationId,
          ...(typeof args.type === "string" ? { type: args.type } : {}),
          ...(typeof args.status === "string" ? { status: args.status } : {}),
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, status: true, progress: true, attempts: true, errorMessage: true, createdAt: true },
      });
    }

    case "retry_job": {
      const jobId = requireString(args.jobId, "jobId");
      const job = await db.aiJob.findUnique({ where: { id: jobId } });
      if (!job || job.organizationId !== organizationId) throw new Error(`Job ${jobId} not found`);
      await db.aiJob.update({ where: { id: jobId }, data: { status: "queued", attempts: 0, errorMessage: null } });
      fetch(new URL("/api/jobs/process", appOrigin).toString(), { method: "POST" }).catch(() => {});
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "retry_job", entity: "ai_job", entityId: jobId });
      return { jobId, status: "re-queued" };
    }

    case "cancel_job": {
      const jobId = requireString(args.jobId, "jobId");
      const job = await db.aiJob.findUnique({ where: { id: jobId } });
      if (!job || job.organizationId !== organizationId) throw new Error(`Job ${jobId} not found`);
      await db.aiJob.update({ where: { id: jobId }, data: { status: "cancelled" } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "cancel_job", entity: "ai_job", entityId: jobId });
      return { jobId, status: "cancelled" };
    }

    // ── Members ────────────────────────────────────────────────────────────

    case "list_members": {
      const members = await db.organizationMember.findMany({
        where: { organizationId },
        include: { user: { select: { email: true, name: true, avatarUrl: true } } },
        take: 50,
      });
      return members.map((m) => ({ id: m.id, role: m.role, status: m.status, email: m.user.email, name: m.user.name }));
    }

    // ── Usage ──────────────────────────────────────────────────────────────

    case "get_usage": {
      const metrics = await db.usageMetric.findMany({
        where: { organizationId },
        orderBy: { periodStart: "desc" },
        take: 10,
      });
      return metrics.map((m) => ({ metric: m.metricType, value: m.value, period: `${m.periodStart} – ${m.periodEnd}` }));
    }

    // ── Audit log ──────────────────────────────────────────────────────────

    case "get_audit_log": {
      const limit = Math.min(Number(args.limit ?? 20), 50);
      const logs = await db.auditLog.findMany({
        where: { organizationId, ...(args.entity ? { entity: String(args.entity) } : {}) },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, actorType: true, actorId: true, action: true, entity: true, entityId: true, createdAt: true },
      });
      return logs;
    }

    // ── Search ─────────────────────────────────────────────────────────────

    case "search": {
      const q = requireString(args.q, "q").toLowerCase().trim();
      const [sources, datasets, schemas] = await Promise.all([
        db.source.findMany({ where: { organizationId, name: { contains: q, mode: "insensitive" } }, take: 5, select: { id: true, name: true, sourceType: true } }),
        db.dataset.findMany({ where: { organizationId, name: { contains: q, mode: "insensitive" } }, take: 5, select: { id: true, name: true, recordCount: true } }),
        db.schema.findMany({ where: { organizationId, name: { contains: q, mode: "insensitive" } }, take: 5, select: { id: true, name: true, version: true } }),
      ]);
      return { results: [...sources.map(s => ({ type: "source", ...s })), ...datasets.map(d => ({ type: "dataset", ...d })), ...schemas.map(s => ({ type: "schema", ...s }))] };
    }

    // ── Model status ────────────────────────────────────────────────────────

    case "get_model_status": {
      const { getModelChainStatus } = await import("@/lib/gemini");
      return getModelChainStatus();
    }

    // ── Test extraction ─────────────────────────────────────────────────────

    case "test_extraction": {
      const { extractWithLLM } = await import("@/lib/extraction");
      const schemaId = requireString(args.schemaId, "schemaId");
      const sampleText = requireString(args.sampleText, "sampleText");
      const schema = await db.schema.findUnique({ where: { id: schemaId }, include: { fields: true } });
      if (!schema || schema.organizationId !== organizationId) throw new Error(`Schema ${schemaId} not found`);
      const result = await extractWithLLM({
        fields: schema.fields.map((f) => ({ name: f.name, type: f.type, description: f.description, instructions: f.instructions, required: f.required, options: f.options ? JSON.parse(f.options) : null })),
        sourceText: sampleText,
        systemOverride: schema.promptTemplate ?? undefined,
      });
      return { fieldsExtracted: result.fields.length, overallConfidence: result.overallConfidence, modelUsed: result.modelUsed };
    }

    // ── Record detail ───────────────────────────────────────────────────────

    case "get_record_detail": {
      const recordId = requireString(args.recordId, "recordId");
      const record = await db.datasetRecord.findUnique({
        where: { id: recordId },
        include: {
          dataset: { select: { id: true, name: true, organizationId: true, schemaId: true } },
          values: { select: { id: true, fieldId: true, value: true, confidence: true, evidence: true } },
        },
      });
      if (!record || record.dataset.organizationId !== organizationId) {
        throw new Error(`Record ${recordId} not found`);
      }

      // Resolve field names from the schema if available
      let fieldMap: Map<string, { name: string; type: string }> = new Map();
      if (record.dataset.schemaId) {
        const fields = await db.schemaField.findMany({
          where: { schemaId: record.dataset.schemaId },
          select: { id: true, name: true, type: true },
        });
        fieldMap = new Map(fields.map((f) => [f.id, { name: f.name, type: f.type }]));
      }

      return {
        id: record.id,
        datasetId: record.datasetId,
        datasetName: record.dataset.name,
        status: record.status,
        confidence: record.confidence,
        createdAt: record.createdAt,
        values: record.values.map((v) => ({
          fieldId: v.fieldId,
          fieldName: fieldMap.get(v.fieldId)?.name ?? v.fieldId,
          fieldType: fieldMap.get(v.fieldId)?.type ?? "unknown",
          value: v.value,
          confidence: v.confidence,
        })),
      };
    }

    // ── Source pause / resume ───────────────────────────────────────────────

    case "pause_source": {
      const sourceId = requireString(args.sourceId, "sourceId");
      const source = await db.source.findUnique({ where: { id: sourceId } });
      if (!source || source.organizationId !== organizationId) throw new Error(`Source ${sourceId} not found`);
      if (source.status === "paused") return { ok: true, status: "already paused", sourceId };
      await db.source.update({ where: { id: sourceId }, data: { status: "paused" } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "pause_source", entity: "source", entityId: sourceId });
      return { ok: true, sourceId, name: source.name, status: "paused" };
    }

    case "resume_source": {
      const sourceId = requireString(args.sourceId, "sourceId");
      const source = await db.source.findUnique({ where: { id: sourceId } });
      if (!source || source.organizationId !== organizationId) throw new Error(`Source ${sourceId} not found`);
      if (source.status === "active") return { ok: true, status: "already active", sourceId };
      await db.source.update({ where: { id: sourceId }, data: { status: "active" } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "resume_source", entity: "source", entityId: sourceId });
      return { ok: true, sourceId, name: source.name, status: "active" };
    }

    // ── Add schema field ────────────────────────────────────────────────────

    case "add_schema_field": {
      const schemaId = requireString(args.schemaId, "schemaId");
      const fieldName = requireString(args.name, "name");
      const schema = await db.schema.findUnique({ where: { id: schemaId }, include: { fields: true } });
      if (!schema || schema.organizationId !== organizationId) throw new Error(`Schema ${schemaId} not found`);
      // Prevent duplicate field names
      if (schema.fields.some((f) => f.name.toLowerCase() === fieldName.toLowerCase())) {
        throw new Error(`Schema already has a field named "${fieldName}"`);
      }
      const maxPosition = schema.fields.reduce((m, f) => Math.max(m, f.position), -1);
      const field = await db.schemaField.create({
        data: {
          schemaId,
          name: fieldName,
          type: typeof args.type === "string" ? args.type : "text",
          description: typeof args.description === "string" ? args.description : null,
          instructions: typeof args.instructions === "string" ? args.instructions : null,
          required: typeof args.required === "boolean" ? args.required : false,
          options: args.options ? JSON.stringify(args.options) : null,
          position: maxPosition + 1,
        },
      });
      // Bump schema version
      await db.schema.update({ where: { id: schemaId }, data: { version: schema.version + 1 } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "add_field", entity: "schema", entityId: schemaId, after: { fieldName, type: field.type } });
      return { ok: true, fieldId: field.id, name: field.name, type: field.type, position: field.position };
    }

    // ── Member role update ──────────────────────────────────────────────────

    case "update_member_role": {
      const targetEmail = requireString(args.email, "email");
      const newRole = requireString(args.role, "role");
      const validRoles = ["owner", "admin", "manager", "member", "viewer"];
      if (!validRoles.includes(newRole)) {
        throw new Error(`Invalid role "${newRole}". Must be one of: ${validRoles.join(", ")}`);
      }

      // Find the target user
      const targetUser = await db.user.findUnique({ where: { email: targetEmail } });
      if (!targetUser) throw new Error(`No user found with email "${targetEmail}"`);

      // Find their membership in this org
      const membership = await db.organizationMember.findFirst({
        where: { organizationId, userId: targetUser.id, status: "active" },
      });
      if (!membership) throw new Error(`"${targetEmail}" is not an active member of this organization`);

      // Prevent changing the last owner
      if (membership.role === "owner" && newRole !== "owner") {
        const ownerCount = await db.organizationMember.count({ where: { organizationId, role: "owner", status: "active" } });
        if (ownerCount <= 1) throw new Error("Cannot demote the last owner. Promote another member to owner first.");
      }

      const before = { role: membership.role };
      await db.organizationMember.update({ where: { id: membership.id }, data: { role: newRole } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "update_member_role", entity: "org_member", entityId: membership.id, before, after: { role: newRole, email: targetEmail } });
      return { ok: true, email: targetEmail, previousRole: before.role, newRole };
    }

    // ── Unknown ─────────────────────────────────────────────────────────────

    default:
      throw new Error(`Unknown tool: "${toolName}". Check the available tools list.`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Asserts that `value` is a non-empty string, or throws a descriptive error. */
function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`"${fieldName}" is required and must be a non-empty string`);
  }
  return value.trim();
}
