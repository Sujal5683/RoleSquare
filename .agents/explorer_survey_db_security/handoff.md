# Handoff Report — Explorer 3 (Database, Supabase RLS, Async & Security Survey)

## 1. Observation

Direct observations from source inspection of `c:\CDS IIT JMU`:

1. **Database Schema & Migrations**:
   - `prisma/schema.prisma` lines 1–1043 defines 43 PostgreSQL models including `User`, `Organization`, `OrganizationMember`, `GoogleConnection`, `Source`, `Dataset`, `DatasetRecord`, `DatasetValue`, `AiJob`, `AiOutput`, `AgentLog`, `AssistantSession`, `AssistantMessage`, `SyncState`, `SyncConflict`, etc.
   - `prisma/migrations/20260823122632_add_dataset_access_invitation_models/migration.sql` creates tables, foreign keys, and indexes. It contains **0** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` statements and **0** `CREATE POLICY` statements.
   - `supabase/migrations/` is an empty directory.

2. **Supabase & Prisma Runtime Usage**:
   - `src/lib/db.ts` lines 9–15 patches `DATABASE_URL` with `?pgbouncer=true` and initializes `PrismaClient`. All application CRUD operations route through Prisma.
   - `src/lib/supabase/client.ts` and `src/lib/supabase/server.ts` initialize `@supabase/ssr` clients for auth token session exchange. No `supabase.from(...)` table calls exist in application code.

3. **Async Processing & Job Queue**:
   - `worker.ts` lines 186–194 initializes a BullMQ `Worker("ai-jobs", processBullJob, { concurrency: 7, lockDuration: 605000, ... })` with an HTTP health check server on port 8080.
   - `src/lib/queue.ts` lines 84–134 defines `enqueueJob()` connecting to Redis via `ioredis` (Upstash).
   - `src/lib/job-runner.ts` lines 178–282 implements `AI_EXTRACTION` fan-out into `EXTRACT_SINGLE_ROW` child jobs (batch size = 50).
   - `src/lib/gemini.ts` lines 32–38 defines a 5-tier model fallback chain (`gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`) with 60-second in-memory rate-limit cooldown.

4. **Security, RBAC & Isolation**:
   - `src/lib/auth.ts` lines 26–32 defines `ROLE_LEVEL: { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1 }`.
   - `src/lib/auth.ts` lines 315–377 (`requireOrgContext`) strictly validates `?organizationId=` query params and requires explicit org context for mutations.
   - `src/lib/dataset-access.ts` lines 27–88 (`resolveDatasetAccess`) resolves dataset ownership and `DatasetAccess` org/user grants.
   - `src/lib/google-auth.ts` lines 54–75 and `src/app/api/assistant/crypto.ts` lines 58–105 encrypt OAuth tokens and assistant chat messages using AES-256-GCM.

5. **Identified Vulnerabilities & Gaps**:
   - `src/lib/webhook-dispatcher.ts` line 11 and `src/app/api/google-sheets/import/route.ts` line 25 import `{ enqueueJob } from "@/lib/job-queue"`. File `@/lib/job-queue.ts` does not exist (`src/lib/queue.ts` is the correct path).
   - `src/app/api/session/route.ts` lines 58–60 permits clients to mutate `user.plan` directly via `PATCH /api/session`, allowing unauthenticated self-upgrade to `"enterprise"` which `checkUserLimits()` in `src/lib/usage.ts` trusts to bypass AI job/token limits.
   - `src/app/api/cron/sheets-sync/route.ts` lines 26–33 only validates `CRON_SECRET` `if (cronSecret)` is defined. If unset, any unauthenticated caller can invoke the route (which is also exempt in `src/middleware.ts`).
   - `src/app/api/2fa/setup/route.ts` lines 26–29 stores TOTP secret in plaintext in `User.twoFactorSecret`. `src/app/api/2fa/disable/route.ts` disables 2FA without requiring a valid TOTP code or password.
   - `src/app/api/invoices/route.ts` line 10 uses `user.memberships.find(m => m.status === "active")` ignoring explicit organization headers/query parameters.

---

## 2. Logic Chain

1. **Database & RLS Logic**:
   - Observation: `prisma/migrations` lacks RLS DDL and `supabase/migrations` is empty.
   - Observation: All application operations route via Prisma with direct postgres credentials.
   - Deduction: Database-level tenant isolation depends entirely on application code. While application-level checks in `requireOrgContext` are robust, any direct PostgREST requests using the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` could bypass application filters unless RLS is enabled or public schema table access is restricted.

