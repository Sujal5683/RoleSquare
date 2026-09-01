# Backend API & Middleware Architecture Survey — Handoff Report

## 1. Observation
- **Route Handlers Count**: Exactly 106 `route.ts` files were discovered under `src/app/api/` (confirmed via node filesystem walker and powershell scan).
- **Server Actions**: Zero instances of `"use server"` or `'use server'` exist anywhere in `src/` (confirmed via `grep_search`). The codebase is 100% REST Route Handler based.
- **Middleware Flow (`src/middleware.ts`)**:
  - `PUBLIC_PATHS` at lines 14-34 explicitly bypasses auth for `/api/auth/callback`, `/api/google/callback`, `/api/google-sheets/auth/callback`, `/api/health`, `/api/debug-error`, `/api/jobs/process`, and `/api/cron`.
  - Lines 73-75 use `supabase.auth.getSession()` (local JWT check, no live auth server network round-trip).
  - Lines 78-90 issue a `307 Temporary Redirect` to `/login?next=...` for unauthenticated requests, even when targeting `/api/*` endpoints.
- **Authorization Layer (`src/lib/auth.ts`)**:
  - `getCurrentUser` is cached per-request using React's `cache()` (lines 76-157).
  - `requireOrgContext` (lines 315-377) resolves org context via `?organizationId=` (strict 403 on invalid org), `x-organization-id` header (soft fallback), and defaults to first active org for GET requests (blocked for mutations).
  - `requireRole` (lines 433-449) enforces role hierarchy: `owner: 5, admin: 4, manager: 3, member: 2, viewer: 1`.
  - `verifyDatasetAccess` (lines 501-546) verifies direct org ownership role mapping or active `DatasetAccess` grant.
- **Specific Vulnerabilities Directly Observed**:
  1. `src/app/api/session/route.ts:58-60`: `if (typeof body.plan === "string") { dataToUpdate.plan = body.plan; }` allows unauthenticated plan modification directly from client JSON.
  2. `src/app/api/2fa/disable/route.ts:6-25`: `POST` disables 2FA (`twoFactorEnabled: false`) without requiring a TOTP code or password.
  3. `src/app/api/cron/sheets-sync/route.ts:26-33`: `if (cronSecret) { ... }` skips token validation if `process.env.CRON_SECRET` is unset, leaving the endpoint publicly triggerable due to the middleware `/api/cron` public prefix.
  4. `src/app/api/debug-error/route.ts:13-15`: Returns `{ error, stack }` with status 500 to unauthenticated callers.
  5. `src/app/api/invoices/route.ts:10-18`: Uses `user.memberships.find(m => m.status === "active")` ignoring `x-organization-id`, always returning the user's first org's invoices.
  6. `src/app/api/datasets/[id]/route.ts:167-199`: `DELETE` handler lacks `if (before.isDefault)` check, allowing deletion of organization default dataset.

---

## 2. Logic Chain
1. **API Structure**: By searching for `'use server'` and scanning all subdirectories in `src/app/api/`, we determined there are 106 Route Handlers and 0 Server Actions. Client-server data flow is managed via `src/lib/api-client.ts` with React Query.
2. **Session Verification**: In `src/middleware.ts`, `supabase.auth.getSession()` refreshes the JWT cookie on the Edge runtime. When an unauthenticated request hits an API route, the middleware redirects to `/login` with status 307. Because HTTP clients like `fetch` follow 307 redirects automatically, unauthenticated API calls receive HTML login pages rather than a JSON `{ error: "Unauthorized" }` 401 response.
3. **Privilege Escalation in Session Route**: In `src/app/api/session/route.ts`, the `PATCH` handler extracts `body.plan` without checking user permissions or verifying payment gateway webhooks, directly saving it to `db.user.update`. Any authenticated user can send `PATCH /api/session { "plan": "enterprise" }` to escalate their plan.
4. **2FA Security Gap**: In `src/app/api/2fa/disable/route.ts`, the handler calls `getCurrentUser()` and immediately sets `twoFactorEnabled: false` without prompting for a one-time password or verifying the user's password. If a session is hijacked, the attacker can immediately disable 2FA.
5. **Cron Open Endpoint**: In `src/app/api/cron/sheets-sync/route.ts`, the auth check is wrapped inside `if (cronSecret)`. If the deployment lacks `CRON_SECRET` in its environment configuration, the check is bypassed. Because `/api/cron` is exempted in `middleware.ts`, the sync cron can be executed by arbitrary external callers.

---

## 3. Caveats
- **Local Dev vs Production Auth**: In local development without Supabase or Redis running, `src/lib/queue.ts` falls back to erroring cleanly when Redis is unreachable.
- **External Services**: We did not execute live Google Workspace API calls (OAuth token exchange or live Gmail/Sheets scraping) during this read-only audit to avoid side effects or network dependency flakiness.

---

## 4. Conclusion
The backend architecture is clean, modular, and organized around Next.js App Router Route Handlers with strong multi-tenant scoping and BullMQ background task offloading. However, 8 distinct vulnerabilities and failure modes were identified (ranging from critical privilege escalation in `/api/session` to 2FA bypass and unauthenticated cron execution). Addressing these findings in targeted audit iterations will harden the platform to production readiness.

Full detailed report with all 106 route breakdowns is available in:
`c:\CDS IIT JMU\.agents\explorer_survey_backend\survey_report.md`

---

## 5. Verification Method
To independently verify the observations and findings:
1. **Count & Discover Routes**:
   ```bash
   node -e "const fs = require('fs'), path = require('path'); function getFiles(dir){let r=[]; fs.readdirSync(dir).forEach(f=>{let p=path.join(dir,f); if(fs.statSync(p).isDirectory()) r=r.concat(getFiles(p)); else if(f.startsWith('route.')) r.push(p);}); return r;} console.log(getFiles('src/app/api').length);"
   ```
2. **Inspect Plan Tampering Flaw**:
   - Inspect `src/app/api/session/route.ts` lines 58-60.
3. **Inspect 2FA Disable Flaw**:
   - Inspect `src/app/api/2fa/disable/route.ts` lines 6-25.
4. **Inspect Cron Secret Bypass Flaw**:
   - Inspect `src/app/api/cron/sheets-sync/route.ts` lines 26-33.
5. **Inspect Middleware Redirect Behavior**:
   - Inspect `src/middleware.ts` lines 78-90.
