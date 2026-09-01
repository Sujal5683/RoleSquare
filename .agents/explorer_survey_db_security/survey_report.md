# Database, Supabase RLS, Async & Security Survey Report

**Date**: 2026-09-01  
**Target Repository**: `c:\CDS IIT JMU` (RoleSquare / Workspace Intelligence Platform)  
**Investigator**: Explorer 3 (Database, Supabase RLS, Async & Security Specialist)

---

## Executive Summary

RoleSquare is a multi-tenant, AI-native SaaS platform designed to extract, structure, and synchronize data from Google Workspace (Gmail, Drive, Docs, Sheets, Forms) into evidence-backed datasets.

### Key Architectural Characteristics
- **Database Layer**: PostgreSQL managed via Prisma ORM (`@prisma/client` v6.11.1), with connection pooling (PgBouncer) via Supabase Pooler. 43 Prisma models defined in `prisma/schema.prisma`.
- **Supabase Integration**: Used strictly for session management / JWT auth tokens via `@supabase/ssr` (Edge Middleware + Server Client). No direct PostgREST table access is utilized in application code; all CRUD operations route through Prisma.
- **Async & Background Jobs**: Dual-layer architecture:
  1. Standalone BullMQ worker (`worker.ts`) processing jobs from Redis with concurrency = 7, exponential backoff, DLQ handling, and a native HTTP health check server (port 8080).
  2. Fan-out job pattern (`AI_EXTRACTION` -> `EXTRACT_SINGLE_ROW`) with multimodal Google Gemini AI fallback chain (5 models).
- **Security & RBAC**: 5-tier role hierarchy (`owner`, `admin`, `manager`, `member`, `viewer`), strict tenant scoping (`requireOrgContext`, `requireRole`, `requireExplicitOrg`), unified dataset sharing (`DatasetAccess`), and AES-256-GCM encryption for Google OAuth tokens and AI assistant chat messages.

---

## 1. Database Schema & Tables Inventory

The schema is defined in `prisma/schema.prisma` (1043 lines) and migrated via `prisma/migrations/20260823122632_add_dataset_access_invitation_models/migration.sql`.

### Complete Table Inventory (43 Models)

