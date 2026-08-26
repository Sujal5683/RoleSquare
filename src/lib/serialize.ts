// Workspace Intelligence Platform — serialization helpers.
//
// Converts Prisma records into DTOs that match the shared types in
// `src/lib/types.ts`. Responsibilities:
//   - serialize Date → ISO string
//   - parse JSON-encoded String fields (scopes, value, options, payload,
//     result, before, after, fieldScope, rowFilter, stats, config) into
//     proper JS objects, gracefully handling invalid JSON
//
// All serializers are pure functions — safe to call inside or outside a
// Prisma transaction.

import type {
  UserDTO,
  OrganizationDTO,
  MemberDTO,
  GoogleConnectionDTO,
  SchemaFieldDTO,
  SchemaDTO,
  SourceRuleDTO,
  SourceDTO,
  SourceRunDTO,
  DatasetValueDTO,
  DatasetRecordDTO,
  DatasetDTO,
  AiJobDTO,
  AiOutputDTO,
  SharingRequestDTO,
  SharingPermissionDTO,
  DatasetAccessDTO,
  InvitationDTO,
  AgentLogDTO,
  AuditLogDTO,
  UsageMetricDTO,
} from "@/lib/types";

/** Parse a JSON string field, returning `fallback` on failure or null. */
export function parseJson<T = unknown>(
  raw: string | null | undefined,
  fallback: T
): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Parse a CSV-style scope string ("gmail.readonly,drive.metadata.readonly"). */
function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // If the scopes field was stored as a JSON array, prefer that.
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const parsed = parseJson<string[]>(raw, []);
    return parsed;
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeUser(u: any): UserDTO {
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    avatarUrl: u.avatarUrl ?? null,
    role: u.role,
  };
}

export function serializeOrganization(
  o: any,
  memberCount?: number
): OrganizationDTO {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    plan: o.plan,
    createdBy: o.createdBy,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    ...(memberCount !== undefined ? { memberCount } : {}),
  };
}

export function serializeMember(m: any): MemberDTO {
  return {
    id: m.id,
    userId: m.userId,
    role: m.role,
    status: m.status,
    user: serializeUser(m.user),
    createdAt:
      m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  };
}

export function serializeGoogleConnection(c: any): GoogleConnectionDTO {
  return {
    id: c.id,
    googleEmail: c.googleEmail,
    scopes: parseScopes(c.scopes),
    status: c.status,
    watchExpiresAt:
      c.watchExpiresAt instanceof Date
        ? c.watchExpiresAt.toISOString()
        : (c.watchExpiresAt ?? null),
    lastSyncAt:
      c.lastSyncAt instanceof Date
        ? c.lastSyncAt.toISOString()
        : (c.lastSyncAt ?? null),
    organizationId: c.organizationId ?? null,
  };
}

export function serializeSchemaField(f: any): SchemaFieldDTO {
  return {
    id: f.id,
    name: f.name,
    type: f.type,
    description: f.description ?? null,
    instructions: f.instructions ?? null,
    required: !!f.required,
    options: f.options ? parseJson<string[] | null>(f.options, null) : null,
    validation: f.validation ? parseJson<Record<string, unknown> | null>(f.validation, null) : null,
    position: f.position,
    confidenceThreshold: f.confidenceThreshold ?? 0.7,
  };
}

export function serializeSchema(s: any): SchemaDTO {
  return {
    id: s.id,
    organizationId: s.organizationId,
    name: s.name,
    description: s.description ?? null,
    version: s.version,
    promptTemplate: s.promptTemplate ?? null,
    fields: Array.isArray(s.fields) ? s.fields.map(serializeSchemaField) : [],
    createdAt:
      s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    isDefault: !!s.isDefault,
  };
}

export function serializeSourceRule(r: any): SourceRuleDTO {
  return {
    id: r.id,
    filterType: r.filterType,
    operator: r.operator,
    value: parseJson(r.value, r.value),
    metadata: r.metadata ? parseJson<Record<string, unknown>>(r.metadata, {}) : null,
    position: r.position,
  };
}

