# Project: CDS IIT JMU — Production-Grade Codebase Audit & Stabilization

## Architecture
- **Framework & Runtime**: Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript.
- **Frontend State & UI**: Dual-layer architecture combining Zustand (`useAppStore` in `src/store/app-store.ts`), TanStack Query v5 (`@tanstack/react-query`), Supabase Realtime subscriptions, and 14 domain views hosted inside `<AppShell>`.
- **Backend & APIs**: 106 Route Handlers (`src/app/api/**/route.ts`), Edge Middleware (`src/middleware.ts`), Multi-tenant RBAC Context (`src/lib/auth.ts`, `src/lib/organization-context.ts`), Zod validation schemas.
- **Database & Data Layer**: Prisma ORM (43 models in `prisma/schema.prisma`), Supabase PostgreSQL, SQL migrations in `supabase/migrations/`, Row-Level Security (RLS) policies.
- **Async & AI Services**: Gemini Multi-Model API (`@google/genai`), BullMQ async job queues, SSE stream handlers, cron triggers.
- **Security & Access Control**: Multi-tenant organization isolation (`owner`, `admin`, `manager`, `member`, `viewer`), TOTP 2FA, invitation token verification, rate limiting, and session management.

## Code Layout
- `src/app/` — Next.js App Router entry points, layouts, workspace routing, auth pages, error boundaries.
- `src/app/api/` — 106 REST API Route Handlers.
- `src/components/` — Domain views (14 views), workspace layout (`<AppShell>`), UI primitives (`src/components/ui/`), dialogs, tables, forms.
- `src/hooks/` — Custom hooks for data fetching, mutations, assistant streaming, organization switching.
- `src/lib/` — Backend & shared utilities (auth, prisma, supabase, query-keys, gemini, validation, rbac).
- `src/store/` — Zustand global application state stores.
- `prisma/` — Database schema definitions and migration scripts.
- `supabase/` — Supabase migrations and RLS policies.
- `.agents/` — Agent coordination, briefing, progress, and audit logs.

---

## Feature Inventory & Milestone Mapping
Every feature and core subsystem is mapped to specific audit cycles across the 5 milestones.