| Domain | Table Name | Purpose & Primary Keys / Relations | Key Constraints & Indexes |
| :--- | :--- | :--- | :--- |
| **Identity & Access** | `User` | User profile, global role, plan, 2FA secret | `id` (cuid PK), `email` (unique) |
| | `Organization` | Tenant entity, plan, retention policies | `id` (cuid PK), `slug` (unique) |
| | `OrganizationMember` | User membership, role, status (`active`/`invited`/`removed`) | Unique `(organizationId, userId)` |
| | `ApiKey` | Org API keys with SHA-256 hash | `id` PK, `keyHash` (unique), index `organizationId` |
| | `Invitation` | Tokenized team invitations with 7-day TTL | Unique `(organizationId, email)`, `token` (unique) |
| **Integrations** | `GoogleConnection` | Gmail/Drive OAuth tokens (AES-256-GCM encrypted) | Index `userId`, `organizationId` |
| | `GoogleSheetsAccount` | Google Sheets OAuth accounts (separate scopes) | Unique `(organizationId, googleEmail)` |
| | `SpreadsheetConnection` | Linked Google Spreadsheets (Drive files) | Unique `(organizationId, spreadsheetId)` |
| | `SheetMapping` | Tab-to-dataset binding, schema fingerprint | Index `organizationId`, `datasetId` |
| | `DatasetRowExternalId` | Stable UUID mapping between DatasetRecord and Sheet row | Unique `(sheetMappingId, externalId)`, Unique `recordId` |
| **Data Ingestion** | `Source` | Ingestion source (gmail/drive/docs/sheets/forms) | Index `organizationId`, `ownerUserId` |
| | `SourceRule` | Filtering criteria (sender, subject, date, links) | Index `sourceId` |
| | `SourceRun` | Historical & incremental scan execution logs | Index `sourceId`, `status` |
| | `Email` | Scanned email metadata, deduplication hash | Unique `(sourceId, googleMessageId)`, index `receivedAt` |
| | `EmailAttachment` | Discovered attachments metadata & storage path | Index `emailId` |
| | `EmailLink` | Discovered URLs & resource references | Index `emailId` |
| | `Document` | Extracted documents (PDF, DOCX, etc.) | Index `(sourceType, sourceId)` |
| | `DocumentChunk` | Chunked content for RAG / retrieval | Index `documentId` |
| **Schemas & Datasets** | `Schema` | Extraction schemas, prompt templates, version | Index `organizationId` |
| | `SchemaField` | Schema attributes, validation rules, confidence thresholds | Index `schemaId` |
| | `Dataset` | Structured datasets (default / custom) | Index `organizationId` |
| | `DatasetColumnDef` | Authoritative column definitions with stable columnId | Unique `(datasetId, columnId)` |
| | `DatasetSchemaVersion` | Immutable version snapshots of dataset column schemas | Unique `(datasetId, version)` |
| | `DatasetRecord` | Extracted records, review status, overall confidence | Index `datasetId`, `status` |
| | `DatasetValue` | Evidence-backed cell values, AI model & confidence, human edits | Index `recordId`, `fieldId` |
| **AI & Jobs** | `AiJob` | BullMQ/Postgres job tracking, status, attempts, payloads | Index `organizationId`, `status`, `type` |
| | `AiOutput` | Model usage, prompt hash, raw response, tokens, cost USD | Index `jobId` |
| | `AgentLog` | Structured AI agent logs (extractor/validator/analyst/assistant) | Index `jobId`, `(organizationId, agentKey)`, `createdAt` |
| **Governance & Sharing** | `SharingRequest` | Cross-org or user-to-user share requests | Index `organizationId`, `targetOrganizationId`, `targetEmail` |
| | `SharingPermission` | Legacy sharing permission mapping | Index `datasetId`, `organizationId` |
| | `CrossOrgPermission` | Legacy cross-org permissions | Index `datasetId`, `ownerOrganizationId` |
| | `DatasetAccess` | Unified dataset access grants (org-to-org, user-to-user) | Index `datasetId`, `ownerOrgId`, `granteeOrgId`, `granteeUserId` |
| | `AuditLog` | Comprehensive audit trail (actor, action, before/after JSON) | Index `organizationId`, `(entity, entityId)` |
| | `UsageMetric` | Monthly token, record, email, and export consumption | Index `(organizationId, metricType)` |
| | `Webhook` | Outbound webhooks with event filters and signature secret | Index `organizationId` |
| **Sheets Sync & Import** | `SyncState` | Continuous sync configuration, schedule, conflict counts | Unique `sheetMappingId` |
| | `SyncEvent` | Historical sync run execution logs | Index `sheetMappingId`, `status`, `startedAt` |
| | `SyncConflict` | Cell-level edit conflicts (app vs sheet) | Index `(sheetMappingId, status)`, `recordId` |
| | `ImportJob` | One-time sheet import execution tracking | Index `organizationId`, `status` |
| | `ImportMapping` | Column-to-column import mappings | Index `importJobId` |
| **Billing & AI Studio** | `Invoice` | Billing invoices, amounts, status | Index `organizationId` |
| | `AssistantSession` | AI assistant chat session history (7-day TTL, encrypted) | Index `userId`, `organizationId`, `(userId, organizationId)`, `expiresAt` |
| | `AssistantMessage` | AI assistant turns (AES-256-GCM encrypted content & toolResult) | Index `sessionId`, `(sessionId, position)` |

---

## 2. Supabase Configuration, RLS, Functions & Triggers Analysis

