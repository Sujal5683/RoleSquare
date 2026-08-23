// Workspace Intelligence Platform — shared domain types
// Mirrors the plan's REST contract but adapted to a single-page App Router app.

export type ViewId =
  | "landing"
  | "dashboard"
  | "sources"
  | "source-builder"
  | "datasets"
  | "dataset-detail"
  | "schema-builder"
  | "ai-studio"
  | "usage"
  | "organizations"
  | "members"
  | "sharing"
  | "audit"
  | "settings"
  | "invitations";

export type Role = "owner" | "admin" | "manager" | "member" | "viewer";
export type Plan = "free" | "team" | "enterprise";

export type SourceType = "gmail" | "drive" | "docs" | "sheets" | "forms";
export type SourceStatus = "active" | "paused" | "idle" | "error";
export type RunState = "idle" | "scanning" | "parsing" | "extracting" | "validating";

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "enum"
  | "array"
  | "multiselect";

export type JobType =
  | "GMAIL_SCAN"
  | "EMAIL_PARSE"
  | "ATTACHMENT_PROCESS"
  | "DRIVE_DISCOVERY"
  | "DOCUMENT_PARSE"
  | "AI_EXTRACTION"
  | "AI_VALIDATION"
  | "EXPORT";

export type JobStatus = "queued" | "running" | "success" | "failed" | "retry" | "dlq" | "cancelled";

export type RecordStatus =
  | "valid"
  | "needs_review"
  | "rejected"
  | "approved"
  | "updated";

export type ConnectionStatus = "active" | "expired" | "revoked" | "degraded";

// ── DTOs ────────────────────────────────────────────────────────────────

export interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
}

export interface OrganizationDTO {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  createdBy: string;
  createdAt: string;
  memberCount?: number;
  userStatus?: string;
}

export interface MemberDTO {
  id: string;
  userId: string;
  role: Role;
  status: string;
  user: UserDTO;
  createdAt: string;
}

export interface GoogleConnectionDTO {
  id: string;
  googleEmail: string;
  scopes: string[];
  status: ConnectionStatus;
  watchExpiresAt: string | null;
  lastSyncAt: string | null;
  organizationId: string | null;
}

export interface SchemaFieldDTO {
  id: string;
  name: string;
  type: FieldType;
  description: string | null;
  instructions: string | null;
  required: boolean;
  options: string[] | null;
  position: number;
  confidenceThreshold: number;
}

export interface SchemaDTO {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  version: number;
  promptTemplate: string | null;
  isDefault: boolean;
  fields: SchemaFieldDTO[];
  createdAt: string;
}

export interface SourceRuleDTO {
  id: string;
  filterType: string;
  operator: string;
  value: unknown;
  position: number;
}

export interface SourceDTO {
  id: string;
  organizationId: string;
  ownerUserId: string;
  googleConnectionId: string;
  googleConnection?: GoogleConnectionDTO;
  schemaId: string | null;
  schema?: SchemaDTO | null;
  datasetId: string | null;
  dataset?: { id: string; name: string } | null;
  name: string;
  description: string | null;
  sourceType: SourceType;
  status: SourceStatus;
  runState: RunState;
  scheduleMode: string;
  scheduleExpr: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  rules?: SourceRuleDTO[];
  createdAt: string;
}

export interface SourceRunDTO {
  id: string;
  sourceId: string;
  status: string;
  mode: string;
  progress: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  stats: Record<string, number>;
}

export interface DatasetValueDTO {
  id: string;
  fieldId: string;
  fieldName?: string;
  fieldType?: FieldType;
  value: unknown;
  originalValue: unknown | null;
  originalConfidence: number | null;
  confidence: number;
  evidence: string;
  sourceFile: string | null;
  pageNumber: number | null;
  modelUsed: string;
  promptVersion: string;
  extractedAt: string;
  correctedAt: string | null;
  correctedBy: string | null;
}

export interface DatasetRecordDTO {
  id: string;
  datasetId: string;
  sourceEmailId: string | null;
  status: RecordStatus;
  confidence: number;
  createdAt: string;
  values: DatasetValueDTO[];
}

export interface DatasetDTO {
  id: string;
  organizationId: string;
  schemaId: string | null;
  schema?: SchemaDTO | null;
  name: string;
  description: string | null;
  recordCount: number;
  isDefault: boolean;
  createdAt: string;
  sourceId?: string | null;
}

export interface AiJobDTO {
  id: string;
  organizationId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  attempts: number;
  payload: Record<string, unknown>;
  errorMessage: string | null;
  result: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface AiOutputDTO {
  id: string;
  jobId: string;
  modelUsed: string;
  promptHash: string;
  tokensUsed: number;
  createdAt: string;
}

export interface SharingRequestDTO {
  id: string;
  organizationId: string;
  datasetId: string | null;
  datasetName?: string | null;
  requestedBy: string;
  requesterName?: string;
  status: string;
  level: string;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface SharingPermissionDTO {
  id: string;
  datasetId: string;
  datasetName?: string;
  organizationId: string;
  organizationName?: string;
  level: string;
  fieldScope: Record<string, unknown> | null;
  rowFilter: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogDTO {
  id: string;
  organizationId: string;
  actorType: string;
  actorId: string | null;
  actorName?: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

export interface UsageMetricDTO {
  id: string;
  metricType: string;
  value: number;
  periodStart: string;
  periodEnd: string;
}

export interface DashboardData {
  kpis: {
    connectedAccounts: number;
    activeSources: number;
    recordsExtracted: number;
    reviewQueue: number;
    aiJobsRunning: number;
    aiJobsFailed: number;
  };
  recentRuns: SourceRunDTO[];
  reviewQueue: DatasetRecordDTO[];
  recentDatasets: DatasetDTO[];
  queueHealth: { type: string; count: number; status: string }[];
  usageMetrics: UsageMetricDTO[];
  connectionAlerts: GoogleConnectionDTO[];
}

// ── AI Extraction Contract ──────────────────────────────────────────────

export interface ExtractionFieldResult {
  fieldName: string;
  value: unknown;
  confidence: number;
  evidence: string;
  sourceFile?: string;
  pageNumber?: number;
}

export interface FieldReviewFlag {
  fieldName: string;
  confidence: number;
  threshold: number;
  needsReview: boolean;
  reason: string;
}

export interface ExtractionResult {
  fields: ExtractionFieldResult[];
  modelUsed: string;
  promptVersion: string;
  tokensUsed: number;
  overallConfidence: number;
  reviewFlags?: FieldReviewFlag[];
  fieldsNeedingReview?: number;
}
