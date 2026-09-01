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
import { enqueueJob } from "@/lib/queue";

// ── Tool metadata ──────────────────────────────────────────────────────────

export type ToolRisk = "low" | "medium" | "high";

export interface ToolDefinition {
  name: string;
  description: string;
  /** Whether this tool writes/mutates data. Write tools require confirmation. */
  isWrite: boolean;
  risk: ToolRisk;
  /** A TypeScript-like description of the expected JSON args object. */
  argsSchema: string;
}

/** Master list of all available assistant tools with metadata. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // ── READ tools — safe to execute immediately ─────────────────────────────
  { name: "get_dashboard_stats", description: "Fetch aggregate counts of sources, datasets, and running jobs", isWrite: false, risk: "low", argsSchema: "{}" },
  { name: "list_sources",        description: "List sources with status and last-run info", isWrite: false, risk: "low", argsSchema: "{ limit?: number }" },
  { name: "get_source_detail",   description: "Full source config and recent scan runs", isWrite: false, risk: "low", argsSchema: "{ sourceId: string }" },
  { name: "list_datasets",       description: "List all datasets for the org", isWrite: false, risk: "low", argsSchema: "{ limit?: number }" },
  { name: "get_dataset_detail",  description: "Dataset metadata and column definitions", isWrite: false, risk: "low", argsSchema: "{ datasetId: string }" },
  { name: "get_dataset_records", description: "Fetch sample records from a dataset", isWrite: false, risk: "low", argsSchema: "{ datasetId: string, limit?: number }" },
  { name: "list_schemas",        description: "List all schemas", isWrite: false, risk: "low", argsSchema: "{}" },
  { name: "get_schema_detail",   description: "Full schema with all field definitions", isWrite: false, risk: "low", argsSchema: "{ schemaId: string }" },
  { name: "list_ai_jobs",        description: "List AI jobs with optional type/status filter", isWrite: false, risk: "low", argsSchema: "{ type?: string, status?: string, limit?: number }" },
  { name: "get_audit_log",       description: "Recent audit log entries for the org", isWrite: false, risk: "low", argsSchema: "{ limit?: number, entity?: string }" },
  { name: "list_members",        description: "Org member list with roles", isWrite: false, risk: "low", argsSchema: "{}" },
  { name: "get_usage",           description: "Token and cost usage metrics", isWrite: false, risk: "low", argsSchema: "{}" },
  { name: "search",              description: "Full-text search across sources, datasets, and schemas", isWrite: false, risk: "low", argsSchema: "{ q: string }" },
  { name: "get_model_status",      description: "Live Gemini model chain status", isWrite: false, risk: "low", argsSchema: "{}" },
  { name: "suggest_schema_fields", description: "Generate AI-suggested schema fields from a description — does NOT create anything", isWrite: false, risk: "low", argsSchema: "{ description: string }" },
  { name: "test_extraction",       description: "Run a test AI extraction against sample text", isWrite: false, risk: "low", argsSchema: "{ text: string, schemaId: string }" },
  { name: "get_record_detail",     description: "Fetch a single dataset record with all its field values", isWrite: false, risk: "low", argsSchema: "{ recordId: string }" },

  // ── WRITE tools — require confirmation before execution ──────────────────
  { name: "trigger_scan",          description: "Trigger a Gmail/Drive scan for a source", isWrite: true, risk: "low", argsSchema: "{ sourceId: string, mode?: 'historical' | 'incremental' }" },
  { name: "pause_source",          description: "Pause an active source (stops scheduled scans)", isWrite: true, risk: "low", argsSchema: "{ sourceId: string }" },
  { name: "resume_source",         description: "Resume a paused source", isWrite: true, risk: "low", argsSchema: "{ sourceId: string }" },
  { name: "retry_job",             description: "Retry a failed AI job", isWrite: true, risk: "low", argsSchema: "{ jobId: string }" },
  { name: "cancel_job",            description: "Cancel a queued AI job", isWrite: true, risk: "medium", argsSchema: "{ jobId: string }" },
  { name: "create_schema",         description: "Create a new schema with field definitions", isWrite: true, risk: "medium", argsSchema: "{ name: string, description?: string, fields: Array<{name:string, type:string, required:boolean, description?:string}> }" },
  { name: "update_schema",         description: "Update schema name, description, or prompt template", isWrite: true, risk: "medium", argsSchema: "{ schemaId: string, name?: string, description?: string, extractionPrompt?: string }" },
  { name: "add_schema_field",      description: "Add a new field to an existing schema", isWrite: true, risk: "medium", argsSchema: "{ schemaId: string, name: string, type: string, required: boolean, description?: string }" },
  { name: "update_schema_field",   description: "Update an existing field's properties (e.g. required, name, description)", isWrite: true, risk: "medium", argsSchema: "{ fieldId: string, name?: string, type?: string, required?: boolean, description?: string }" },
  { name: "delete_schema_field",   description: "Delete an existing field from a schema", isWrite: true, risk: "medium", argsSchema: "{ fieldId: string }" },
  { name: "delete_schema",         description: "Permanently delete a schema (unlinks datasets)", isWrite: true, risk: "high", argsSchema: "{ schemaId: string }" },
  { name: "create_dataset",        description: "Create a new dataset", isWrite: true, risk: "medium", argsSchema: "{ name: string, description?: string, schemaId?: string }" },
  { name: "update_dataset",        description: "Update dataset name or schema assignment", isWrite: true, risk: "medium", argsSchema: "{ datasetId: string, name?: string, schemaId?: string }" },
  { name: "delete_dataset",        description: "Permanently delete a dataset and all its records", isWrite: true, risk: "high", argsSchema: "{ datasetId: string }" },
  { name: "update_member_role",    description: "Change a member's role in the organization", isWrite: true, risk: "high", argsSchema: "{ memberId: string, role: string }" },

  // ── Missing Features (Source & Rules) ────────────────────────────────────
  { name: "create_source",         description: "Connect a new Gmail or Drive source", isWrite: true, risk: "medium", argsSchema: "{ name: string, googleConnectionId: string, sourceType?: string, description?: string, schemaId?: string, datasetId?: string }" },
  { name: "delete_source",         description: "Delete an entire source and its rules", isWrite: true, risk: "high", argsSchema: "{ sourceId: string }" },
  { name: "add_source_rule",       description: "Add a filtering rule to a source (e.g. sender, subject)", isWrite: true, risk: "medium", argsSchema: "{ sourceId: string, filterType: string, operator: string, value: any, position?: number }" },
  { name: "update_source_rule",    description: "Update an existing source filtering rule", isWrite: true, risk: "medium", argsSchema: "{ ruleId: string, filterType?: string, operator?: string, value?: any, position?: number }" },
  { name: "delete_source_rule",    description: "Delete an existing source filtering rule", isWrite: true, risk: "medium", argsSchema: "{ ruleId: string }" },

  // ── Missing Features (Dataset Curation) ──────────────────────────────────
  { name: "update_record_status",  description: "Approve or reject a dataset record", isWrite: true, risk: "medium", argsSchema: "{ recordId: string, status: 'approved'|'rejected'|'needs_review' }" },
  { name: "correct_extracted_value",description: "Human-in-the-loop correction of an extracted value", isWrite: true, risk: "medium", argsSchema: "{ valueId: string, newValue: string }" },
  { name: "delete_dataset_record", description: "Delete a specific dataset record", isWrite: true, risk: "medium", argsSchema: "{ recordId: string }" },

  // ── Missing Features (Team Governance & Sharing) ─────────────────────────
  { name: "invite_member",         description: "Invite a new user to the organization", isWrite: true, risk: "high", argsSchema: "{ email: string, role?: string }" },
  { name: "remove_member",         description: "Remove a member from the organization", isWrite: true, risk: "high", argsSchema: "{ memberId: string }" },
  { name: "list_sharing_requests", description: "List pending incoming sharing requests", isWrite: false, risk: "low", argsSchema: "{}" },
  { name: "approve_sharing_request",description: "Approve a dataset sharing request", isWrite: true, risk: "high", argsSchema: "{ requestId: string }" },
  { name: "reject_sharing_request",description: "Reject a dataset sharing request", isWrite: true, risk: "medium", argsSchema: "{ requestId: string }" },
  { name: "grant_dataset_access",  description: "Grant dataset access to an external org or user", isWrite: true, risk: "high", argsSchema: "{ datasetId: string, granteeOrgId?: string, granteeUserId?: string, level?: string }" },

  // ── Missing Features (Google Integrations) ───────────────────────────────
  { name: "list_google_connections",description: "List linked Google accounts and their status", isWrite: false, risk: "low", argsSchema: "{}" },
  { name: "revoke_google_connection",description: "Revoke access to a connected Google account", isWrite: true, risk: "high", argsSchema: "{ connectionId: string }" },
  { name: "export_dataset_to_sheets",description: "Export a dataset to a connected Google Sheet", isWrite: true, risk: "medium", argsSchema: "{ datasetId: string }" },
  { name: "sync_dataset_to_sheets",description: "Force sync rows to an existing Google Sheet export", isWrite: true, risk: "low", argsSchema: "{ datasetId: string }" },

  // ── Missing Features (Debugging) ─────────────────────────────────────────
  { name: "get_job_logs",          description: "Get raw execution agent logs for an AI Job", isWrite: false, risk: "low", argsSchema: "{ jobId: string }" },
  { name: "analyze_job_failure",   description: "Analyze a failed job's logs and explain the error", isWrite: false, risk: "low", argsSchema: "{ jobId: string }" },
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
    const def = getToolDef(toolName);
  if (!def) {
    throw new Error(`Unknown tool: ${toolName}. Check the available tools list.`);
  }

  const actorMembership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } }
  });
  if (!actorMembership || actorMembership.status !== "active") {
    throw new Error("Permission denied: Not an active member of this organization.");
  }

  const role = actorMembership.role;
  const ROLE_LEVEL: Record<string, number> = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1 };
  const level = ROLE_LEVEL[role] ?? 0;

  // GLOBAL SECURITY CHECK
  if (def.isWrite) {
    if (level < ROLE_LEVEL.member) {
      throw new Error(`Permission denied: Viewers cannot perform write operations (${toolName}).`);
    }

    // Admin-only tools
    const adminTools = ["invite_member", "remove_member", "revoke_google_connection", "grant_dataset_access", "update_member_role"];
    if (adminTools.includes(toolName) && level < ROLE_LEVEL.admin) {
      throw new Error(`Permission denied: '${toolName}' requires admin privileges.`);
    }

    // Manager-only tools (destructive)
    const managerTools = ["delete_dataset", "delete_schema", "delete_source", "delete_dataset_record", "delete_schema_field"];
    if (managerTools.includes(toolName) && level < ROLE_LEVEL.manager) {
      throw new Error(`Permission denied: '${toolName}' requires manager privileges.`);
    }
  }

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
      const jobId = await enqueueJob({
        organizationId,
        type: "GMAIL_SCAN",
        payload: { sourceId, runId: run.id, mode, triggeredBy: "assistant" },
      });
      await db.source.update({ where: { id: sourceId }, data: { lastRunAt: now, runState: "scanning" } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "trigger_scan", entity: "source", entityId: sourceId });
      return { runId: run.id, sourceId, mode, jobId, status: "queued" };
    }

    case "create_source": {
      const name = requireString(args.name, "name");
      const googleConnectionId = requireString(args.googleConnectionId, "googleConnectionId");
      const sourceType = typeof args.sourceType === "string" ? args.sourceType : "gmail";
      const connection = await db.googleConnection.findUnique({ where: { id: googleConnectionId } });
      if (!connection || connection.organizationId !== organizationId) throw new Error(`Google connection ${googleConnectionId} not found`);
      const source = await db.source.create({
        data: {
          organizationId,
          ownerUserId: userId,
          googleConnectionId,
          name,
          sourceType,
          description: typeof args.description === "string" ? args.description : null,
          schemaId: typeof args.schemaId === "string" ? args.schemaId : null,
          datasetId: typeof args.datasetId === "string" ? args.datasetId : null,
        }
      });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "create", entity: "source", entityId: source.id, after: { name, sourceType } });
      return { id: source.id, name: source.name };
    }

    case "delete_source": {
      const sourceId = requireString(args.sourceId, "sourceId");
      const source = await db.source.findUnique({ where: { id: sourceId } });
      if (!source || source.organizationId !== organizationId) throw new Error(`Source ${sourceId} not found`);
      await db.source.delete({ where: { id: sourceId } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "delete", entity: "source", entityId: sourceId, before: { name: source.name } });
      return { ok: true, deletedId: sourceId };
    }

    case "add_source_rule": {
      const sourceId = requireString(args.sourceId, "sourceId");
      const filterType = requireString(args.filterType, "filterType");
      const operator = requireString(args.operator, "operator");
      const value = typeof args.value !== "undefined" ? JSON.stringify(args.value) : "\"\"";
      const source = await db.source.findUnique({ where: { id: sourceId } });
      if (!source || source.organizationId !== organizationId) throw new Error(`Source ${sourceId} not found`);
      const rule = await db.sourceRule.create({
        data: {
          sourceId,
          filterType,
          operator,
          value,
          position: typeof args.position === "number" ? args.position : 999,
        }
      });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "add_rule", entity: "source", entityId: sourceId, after: { filterType, operator, value } });
      return { ok: true, ruleId: rule.id };
    }

    case "update_source_rule": {
      const ruleId = requireString(args.ruleId, "ruleId");
      const rule = await db.sourceRule.findUnique({ where: { id: ruleId }, include: { source: true } });
      if (!rule || rule.source.organizationId !== organizationId) throw new Error(`Source rule ${ruleId} not found`);
      const data: any = {};
      if (typeof args.filterType === "string") data.filterType = args.filterType;
      if (typeof args.operator === "string") data.operator = args.operator;
      if (typeof args.value !== "undefined") data.value = JSON.stringify(args.value);
      if (typeof args.position === "number") data.position = args.position;
      await db.sourceRule.update({ where: { id: ruleId }, data });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "update_rule", entity: "source", entityId: rule.sourceId, before: rule, after: data });
      return { ok: true, ruleId };
    }

    case "delete_source_rule": {
      const ruleId = requireString(args.ruleId, "ruleId");
      const rule = await db.sourceRule.findUnique({ where: { id: ruleId }, include: { source: true } });
      if (!rule || rule.source.organizationId !== organizationId) throw new Error(`Source rule ${ruleId} not found`);
      await db.sourceRule.delete({ where: { id: ruleId } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "delete_rule", entity: "source", entityId: rule.sourceId, before: rule });
      return { ok: true, deletedRuleId: ruleId };
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
      const { verifyDatasetAccess } = await import("@/lib/auth");
      const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
      if (!dataset || dataset.organizationId !== organizationId) throw new Error(`Dataset ${datasetId} not found`);
      const hasAccess = await verifyDatasetAccess(dataset, organizationId, userId, "edit");
      if (!hasAccess) throw new Error(`Access denied to update dataset ${datasetId}`);

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
      const { verifyDatasetAccess } = await import("@/lib/auth");
      const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
      if (!dataset || dataset.organizationId !== organizationId) throw new Error(`Dataset ${datasetId} not found`);
      const hasAccess = await verifyDatasetAccess(dataset, organizationId, userId, "owner");
      if (!hasAccess) throw new Error(`Access denied to delete dataset ${datasetId}`);

      await db.dataset.delete({ where: { id: datasetId } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "delete", entity: "dataset", entityId: datasetId, before: { name: dataset.name } });
      // Dataset deletes are NOT undoable — records cascade-deleted permanently
      return { ok: true, deletedId: datasetId, name: dataset.name };
    }

    case "update_record_status": {
      const recordId = requireString(args.recordId, "recordId");
      const status = requireString(args.status, "status"); // "approved" | "rejected" | "needs_review"
      const { verifyDatasetAccess } = await import("@/lib/auth");
      const record = await db.datasetRecord.findUnique({ where: { id: recordId }, include: { dataset: true } });
      if (!record || record.dataset.organizationId !== organizationId) throw new Error(`Record ${recordId} not found`);
      const hasAccess = await verifyDatasetAccess(record.dataset, organizationId, userId, "edit");
      if (!hasAccess) throw new Error(`Access denied to update records in dataset ${record.datasetId}`);

      await db.datasetRecord.update({ where: { id: recordId }, data: { status } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "update_status", entity: "record", entityId: recordId, before: { status: record.status }, after: { status } });
      return { ok: true, recordId, status };
    }

    case "correct_extracted_value": {
      const valueId = requireString(args.valueId, "valueId");
      const newValue = requireString(args.newValue, "newValue");
      const { verifyDatasetAccess } = await import("@/lib/auth");
      // Find the value, ensuring the parent record and dataset belong to the user's org
      const datasetValue = await db.datasetValue.findUnique({ 
        where: { id: valueId }, 
        include: { record: { include: { dataset: true } } } 
      });
      if (!datasetValue || datasetValue.record.dataset.organizationId !== organizationId) throw new Error(`Value ${valueId} not found`);
      
      const hasAccess = await verifyDatasetAccess(datasetValue.record.dataset, organizationId, userId, "edit");
      if (!hasAccess) throw new Error(`Access denied to correct values in dataset ${datasetValue.record.datasetId}`);

      
      // Keep the original value if it's the first correction, else keep existing originalValue
      const originalValue = datasetValue.originalValue ?? datasetValue.value;
      const originalConfidence = datasetValue.originalConfidence ?? datasetValue.confidence;
      
      await db.datasetValue.update({ 
        where: { id: valueId }, 
        data: { 
          value: newValue, 
          originalValue, 
          originalConfidence,
          correctedBy: userId, 
          correctedAt: new Date(),
          confidence: 1.0 // Manual correction implies 100% confidence
        } 
      });
      // Mark record as updated
      await db.datasetRecord.update({ where: { id: datasetValue.recordId }, data: { status: "updated" } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "correct_value", entity: "record", entityId: datasetValue.recordId, before: { value: datasetValue.value }, after: { value: newValue } });
      return { ok: true, valueId, recordId: datasetValue.recordId };
    }

    case "delete_dataset_record": {
      const recordId = requireString(args.recordId, "recordId");
      const record = await db.datasetRecord.findUnique({ where: { id: recordId }, include: { dataset: true } });
      if (!record || record.dataset.organizationId !== organizationId) throw new Error(`Record ${recordId} not found`);
      await db.datasetRecord.delete({ where: { id: recordId } });
      // Update the dataset record count properly in a transaction, or rely on a DB trigger if it exists.
      // Assuming naive count for now, since this is a manual AI action.
      await db.dataset.update({ where: { id: record.datasetId }, data: { recordCount: { decrement: 1 } } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "delete", entity: "record", entityId: recordId });
      return { ok: true, deletedRecordId: recordId };
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
      // Re-push to BullMQ so it gets picked up immediately
      await enqueueJob({
        organizationId,
        type:    job.type,
        payload: job.payload ? JSON.parse(job.payload) : {},
      });
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

    case "invite_member": {
      const email = requireString(args.email, "email").toLowerCase();
      const role = typeof args.role === "string" ? args.role : "member";
      const invite = await db.invitation.create({
        data: {
          organizationId,
          email,
          role,
          token: Math.random().toString(36).slice(2),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invitedBy: userId
        }
      });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "invite", entity: "member", entityId: invite.id, after: { email, role } });
      return { ok: true, inviteId: invite.id, email, status: "sent" };
    }

    case "remove_member": {
      const memberId = requireString(args.memberId, "memberId");
      const member = await db.organizationMember.findUnique({ where: { id: memberId } });
      if (!member || member.organizationId !== organizationId) throw new Error(`Member ${memberId} not found`);
      if (member.role === "admin") {
        const adminCount = await db.organizationMember.count({ where: { organizationId, role: "admin" } });
        if (adminCount <= 1) throw new Error("Cannot remove the last admin");
      }
      await db.organizationMember.delete({ where: { id: memberId } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "remove", entity: "member", entityId: memberId });
      return { ok: true, removedMemberId: memberId };
    }

    // ── Sharing & Governance ────────────────────────────────────────────────

    case "list_sharing_requests": {
      const requests = await db.sharingRequest.findMany({
        where: { targetOrganizationId: organizationId, status: "pending" },
        include: { requester: { select: { name: true, email: true } }, dataset: { select: { name: true } } },
        take: 20
      });
      return requests.map(r => ({ id: r.id, datasetName: r.dataset?.name, requester: r.requester.email, level: r.level, reason: r.reason }));
    }

    case "approve_sharing_request": {
      const requestId = requireString(args.requestId, "requestId");
      const request = await db.sharingRequest.findUnique({ where: { id: requestId } });
      if (!request || request.targetOrganizationId !== organizationId) throw new Error(`Request ${requestId} not found`);
      
      const [updated] = await db.$transaction([
        db.sharingRequest.update({ where: { id: requestId }, data: { status: "approved", decidedBy: userId, decidedAt: new Date() } }),
        db.datasetAccess.create({
          data: {
            datasetId: request.datasetId!,
            ownerOrgId: request.organizationId,
            granteeOrgId: organizationId,
            granteeUserId: request.targetUserId,
            level: request.level
          }
        })
      ]);
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "approve_share", entity: "sharing_request", entityId: requestId });
      return { ok: true, requestId, status: updated.status };
    }

    case "reject_sharing_request": {
      const requestId = requireString(args.requestId, "requestId");
      const request = await db.sharingRequest.findUnique({ where: { id: requestId } });
      if (!request || request.targetOrganizationId !== organizationId) throw new Error(`Request ${requestId} not found`);
      await db.sharingRequest.update({ where: { id: requestId }, data: { status: "rejected", decidedBy: userId, decidedAt: new Date() } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "reject_share", entity: "sharing_request", entityId: requestId });
      return { ok: true, requestId, status: "rejected" };
    }

    case "grant_dataset_access": {
      const datasetId = requireString(args.datasetId, "datasetId");
      const granteeOrgId = args.granteeOrgId as string | undefined;
      const granteeUserId = args.granteeUserId as string | undefined;
      const level = typeof args.level === "string" ? args.level : "read";
      
      const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
      if (!dataset || dataset.organizationId !== organizationId) throw new Error(`Dataset ${datasetId} not found`);
      if (!granteeOrgId && !granteeUserId) throw new Error("Must specify granteeOrgId or granteeUserId");

      const access = await db.datasetAccess.create({
        data: {
          datasetId,
          ownerOrgId: organizationId,
          granteeOrgId,
          granteeUserId,
          level
        }
      });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "grant_access", entity: "dataset", entityId: datasetId });
      return { ok: true, accessId: access.id };
    }

    // ── Google Integrations ────────────────────────────────────────────────

    case "list_google_connections": {
      const connections = await db.googleConnection.findMany({
        where: { organizationId },
        select: { id: true, googleEmail: true, status: true, scopes: true, tokenExpiresAt: true }
      });
      return connections;
    }

    case "revoke_google_connection": {
      const connectionId = requireString(args.connectionId, "connectionId");
      const connection = await db.googleConnection.findUnique({ where: { id: connectionId } });
      if (!connection || connection.organizationId !== organizationId) throw new Error(`Connection ${connectionId} not found`);
      await db.googleConnection.update({ where: { id: connectionId }, data: { status: "revoked" } });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: "revoke", entity: "google_connection", entityId: connectionId });
      return { ok: true, connectionId, status: "revoked" };
    }

    case "export_dataset_to_sheets":
    case "sync_dataset_to_sheets": {
      const datasetId = requireString(args.datasetId, "datasetId");
      const dataset = await db.dataset.findUnique({ where: { id: datasetId } });
      if (!dataset || dataset.organizationId !== organizationId) throw new Error(`Dataset ${datasetId} not found`);
      
      const jobId = await enqueueJob({
        organizationId,
        type: "EXPORT",
        payload: { datasetId, target: "google_sheets", mode: toolName === "export_dataset_to_sheets" ? "full" : "sync" },
      });
      await logAudit({ organizationId, actorId: userId, actorType: "ai", action: toolName, entity: "dataset", entityId: datasetId });
      return { ok: true, jobId, status: "queued" };
    }

    // ── Debugging ──────────────────────────────────────────────────────────

    case "get_job_logs": {
      const jobId = requireString(args.jobId, "jobId");
      const job = await db.aiJob.findUnique({ where: { id: jobId } });
      if (!job || job.organizationId !== organizationId) throw new Error(`Job ${jobId} not found`);
      const logs = await db.agentLog.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } });
      return logs;
    }

    case "analyze_job_failure": {
      const jobId = requireString(args.jobId, "jobId");
      const job = await db.aiJob.findUnique({ where: { id: jobId } });
      if (!job || job.organizationId !== organizationId) throw new Error(`Job ${jobId} not found`);
      const logs = await db.agentLog.findMany({ where: { jobId }, orderBy: { createdAt: "desc" }, take: 50 });
      
      // Inline Gemini call to analyze logs
      const prompt = `Analyze this failed AI Job and explain exactly what went wrong in plain English.\n\nError Message:\n${job.errorMessage}\n\nRecent Agent Logs:\n${JSON.stringify(logs, null, 2)}`;
      const { callGeminiWithFallback } = await import("@/lib/gemini"); // Dynamic import to prevent circular deps if any
      const analysisResult = await callGeminiWithFallback([{ role: "user", content: prompt }], {
        system: "You are an expert platform debugger. Explain the error concisely.",
        temperature: 0.1,
        maxOutputTokens: 500
      });
      return { jobId, analysis: analysisResult.text };
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

      // Security Check: Enforce role hierarchy for AI-driven role changes
      const ROLE_LEVEL: Record<string, number> = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1 };
      const actorMembership = await db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } }
      });
      if (!actorMembership || actorMembership.status !== "active") throw new Error("Actor is not an active member");
      
      const actorLevel = ROLE_LEVEL[actorMembership.role] ?? 0;
      if (actorLevel < ROLE_LEVEL.manager) throw new Error("Only managers and above can change roles.");

      // Find the target user
      const targetUser = await db.user.findUnique({ where: { email: targetEmail } });
      if (!targetUser) throw new Error(`No user found with email "${targetEmail}"`);

      // Find their membership in this org
      const membership = await db.organizationMember.findFirst({
        where: { organizationId, userId: targetUser.id, status: "active" },
      });
      if (!membership) throw new Error(`"${targetEmail}" is not an active member of this organization`);

      const targetLevel = ROLE_LEVEL[membership.role] ?? 0;
      const newLevel = ROLE_LEVEL[newRole] ?? 0;

      if (userId === targetUser.id) {
        if (newLevel > targetLevel) throw new Error("You cannot promote yourself.");
      } else {
        if (actorLevel <= targetLevel && membership.role !== "viewer") throw new Error(`You cannot modify the role of a ${membership.role}`);
        if (actorLevel < newLevel) throw new Error(`You cannot grant a role higher than your own (${actorMembership.role})`);
      }

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