### Supabase Client Wiring
1. **Edge Middleware (`src/middleware.ts`)**:
   - Uses `createServerClient` from `@supabase/ssr`.
   - Protects all routes except `PUBLIC_PATHS` (`/login`, `/api/auth/callback`, `/api/google/callback`, `/api/google-sheets/auth/callback`, `/api/health`, `/api/debug-error`, `/api/jobs/process`, `/api/cron`, static assets).
   - Validates session using local JWT signature check `supabase.auth.getSession()` and refreshes auth cookies.
2. **Server Client (`src/lib/supabase/server.ts`)**:
   - Initialized per-request using Next.js `cookies()`.
3. **Database Connection (`src/lib/db.ts`)**:
   - Uses Prisma Client.
   - Automatically patches Supabase connection pooler URLs to enforce `?pgbouncer=true` to prevent PostgreSQL error `42P05` (prepared statement already exists) on serverless platforms.

### Row Level Security (RLS) Status
- **Status in Database**: **ABSENT (0 RLS policies)**.
- **Evidence**:
  - `supabase/migrations/` is completely empty.
  - `prisma/migrations/20260823122632_add_dataset_access_invitation_models/migration.sql` creates standard PostgreSQL tables, foreign keys, and indexes without issuing `ALTER TABLE <Table> ENABLE ROW LEVEL SECURITY;`.
  - No database triggers, stored procedures, or `auth.uid()` security functions exist in PostgreSQL.
- **Architectural Reality**:
  - Security and multi-tenant isolation are implemented **100% at the application layer** in Next.js API routes (`src/lib/auth.ts`, `src/lib/dataset-access.ts`).
  - **Risk**: If PostgREST API is accessible via Supabase with `NEXT_PUBLIC_SUPABASE_ANON_KEY`, tables in the `public` schema could be queried directly bypassing application-level checks unless public table grants are revoked or RLS is enabled.

---

## 3. AI Studio Integrations, Async Tasks & Job Queue Survey

### Gemini Multi-Model Fallback Chain (`src/lib/gemini.ts`)
- **Model Chain (Priority Order)**:
  1. `gemini-3.5-flash` (Primary)
  2. `gemini-3.1-flash-lite` (Fallback 1)
  3. `gemini-3.7-flash` (Fallback 2)
  4. `gemini-3.6-flash` (Fallback 3)
  5. `gemini-3.5-flash-lite` (Fallback 4)
- **Cooldown & Rate Limiting**:
  - Catches 429, 503, `RESOURCE_EXHAUSTED`, `MODEL_CAPACITY_EXHAUSTED`.
  - Automatically isolates the affected model with a 60-second in-memory cooldown.
  - If all 5 models are concurrently exhausted, throws `GeminiRateLimitExhaustedError`.
- **Multimodal File API (`src/lib/gemini-file-api.ts`)**:
  - Uploads Drive files (PDF, DOCX, images) directly to Google Gemini File API (`google-genai` / `@google/generative-ai`) and attaches `fileUri` parts to the prompt for native document comprehension without lossy local text parsers.

### Async Background Processing (`worker.ts`, `src/lib/queue.ts`, `src/lib/job-runner.ts`)
- **Queue Engine**: BullMQ (`ai-jobs` queue) backed by Upstash Redis (`IORedis`).
- **Worker Execution (`worker.ts`)**:
  - Standalone daemon (`pnpm worker`) running with `concurrency = 7`.
  - Embedded native Node HTTP server listening on `process.env.PORT || 8080` to pass Render / cloud health checks and avoid service sleeping.
  - Stalled job check interval: 5 minutes (`stalledInterval: 300_000`, `maxStalledCount: 2`).
  - Stale lock duration: 10 minutes + 5s (`STALE_LOCK_MS = 605_000`).
- **Fan-Out Architecture**:
  - `AI_EXTRACTION` acts as master orchestrator: queries unprocessed dataset rows, chunks them into batches of 50, and enqueues individual `EXTRACT_SINGLE_ROW` child jobs in BullMQ.
  - Individual row processing isolates LLM calls: failure or rate limiting on row $K$ never contaminates or aborts row $K+1$.
