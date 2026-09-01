# Comprehensive Backend API & Middleware Architecture Survey

**Target Repository**: `c:\CDS IIT JMU` (RoleSquare / Workspace Intelligence Platform)  
**Survey Date**: September 1, 2026  
**Auditor**: Explorer 2 (Backend API & Middleware Survey)  

---

## 1. Executive Summary & Architecture Overview

The backend architecture of the Workspace Intelligence Platform is built entirely on the **Next.js 16 App Router** framework with TypeScript. The entire server communication layer consists of **106 Route Handlers** (`src/app/api/**/route.ts`), Edge Runtime Middleware (`src/middleware.ts`), Prisma ORM (`@prisma/client` with PostgreSQL/Supabase), and an asynchronous BullMQ worker process backed by Redis (`src/lib/queue.ts`, `worker.ts`).

### Key Architectural Findings:
1. **Server Actions vs Route Handlers**:
   - There are **zero** Server Actions (`'use server'`) across the entire repository.
   - The application relies 100% on RESTful API Route Handlers accessed via a centralized client (`src/lib/api-client.ts`) and React Query (`@tanstack/react-query`).
2. **Session & Auth Architecture**:
   - Authentication is managed via `@supabase/ssr` with Next.js Edge Middleware verifying session cookies.
   - Per-request authorization is centralized in `src/lib/auth.ts` using React's `cache()` memoization (`getCurrentUser`, `requireOrgContext`, `requireRole`, `requireExplicitOrg`, `verifyDatasetAccess`).
   - Organization multi-tenancy is enforced via composite queries and strict query-param / header checks.
3. **Background Processing**:
   - Long-running jobs (Gmail/Drive scans, AI extractions, Google Sheets synchronization) are decoupled from HTTP request cycles using BullMQ and Redis (`src/lib/queue.ts`), tracked persistently in Postgres (`AiJob` and `SourceRun` tables).
4. **AI Integration**:
   - Google Gemini SDK (`@google/generative-ai`) is orchestrated with a multi-model fallback chain (`gemini-1.5-pro` -> `gemini-1.5-flash`), token usage metrics, and an AI Assistant system with tool execution confirmation and AES-256-GCM encrypted message history.

---

## 2. Next.js Middleware & Session Verification Flow

### File: `src/middleware.ts`
- **Runtime**: Edge Runtime
- **Purpose**: Global session validation and automatic cookie refreshing using `@supabase/ssr`.

### Public Paths Configuration (`PUBLIC_PATHS`):
```typescript
const PUBLIC_PATHS = [
  "/", "/about", "/faq", "/contact", "/privacy", "/terms", "/login",
  "/api/auth/callback",
  "/api/google/callback",
  "/api/google-sheets/auth/callback",
  "/api/health",
  "/api/debug-error",
  "/api/jobs/process",
  "/api/cron",
  "/manifest.json", "/sw.js", "/offline.html", "/icons",
];
```

### Flow & Lifecycle:
1. **Public Path Check**: `isPublicPath(pathname)` checks if the request path matches or begins with any prefix in `PUBLIC_PATHS`. If true, `NextResponse.next()` is returned immediately.
2. **Supabase Client Initialization**: Instantiates `createServerClient` with `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`, piping request cookies through `request.cookies.getAll()` and setting updated cookies onto `supabaseResponse`.
3. **Session Refresh**: Calls `supabase.auth.getSession()` to read and refresh the JWT cookie locally.
4. **Redirect on Unauthenticated**: If `!session`, clones the request URL, sets `pathname = "/login"`, preserves the destination in `?next=<pathname>`, copies refreshed cookies, and returns `NextResponse.redirect(loginUrl)`.

### Critical Middleware Observations & Vulnerabilities:
1. **API Route 307 Redirect vs 401 JSON**:
   - When an unauthenticated client sends a request to a protected API route (e.g. `POST /api/datasets`), `middleware.ts` issues a `307 Temporary Redirect` to `/login?next=/api/datasets`.
   - In standard browser `fetch()`, redirects are followed automatically, causing the client to receive a `200 OK` HTML login page instead of a `401 Unauthorized` JSON payload. While `src/lib/api-client.ts` attempts to inspect responses, external integrations or non-browser clients will receive unexpected HTML payloads.
2. **`getSession()` vs `getUser()` Security Trade-off**:
   - Line 75 uses `supabase.auth.getSession()` rather than `supabase.auth.getUser()`. As documented by Supabase, `getSession()` parses the local JWT cookie cryptographically without verifying revocation status against the Supabase Auth server. If a user's account or session is revoked on Supabase, the middleware will continue allowing requests until the JWT expires.
