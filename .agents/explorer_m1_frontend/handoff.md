# Handoff Report — Milestone 1 (Frontend State, Race Conditions & UI Audit)

**Agent**: Explorer M1 (`explorer_m1_frontend`)  
**Type**: Hard Handoff (Investigation Complete)  
**Target Milestone**: M1 (Cycles 1–10)  
**Detailed Report**: `c:\CDS IIT JMU\.agents\explorer_m1_frontend\m1_exploration_report.md`

---

## 1. Observation

Direct source code inspection identified the following verbatim facts:

1. **Cycle 1 (Missing Error Boundaries)**:
   - `src/app/error.tsx`: File does NOT exist.
   - `src/app/global-error.tsx`: File does NOT exist.
   - `src/app/workspace/workspace-client.tsx`: Lines 41–58 render 14 domain views directly into `<AppShell>` without `<ErrorBoundary>`.
   - `src/components/app-shell.tsx`: Lines 628–636 render `{children}` without error boundary protection.

2. **Cycle 2 (Dataset Detail Optimistic Mutation Bugs)**:
   - `src/components/views/dataset-detail-view.tsx`: Lines 517–522 define `useQuery` with 4-part key `["dataset-records", datasetId, page, statusFilter]`.
   - Lines 641–643, 670–672, 698–700 call `queryClient.getQueryData(["dataset-records", datasetId])` (2-part key), returning `undefined`. `setQueryData` writes to the unused 2-part key.
   - `src/components/views/dataset-inline-edit.tsx`: Line 69 checks `if (!old || !old.records) return old;`. The API response payload is `{ data: DatasetRecordDTO[], total, page, pageSize }`, so `old.records` is `undefined`, causing the optimistic cell edit to be skipped entirely.

3. **Cycle 3 (Query Key Normalization)**:
   - `src/lib/query-keys.ts`: Lines 1–81 define `qk`, but a grep for `query-keys` across the repo showed **0 usages**.
   - `src/components/views/members-view.tsx`: Lines 300, 324, 337, 351, 362, 387 use `["organizations", activeOrgId, "members"]` instead of `qk.members(orgId)`.
   - `src/components/views/usage-view.tsx`: Line 97 uses `["usage-trends", orgId]` while `src/lib/query-keys.ts` line 59 defines `usageTrends: () => ["usage-trends"]`.
   - `src/components/views/invitations-view.tsx`: Lines 72, 247, 426 use `["invitations", "incoming"]` and `["invitations", "outgoing", activeOrgId]`.

4. **Cycle 4 (Org Switcher State Sync)**:
   - `src/lib/store.ts`: Lines 99–101 define `setOrganization: (id) => set({ selectedOrganizationId: id })`. It leaves `selectedDatasetId`, `selectedSourceId`, `selectedSchemaId`, `selectedRecordId`, `sourceBuilderDraft`, and `sourceBuilderStep` populated with previous organization resource IDs.
   - `src/components/app-shell.tsx`: Line 499 invokes `setActiveOrgId(o.id)` without resetting detail views.

5. **Cycle 5 (Hydration Stability)**:
   - `src/components/views/dataset-detail-view.tsx`: Lines 419–430 initialize `savedViews` by synchronously reading `localStorage.getItem(...)` inside the `useState` initializer, causing SSR HTML / client DOM mismatches.
   - `formatDistanceToNow` calls across views produce clock drift hydration warnings.

6. **Cycle 6 (Assistant Chat Streaming)**:
   - `src/components/assistant/use-assistant-chat.ts`: Lines 143–302 (`sendMessage`) and lines 499–504 (`clearChat`) lack `AbortController` cancellation.
   - Unmounting or resetting chat while streaming keeps the `reader.read()` loop running, calling `setMessages` on dead/reset state.

7. **Cycle 7 (Form Double-Submit Protection)**:
   - `src/components/views/invite-member-dialog.tsx`: Line 82 calls `onClose()` in `onMutate` before request completion. `handleSubmit` (lines 106–121) lacks `if (inviteMutation.isPending) return;`.
   - `src/components/views/datasets-view.tsx`: Lines 847–858 (`CreateDatasetDialog`) lacks in-flight mutation locks.

8. **Cycle 8 (Table Selection State Sync)**:
   - `src/components/views/dataset-detail-view.tsx`: Line 367 stores `selectedRecords`. Lines 1817, 1829 (`setPage`) and status filters do not clear `selectedRecords`.
   - Line 1472 checkbox checks `selectedRecords.size === filteredRecords.length`, leading to cross-page ghost selections and bulk deletion of off-page rows.