export function serializeSource(s: any): SourceDTO {
  return {
    id: s.id,
    organizationId: s.organizationId,
    ownerUserId: s.ownerUserId,
    googleConnectionId: s.googleConnectionId,
    googleConnection: s.googleConnection
      ? serializeGoogleConnection(s.googleConnection)
      : undefined,
    schemaId: s.schemaId ?? null,
    schema: s.schema ? serializeSchema(s.schema) : s.schemaId ? null : null,
    datasetId: s.datasetId ?? null,
    dataset: s.dataset
      ? { id: s.dataset.id, name: s.dataset.name }
      : s.datasetId
        ? null
        : null,
    name: s.name,
    description: s.description ?? null,
    sourceType: s.sourceType,
    status: s.status,
    runState: s.runState,
    scheduleMode: s.scheduleMode,
    scheduleExpr: s.scheduleExpr,
    maxEmailsPerScan: s.maxEmailsPerScan ?? 100,
    lastRunAt:
      s.lastRunAt instanceof Date ? s.lastRunAt.toISOString() : (s.lastRunAt ?? null),
    nextRunAt:
      s.nextRunAt instanceof Date ? s.nextRunAt.toISOString() : (s.nextRunAt ?? null),
    rules: Array.isArray(s.rules) ? s.rules.map(serializeSourceRule) : undefined,
    createdAt:
      s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  };
}

export function serializeSourceRun(r: any): SourceRunDTO {
  return {
    id: r.id,
    sourceId: r.sourceId,
    status: r.status,
    mode: r.mode,
    progress: r.progress,
    startedAt:
      r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
    finishedAt:
      r.finishedAt instanceof Date
        ? r.finishedAt.toISOString()
        : (r.finishedAt ?? null),
    errorMessage: r.errorMessage ?? null,
    stats: parseJson<Record<string, number>>(r.stats, {}),
  };
}

export function serializeDatasetValue(v: any): DatasetValueDTO {
  return {
    id: v.id,
    fieldId: v.fieldId,
    fieldName: v.field?.name,
    fieldType: v.field?.type,
    value: parseJson(v.value, v.value),
    originalValue: v.originalValue ? parseJson(v.originalValue, v.originalValue) : null,
    originalConfidence: v.originalConfidence ?? null,
    confidence: v.confidence,
    evidence: v.evidence,
    sourceFile: v.sourceFile ?? null,
    pageNumber: v.pageNumber ?? null,
    modelUsed: v.modelUsed,
    promptVersion: v.promptVersion,
    extractedAt:
      v.extractedAt instanceof Date
        ? v.extractedAt.toISOString()
        : v.extractedAt,
    correctedAt:
      v.correctedAt instanceof Date
        ? v.correctedAt.toISOString()
        : (v.correctedAt ?? null),
    correctedBy: v.correctedBy ?? null,
  };
}

export function serializeDatasetRecord(r: any): DatasetRecordDTO {
  return {
    id: r.id,
    datasetId: r.datasetId,
    sourceEmailId: r.sourceEmailId ?? null,
    sourceName: r.sourceName ?? null,
    sourceSubject: r.sourceSubject ?? null,
    status: r.status,
    confidence: r.confidence,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    values: Array.isArray(r.values) ? r.values.map(serializeDatasetValue) : [],
  };
}

export function serializeDataset(d: any): DatasetDTO {
  // Resolve the first active SheetMapping if eager-loaded
  const mapping = d.sheetMappings?.find?.(
    (m: any) => m.status !== "unlinked"
  );

  return {
    id: d.id,
    organizationId: d.organizationId,
    schemaId: d.schemaId ?? null,
    schema: d.schema ? serializeSchema(d.schema) : null,
    columnDefs: Array.isArray(d.columnDefs) ? d.columnDefs.map((c: any) => ({
      columnId: c.columnId,
      name: c.name,
      dataType: c.dataType,
      required: c.required,
      position: c.position,
    })) : undefined,
    name: d.name,
    description: d.description ?? null,
    recordCount: d.recordCount,
    createdAt:
      d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
    isDefault: !!d.isDefault,
    sourceId: d.sources?.[0]?.id ?? null,
    // Google Sheets fields (only populated when mapping is included)
    sheetMappingId: mapping?.id ?? null,
    syncStatus: mapping?.status ?? null,
    lastSyncAt: mapping?.syncState?.lastSyncAt instanceof Date
      ? mapping.syncState.lastSyncAt.toISOString()
      : (mapping?.syncState?.lastSyncAt ?? null),
    pendingConflicts: mapping?._count?.syncConflicts ?? 0,
  };
}