3. **Broad `/api/cron` Public Path Prefix**:
   - `pathname.startsWith("/api/cron/")` bypasses all session authentication for any route located under `/api/cron/`. If downstream cron handlers do not strictly validate a shared secret, they become publicly accessible endpoints.

---

## 3. Authorization & Tenant Scoping Architecture

### File: `src/lib/auth.ts`

### Centralized Helper Functions:
| Helper | Purpose | Resolution Order / Logic | Error Returned |
|---|---|---|---|
| `getCurrentUser(skip2FA?)` | Resolves authenticated `SessionUser` + memberships | `supabase.auth.getSession()` -> `getOrCreateUser(email, metadata)` -> checks `2fa_verified_<id>` cookie. Cached per-request with React `cache()`. | `AuthError("Unauthorized", 401)` or `AuthError("2FA_REQUIRED", 403)` |
| `requireOrgContext(req)` | Validates active membership for current org | 1. `?organizationId=` (Strict: throws 403 if invalid)<br>2. `x-organization-id` header (Soft hint)<br>3. Fallback to 1st active org (Blocked for POST/PUT/DELETE/PATCH mutations). | `AuthError("...", 403)` |
| `requireExplicitOrg(req)` | Strictly requires explicit org context | Requires `?organizationId=` or `x-organization-id` header, throws 400 if omitted, 403 if not active member. | `AuthError("...", 400 \| 403)` |
| `requireRole(req, minRole)` | Enforces role hierarchy level | Calls `requireOrgContext(req)`, compares `ROLE_LEVEL[userRole] >= ROLE_LEVEL[minRole]`. | `AuthError("This action requires ... role or higher.", 403)` |
| `verifyDatasetAccess(...)` | Validates dataset ownership or cross-org grant | 1. Checks if dataset belongs to active org & maps role to access level.<br>2. Queries `DatasetAccess` for active, unpaused grant to `granteeOrgId` or `granteeUserId`. | Returns boolean (`true` / `false`) |

### Role Hierarchy (`ROLE_LEVEL`):
```typescript
const ROLE_LEVEL: Record<Role, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};
```

---

## 4. Input Validation, Schema Parsing & Error Propagation

### Input Parsing & Validation Patterns:
1. **Absence of Zod Schema Parsing in Routes**:
   - While `zod: ^4.0.2` is installed in `package.json`, route handlers almost universally rely on manual parsing (`typeof body.xyz === "string"`, `body?.name?.trim()`, regex testing) rather than structured Zod schema validation pipelines.
2. **Safe JSON Parsing**:
   - Handlers consistently use `await req.json().catch(() => ({}))` to prevent crashes on empty request bodies.
3. **Database Scoping & IDOR Prevention**:
   - Route handlers enforce multi-tenancy by including `{ where: { id, organizationId } }` or verifying access through `verifyOrgAccess` / `verifyDatasetAccess` before executing updates or deletes.
4. **Error Propagation Standard**:
   - Authorization failures throw `AuthError` instances.
   - Handlers catch errors and call `authErrorResponse(err)` which formats `{ error: err.message }` with `err.status` (401, 403, 400).
   - Unhandled exceptions return `{ error: err.message }` with HTTP status `500`.

### Client-Side Resilience (`src/lib/api-client.ts`):
- **Timeout Protection**: Standard `30,000ms` `AbortController` timeout on all network requests.
- **Idempotency Retries**: Automatic exponential retry (up to 4 attempts) via `withRetry` for idempotent methods (`GET`, `HEAD`). Mutations (`POST`, `PUT`, `PATCH`, `DELETE`) are strictly single-attempt to prevent duplicate side-effects.
- **Auth Interception**: Automatically catches `401 Unauthorized` and `403 2FA_REQUIRED` to trigger client redirection to `/login?next=...`.

---

## 5. Background Jobs, AI & External Service Integrations

### 1. Background Jobs & Queue Architecture (`src/lib/queue.ts`, `worker.ts`):
- **Queue Engine**: BullMQ v6 with Redis (`QUEUE_NAME = "ai-jobs"`).
- **Producers**: API routes call `enqueueJob({ organizationId, type, payload, userId })` which creates an `AiJob` record in Postgres and dispatches to Redis.
- **Worker**: Standalone worker process (`worker.ts`) consumes BullMQ jobs with exponential retry (5 attempts: 2s, 4s, 8s, 16s, 32s).
- **Fallback**: If Redis is offline, `enqueueJob` marks the `AiJob` status as `"failed"` and throws a clean error rather than hanging.
- **Job Processing Shim**: `/api/jobs/process` is maintained as a fast `{ success: true, mode: "bullmq" }` response to maintain backward compatibility with legacy frontend polling.

