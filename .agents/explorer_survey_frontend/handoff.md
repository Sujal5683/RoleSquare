# Handoff Report — Frontend Architecture & State Survey

**Agent**: Explorer 1 (Frontend Architecture & State Survey)  
**Parent Agent**: Orchestrator 1 (`cd1ebbe9-c090-4cef-a988-62ddb5bf28c9`)  
**Date**: 2026-09-01  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

1. **Routing & Framework**:
   - `package.json:73` and `82`: Next.js `^16.1.1` with React `^19.0.0`, Tailwind CSS `^4`.
   - `src/app/workspace/page.tsx:19-61`: Server Component prefetches `initialSession` using `getCurrentUser()` with `React.cache()` and renders `<WorkspaceClient initialSession={initialSession} />`.
   - `src/app/workspace/workspace-client.tsx:37-60`: Client Component mounts `<AppShell>` and renders 14 primary views conditionally based on `useAppStore((s) => s.view)`.
   - `src/middleware.ts:40-94`: Edge middleware checks Supabase session cookies for all non-public paths and redirects to `/login`.

2. **State Management & Caching**:
   - `src/lib/store.ts:93-217`: Zustand store with `persist` middleware storing `view`, `selectedOrganizationId`, `theme`, `recentItems`, `desktopSidebarOpen`, `dismissedNotifications`, `readNotifications` to `localStorage`.
   - `src/components/providers.tsx:8-43`: TanStack Query v5 `QueryClient` initialized with `staleTime: 30_000`, `gcTime: 600_000`, `refetchOnWindowFocus: false`, `retry: 2`.
   - `src/components/app-shell.tsx:211-294`: Supabase Realtime channel `realtime-all-${activeOrgId}` listens for table changes (`AiJob`, `Source`, `SourceRun`, `Dataset`, `DatasetRecord`, `Schema`) and invalidates QueryClient caches.
   - `src/lib/api-client.ts:65-139`: Fetch wrapper injecting `x-organization-id` header from Zustand store, enforcing a 30s `AbortController` timeout, with retry logic for idempotent GET requests.

3. **Risk Area Observations (Exact Locations)**:
   - **Missing Error Boundaries**: Grep search for `ErrorBoundary` in `src/` returned 0 results. No `error.tsx` or `global-error.tsx` exist in `src/app/`.
   - **Optimistic Mutation Bug**:
     - `src/components/views/dataset-detail-view.tsx:517`: Query key is `["dataset-records", datasetId, page, statusFilter]`. Response payload format is `{ data: DatasetRecordDTO[], total: number, page: number, pageSize: number }`.
     - `src/components/views/dataset-inline-edit.tsx:65-86`: `onMutate` calls `queryClient.getQueryData(["dataset-records", datasetId])` (missing `page` and `statusFilter` in key) and checks `old.records` (property does not exist on `{ data: [...] }`).
     - `src/components/views/dataset-detail-view.tsx:641-651`: `statusMutation.onMutate` calls `setQueryData(["dataset-records", datasetId], ...)` instead of targeting the 4-part key.
   - **Query Key Inconsistencies**:
     - `src/lib/query-keys.ts:53`: `members: (orgId) => ["members", orgId]`.
     - `src/components/views/members-view.tsx:300`: `queryKey: ["organizations", activeOrgId, "members"]`.
     - `src/lib/query-keys.ts:58`: `usage: (orgId) => ["usage", orgId]`.
     - `src/components/views/usage-view.tsx:97` and `settings-view.tsx:1262`: `queryKey: ["usage-trends", orgId]`.
   - **Org Switch Desynchronization**:
     - `src/lib/store.ts:100`: `setOrganization: (id) => set({ selectedOrganizationId: id })` does not reset `selectedDatasetId`, `selectedSourceId`, `selectedSchemaId`, or `view`.
   - **Hydration Risk**:
     - `src/components/views/dataset-detail-view.tsx:419-430`: `useState(() => { if (typeof window === "undefined") return []; const raw = localStorage.getItem(...); ... })` directly accesses `localStorage` on initial client render, differing from server pre-render.
   - **Unhandled Promise Rejections**:
     - `src/app/login/page.tsx:44-60`: `supabase.auth.getSession()` and `fetch("/api/session")` inside `useEffect` lack `.catch()` error handlers.
   - **Streaming Abort Lifecycle**:
     - `src/components/assistant/use-assistant-chat.ts:183-260`: `fetch("/api/assistant/chat")` lacks an `AbortController` signal to terminate the reader stream on unmount or cancellation.

---

## 2. Logic Chain

1. **Architecture Classification**:
   - The application relies on a single-page view router inside `/workspace` while using App Router for marketing/auth pages.
   - Initial SSR pre-fetching in `workspace/page.tsx` prevents client-side loading waterfalls.
   - In-memory view state managed by Zustand allows instantaneous sub-millisecond view transitions between 14 domain views.