| # | Feature / Subsystem | Description | Milestone / Cycles | Source |
|---|---------------------|-------------|--------------------|--------|
| 1 | App Error Boundaries | React ErrorBoundary wrappers, `error.tsx`, `global-error.tsx`, component crash fallback | M1 (Cycle 1) | Survey F1 |
| 2 | Dataset Optimistic UI | TanStack query cache key alignment & optimistic rollback in `dataset-detail-view.tsx` | M1 (Cycle 2) | Survey F2 |
| 3 | Query Key Normalization | Standardize query key factory across `members-view`, `usage-view`, `invitations-view` | M1 (Cycle 3) | Survey F3 |
| 4 | Org Switcher State Sync | Clean reset of active resource IDs on org change in `useAppStore` & `AppShell` | M1 (Cycle 4) | Survey F4 |
| 5 | Hydration Stabilization | Elimination of localStorage SSR mismatches and unstable relative time formatting | M1 (Cycle 5) | Survey F5 |
| 6 | Assistant Chat SSE Stream | Add AbortController cancellation and error recovery to `use-assistant-chat.ts` | M1 (Cycle 6) | Survey F6 |
| 7 | Form Double-Submit Protection | Idempotency and pending state locks across dataset, schema, and member forms | M1 (Cycle 7) | Survey F7 |
| 8 | Table Selection State Sync | Bulk selection reset on page, filter, or dataset change in table views | M1 (Cycle 8) | Survey F8 |
| 9 | Toast & UI Error Notification | Centralized error toast dispatching for unhandled query/mutation errors | M1 (Cycle 9) | Survey F9 |
| 10 | Login & Auth Redirect Flow | Network failure error handling, unhandled promises in `login/page.tsx` & callbacks | M1 (Cycle 10) | Survey F10 |
| 11 | Session Plan Escalation Fix | Fix `PATCH /api/session` to prevent unauthorized self-upgrade to Enterprise plan | M2 (Cycle 11) | Survey B1 |
| 12 | 2FA Disable Auth Validation | Enforce TOTP code verification on `POST /api/2fa/disable` before removal | M2 (Cycle 12) | Survey B2 |
| 13 | Sheets-Sync Cron Hardening | Enforce constant-time timing-safe `CRON_SECRET` validation on `/api/cron/sheets-sync` | M2 (Cycle 13) | Survey B3 |
| 14 | Debug Route Protection | Remove or secure `GET /api/debug-error` to prevent stack trace leaks in production | M2 (Cycle 14) | Survey B4 |
| 15 | Middleware API Auth Handling | Return JSON 401 instead of 307 HTML redirect on unauthenticated `/api/*` requests | M2 (Cycle 15) | Survey B5 |
| 16 | Invoice Org Scoping | Ensure `/api/invoices` strictly respects `x-organization-id` instead of defaulting to first org | M2 (Cycle 16) | Survey B6 |
| 17 | Default Dataset Protection | Prevent deletion of system default dataset in `DELETE /api/datasets/[id]` | M2 (Cycle 17) | Survey B7 |
| 18 | Value Audit JSON Resilience | Safe parsing for malformed JSON strings in audit trail endpoints | M2 (Cycle 18) | Survey B8 |
| 19 | API Input Zod Validation | Strict request body schema validation on dataset & schema creation/update routes | M2 (Cycle 19) | Survey B9 |
| 20 | API Error Normalization | Standardized JSON error response format `{ error: string, code: string }` across all routes | M2 (Cycle 20) | Survey B10 |
| 21 | Supabase RLS Core Tables | Enable and verify RLS policies on all tenant-scoped Supabase tables | M3 (Cycle 21) | Survey D1 |
| 22 | Org Membership RLS Policy | Validate multi-tenant isolation policies on `OrganizationMember` and `Organization` | M3 (Cycle 22) | Survey D2 |
| 23 | Dataset & Record RLS Policy | Ensure dataset records and raw imports cannot be accessed across tenant boundaries | M3 (Cycle 23) | Survey D3 |
| 24 | Schema & Field Constraint Rules| Enforce unique constraints and cascade delete safety in Prisma schema | M3 (Cycle 24) | Survey D4 |
| 25 | Audit Log Immutability | Ensure audit log tables have append-only constraints and RLS prevent updates/deletes | M3 (Cycle 25) | Survey D5 |
| 26 | Prisma Soft-Delete Consistency | Audit soft-delete handling (`deletedAt`) across Prisma queries and relations | M3 (Cycle 26) | Survey D6 |
| 27 | Index Optimization | Verify database indexes on high-frequency tenant queries (`organizationId`, `userId`) | M3 (Cycle 27) | Survey D7 |
| 28 | Migration Drift & Rollback Safety | Audit migration files in `supabase/migrations/` for syntax and constraint integrity | M3 (Cycle 28) | Survey D8 |
| 29 | Foreign Key Orphan Prevention | Ensure relational integrity on user deletion, organization deletion, and dataset purging | M3 (Cycle 29) | Survey D9 |
| 30 | Database Connection Resilience | Verify connection pooling, timeout configurations, and graceful Prisma disconnects | M3 (Cycle 30) | Survey D10 |
| 31 | Import Queue Module Resolution | Fix broken module imports (`@/lib/services/import-queue` / `@/lib/bullmq`) | M4 (Cycle 31) | Survey A1 |
| 32 | Webhook Queue State Machine | Ensure resilient state transitions (`PENDING -> PROCESSING -> COMPLETED/FAILED`) | M4 (Cycle 32) | Survey A2 |
| 33 | Gemini Multi-Model Fallback | Harden fallback sequence (`gemini-2.5-pro -> gemini-2.5-flash -> gemini-1.5-flash`) | M4 (Cycle 33) | Survey A3 |
| 34 | AI Studio Token Quota Limiting | Enforce rate limiting and token consumption tracking per organization | M4 (Cycle 34) | Survey A4 |
| 35 | AI Studio Timeout Handling | Add strict timeout handlers and client disconnection detection for LLM generations | M4 (Cycle 35) | Survey A5 |
| 36 | Background Worker Error Retries | Configure exponential backoff and dead-letter queue handling for async jobs | M4 (Cycle 36) | Survey A6 |
| 37 | Realtime Channel Cleanup | Ensure Supabase Realtime channel unsubscriptions on view teardown | M4 (Cycle 37) | Survey A7 |
| 38 | File Upload Chunk Processing | Validate file size limits, MIME type verification, and partial upload cleanup | M4 (Cycle 38) | Survey A8 |
| 39 | Export Job Generation Resilience | Stream large CSV/JSON dataset exports with bounded memory footprint | M4 (Cycle 39) | Survey A9 |
| 40 | Async Notification Dispatch | Safe async email/notification queueing without blocking critical path APIs | M4 (Cycle 40) | Survey A10 |
| 41 | RBAC Role Hierarchy Enforcement | Strict role validation (`owner > admin > manager > member > viewer`) on all operations | M5 (Cycle 41) | Survey S1 |
| 42 | Last Owner Removal Prevention | Prevent removing or downgrading the last organization owner | M5 (Cycle 42) | Survey S2 |
| 43 | Member Invitation Token Lifecycle | Enforce expiration, single-use, and email match verification on invitations | M5 (Cycle 43) | Survey S3 |
| 44 | Ownership Transfer Transaction | Atomic database transaction for organization ownership transfer | M5 (Cycle 44) | Survey S4 |
| 45 | API Key Permission Scoping | Scoped permissions and expiration checks on programmatic API keys | M5 (Cycle 45) | Survey S5 |
| 46 | Cross-Tenant Data Leak Guard | Verification of `organizationId` injection protection across all data loaders | M5 (Cycle 46) | Survey S6 |
| 47 | Sensitive Field Scrubbing | Ensure passwords, hashes, TOTP secrets, and API keys are stripped from responses | M5 (Cycle 47) | Survey S7 |
| 48 | Rate Limiting on Sensitive Routes | Enforce IP and user rate limits on auth, password reset, and 2FA verify endpoints | M5 (Cycle 48) | Survey S8 |
| 49 | CSRF & Origin Header Validation | Verify origin/referer headers on state-mutating requests | M5 (Cycle 49) | Survey S9 |
| 50 | Security Audit Logging Integrity | Verify all auth and administrative actions emit structured audit records | M5 (Cycle 50) | Survey S10 |
| 51 | Master Regression & Verification | End-to-end full stack test execution, challenger stress-tests, forensic audit | M6 (Final) | Synthesis |