export function serializeAiJob(j: any): AiJobDTO {
  return {
    id: j.id,
    organizationId: j.organizationId,
    type: j.type,
    status: j.status,
    progress: j.progress,
    attempts: j.attempts,
    payload: parseJson<Record<string, unknown>>(j.payload, {}),
    errorMessage: j.errorMessage ?? null,
    result: j.result
      ? parseJson<Record<string, unknown> | null>(j.result, null)
      : null,
    startedAt:
      j.startedAt instanceof Date
        ? j.startedAt.toISOString()
        : (j.startedAt ?? null),
    finishedAt:
      j.finishedAt instanceof Date
        ? j.finishedAt.toISOString()
        : (j.finishedAt ?? null),
    createdAt:
      j.createdAt instanceof Date ? j.createdAt.toISOString() : j.createdAt,
  };
}

export function serializeAiOutput(o: any): AiOutputDTO {
  return {
    id: o.id,
    jobId: o.jobId,
    modelUsed: o.modelUsed,
    promptHash: o.promptHash,
    tokensUsed: o.tokensUsed,
    promptTokens: o.promptTokens ?? 0,
    completionTokens: o.completionTokens ?? 0,
    costUsd: o.costUsd ?? 0,
    rawResponse: o.rawResponse ?? null,
    createdAt:
      o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
  };
}

export function serializeSharingRequest(
  r: any
): SharingRequestDTO {
  return {
    id: r.id,
    organizationId: r.organizationId,
    datasetId: r.datasetId ?? null,
    datasetName: r.dataset?.name ?? null,
    requestedBy: r.requestedBy,
    requesterName: r.requester?.name ?? null,
    requesterEmail: r.requester?.email ?? null,
    status: r.status,
    level: r.level,
    reason: r.reason ?? null,
    targetOrganizationId: r.targetOrganizationId ?? null,
    targetOrganizationName: r.targetOrganization?.name ?? null,
    targetUserId: r.targetUserId ?? null,
    targetEmail: r.targetEmail ?? null,
    direction: r.direction ?? "outgoing",
    shareType: r.shareType ?? "request",
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    decidedAt:
      r.decidedAt instanceof Date
        ? r.decidedAt.toISOString()
        : (r.decidedAt ?? null),
  };
}

export function serializeSharingPermission(
  p: any
): SharingPermissionDTO {
  return {
    id: p.id,
    datasetId: p.datasetId,
    datasetName: p.dataset?.name,
    organizationId: p.organizationId,
    organizationName: p.organization?.name,
    level: p.level,
    fieldScope: p.fieldScope
      ? parseJson<Record<string, unknown> | null>(p.fieldScope, null)
      : null,
    rowFilter: p.rowFilter
      ? parseJson<Record<string, unknown> | null>(p.rowFilter, null)
      : null,
    createdAt:
      p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

/** Recursively removes properties whose keys match exactly 'id' or end in 'Id' (case-insensitive). */
export function sanitizeSensitiveIds(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeSensitiveIds);
  }
  if (obj !== null && typeof obj === "object") {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (lower === "id" || lower.endsWith("id")) {
        continue;
      }
      sanitized[key] = sanitizeSensitiveIds(value);
    }
    return sanitized;
  }
  return obj;
}

export function serializeAuditLog(a: any): AuditLogDTO {
  const beforeObj = a.before ? parseJson<Record<string, unknown> | null>(a.before, null) : null;
  const afterObj = a.after ? parseJson<Record<string, unknown> | null>(a.after, null) : null;
  
  const entityName = (afterObj?.name as string) || (beforeObj?.name as string) || (afterObj?.title as string) || (beforeObj?.title as string) || null;

  return {
    id: a.id,
    organizationId: a.organizationId,
    actorType: a.actorType,
    actorId: a.actorId ?? null,
    actorName: a.actor?.name || a.actor?.email || null,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId ?? null,
    entityName: entityName,
    before: beforeObj ? sanitizeSensitiveIds(beforeObj) : null,
    after: afterObj ? sanitizeSensitiveIds(afterObj) : null,
    reason: a.reason ?? null,
    createdAt:
      a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  };
}

export function serializeUsageMetric(u: any): UsageMetricDTO {
  return {
    id: u.id,
    metricType: u.metricType,
    value: u.value,
    periodStart:
      u.periodStart instanceof Date
        ? u.periodStart.toISOString()
        : u.periodStart,
    periodEnd:
      u.periodEnd instanceof Date ? u.periodEnd.toISOString() : u.periodEnd,
  };
}

