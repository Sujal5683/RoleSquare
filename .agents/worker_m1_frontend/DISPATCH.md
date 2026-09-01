## 2026-09-01T08:54:44Z

Implementation Tasks (Milestone 1, Cycles 1-10):
1. Cycle 1 (Error Boundaries):
   - Implement `src/app/error.tsx` (App Router error boundary with retry button).
   - Implement `src/app/global-error.tsx` (Root error boundary with full HTML/body recovery).
   - Create `src/components/view-error-boundary.tsx` and integrate it into `src/components/app-shell.tsx` around the dynamic view container.
2. Cycle 2 (Dataset Optimistic UI & Cache Key Alignment):
   - Fix `dataset-detail-view.tsx` optimistic updates to match the active 4-part query key `queryKeys.datasets.records(datasetId, page, statusFilter)` or standard queryKey pattern.
   - Fix `dataset-inline-edit.tsx` to handle `old.data` (or correct data structure) and robust rollback.
3. Cycle 3 (Query Key Normalization):
   - Update `src/lib/query-keys.ts` with clean query key definitions for all domain views.
   - Update `members-view.tsx`, `usage-view.tsx`, and `invitations-view.tsx` to strictly consume `queryKeys` instead of disparate hardcoded strings.
4. Cycle 4 (Org Switcher Resource Reset):
   - In `src/store/app-store.ts`, update `setOrganization` to clear/reset `selectedDatasetId`, `selectedSourceId`, `selectedSchemaId`, `selectedViewId` to `null` to avoid stale cross-tenant resource references.
5. Cycle 5 (Hydration Mismatch Fix):
   - In `dataset-detail-view.tsx` and any related components, remove direct `localStorage` access from `useState` initializers. Use a `useEffect` or safe mounting pattern to read client-only persisted state.
6. Cycle 6 (Assistant Chat Streaming & Cancellation):
   - In `src/hooks/use-assistant-chat.ts`, attach an `AbortController` to the SSE stream. Expose an `abort()` / `stopGeneration()` handler. Clean up stream listener on component unmount.
7. Cycle 7 (Form Double-Submit Protection):
   - Ensure form submission handlers and buttons across dialogs (invite member, create dataset, create schema) disable the submit button and prevent duplicate submission while `isPending` / `isSubmitting` is true.
8. Cycle 8 (Table Bulk Selection Reset):
   - In `dataset-detail-view.tsx`, reset `selectedRows` / `selectedRecordIds` whenever `page`, `statusFilter`, or `datasetId` changes.
9. Cycle 9 (Centralized Toast & Mutation Error Handling):
   - In `src/app/providers.tsx` (or QueryClient configuration), add a default `MutationCache({ onError: ... })` handler that emits an error toast for unhandled mutation failures.
10. Cycle 10 (Auth Network & Non-JSON Error Resilience):
   - In `src/app/login/page.tsx`, wrap API auth calls in resilient try/catch checking for response content-type before parsing JSON, handling network failures gracefully without unhandled promise rejections.