---

## Milestones
| # | Name | Scope | Cycles | Dependencies | Status |
|---|------|-------|--------|-------------|--------|
| M0 | Survey & Architecture Mapping | Full codebase survey (Frontend, Backend, Database/Security) | N/A | None | DONE |
| M1 | Frontend State, Race Conditions & UI | Error boundaries, TanStack cache keys, optimistic UI, state sync | 1-10 | M0 | IN_PROGRESS |
| M2 | Backend API Validation & Security | Route handler auth, zod validation, error normalization, critical vulns | 11-20 | M0 | PLANNED |
| M3 | Database, Supabase RLS & Schema | RLS policies, Prisma constraints, migration audit, soft-delete safety | 21-30 | M0 | PLANNED |
| M4 | Async Workflows, AI Studio & Jobs | BullMQ queues, Gemini fallback chain, SSE streams, timeouts | 31-40 | M1, M2 | PLANNED |
| M5 | Security, RBAC & Member Lifecycle | Role escalation prevention, last owner protection, invite tokens, 2FA | 41-50 | M2, M3 | PLANNED |
| M6 | Master Verification & Final Report | Full-stack regression test suite, challenger stress-tests, final audit report | Final | M1, M2, M3, M4, M5 | PLANNED |

---

## Interface Contracts
### Multi-Tenant Auth Context (`src/lib/auth.ts`)
- `getAuthSession()`: Returns `{ user, session, organization, role }` or throws `UnauthorizedError`/`ForbiddenError`.
- Roles: `"owner" | "admin" | "manager" | "member" | "viewer"`.
- Role hierarchy: `owner` (50) > `admin` (40) > `manager` (30) > `member` (20) > `viewer` (10).

### API Error Contract
- All error responses must return JSON: `{ error: string, code?: string, details?: any }` with appropriate HTTP status codes (`400`, `401`, `403`, `404`, `429`, `500`).
- No API route may return raw unhandled HTML (e.g., 307 redirect HTML or default Next.js error HTML).

### TanStack Query Key Standard (`src/lib/query-keys.ts`)
- All views and hooks must consume centralized query keys from `queryKeys` object to guarantee cache invalidation and optimistic update consistency across views.