2. **State & Realtime Synchronization Reasoning**:
   - React Query handles caching and server data fetching with a 30s stale window.
   - Supabase Realtime WebSocket push invalidation acts as the primary synchronization layer when database rows change.
   - When query keys match exactly, Realtime updates trigger immediate re-renders across views.
   - However, discrepancies between `query-keys.ts` and view query keys (e.g. `members-view.tsx`, `usage-view.tsx`, `invitations-view.tsx`) prevent automated cache invalidation from reaching those views.

3. **Failure Scenarios**:
   - **Rendering Crash**: Because no `ErrorBoundary` is present, a runtime error in any child component (e.g., malformed dataset cell value or Recharts dimension error) unmounts the entire workspace view hierarchy.
   - **Optimistic UI Glitch**: Because `InlineEditCell` and `statusMutation` query keys do not match the active 4-part query key and expect `old.records` instead of `old.data`, optimistic updates fail silently until the backend responds.
   - **Cross-Org 404/403**: When a user switches organizations via the header dropdown while viewing a specific dataset, `selectedDatasetId` retains the old dataset ID, sending requests with a mismatched `x-organization-id` header.

---

## 3. Caveats

1. **Backend Verification**: This survey focuses strictly on frontend code in `src/app`, `src/components`, `src/hooks`, and `src/lib`. API Route Handlers in `src/app/api/` and database migrations were examined only as far as their REST DTO contracts interact with frontend queries.
2. **Offline Mode / Service Worker**: The PWA service worker (`/sw.js`) was noted in `layout.tsx:77-88`, but service worker caching strategies and IndexedDB offline persistence were not comprehensively evaluated.
3. **Browser Compatibility**: Testing was performed via static code inspection and TypeScript AST analysis on Windows.

---

## 4. Conclusion

The RoleSquare frontend architecture is feature-rich, highly interactive, and well-designed with Next.js 16, Zustand, and TanStack Query v5. It implements 14 full-fledged domain views covering data ingestion, visual schema modeling, 2-way Google Sheets synchronization, cross-org governance, AI extraction workflows, and an interactive AI assistant.

To achieve production-grade resilience, the following concrete fixes are recommended:
1. **Implement Root & View-Level Error Boundaries**: Add `src/app/error.tsx`, `src/app/global-error.tsx`, and a reusable `<ErrorBoundary>` around `<AppShell>` views.
2. **Fix Optimistic Cache Mutations**: Update `dataset-inline-edit.tsx` and `dataset-detail-view.tsx` to target `["dataset-records", datasetId, page, statusFilter]` and update `old.data`.
3. **Harmonize Query Keys**: Align `query-keys.ts` with `members-view.tsx`, `usage-view.tsx`, `invitations-view.tsx`, and `sharing-view.tsx`.
4. **Reset Active Resource IDs on Org Switch**: Update `setOrganization` in `src/lib/store.ts` to clear `selectedDatasetId`, `selectedSourceId`, `selectedSchemaId`, and reset `view: "dashboard"` if the active view belongs to a scoped resource.
5. **Fix Hydration in Saved Views**: Move `localStorage` view loading in `dataset-detail-view.tsx` into a `useEffect` after mount.
6. **Add Promise Catch Handlers & Abort Signals**: Add `.catch()` to auth session checks in `login/page.tsx` and attach `AbortController` to the AI Assistant stream in `use-assistant-chat.ts`.

---

## 5. Verification Method

To verify the observations and findings independently:

1. **Inspect Survey Report**:
   - Read `c:\CDS IIT JMU\.agents\explorer_survey_frontend\survey_report.md`.

2. **Verify Error Boundaries Absence**:
   - Run grep for `ErrorBoundary`: `grep_search` pattern `ErrorBoundary` in `c:\CDS IIT JMU\src`.
   - Inspect `c:\CDS IIT JMU\src\app` for `error.tsx` / `global-error.tsx`.

3. **Verify Optimistic Mutation Bug**:
   - Inspect `c:\CDS IIT JMU\src\components\views\dataset-inline-edit.tsx` lines 65-86. Compare key `["dataset-records", datasetId]` with `dataset-detail-view.tsx` lines 517-534 (`["dataset-records", datasetId, page, statusFilter]`).
   - Observe `old.records` check in `InlineEditCell` vs `old.data` in `dataset-detail-view.tsx`.

4. **Verify Query Key Inconsistencies**:
   - Inspect `c:\CDS IIT JMU\src\lib\query-keys.ts` lines 53, 58, 64 vs `src\components\views\members-view.tsx` line 300 and `src\components\views\usage-view.tsx` line 97.

5. **Verify Org Switcher State Behavior**:
   - Inspect `c:\CDS IIT JMU\src\lib\store.ts` line 100 (`setOrganization`).