9. **Cycle 9 (Centralized Toast & Error Handling)**:
   - `src/components/providers.tsx`: Lines 8–43 initialize `QueryClient` without `MutationCache({ onError })` or `QueryCache({ onError })`.
   - Mutations lacking explicit inline toasts drop unhandled errors silently.

10. **Cycle 10 (Auth Redirect & Network Error Handling)**:
    - `src/app/login/page.tsx`: Lines 43–61 lack `.catch()` on session pre-check. Lines 77, 124 call `await res.json()` on error responses, which crashes with `SyntaxError` when backend returns 502/504 HTML.

---

## 2. Logic Chain

1. **Error Boundaries (C1)**: Because Next.js App Router requires `error.tsx` for route segment catching and `global-error.tsx` for root layout crashes, and React requires class ErrorBoundaries for component subtree errors, their total absence means any single uncaught error in any view crashes the entire application into a blank screen.
2. **Optimistic Mutations (C2)**: In TanStack Query v5, `getQueryData` and `setQueryData` use exact key matching. Querying `["dataset-records", datasetId]` cannot find cache entries stored under `["dataset-records", datasetId, page, statusFilter]`. Furthermore, accessing `old.records` on an object shaped as `{ data: [...] }` evaluates to `undefined`, silently bypassing all optimistic updates and rollback logic.
3. **Query Key Drift (C3)**: Query keys that do not match the invalidation triggers will never be invalidated. Because views use disjoint string arrays and ignore `src/lib/query-keys.ts`, background updates (Supabase Realtime / AI Assistant) fail to refresh views automatically.
4. **Org Switcher Desync (C4)**: Changing `selectedOrganizationId` in Zustand while preserving `selectedDatasetId` causes immediate cross-tenant API requests (fetching Org A's dataset using Org B's session context), causing 404/403 errors and UX failure.
5. **Hydration Violations (C5)**: React 19 expects the initial client render tree to match the server HTML exactly. Reading `localStorage` during initial `useState` creation breaks this contract whenever local storage contains saved data.
6. **Streaming Zombie Reads (C6)**: Without `AbortController.abort()`, unmounting or clearing an SSE reader loop allows asynchronous chunks to continue resolving and setting state on unmounted/cleared sessions.
7. **Form Race Conditions (C7)**: Rapid user interactions without submission guards or `<form onSubmit>` wrappers dispatch concurrent HTTP mutations, causing duplicate entity creation.
8. **Table Selection Phantom State (C8)**: When pagination and filtering occur without clearing `selectedRecords`, IDs from previous pages persist, corrupting select-all calculations and causing destructive bulk operations on off-screen rows.
9. **Mutation Failure Blindspot (C9)**: TanStack Query mutations do not show notifications unless explicitly instructed. Global `MutationCache({ onError })` is required to ensure no mutation fails silently.
10. **Auth JSON Parse Exceptions (C10)**: Reverse proxies and cloud hosts return HTML on 502/504/timeout errors. Calling `res.json()` directly on failed responses throws unhandled SyntaxErrors that hide actionable error messages from users.

---

## 3. Caveats

1. The current codebase has not yet applied the fix implementations (this exploration report is read-only).
2. Backend API routes (Milestones 2–5) will be audited in subsequent milestones; however, all frontend interaction contracts for M1 have been precisely identified.
3. No other caveats.

---

## 4. Conclusion

All 10 cycles of Milestone 1 have been deeply explored, with exact file paths, line numbers, reproduction scenarios, failure mechanics, and drop-in code fixes documented in `m1_exploration_report.md`. The implementation plan is clear and ready for Worker execution.

---

## 5. Verification Method

Once implemented, the following steps verify the fixes:
1. **Type & Lint Check**: `npm run build` or `npx tsc --noEmit` must pass without TypeScript errors.
2. **Error Boundary Verification**: Intentionally throw an error inside `DashboardView` and verify `<ViewErrorBoundary>` catches it, preserves AppShell header/sidebar, and provides a working "Try again" button.
3. **Optimistic UI Verification**: Perform inline cell edits and status changes on dataset records; verify immediate UI update and verify rollback when simulating network failure.
4. **Query Key Verification**: Verify that AI Assistant mutations (`invite_member`, `create_schema`, `delete_dataset`) immediately reflect in views without page reloads.
5. **Org Switcher Verification**: Open a dataset detail view, switch org, and verify the UI resets to the datasets list view of the newly active org without 404 errors.
6. **Hydration Verification**: Load dataset detail view with saved views in localStorage; verify 0 React hydration mismatch errors in dev console.
7. **Assistant Abort Verification**: Send a long prompt in AI assistant, click "Clear chat" mid-stream, verify stream terminates cleanly without memory leak warnings.
8. **Selection Sync Verification**: Select rows on Page 1, navigate to Page 2, verify selection count resets to 0.

---