/** Builds an ISO date offset from now (e.g. +7d). */
export function offsetDate(days: number, from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

// Note: CrossOrgPermission table replaced by DatasetAccess — use serializeDatasetAccess instead.


export function serializeAgentLog(l: any): AgentLogDTO {
  return {
    id: l.id,
    jobId: l.jobId,
    organizationId: l.organizationId,
    agentKey: l.agentKey,
    level: l.level,
    message: l.message,
    metadata: l.metadata ? parseJson<Record<string, unknown>>(l.metadata, {}) : null,
    createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
  };
}

export function serializeDatasetAccess(a: any): DatasetAccessDTO {
  return {
    id: a.id,
    datasetId: a.datasetId,
    datasetName: a.dataset?.name ?? undefined,
    ownerOrgId: a.ownerOrgId,
    ownerOrgName: a.ownerOrg?.name ?? undefined,
    granteeOrgId: a.granteeOrgId ?? null,
    granteeOrgName: a.granteeOrg?.name ?? null,
    granteeUserId: a.granteeUserId ?? null,
    granteeUserEmail: a.granteeUser?.email ?? null,
    granteeUserName: a.granteeUser?.name ?? null,
    level: a.level,
    status: a.status,
    isPaused: Boolean(a.isPaused),
    fieldScope: a.fieldScope ? parseJson<Record<string, unknown>>(a.fieldScope, {}) : null,
    rowFilter: a.rowFilter ? parseJson<Record<string, unknown>>(a.rowFilter, {}) : null,
    sourceRequestId: a.sourceRequestId ?? null,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  };
}

export function serializeInvitation(i: any): InvitationDTO {
  return {
    id: i.id,
    organizationId: i.organizationId,
    organizationName: i.organization?.name ?? undefined,
    email: i.email,
    role: i.role,
    token: i.token,
    invitedBy: i.invitedBy,
    inviterName: i.inviter?.name ?? undefined,
    status: i.status,
    expiresAt: i.expiresAt instanceof Date ? i.expiresAt.toISOString() : i.expiresAt,
    acceptedAt: i.acceptedAt instanceof Date
      ? i.acceptedAt.toISOString()
      : (i.acceptedAt ?? null),
    createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
  };
}

// ── Schema field attachment helpers ────────────────────────────────────
//
// `DatasetValue` has no Prisma relation to `SchemaField` (only `fieldId`).
// Use these helpers to attach the field metadata after loading values so
// the serializer can populate `fieldName` / `fieldType`.

export function fieldsByIdMap(fields: any[]): Map<string, any> {
  return new Map((fields ?? []).map((f) => [f.id, f]));
}

export function attachFieldInfo(value: any, fieldsById: Map<string, any>): any {
  if (!value) return value;
  return { ...value, field: fieldsById.get(value.fieldId) ?? null };
}

export function attachFieldsToValues(
  values: any[],
  fieldsById: Map<string, any>
): any[] {
  return (values ?? []).map((v) => attachFieldInfo(v, fieldsById));
}

export function attachFieldsToRecords(
  records: any[],
  fieldsById: Map<string, any>
): any[] {
  return (records ?? []).map((r) => ({
    ...r,
    values: attachFieldsToValues(r.values ?? [], fieldsById),
  }));
}

/**
 * Builds a fieldId→column map from DatasetColumnDef rows.
 * This is the preferred way to resolve fieldId in the dataset detail view,
 * since DatasetColumnDef is the per-dataset source of truth (independent of schema).
 */
export function columnsByIdMap(columnDefs: any[]): Map<string, any> {
  return new Map((columnDefs ?? []).map((c) => [c.columnId, {
    id: c.columnId,
    name: c.name,
    type: c.dataType,
    required: c.required,
    options: c.options ? parseJson<string[]>(c.options, []) : null,
    position: c.position,
  }]));
}

/**
 * Merges schema field map with dataset column def map.
 * DatasetColumnDef takes precedence over SchemaField for name/type resolution.
 * This ensures that even if a SchemaField is deleted, values referencing
 * its ID still display correctly via the DatasetColumnDef snapshot.
 */
export function mergedFieldsMap(
  schemaFields: any[],
  columnDefs: any[]
): Map<string, any> {
  // Start with schema fields as base
  const base = fieldsByIdMap(schemaFields);
  // Override with column defs (which are dataset-local and more authoritative)
  for (const col of (columnDefs ?? [])) {
    base.set(col.columnId, {
      id: col.columnId,
      name: col.name,
      type: col.dataType,
      required: col.required,
      options: col.options ? parseJson<string[]>(col.options, []) : null,
      position: col.position,
    });
  }
  return base;
}
