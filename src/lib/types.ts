// Workspace Intelligence Platform — shared domain types
// Mirrors the plan's REST contract but adapted to a single-page App Router app.

export type ViewId =
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
  | "DRIVE_SCAN"
  | "SHEETS_SCAN"
  | "DOCS_SCAN"
  | "FORMS_SCAN"
  | "EMAIL_PARSE"
  | "ATTACHMENT_PROCESS"
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
  notificationPrefs: Record<string, boolean>;
  twoFactorEnabled?: boolean;
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
  userRole?: string;
  retentionEmails?: string;
  retentionDocs?: string;
  retentionAuditLogs?: string;
  exportFileExpiry?: string;
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
  validation: Record<string, unknown> | null;
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
  metadata: Record<string, unknown> | null;
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
  maxEmailsPerScan: number;
  config?: string | null;
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
  recordId?: string;
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
  sourceName?: string | null;
  sourceSubject?: string | null;
  status: RecordStatus;
  confidence: number;
  createdAt: string;
  values: DatasetValueDTO[];
}

export interface DatasetColumnDefDTO {
  columnId: string;
  name: string;
  dataType: string;
  required: boolean;
  position: number;
}

export interface DatasetDTO {
  id: string;
  organizationId: string;
  schemaId: string | null;
  schema?: SchemaDTO | null;
  columnDefs?: DatasetColumnDefDTO[];
  name: string;
  description: string | null;
  recordCount: number;
  isDefault: boolean;
  createdAt: string;
  sourceId?: string | null;
  // Sharing metadata (populated when dataset comes from a DatasetAccess grant)
  accessLevel?: "owner" | "read" | "comment" | "edit";
  isShared?: boolean;
  ownerOrgName?: string;
  ownerOrgId?: string;
  // Google Sheets sync metadata (populated when dataset is linked)
  sheetMappingId?: string | null;
  syncStatus?: string | null;
  lastSyncAt?: string | null;
  pendingConflicts?: number;
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
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  rawResponse: string | null;
  createdAt: string;
}

export interface SharingRequestDTO {
  id: string;
  organizationId: string;
  datasetId: string | null;
  datasetName?: string | null;
  requestedBy: string;
  requesterName?: string;
  requesterEmail?: string;
  status: string;
  level: string;
  reason: string | null;
  targetOrganizationId: string | null;
  targetOrganizationName?: string | null;
  targetUserId: string | null;
  targetEmail?: string | null;
  direction: string;
  shareType: string;
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

export interface DatasetAccessDTO {
  id: string;
  datasetId: string;
  datasetName?: string;
  ownerOrgId: string;
  ownerOrgName?: string;
  granteeOrgId: string | null;
  granteeOrgName?: string | null;
  granteeUserId: string | null;
  granteeUserEmail?: string | null;
  granteeUserName?: string | null;
  level: string;
  status: string;
  isPaused: boolean;
  fieldScope: Record<string, unknown> | null;
  rowFilter: Record<string, unknown> | null;
  sourceRequestId: string | null;
  createdAt: string;
}

export interface InvitationDTO {
  id: string;
  organizationId: string;
  organizationName?: string;
  email: string;
  role: string;
  token: string;
  invitedBy: string;
  inviterName?: string;
  status: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface AgentLogDTO {
  id: string;
  jobId: string;
  organizationId: string;
  agentKey: string;
  level: string;
  message: string;
  metadata: Record<string, unknown> | null;
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
  entityName?: string | null;
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
  pendingSharingRequests?: SharingRequestDTO[];
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
  promptTokens: number;
  completionTokens: number;
  overallConfidence: number;
  reviewFlags?: FieldReviewFlag[];
  fieldsNeedingReview?: number;
}