- **Job Types Supported**:
  - `GMAIL_SCAN`, `DRIVE_SCAN`, `DOCS_SCAN`, `SHEETS_SCAN`, `FORMS_SCAN`
  - `DETERMINISTIC_SYNC` (heuristic parsing of email headers, signatures, attachments, and URLs)
  - `AI_EXTRACTION` (master fan-out)
  - `EXTRACT_SINGLE_ROW` (atomic worker extraction)
  - `SHEETS_IMPORT` (one-time Google Sheets import)
  - `EXPORT` (CSV/JSON generation)
  - `WEBHOOK_DISPATCH` (asynchronous event notifications)

### AI Assistant & Streaming Architecture (`src/app/api/assistant/`)
- **Streaming Response**: Newline-delimited JSON stream over HTTP chunked transfer encoding (`/api/assistant/chat`).
- **Two-Tier Action Model**:
  - **Read Tools** (e.g. `get_dashboard_stats`, `list_sources`, `get_dataset_detail`): Executed immediately server-side; output fed back to Gemini in a second pass.
  - **Write Tools** (e.g. `create_schema`, `delete_dataset`, `update_member_role`): Model execution is intercepted; server emits `{ type: "pending", tool, args, risk }`. Requires explicit user confirmation via POST `/api/assistant/confirm`.
- **Encryption at Rest**:
  - `AssistantSession` and `AssistantMessage` contents and `toolResult` blobs are encrypted using AES-256-GCM (`ASSISTANT_ENCRYPTION_KEY`).
  - Format: `<base64_ciphertext>:<base64_iv>:<base64_authtag>`.
- **Reversible Undo Engine (`/api/assistant/undo`)**:
  - Generates 1-hour TTL encrypted undo tokens storing previous state snapshot. Supports reversing schema creations, field additions, role changes, source pause/resumes.

---

## 4. RBAC, Tenant Isolation & Access Control Survey

### Role Hierarchy & Matrix
Defined in `src/lib/auth.ts` (`ROLE_LEVEL`):
```
owner (5) > admin (4) > manager (3) > member (2) > viewer (1)
```

| Role | Scope & Permissions |
| :--- | :--- |
| **Owner (5)** | Full organization governance, transfer ownership, delete organization, modify owners. |
| **Admin (4)** | Manage team members, invite members, modify roles (up to admin), revoke connections, update org settings. |
| **Manager (3)** | Create/delete schemas, create/delete sources, delete dataset records, approve/reject sharing requests, manage schema fields. |
| **Member (2)** | Create datasets, trigger scans, run extractions, edit record values, export data. |
| **Viewer (1)** | Read-only access to datasets, schemas, sources, jobs, audit logs. All write/mutation actions rejected. |

### Tenant Isolation Enforcement
1. **Context Resolution (`requireOrgContext`)**:
   - `?organizationId=` query param: Strictly validated. If caller is not an active member, immediately throws 403 Forbidden.
   - `x-organization-id` header: Evaluated as a client hint.
   - Mutation requests (POST, PATCH, DELETE, PUT) strictly require explicit organization context; fallback to default org is permitted only for GET requests.
2. **Unified Dataset Access (`src/lib/dataset-access.ts`)**:
   - Checks primary org ownership: `dataset.organizationId === currentOrgId`.
   - Checks active grants in `DatasetAccess`: org-level grant (`granteeOrgId`) and user-level grant (`granteeUserId`).
   - Granular permission weights: `read` (1), `comment` (2), `edit` (3), `owner` (4).
3. **Member Lifecycle & Invitations**:
   - Invitations use secure UUID tokens with 7-day expiration (`Invitation` model).
   - Non-owners cannot promote themselves or others above their own role level.
   - Removing the last owner of an organization is explicitly blocked with a 400 Bad Request.