### 2. Google Workspace & OAuth Integration:
- **Scopes**:
  - `GoogleConnection`: `gmail.readonly`, `drive.metadata.readonly` for ingestion pipelines.
  - `GoogleSheetsAccount`: `spreadsheets`, `drive.readonly` for bidirectional Sheets synchronization.
- **Token Security**: Tokens are encrypted using AES-256-GCM prior to storage in Postgres.
- **Sync Engine (`src/lib/services/sync-engine.ts`)**: Handles schema fingerprinting, row external ID mapping, conflict resolution strategies (`flag`, `app_wins`, `sheet_wins`), and schema version rollback.

### 3. Google Gemini AI Service (`src/lib/gemini.ts`):
- **SDK**: `@google/generative-ai` v0.24.1.
- **Fallback Chain**: Requests prioritize `gemini-1.5-pro`, falling back to `gemini-1.5-flash` upon 429/quota exhaustion with dynamic cooldown timers.
- **Token Usage Tracking**: Increments `UsageMetric` (`metricType: "ai_tokens"`) per organization.

### 4. Webhook Dispatcher (`src/lib/webhook-dispatcher.ts`):
- **SSRF Mitigation**: Webhook creation endpoints strictly block internal IP addresses (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`, `169.254.0.0/16`, `localhost`, `0.0.0.0`, `::1`).
- **Signature Security**: Webhook payloads are signed with HMAC-SHA256 headers (`X-RoleSquare-Signature`).

---

## 6. Complete Inventory of All 106 API Routes

Below is the complete inventory of all 106 API route handlers across 16 functional domains.

### Domain 1: Authentication & Session Management (5 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/auth/callback` | `GET` | Exchanges Supabase OAuth/magic link code for session | Public (Middleware allowed) | Open redirect risk mitigated with strict `startsWith('/')` check. |
| `/api/auth/logout` | `POST` | Clears 2FA cookie and signs out of Supabase | Authenticated (`getCurrentUser`) | None; fails safe with `{ success: true }`. |
| `/api/session` | `GET`, `PATCH` | Loads active user profile & orgs; updates profile | `getCurrentUser` | **CRITICAL**: `PATCH` allows arbitrary `plan` string in body, allowing free self-upgrades to Enterprise without billing validation. |
| `/api/debug-error` | `GET` | Diagnostic test route | Public (in Middleware `PUBLIC_PATHS`) | **HIGH**: Exposes full error stack traces to unauthenticated callers; converts 401 to 500. |
| `/api/users/search` | `GET` | Searches users by name/email for sharing | `getCurrentUser` (min 2 chars) | Case-insensitive email query; limited to 20 results; self excluded. |

### Domain 2: Two-Factor Authentication (3 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/2fa/setup` | `POST` | Generates TOTP secret and QR code data URI | `getCurrentUser(skip2FA=true)` | Updates user with `twoFactorEnabled: false` until verified. |
| `/api/2fa/verify` | `POST` | Validates TOTP code & enables 2FA | `getCurrentUser(skip2FA=true)` | Sets `2fa_verified_<userId>` httpOnly cookie for 30 days. |
| `/api/2fa/disable` | `POST` | Disables 2FA and deletes secret | `getCurrentUser` | **HIGH**: Does NOT require TOTP token or password re-entry to disable 2FA. |

### Domain 3: Organizations, Members & Invitations (11 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/organizations` | `GET`, `POST` | Lists user's orgs; creates new organization | `getCurrentUser` | Auto-provisions default dataset; unique slug deduplication loop. |
| `/api/organizations/search` | `GET` | Searches organizations by name/slug | `getCurrentUser` | Scoped to active memberships. |
| `/api/organizations/[id]` | `GET`, `PATCH`, `DELETE` | Org detail, update settings, delete org | `verifyOrgAccess` (`viewer` for GET, `admin` for PATCH, `owner` for DELETE) | Protected against deleting the user's only organization. |
| `/api/organizations/[id]/invitations` | `GET`, `POST` | Lists and creates pending invitations | `requireRole("manager")` | Validates email format; prevents duplicate active members. |
| `/api/organizations/[id]/members` | `GET`, `POST` | Lists active members; legacy invite proxy | `verifyOrgAccess` (`viewer` for GET, `manager` for POST) | Proxies to invitation creation. |
| `/api/organizations/[id]/members/me` | `GET` | Returns caller's membership details in org | `getCurrentUser` | 404 if not a member. |
| `/api/organizations/[id]/members/[memberId]` | `GET`, `PATCH`, `DELETE` | Member details, update role, remove member | `verifyOrgAccess` (`admin`+) | Prevents demoting owner without transfer; prevents deleting last owner. |
| `/api/organizations/[id]/members/[memberId]/resend` | `POST` | Resends invitation email for pending member | `requireRole("manager")` | Regenerates invite token and expiration. |
| `/api/invitations` | `GET` | Lists pending invitations received by caller | `getCurrentUser` | Matches on `user.email`. |
| `/api/invitations/accept` | `POST` | Accepts pending invitation via token | `getCurrentUser` | Case-insensitive email verification; upserts `OrganizationMember`. |
| `/api/invitations/decline` | `POST` | Declines pending invitation via token | `getCurrentUser` | Marks invitation as `cancelled`. |

### Domain 4: Datasets, Records & Columns (12 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/datasets` | `GET`, `POST` | Lists owned/shared datasets; creates dataset | `requireOrgContext` (GET), `requireRole("member")` (POST) | Merges owned and shared access grants; seeds column defs from schema. |
| `/api/datasets/[id]` | `GET`, `PATCH`, `DELETE` | Dataset detail, assign schema, delete dataset | `verifyDatasetAccess` (`read` for GET, `owner` for PATCH/DELETE) | **MEDIUM**: `DELETE` does NOT check `dataset.isDefault`, allowing deletion of organization default dataset. |
| `/api/datasets/[id]/columns` | `GET`, `POST` | Lists column definitions; creates custom column | `verifyDatasetAccess` (`read` for GET, `edit` for POST) | Shifts column positions on insert. |
| `/api/datasets/[id]/columns/[columnId]` | `PATCH`, `DELETE` | Updates or soft-deletes column definition | `verifyDatasetAccess` (`edit` for PATCH, `owner` for DELETE) | Soft delete (`isDeleted: true`) preserves historical data. |
| `/api/datasets/[id]/records` | `GET`, `POST` | Lists paginated records; creates empty record | `verifyDatasetAccess` (`read` for GET, `edit` for POST) | Enriches with merged schema fields and email metadata; updates `recordCount`. |
| `/api/datasets/[id]/records/bulk` | `POST` | Bulk insert/update/delete records | `verifyDatasetAccess` (`edit`) | Atomic transaction; updates dataset `recordCount`. |
| `/api/datasets/[id]/records/[recordId]` | `GET`, `PATCH` | Record detail with values; updates status | `verifyDatasetAccess` (`read` for GET, `edit` for PATCH) | Audit logs status changes (`approved`, `rejected`, `needs_review`). |
| `/api/datasets/[id]/records/[recordId]/values` | `GET`, `POST` | Lists values; creates record value | `verifyDatasetAccess` (`read` for GET, `edit` for POST) | Validates field belongs to dataset schema. |
| `/api/datasets/[id]/records/[recordId]/values/[valueId]` | `PATCH` | Updates value (human-in-the-loop correction) | `verifyDatasetAccess` (`edit`) | Preserves `originalValue` and `originalConfidence` on first edit; bumps confidence to 1.0. |
| `/api/datasets/[id]/export` | `POST` | Generates CSV / JSON export of dataset | `verifyDatasetAccess` (`read`) | Logs audit export event; validates file expiry settings. |
| `/api/datasets/[id]/import` | `POST` | Imports CSV / JSON data into dataset | `verifyDatasetAccess` (`edit`) | Validates header types against column definitions. |
| `/api/datasets/[id]/import-history` | `GET` | Lists historical import jobs for dataset | `verifyDatasetAccess` (`read`) | Paginated import log queries. |

### Domain 5: Schemas & Fields (7 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/schemas` | `GET`, `POST` | Lists org schemas; creates schema with fields | `requireOrgContext` (GET), `requireRole("member")` (POST) | Transactionally creates schema and initial schema fields. |
| `/api/schemas/[id]` | `GET`, `PATCH`, `DELETE` | Schema detail, update metadata, delete schema | `requireOrgContext` (GET), `requireRole("member")` (PATCH/DELETE) | Protected: blocks deletion of default schema (`isDefault: true`). |
| `/api/schemas/[id]/clone` | `POST` | Clones schema and all associated fields | `requireRole("member")` | Creates independent deep copy with `version: 1`. |
| `/api/schemas/[id]/fields` | `POST` | Appends a new field to schema | `requireRole("member")` | Increments schema version; auto-positions field at end. |
| `/api/schemas/[id]/fields/reorder` | `PUT` | Reorders schema fields | `requireRole("member")` | Transactionally updates position indexes. |
| `/api/schemas/[id]/fields/[fieldId]` | `PATCH`, `DELETE` | Updates field definition; deletes field | `requireRole("member")` | Blocks field deletion on `isDefault: true` schemas. |
| `/api/schemas/[id]/test-extraction` | `POST` | Runs live AI extraction against sample text | `requireRole("member")` | Increments `ai_tokens` usage metric; does not persist dataset records. |

### Domain 6: Sources, Rules, Runs & Scanning (11 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/sources` | `GET`, `POST` | Lists sources; creates new source pipeline | `requireOrgContext` (GET), `requireRole("member")` (POST) | Validates connection exists and belongs to org. |
| `/api/sources/test-scan` | `POST` | Simulates scan run without saving records | `requireRole("member")` | Checks query filters against Google Connection. |
| `/api/sources/[id]` | `GET`, `PATCH`, `DELETE` | Source detail, update configuration, delete | `requireOrgContext` (GET), `requireRole("member")` (PATCH/DELETE) | Cascades rules and runs on delete. |
| `/api/sources/[id]/scan` | `POST` | Explicitly triggers scan run | `requireRole("member")` | Checks `runState !== "scanning"`; enforces user quotas before enqueueing job. |
| `/api/sources/[id]/cancel-scan` | `POST` | Cancels in-flight scan run | `requireRole("member")` | Updates `SourceRun.status = "failed"` and resets `Source.runState = "idle"`. |
| `/api/sources/[id]/runs` | `GET`, `POST` | Lists run history; triggers run | `requireOrgContext` (GET), `requireRole("member")` (POST) | Paginated run list. |
| `/api/sources/[id]/rules` | `GET`, `PUT` | Lists and replaces filter rules for source | `requireOrgContext` (GET), `requireRole("member")` (PUT) | Transactionally replaces rule set with updated positions. |
| `/api/sources/[id]/extract` | `POST` | Runs extraction on matched source emails | `requireRole("member")` | Enqueues `AI_EXTRACTION` job into BullMQ. |
| `/api/sources/[id]/emails` | `GET` | Lists discovered emails for source | `requireOrgContext` | Paginated email records with attachment and link status. |
| `/api/sources/[id]/default-dataset` | `GET` | Resolves or creates default dataset for source | `requireOrgContext` | Ensures source is bound to a valid target dataset. |
| `/api/sources/[id]/clone` | `POST` | Clones a source with all filter rules | `requireRole("member")` | Creates copy in `idle` state. |

### Domain 7: AI Extraction, Jobs & Logs (10 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/extraction` | `POST` | Core LLM extraction endpoint | `requireRole("member")` | Validates field names against schema; flags low-confidence fields for review. |
| `/api/ai/extract-wizard` | `POST` | AI wizard to generate schemas from sample data | `requireRole("member")` | Generates field suggestions and confidence thresholds. |
| `/api/ai/model-status` | `GET` | Live Gemini rate-limit & cooldown status | Public (no auth) | Non-sensitive runtime model health metadata. |
| `/api/ai-jobs` | `GET`, `POST` | Lists org background jobs; enqueues custom job | `requireOrgContext` (GET), `requireRole("member")` (POST) | Filterable by `type`, `status`, `agentKey`. |
| `/api/ai-jobs/[id]` | `GET` | Detailed job status and execution result | `requireOrgContext` | Includes outputs and agent logs. |
| `/api/ai-jobs/[id]/cancel` | `POST` | Cancels running job | `requireRole("member")` | Updates job status to `failed`. |
| `/api/ai-jobs/[id]/logs` | `GET` | Retrieves execution logs for job | `requireOrgContext` | Ordered by `createdAt asc`. |
| `/api/ai-jobs/[id]/outputs` | `GET` | Retrieves raw LLM responses and token costs | `requireOrgContext` | Includes token counts and pre-computed USD cost. |
| `/api/ai-jobs/[id]/retry` | `POST` | Retries failed or dead-letter job | `requireRole("member")` | Re-enqueues job into BullMQ queue. |
| `/api/agent-logs` | `GET`, `POST` | Lists and creates structured agent logs | `requireOrgContext` (GET), `requireRole("member")` (POST) | Structured logging for autonomous agents. |

### Domain 8: AI Assistant & Chat Sessions (5 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/assistant/chat` | `POST` | Streaming chat with AI assistant | `requireRole("member")` | Read tools execute automatically; write tools emit `pending` events requiring confirmation. Messages encrypted with AES-256-GCM. |
| `/api/assistant/confirm` | `POST` | Confirms and executes a pending write tool | `requireRole("member")` | Re-checks role permissions before executing mutation; generates undo token. |
| `/api/assistant/undo` | `POST` | Reverts tool execution via undo token | `requireRole("member")` | Validates undo token within expiry window. |
| `/api/assistant/sessions` | `GET`, `POST` | Lists user's assistant sessions; creates session | `requireOrgContext` | Sessions strictly user-scoped (`userId`). |
| `/api/assistant/sessions/[id]` | `GET`, `DELETE` | Session history; soft deletes session | `requireOrgContext` | Decrypts message content on read. |

### Domain 9: Google Connections & OAuth (4 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/google/authorize` | `GET` | Starts OAuth flow for Gmail/Drive | `requireOrgContext` | State parameter contains encrypted org and user context. |
| `/api/google/callback` | `GET` | OAuth callback for Gmail/Drive tokens | Public (in Middleware `PUBLIC_PATHS`) | Validates state; encrypts and stores tokens in `GoogleConnection`. |
| `/api/google-connections` | `GET`, `POST` | Lists connections; creates connection | `requireOrgContext` (GET), `requireRole("member")` (POST) | Scoped to active organization. |
| `/api/google-connections/[id]` | `GET`, `DELETE` | Connection detail; disconnects connection | `requireOrgContext` (GET), `requireRole("member")` (DELETE) | Revokes watch subscriptions on delete. |

### Domain 10: Google Sheets Integration & Cron Sync (21 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/google-sheets/auth` | `GET` | Starts OAuth flow for Google Sheets | `requireOrgContext` | Uses separate Sheets scopes (`spreadsheets`, `drive.readonly`). |
| `/api/google-sheets/auth/callback` | `GET` | OAuth callback for Sheets account | Public (in Middleware `PUBLIC_PATHS`) | Stores tokens in `GoogleSheetsAccount`. |
| `/api/google-sheets/accounts` | `GET`, `POST` | Lists and registers Sheets accounts | `requireOrgContext` (GET), `requireRole("member")` (POST) | Unique per org and Google email. |
| `/api/google-sheets/accounts/[id]` | `GET`, `DELETE` | Account detail; disconnects account | `requireOrgContext` (GET), `requireRole("member")` (DELETE) | Cascades to spreadsheet connections. |
| `/api/google-sheets/spreadsheets` | `GET` | Lists accessible spreadsheets via Drive API | `requireOrgContext` | Queries Google Drive metadata. |
| `/api/google-sheets/spreadsheets/[id]/tabs` | `GET` | Lists tabs/sheets within a spreadsheet | `requireOrgContext` | Queries Google Sheets metadata. |
| `/api/google-sheets/spreadsheets/[id]/preview` | `GET` | Previews first 10 rows of a sheet tab | `requireOrgContext` | Returns sample rows and detected headers. |
| `/api/google-sheets/ai-mapping` | `POST` | AI-powered column mapping recommendation | `requireRole("member")` | Matches sheet headers to dataset columns. |
| `/api/google-sheets/link` | `POST` | Links dataset to spreadsheet tab | `requireRole("member")` | Creates `SpreadsheetConnection`, `SheetMapping`, and `SyncState`. |
| `/api/google-sheets/mappings/[id]` | `GET`, `PATCH`, `DELETE` | Mapping detail, update sync settings, unlink | `requireOrgContext` (GET), `requireRole("member")` (PATCH/DELETE) | Allows updating direction, conflict strategy, schedule expression. |
| `/api/google-sheets/mappings/[id]/sync` | `POST` | Triggers manual sync for mapping | `requireRole("member")` | Runs `sync-engine` pipeline. |
| `/api/google-sheets/mappings/[id]/history` | `GET` | Lists sync event history | `requireOrgContext` | Paginated sync audit logs. |
| `/api/google-sheets/mappings/[id]/conflicts` | `GET` | Lists unresolved sync conflicts | `requireOrgContext` | Returns conflicting values for user resolution. |
| `/api/google-sheets/mappings/[id]/conflicts/[conflictId]/resolve` | `POST` | Resolves conflict (`app_wins` or `sheet_wins`) | `requireRole("member")` | Applies chosen value and marks conflict resolved. |
| `/api/google-sheets/mappings/[id]/schema-versions` | `GET` | Lists schema snapshots for mapping | `requireOrgContext` | Ordered by `version desc`. |
| `/api/google-sheets/mappings/[id]/schema-versions/[versionId]/rollback` | `POST` | Rolls back dataset schema to snapshot | `requireRole("member")` | Restores column configuration from historical version. |
| `/api/google-sheets/import` | `POST` | Imports spreadsheet data into dataset | `requireRole("member")` | Creates `ImportJob` and batches records. |
| `/api/google-sheets/import/[id]` | `GET` | Checks status of ongoing import job | `requireOrgContext` | Returns progress percentage and error log. |
| `/api/google-sheets/export` | `POST` | Exports dataset to a Google Sheet | `requireRole("member")` | Writes dataset records directly to Google Sheet tab. |
| `/api/google-sheets/org-export` | `POST` | Multi-dataset organization bulk export | `requireRole("admin")` | Bulk exports multiple datasets into multi-tab workbook. |
| `/api/cron/sheets-sync` | `GET` | Background cron sync worker trigger | Bearer token / `CRON_SECRET` | **HIGH**: If `process.env.CRON_SECRET` is unset, the `if (cronSecret)` check is bypassed and the endpoint is publicly executable. |

### Domain 11: Sharing & Access Governance (6 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/sharing/permissions` | `GET`, `POST`, `DELETE`, `PATCH` | Lists, grants, revokes, pauses dataset shares | `requireOrgContext` (GET), `requireRole("member")` (mutations) | Enforces dataset write access before granting; soft-delete via `status: "revoked"`. |
| `/api/sharing/cross-org` | `GET`, `POST` | Legacy cross-org permissions list/grant | `requireOrgContext` (GET), `requireRole("member")` (POST) | Proxies to `DatasetAccess`. |
| `/api/sharing/cross-org/[id]` | `DELETE` | Revokes cross-org permission | `requireRole("member")` | Soft deletes permission. |
| `/api/sharing/requests` | `GET`, `POST` | Lists pending requests; requests share | `requireOrgContext` (GET), `requireRole("member")` (POST) | Tracks requester and target org/user. |
| `/api/sharing/requests/[id]/approve` | `POST` | Approves sharing request | `requireRole("member")` | Verifies approver has write access; creates `DatasetAccess` grant. |
| `/api/sharing/requests/[id]/reject` | `POST` | Rejects sharing request | `requireRole("member")` | Updates status to `rejected`. |

### Domain 12: Audit, Usage & Analytics (4 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/audit` | `GET`, `POST` | Lists audit logs; writes client audit log | `requireOrgContext` (GET), `requireRole("member")` (POST) | Filterable by `entity`, `actorId`, `action`, date range. |
| `/api/usage` | `GET` | Current billing period usage metrics | `requireOrgContext` | Returns token counts, scans, exports vs plan quota. |
| `/api/usage/trends` | `GET` | Historical usage trends (30d/90d) | `requireOrgContext` | Aggregated daily metric charts. |
| `/api/dashboard` | `GET` | Aggregated workspace metrics & activity | `requireOrgContext` | Returns parallel counts of sources, datasets, records, pending reviews, active jobs. |

### Domain 13: Webhooks (2 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/webhooks` | `GET`, `POST` | Lists org webhooks; creates webhook | `requireOrgContext` (GET), `requireRole("member")` (POST) | **SSRF Protected**: Validates URL against private IP ranges and loopback. |
| `/api/webhooks/[id]` | `PATCH`, `DELETE` | Updates or deletes webhook | `requireRole("member")` | Scoped to `{ id, organizationId }`. |

### Domain 14: Invoices & Billing (1 route)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/invoices` | `GET` | Lists organization invoices | `getCurrentUser` | **MEDIUM**: Ignores `x-organization-id` header and always defaults to the user's first active organization. |

### Domain 15: Search & Discovery (2 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/search` | `GET` | Global search across sources, datasets, schemas, records | `requireOrgContext` (min 2 chars) | Multi-tenant organization scoping on all 4 sub-queries. |
| `/api/users/search` | `GET` | User search for sharing dialogs | `getCurrentUser` | Excludes self; returns non-sensitive fields (`id`, `email`, `name`, `avatarUrl`). |

### Domain 16: System, Diagnostics & Shims (3 routes)
| Endpoint | Methods | Purpose | Auth & Role Required | Potential Vulnerability / Failure Point |
|---|---|---|---|---|
| `/api/jobs/process` | `POST` | Legacy worker execution shim | Public (in Middleware `PUBLIC_PATHS`) | Fast no-op returning `{ success: true, mode: "bullmq" }`. |
| `/api/health` | `GET` | Subsystem diagnostics (DB, Jobs, Quotas, Webhooks) | Public (in Middleware `PUBLIC_PATHS`) | Exposes operational metrics; returns 503 if any critical subsystem is unhealthy. |
| `/api/route.ts` | `GET` | Root API test stub | Public | Returns `{ message: "Hello, world!" }`. |

---

## 7. Critical Vulnerabilities & Potential Failure Points Matrix

| ID | Severity | Category | Affected File(s) & Lines | Description & Impact | Recommended Fix |
|---|---|---|---|---|---|
| **VULN-01** | **CRITICAL** | Authorization / Plan Tampering | `src/app/api/session/route.ts:58-60` | `PATCH /api/session` accepts arbitrary `{ "plan": "enterprise" }` in the JSON body and directly mutates `user.plan` in PostgreSQL without checking admin rights or billing confirmation. | Restrict `PATCH /api/session` to non-sensitive fields (`name`, `avatarUrl`, `notificationPrefs`). Move `plan` modifications to dedicated billing/webhook handlers. |
| **VULN-02** | **HIGH** | Authentication / 2FA Bypass | `src/app/api/2fa/disable/route.ts:6-25` | `POST /api/2fa/disable` disables two-factor authentication without requiring a valid TOTP code or password re-entry. Any compromised session can instantly remove 2FA. | Require `{ token: string }` in request body and verify with `otplib.verify` before updating `twoFactorEnabled = false`. |
| **VULN-03** | **HIGH** | Authentication Bypass / Cron | `src/app/api/cron/sheets-sync/route.ts:26-33` | If the `CRON_SECRET` environment variable is undefined, the authentication check `if (cronSecret)` is skipped entirely. Because `/api/cron` is in `PUBLIC_PATHS` in `middleware.ts`, anyone on the internet can trigger sheet syncs. | Enforce `if (!cronSecret \|\| token !== cronSecret) return 401;` so missing environment secrets fail closed. |
| **VULN-04** | **HIGH** | Information Disclosure / Debug | `src/app/api/debug-error/route.ts:1-18` | Route is public in `middleware.ts` and returns full error stack traces (`err.stack`) to unauthenticated callers, while throwing 500 when an unauthenticated caller triggers an expected 401. | Remove `/api/debug-error` from production builds or remove it from `PUBLIC_PATHS` and strip stack traces in production. |
| **VULN-05** | **MEDIUM** | Middleware Client Flow | `src/middleware.ts:78-90` | Middleware returns a `307 Temporary Redirect` to `/login` for unauthenticated requests to API routes (`/api/*`), causing `fetch()` to receive HTML rather than a clean JSON `401 Unauthorized` response. | Add `if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });` in `middleware.ts`. |
| **VULN-06** | **MEDIUM** | Multi-Tenancy State Desync | `src/app/api/invoices/route.ts:10-18` | Endpoint uses `user.memberships.find(m => m.status === 'active')` instead of `requireOrgContext(req)`. When switching organizations, the UI continues displaying invoices from the first org. | Replace with `const { organizationId } = await requireOrgContext(req);`. |
| **VULN-07** | **MEDIUM** | Resource Integrity | `src/app/api/datasets/[id]/route.ts:167-199` | `DELETE /api/datasets/[id]` does not check `dataset.isDefault`. Deleting an organization's default dataset can corrupt pipelines and sources expecting a default dataset. | Add `if (before.isDefault) return NextResponse.json({ error: "Cannot delete default dataset" }, { status: 400 });`. |
| **VULN-08** | **LOW** | Unchecked JSON Parsing in Audit | `src/app/api/datasets/[id]/records/[recordId]/values/[valueId]/route.ts:93` | `JSON.parse(before.value)` is executed inside the audit payload constructor without a try/catch. If corrupted data exists in the value column, the PATCH route crashes with a 500. | Use a safe JSON parser helper or wrap parsing in a fallback. |

---

## 8. Summary & Next Steps for Audit Cycles

This survey establishes the complete baseline for the backend API and middleware architecture. The findings above provide specific, actionable targets for subsequent audit and stabilization cycles across:
1. Hardening authentication and authorization guards (plan tampering, 2FA disable verification, cron authorization fail-safe).
2. Normalizing middleware API responses (returning JSON 401 on `/api/*` instead of 307 HTML redirects).
3. Standardizing organization context resolution (fixing `/api/invoices` and default dataset protection).
4. Introducing uniform input validation schemas and error handling across route handlers.