2. **Async & AI Architecture Logic**:
   - Observation: `AI_EXTRACTION` divides rows into individual `EXTRACT_SINGLE_ROW` BullMQ jobs.
   - Observation: `gemini.ts` throws `GeminiRateLimitExhaustedError` when all 5 fallback models fail, and `isRetryableError` re-queues retryable errors.
   - Deduction: Row-level processing ensures rate limit spikes on individual rows do not fail an entire batch, preventing data loss.

3. **Vulnerability Logic**:
   - Observation: Import statements reference non-existent `@/lib/job-queue`.
   - Deduction: Calling webhook dispatches or Google Sheets imports will throw a runtime `Module not found` exception in Node.js.
   - Observation: `PATCH /api/session` allows setting `body.plan` without payment validation, and `checkUserLimits` checks `user.plan`.
   - Deduction: A user can upgrade their plan to `"enterprise"` for free by sending `{"plan": "enterprise"}` to `/api/session`.

---

## 3. Caveats

- Live database query execution was not performed against the remote Supabase production instance (`yyvsyqaihcaeambktvnr.supabase.co`) to protect production integrity; analysis is based on repository migration DDL and configuration.
- Local Redis service was not actively running during static analysis, but BullMQ queue topology and worker parameters were fully audited.
- No caveats regarding source code completeness across the audited repositories.

---

## 4. Conclusion

The database, queue, and security architectures are robustly structured for multi-tenant SaaS operation with AES-256-GCM encryption, granular RBAC, and BullMQ worker isolation. However, 6 specific security and functional defects were identified:
1. **Broken import**: `@/lib/job-queue` -> `@/lib/queue` in `webhook-dispatcher.ts` and `google-sheets/import/route.ts`.
2. **Billing bypass**: Unprotected `user.plan` mutation in `PATCH /api/session`.
3. **Database RLS absence**: Missing PostgreSQL RLS policies in migrations.
4. **Cron auth bypass**: Unchecked execution when `CRON_SECRET` is unset.
5. **2FA hardening**: Plaintext `twoFactorSecret` and missing confirmation on 2FA disable.
6. **Invoices tenant scoping**: Hardcoded first-membership fallback in `invoices/route.ts`.

Detailed findings and recommendations are cataloged in `survey_report.md`.

---

## 5. Verification Method

To independently verify the observations:

1. **Verify Broken Imports**:
   ```powershell
   # Search for invalid job-queue imports:
   Get-ChildItem -Path "src" -Recurse -Include *.ts,*.tsx | Select-String "from.*job-queue"
   ```
2. **Verify Missing RLS in Migrations**:
   ```powershell
   Get-ChildItem -Path "prisma/migrations","supabase" -Recurse | Select-String "ENABLE ROW LEVEL SECURITY"
   ```
3. **Inspect Plan Escalation Vector in `src/app/api/session/route.ts`**:
   Lines 58–67 of `src/app/api/session/route.ts`.
4. **Inspect Cron Secret Bypass in `src/app/api/cron/sheets-sync/route.ts`**:
   Lines 26–33 of `src/app/api/cron/sheets-sync/route.ts`.
5. **Review Survey Report**:
   Inspect `c:\CDS IIT JMU\.agents\explorer_survey_db_security\survey_report.md`.