---

## 5. Security Vulnerabilities, Gaps & Risk Matrix

| ID | Category | Severity | Description & Root Cause | Impact | Recommended Remediation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VULN-01** | Code Quality / Availability | **HIGH** | **Broken Module Imports** in `src/lib/webhook-dispatcher.ts` and `src/app/api/google-sheets/import/route.ts` import `{ enqueueJob } from "@/lib/job-queue"`. The actual file is `@/lib/queue`. | Webhook dispatching and Google Sheets import routes crash at runtime with `Module not found: Can't resolve '@/lib/job-queue'`. | Update import statements from `@/lib/job-queue` to `@/lib/queue`. |
| **VULN-02** | Authorization / Billing | **HIGH** | **Self-Service Plan Escalation** in `PATCH /api/session`. The endpoint accepts `{ plan: string }` from the request body and updates `user.plan` directly without payment or admin verification. | Any user can upgrade themselves to `"enterprise"` for free, bypassing all AI job, token, and record limits in `checkUserLimits()`. | Remove `plan` field mutation from `PATCH /api/session`. Plan upgrades must be restricted to verified Stripe/payment webhooks or admin billing endpoints. |
| **VULN-03** | Database / RLS | **HIGH** | **Missing PostgreSQL RLS Policies**. No `ENABLE ROW LEVEL SECURITY` statements exist in database migrations. | If Supabase PostgREST endpoints are reachable using `NEXT_PUBLIC_SUPABASE_ANON_KEY`, data across all 43 tables could be queried directly bypassing Next.js middleware and API authorization. | Generate and apply Supabase SQL migrations enabling RLS on all tables and defining policies matching `OrganizationMember` and `DatasetAccess` rules, or revoke public schema PostgREST access. |
| **VULN-04** | Authentication / Cron | **MEDIUM** | **Unauthenticated Cron Execution** in `src/app/api/cron/sheets-sync/route.ts`. The check `if (cronSecret)` is conditional: if `process.env.CRON_SECRET` is unset, the route skips auth entirely. Combined with public exemption in `src/middleware.ts`, anyone can invoke it. | Public unauthenticated users can trigger bulk Google Sheets sync jobs, consuming Google API quotas and compute resources. | Enforce `if (!cronSecret || token !== cronSecret) return 401`. Require `CRON_SECRET` to be configured. |
| **VULN-05** | Cryptography / 2FA | **MEDIUM** | **Plaintext 2FA Secret & Unverified Disable**. In `src/app/api/2fa/setup/route.ts`, TOTP secret is stored plaintext in `User.twoFactorSecret`. In `src/app/api/2fa/disable/route.ts`, 2FA can be disabled without entering a current TOTP code or password. `2fa_verified` cookie is unsigned. | If a user session is hijacked or DB inspected, 2FA can be instantly disabled or TOTP codes generated offline. | Encrypt `twoFactorSecret` with AES-256-GCM. Require valid TOTP token/password on 2FA disable. Sign 2FA verification cookie with HMAC. |
| **VULN-06** | Multi-Tenancy / Consistency | **LOW** | **Hardcoded First-Org Fallback** in `src/app/api/invoices/route.ts`. The route uses `user.memberships.find(m => m.status === 'active')` instead of `requireOrgContext(req)`. | Invoices always reflect the user's first organization, ignoring active org header/query parameter when user switches workspaces. | Refactor `src/app/api/invoices/route.ts` to use `requireOrgContext(req)`. |

---

## Conclusion & Action Plan

RoleSquare exhibits strong application-level security, encryption discipline for sensitive credentials/messages, and a scalable BullMQ + Gemini fallback architecture. Resolving the broken module import (`VULN-01`), locking down the self-service plan escalation (`VULN-02`), adding database-level RLS policies (`VULN-03`), hardening the cron endpoint (`VULN-04`), and patching 2FA verification (`VULN-05`) will bring the codebase to production readiness.
