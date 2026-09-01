# Milestone 1: Frontend State, Race Conditions & UI Audit — Deep Exploration Report

**Agent**: Explorer M1 (`explorer_m1_frontend`)  
**Scope**: Cycles 1 to 10 (Milestone 1)  
**Date**: 2026-09-01  
**Working Directory**: `c:\CDS IIT JMU\.agents\explorer_m1_frontend`

---

## Executive Summary

Milestone 1 covers the frontend architecture of RoleSquare (Next.js 16 App Router, React 19, Zustand, TanStack Query v5, Supabase Realtime). A comprehensive code audit across all views, hooks, stores, and layout components revealed critical vulnerabilities and bugs in:
1. Complete absence of React error boundaries and Next.js route error boundaries.
2. Silent failure and data corruption in dataset optimistic UI mutations due to cache key mismatches and invalid object property access (`old.records` vs `old.data`).
3. Complete disconnect between centralized query key factory `src/lib/query-keys.ts` and actual view components.
4. Organization switcher race conditions retaining stale resource IDs across tenant boundaries.
5. React hydration mismatches caused by direct `localStorage` access during `useState` initialization and relative date calculations.
6. SSE Assistant chat streams lacking `AbortController` cancellation, causing zombie stream executions and unhandled background state mutations.
7. Double-submit vulnerabilities across modal forms.
8. Unsynchronized table bulk selection states retaining out-of-page record IDs on pagination and filtering.
9. Unhandled mutation failures due to unconfigured global TanStack Query mutation error caches.
10. Fragile network exception and JSON parsing handling in authentication and 2FA login workflows.

---

## Detailed Investigation by Audit Cycle

---

### Cycle 1: Missing Error Boundaries

#### 1. Exact File Paths & Line Numbers
- `src/app/error.tsx`: **MISSING** (File does not exist).
- `src/app/global-error.tsx`: **MISSING** (File does not exist).
- `src/app/workspace/workspace-client.tsx`: Lines 41–58 (`<WorkspaceClient>` renders 14 domain views inside `<AppShell>` without an error boundary wrapper).
- `src/components/app-shell.tsx`: Lines 628–636 (`<main><div key={view}>{children}</div></main>` directly renders child views without boundary protection).

#### 2. Failure Mode & Reproduction Scenario
- **Failure Mode**: Any unhandled render error, lifecycle exception, or malformed data access (e.g., `cannot read property 'x' of undefined` during record rendering in `<DatasetDetailView>` or AI response parsing in `<AiStudioView>`) unmounts the entire React root.
- **Reproduction**:
  1. Navigate to `/workspace`.
  2. Switch to a view where an unexpected null/undefined data value is rendered (e.g. malformed dataset record).
  3. React throws during render.
  4. The entire page crashes into a blank white screen; sidebar, header, org switcher, and floating assistant panel are destroyed.
  5. In Next.js production builds, absence of `global-error.tsx` results in unstyled generic browser crash text.

#### 3. Recommended Code Fix
1. Create `src/components/ui/error-boundary.tsx`:
```tsx
"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ViewErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ViewErrorBoundary] Uncaught error:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-6">
          <Card className="max-w-lg border-destructive/20 bg-destructive/5 shadow-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">
                {this.props.fallbackTitle || "Something went wrong in this view"}
              </CardTitle>
              <CardDescription>
                {this.props.fallbackDescription ||
                  "An unexpected error occurred while rendering this component."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-32 overflow-auto rounded bg-background/80 p-3 font-mono text-xs text-muted-foreground border">
                {this.state.error?.message || "Unknown error"}
              </div>
            </CardContent>
            <CardFooter className="flex justify-center gap-3">
              <Button variant="outline" size="sm" onClick={this.handleReset}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Try again
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  window.location.href = "/workspace";
                }}
              >
                <Home className="mr-2 h-3.5 w-3.5" />
                Return to Dashboard
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
```

2. Create `src/app/error.tsx`:
```tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AppError] Route segment error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Application Error</h1>
        <p className="text-sm text-muted-foreground">
          An error occurred in this workspace view. You can reload the view or return to safety.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Button variant="outline" onClick={() => reset()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
          <Button onClick={() => (window.location.href = "/workspace")}>
            Reload Workspace
          </Button>
        </div>
      </div>
    </div>
  );
}
```

3. Create `src/app/global-error.tsx`:
```tsx
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100 font-sans">
        <div className="max-w-md text-center space-y-4 p-6 border border-zinc-800 rounded-xl bg-zinc-900 shadow-2xl">
          <h2 className="text-2xl font-bold text-red-400">Critical Application Error</h2>
          <p className="text-sm text-zinc-400">
            A fatal error occurred at root level.
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition"
          >
            Reload application
          </button>
        </div>
      </body>
    </html>
  );
}
```

4. Wrap views in `src/app/workspace/workspace-client.tsx`:
```tsx
<AppShell initialSession={initialSession}>
  <ViewErrorBoundary>
    {view === "dashboard" && <DashboardView />}
    {view === "sources" && <SourcesView />}
    ...
  </ViewErrorBoundary>
  <GlobalProgress />
</AppShell>
```

---

### Cycle 2: Dataset Detail View Optimistic Mutation Bugs

#### 1. Exact File Paths & Line Numbers
- `src/components/views/dataset-detail-view.tsx`:
  - Lines 517–534: Paginated records query defined with 4-part query key `["dataset-records", datasetId, page, statusFilter]`.
  - Lines 640–663 (`statusMutation`):
    - Line 641: `await queryClient.cancelQueries({ queryKey: ["dataset-records", datasetId] });`
    - Line 642: `const previousRecords = queryClient.getQueryData(["dataset-records", datasetId]);` — Exact match fails, returns `undefined`.
    - Line 643: `queryClient.setQueryData(["dataset-records", datasetId], ...)` — Writes to unused 2-part key.
    - Lines 659–663: Rollback writes `context.previousRecords` (undefined) to 2-part key.
  - Lines 666–690 (`bulkStatusMutation`): Identical 2-part key bug.
  - Lines 693–721 (`deleteMutation`): Identical 2-part key bug.
  - Lines 723–746 (`applyEditMutation`): No optimistic update or rollback logic.
- `src/components/views/dataset-inline-edit.tsx`:
  - Lines 62–86 (`updateMutation.onMutate`):
    - Line 65: `const previousRecords = queryClient.getQueryData(["dataset-records", datasetId]);` (2-part key mismatch).
    - Line 69: `if (!old || !old.records) return old;` — **CRITICAL**: The API returns `{ data: DatasetRecordDTO[], total, page, pageSize }`, NOT `records`. Because `old.records` is `undefined`, the optimistic update function returns `old` unmodified and does nothing!

#### 2. Failure Mode & Reproduction Scenario
- **Failure Mode**:
  1. Optimistic updates in `statusMutation`, `bulkStatusMutation`, `deleteMutation`, and `InlineEditCell` fail to update the active table on screen.
  2. Rollback upon server failure cannot restore previous state because `context.previousRecords` was captured as `undefined`.
  3. In `dataset-inline-edit.tsx`, accessing `old.records` instead of `old.data` completely breaks optimistic inline cell edits.
- **Reproduction**:
  1. Open a dataset in `dataset-detail-view.tsx`.
  2. Double click a cell or click "Approve" on a row status badge.
  3. Notice the UI does not optimistically reflect the change immediately; it only updates after the HTTP roundtrip settles (or fails silently).
  4. Throttle network to offline: trigger status update. Note that the UI has no rollback behavior.

#### 3. Recommended Code Fix
1. In `src/components/views/dataset-detail-view.tsx`:
Replace single-key targeting with `setQueriesData` or scoped 4-part key:
```tsx
const recordsQueryKey = ["dataset-records", datasetId, page, statusFilter] as const;

// In statusMutation:
onMutate: async ({ recordId, status }) => {
  await queryClient.cancelQueries({ queryKey: ["dataset-records", datasetId] });
  
  // Snapshot all matching paginated queries for this dataset
  const previousQueries = queryClient.getQueriesData<{
    data: DatasetRecordDTO[];
    total: number;
    page: number;
    pageSize: number;
  }>({ queryKey: ["dataset-records", datasetId] });

  queryClient.setQueriesData<{
    data: DatasetRecordDTO[];
    total: number;
    page: number;
    pageSize: number;
  }>({ queryKey: ["dataset-records", datasetId] }, (old) => {
    if (!old || !old.data) return old;
    return {
      ...old,
      data: old.data.map((r) => (r.id === recordId ? { ...r, status } : r)),
    };
  });

  return { previousQueries };
},
onError: (err, _vars, context) => {
  if (context?.previousQueries) {
    context.previousQueries.forEach(([key, data]) => {
      queryClient.setQueryData(key, data);
    });
  }
  toast.error("Update failed", {
    description: err instanceof Error ? err.message : "Failed to update status",
  });
},
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ["dataset-records", datasetId] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}
```

2. In `src/components/views/dataset-inline-edit.tsx`:
```tsx
onMutate: async (newValue: string) => {
  await queryClient.cancelQueries({ queryKey: ["dataset-records", datasetId] });
  const previousQueries = queryClient.getQueriesData<{ data: DatasetRecordDTO[] }>({
    queryKey: ["dataset-records", datasetId],
  });

  queryClient.setQueriesData<{ data: DatasetRecordDTO[] }>(
    { queryKey: ["dataset-records", datasetId] },
    (old: any) => {
      if (!old) return old;
      const recordsList = Array.isArray(old) ? old : old.data;
      if (!recordsList) return old;

      const updatedRecords = recordsList.map((record: any) => {
        if (record.id === recordId) {
          const newValues = [...(record.values || [])];
          const valIndex = newValues.findIndex((v: any) => v.fieldId === fieldId);
          if (valIndex >= 0) {
            newValues[valIndex] = { ...newValues[valIndex], value: newValue };
          } else {
            newValues.push({ id: "temp-" + Date.now(), fieldId, value: newValue, confidence: 1 });
          }
          return { ...record, values: newValues };
        }
        return record;
      });

      return Array.isArray(old) ? updatedRecords : { ...old, data: updatedRecords };
    }
  );

  onClose();
  if (onSaveSuccess) onSaveSuccess(initialValue, newValue, valueId || "temp");
  return { previousQueries };
},
onError: (_err, _newVal, context) => {
  if (context?.previousQueries) {
    context.previousQueries.forEach(([key, data]) => {
      queryClient.setQueryData(key, data);
    });
  }
  toast.error("Failed to save value");
},
```

---

### Cycle 3: Query Key Normalization

#### 1. Exact File Paths & Line Numbers
- `src/lib/query-keys.ts`: Lines 1–81 (Factory defined but unreferenced repo-wide).
- `src/components/views/members-view.tsx`:
  - Line 300, 324, 337, 351, 362, 387: Uses hardcoded `["organizations", activeOrgId, "members"]` instead of `qk.members(orgId)` (`["members", orgId]`).
- `src/components/views/usage-view.tsx`:
  - Line 97: Uses `["usage-trends", orgId]` while `src/lib/query-keys.ts` Line 59 defines `usageTrends: () => ["usage-trends"]`.
- `src/components/views/invitations-view.tsx`:
  - Lines 72, 426, 437, 450: Uses `["invitations", "outgoing", activeOrgId]`.
  - Line 247: Uses `["invitations", "incoming"]`.
  - Lines 86, 108, 129, 217, 238: Uses `["invitations"]`.
  - In `src/lib/query-keys.ts` Line 54, only `invitations: (orgId) => ["invitations", orgId]` was declared.

#### 2. Failure Mode & Reproduction Scenario
- **Failure Mode**: When mutations or AI Assistant actions execute (e.g. `invite_member` assistant tool invalidating `["organizations"]` or `["members"]`), the query caches in `members-view.tsx` and `invitations-view.tsx` do not get invalidated because the query key shapes differ. Users must manually reload the page to see updated member lists or invitations.
- **Reproduction**:
  1. Open Members view in one window.
  2. In AI Assistant panel, execute "Invite user test@example.com as viewer".
  3. AI confirms member invitation and invalidates `["organizations"]` / `["session"]`.
  4. Members view fails to refetch because its query key is `["organizations", activeOrgId, "members"]`.

#### 3. Recommended Code Fix
1. Update `src/lib/query-keys.ts`:
```ts
export const qk = {
  // Sources
  sources:        (orgId: string)                      => ["sources", orgId] as const,
  source:         (sourceId: string)                   => ["source", sourceId] as const,
  sourceRuns:     (sourceId: string)                   => ["source-runs", sourceId] as const,

  // Datasets
  datasets:       (orgId: string)                      => ["datasets", orgId] as const,
  dataset:        (datasetId: string)                  => ["dataset", datasetId] as const,
  records:        (datasetId: string, page?: number, status?: string) => 
                  ["dataset-records", datasetId, page ?? 1, status ?? "all"] as const,

  // Schemas
  schemas:        (orgId: string)                      => ["schemas", orgId] as const,
  schema:         (schemaId: string)                   => ["schema", schemaId] as const,

  // AI Jobs
  jobs:           (orgId?: string)                     => orgId ? ["ai-jobs", orgId] as const : ["ai-jobs"] as const,
  job:            (jobId: string)                      => ["ai-job", jobId] as const,

  // Dashboard
  dashboard:      (orgId: string, dateRange?: string)  => ["dashboard", orgId, dateRange] as const,

  // Auth / Session
  session:        ()                                   => ["session"] as const,

  // Members & Organizations
  members:        (orgId: string)                      => ["organizations", orgId, "members"] as const,
  organizations:  ()                                   => ["organizations"] as const,
  
  // Invitations
  invitations: {
    incoming:     ()                                   => ["invitations", "incoming"] as const,
    outgoing:     (orgId: string)                      => ["invitations", "outgoing", orgId] as const,
    all:          ()                                   => ["invitations"] as const,
  },

  // Usage
  usage:          (orgId: string)                      => ["usage", orgId] as const,
  usageTrends:    (orgId?: string)                     => orgId ? ["usage-trends", orgId] as const : ["usage-trends"] as const,
} as const;
```

2. Replace raw string arrays in `members-view.tsx`, `usage-view.tsx`, `invitations-view.tsx`, and `app-shell.tsx` with `qk.*`.

---

### Cycle 4: Org Switcher State Sync

#### 1. Exact File Paths & Line Numbers
- `src/lib/store.ts`:
  - Lines 99–101: `setOrganization: (id) => set({ selectedOrganizationId: id })`.
  - Stale state properties: `selectedDatasetId` (line 41), `selectedSourceId` (line 34), `selectedSchemaId` (line 44), `selectedRecordId` (line 47), `sourceBuilderDraft` (line 36), `sourceBuilderStep` (line 38), `view` (line 27).
- `src/components/app-shell.tsx`:
  - Lines 497–508: Org dropdown calls `setActiveOrgId(o.id)` without cleaning up active detail view states or route parameters.

#### 2. Failure Mode & Reproduction Scenario
- **Failure Mode**:
  1. Cross-tenant state leakage in UI: User opens a dataset belonging to Org A (`selectedDatasetId = "ds_orgA_01"`, `view = "dataset-detail"`).
  2. User switches to Org B in the header org switcher.
  3. `selectedDatasetId` remains `"ds_orgA_01"`. `DatasetDetailView` fires `GET /api/datasets/ds_orgA_01` with `x-organization-id: Org B`.
  4. Backend returns 404 Not Found or 403 Forbidden, causing error toasts or view crash.
- **Reproduction**:
  1. Open dataset details for an Org 1 dataset.
  2. Switch to Org 2 in the dropdown.
  3. View stays on `dataset-detail` attempting to fetch Org 1's dataset under Org 2's session.

#### 3. Recommended Code Fix
Update `src/lib/store.ts`:
```ts
setOrganization: (id: string) =>
  set((s) => {
    // If user is currently in a resource detail view, bounce them back to the list view
    let targetView = s.view;
    if (s.view === "dataset-detail") targetView = "datasets";
    else if (s.view === "source-builder") targetView = "sources";

    return {
      selectedOrganizationId: id,
      selectedDatasetId: null,
      selectedSourceId: null,
      selectedSchemaId: null,
      selectedRecordId: null,
      sourceBuilderDraft: null,
      sourceBuilderStep: 0,
      view: targetView,
    };
  }),
```

---

### Cycle 5: Hydration Stability

#### 1. Exact File Paths & Line Numbers
- `src/components/views/dataset-detail-view.tsx`:
  - Lines 419–430:
    ```tsx
    const [savedViews, setSavedViews] = useState<...>(() => {
      if (typeof window === "undefined") return [];
      try {
        const key = `wip-saved-views-${datasetId}`;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    });
    ```
- `formatDistanceToNow` date formatting across SSR-rendered views:
  - `dataset-detail-view.tsx`: Line 166
  - `datasets-view.tsx`: Line 88
  - `sources-view.tsx`: Line 111
  - `members-view.tsx`: Line 110
  - `organizations-view.tsx`: Line 77
  - `audit-view.tsx`: Line 61
  - `invitations-view.tsx`: Lines 313, 389, 519, 595, 605

#### 2. Failure Mode & Reproduction Scenario
- **Failure Mode**:
  1. On server pre-render, `typeof window === "undefined"` evaluates to true -> `savedViews` is `[]`.
  2. On client initial hydration, `useState` initializer reads `localStorage` containing saved views.
  3. Initial client render creates button DOM nodes for saved views, differing from the server-rendered HTML.
  4. React 19 throws Hydration Error: "Hydration failed because the initial UI does not match what was rendered on the server."
  5. `formatDistanceToNow` computes timestamps based on server clock during build vs browser clock during hydration, causing text mismatch warnings.
- **Reproduction**:
  1. Save a custom view filter in Dataset Detail View (populates `localStorage`).
  2. Refresh the page (`F5`).
  3. React throws a hydration mismatch error in browser devtools console.

#### 3. Recommended Code Fix
1. In `src/components/views/dataset-detail-view.tsx`:
```tsx
const [savedViews, setSavedViews] = useState<
  { id: string; name: string; statusFilter: string; search: string; hiddenFields: string[] }[]
>([]);

// Load from localStorage only after component mounts on the client
useEffect(() => {
  if (!datasetId) return;
  try {
    const raw = localStorage.getItem(`wip-saved-views-${datasetId}`);
    if (raw) {
      setSavedViews(JSON.parse(raw));
    }
  } catch (err) {
    console.warn("[SavedViews] Failed to load saved views:", err);
  }
}, [datasetId]);
```

2. Wrap relative timestamp displays in `<span suppressHydrationWarning>{relativeTime(iso)}</span>` or use a deterministic format during SSR.

---

### Cycle 6: Assistant Chat Streaming

#### 1. Exact File Paths & Line Numbers
- `src/components/assistant/use-assistant-chat.ts`:
  - Lines 143–302 (`sendMessage`): Calls `fetch("/api/assistant/chat", { ... })` without an `AbortSignal`.
  - Lines 207–260 (Stream reader loop): No cancellation check or reader release on abort.
  - Lines 499–504 (`clearChat`): Does not cancel in-flight SSE stream reader.
- `src/components/assistant/assistant-panel.tsx`:
  - Lines 430–520: Input and buttons disabled when `isLoading` is true, but no "Stop" generation button is provided.

#### 2. Failure Mode & Reproduction Scenario
- **Failure Mode**:
  1. Zombie streaming: User sends a long prompt to AI assistant. If user clicks "Clear Chat" or navigates views, the stream reader continues reading incoming tokens and calling `setMessages`, resurrecting the streaming response in the newly cleared chat or causing React memory leak warnings.
  2. Unrecoverable stream interrupts: If the network connection drops mid-stream, `reader.read()` hangs indefinitely.
  3. User has no ability to cancel a slow or misbehaving generation.
- **Reproduction**:
  1. Open AI Assistant panel.
  2. Send: "Generate a 10-field schema for medical insurance claims with detailed descriptions".
  3. While tokens are streaming in, click the "Clear chat" trash button.
  4. Observe incoming tokens still appearing or `setMessages` firing on unmounted state.

#### 3. Recommended Code Fix
In `src/components/assistant/use-assistant-chat.ts`:
```ts
const abortControllerRef = useRef<AbortController | null>(null);

const stopStreaming = useCallback(() => {
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }
}, []);

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };
}, []);

const sendMessage = useCallback(
  async (text: string) => {
    if (!text.trim() || isLoading) return;
    
    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    ...

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({ ... }),
      });

      ...
      if (reader) {
        while (true) {
          if (abortController.signal.aborted) {
            await reader.cancel();
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          ...
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // Stream aborted by user — finalize gracefully
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id
              ? { ...m, isStreaming: false, content: m.content + " *(generation stopped)*" }
              : m
          )
        );
        return;
      }
      const errMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id
            ? { ...m, content: `❌ **Error:** ${errMsg}`, isStreaming: false, retryAvailable: true }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  },
  [...]
);
```

In `clearChat`:
```ts
const clearChat = useCallback(() => {
  stopStreaming();
  setMessages([]);
  setActiveModel(null);
  setSessionId(undefined);
  setActivityLog([]);
}, [stopStreaming]);
```

Export `stopStreaming` from `useAssistantChat` and render a Stop button in `assistant-panel.tsx`.

---

### Cycle 7: Form Double-Submit Protection

#### 1. Exact File Paths & Line Numbers
- `src/components/views/invite-member-dialog.tsx`:
  - Lines 80–84: Calls `onClose()` inside `onMutate` before mutation completes.
  - Lines 106–121: `handleSubmit` does not check `if (inviteMutation.isPending) return;`.
  - Lines 124–209: Modal contents lack a `<form onSubmit={...}>` wrapper.
- `src/components/views/datasets-view.tsx`:
  - Lines 847–858 (`CreateDatasetDialog.handleSubmit`): Lacks in-flight pending guard.
- `src/components/views/organizations-view.tsx`:
  - Lines 751–780, 947–960: `CreateOrgDialog` and `EditOrgForm` lack form event handling and debounce locks.
- `src/components/views/schema-builder-view.tsx`:
  - Lines 1354, 1413: Dialogs lack double-submit protection on rapid keypress / click.

#### 2. Failure Mode & Reproduction Scenario
- **Failure Mode**:
  1. A user rapidly double-clicks "Send invitation" or presses Enter repeatedly inside an input field.
  2. Multiple parallel `POST /api/organizations/:id/members` or `POST /api/datasets` requests are dispatched.
  3. Results in duplicate records, duplicated invitation emails sent to users, or unique constraint conflict errors.
- **Reproduction**:
  1. Open Invite Member dialog.
  2. Type a valid email.
  3. Double click the "Send invitation" button rapidly.
  4. Inspect network tab: two identical `POST` requests are dispatched simultaneously.

#### 3. Recommended Code Fix
1. In `src/components/views/invite-member-dialog.tsx`:
- Move `onClose()` from `onMutate` to `onSuccess`.
- Guard `handleSubmit`:
```tsx
const handleSubmit = (e?: React.FormEvent) => {
  e?.preventDefault();
  if (inviteMutation.isPending) return;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || !selectedOrg) {
    return;
  }
  inviteMutation.mutate({ email: trimmed, role, orgId: selectedOrg });
};
```
- Wrap dialog body in `<form onSubmit={handleSubmit}>` and make the submit button `type="submit" disabled={inviteMutation.isPending || !email.trim()}`.

2. Apply identical form submit guard pattern across `CreateDatasetDialog`, `CreateOrgDialog`, and `EditOrgForm`.

---

### Cycle 8: Table Selection State Sync

#### 1. Exact File Paths & Line Numbers
- `src/components/views/dataset-detail-view.tsx`:
  - Line 367: `const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());`
  - Lines 1472–1481:
    ```tsx
    <Checkbox 
      checked={selectedRecords.size > 0 && selectedRecords.size === filteredRecords.length}
      onCheckedChange={(checked) => {
        if (checked) setSelectedRecords(new Set(filteredRecords.map((r) => r.id)));
        else setSelectedRecords(new Set());
      }}
    />
    ```
  - Lines 1817, 1829: `setPage` calls do not reset `selectedRecords`.
  - Status filter dropdown and search input do not reset `selectedRecords`.

#### 2. Failure Mode & Reproduction Scenario
- **Failure Mode**:
  1. User selects 3 rows on Page 1.
  2. User navigates to Page 2.
  3. `selectedRecords` still contains the 3 row IDs from Page 1.
  4. The bulk action bar ("3 selected: Approve / Reject / Delete") remains visible on Page 2.
  5. If the user clicks "Delete", records from Page 1 are deleted while the user is looking at Page 2.
  6. If Page 2 happens to have 3 rows, the header checkbox shows checked even though none of Page 2's rows are selected.
- **Reproduction**:
  1. Open a dataset with > 20 records.
  2. Select 2 records on Page 1.
  3. Click Next Page (`Page 2`).
  4. Notice the bulk toolbar is active showing "2 records selected".

#### 3. Recommended Code Fix
In `src/components/views/dataset-detail-view.tsx`:
1. Auto-reset selection on pagination/filter change:
```tsx
useEffect(() => {
  setSelectedRecords(new Set());
}, [page, statusFilter, search, datasetId]);
```

2. Fix header select-all checkbox calculation:
```tsx
const isAllCurrentPageSelected =
  filteredRecords.length > 0 &&
  filteredRecords.every((r) => selectedRecords.has(r.id));

const isSomeCurrentPageSelected =
  filteredRecords.some((r) => selectedRecords.has(r.id)) && !isAllCurrentPageSelected;

<Checkbox
  checked={
    isAllCurrentPageSelected
      ? true
      : isSomeCurrentPageSelected
      ? "indeterminate"
      : false
  }
  onCheckedChange={(checked) => {
    if (checked) {
      setSelectedRecords((prev) => {
        const next = new Set(prev);
        filteredRecords.forEach((r) => next.add(r.id));
        return next;
      });
    } else {
      setSelectedRecords((prev) => {
        const next = new Set(prev);
        filteredRecords.forEach((r) => next.delete(r.id));
        return next;
      });
    }
  }}
/>
```

---

### Cycle 9: Centralized Toast & Error Handling in TanStack Query

#### 1. Exact File Paths & Line Numbers
- `src/components/providers.tsx`:
  - Lines 8–43 (`makeQueryClient`): `QueryClient` initialized without `MutationCache({ onError })` or `QueryCache({ onError })`.
- Affected mutations lacking explicit error toasts:
  - `src/components/assistant/use-assistant-sessions.ts`: Line 84 (`setError` without toast)
  - `src/components/google-sheets/sync-dashboard.tsx`: Mutations with missing or silent `onError`
  - Dynamic API errors dropping silently when network drops.

#### 2. Failure Mode & Reproduction Scenario
- **Failure Mode**: When any asynchronous mutation fails without an inline `onError` callback (or if an unexpected network error occurs during a mutation), the error is dropped. The UI shows no feedback, leaving the user wondering why their action did not take effect.
- **Reproduction**:
  1. Trigger an action with intermittent connection.
  2. Mutation fails with 500 or network error.
  3. No toast notification appears on screen.

#### 3. Recommended Code Fix
Update `src/components/providers.tsx`:
```tsx
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from "@tanstack/react-query";
import { toast } from "sonner";

function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error: any, _variables, _context, mutation) => {
        // If mutation does not have its own custom onError handler, display default error toast
        if (!mutation.options.onError) {
          const message = error?.message || error?.error || "Operation failed. Please try again.";
          toast.error("Action Failed", { description: message });
        }
      },
    }),
    queryCache: new QueryCache({
      onError: (error: any, query) => {
        // Only toast for queries that failed with no data in cache
        if (query.state.data === undefined) {
          const message = error?.message || "Failed to load data from server";
          console.error("[QueryCache Error]", query.queryKey, error);
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        refetchOnReconnect: true,
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
```

---

### Cycle 10: Auth Redirect & Network Error Handling

#### 1. Exact File Paths & Line Numbers
- `src/app/login/page.tsx`:
  - Lines 43–61: `useEffect` session check calls `fetch("/api/session")` without `.catch()`.
  - Lines 70–84: `2fa` verification calls `await res.json()` on error status without try/catch for non-JSON responses.
  - Lines 119–131: Login response check calls `await res.json()` blindly.
- `src/app/api/auth/callback/route.ts`:
  - Lines 13–32: Exchange code failures silently redirect to `/auth/auth-code-error` with no error query parameter.
- `src/app/auth/auth-code-error/page.tsx`:
  - Lines 1–28: Static error page without retry parameters.

#### 2. Failure Mode & Reproduction Scenario
- **Failure Mode**:
  1. In `src/app/login/page.tsx`, if the backend server returns a 502/504 Bad Gateway or HTML error page during network disruption, `await res.json()` throws `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
  2. The raw syntax error is displayed to the user (`"Unexpected token '<'..."`) rather than an actionable message.
  3. On initial page load, if `/api/session` fails due to network outage, the unhandled promise rejection pollutes error telemetry.
- **Reproduction**:
  1. Simulate an API 502 gateway error by pointing `/api/session` to a bad endpoint.
  2. Attempt login on `/login`.
  3. Observe raw `SyntaxError` displayed in the login card error box.

#### 3. Recommended Code Fix
1. In `src/app/login/page.tsx`:
```tsx
// Safe JSON parser helper
async function parseErrorResponse(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return data.error || data.message || `Request failed with status ${res.status}`;
    } catch {
      return `Server error (${res.status}). Please try again later.`;
    }
  } catch {
    return "Network connection error. Please check your internet connection.";
  }
}

// In useEffect:
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      fetch("/api/session", { cache: "no-store" })
        .then(async (res) => {
          if (res.ok) {
            router.replace(next);
          } else if (res.status === 403) {
            const data = await res.json().catch(() => ({}));
            if (data.error === "2FA_REQUIRED") setMode("2fa");
          } else if (res.status === 401) {
            supabase.auth.signOut().catch(() => {});
          }
        })
        .catch((err) => {
          console.warn("[Login] Session check failed:", err);
        });
    }
  }).catch((err) => {
    console.warn("[Login] Supabase session check failed:", err);
  });
}, [next, router, supabase]);
```

2. In `handleSubmit`:
```tsx
if (mode === "2fa") {
  const res = await fetch("/api/2fa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token2fa }),
  });
  if (!res.ok) {
    const errorMsg = await parseErrorResponse(res);
    throw new Error(errorMsg);
  }
  router.push(next);
  router.refresh();
  return;
}
```

---

## Synthesis Matrix

| Cycle | Area | Target Files | Primary Vulnerability | Fix Scope |
|---|---|---|---|---|
| **C1** | Error Boundaries | `src/app/error.tsx`, `src/app/global-error.tsx`, `src/components/ui/error-boundary.tsx`, `src/app/workspace/workspace-client.tsx` | Total crash of React tree on render exceptions | Add route and component error boundaries with recovery |
| **C2** | Optimistic UI | `src/components/views/dataset-detail-view.tsx`, `src/components/views/dataset-inline-edit.tsx` | 2-part vs 4-part key mismatch; `old.records` vs `old.data` undefined bug | Use `setQueriesData` with prefix key and fix data shape access |
| **C3** | Query Keys | `src/lib/query-keys.ts`, `members-view.tsx`, `usage-view.tsx`, `invitations-view.tsx` | Zero adoption of centralized key factory; fragmented query keys | Expand `qk` factory and refactor all views |
| **C4** | Org Switcher | `src/lib/store.ts`, `src/components/app-shell.tsx` | Stale resource IDs (`selectedDatasetId`, etc.) retained across org switch | Reset detail resource IDs & views in `setOrganization` |
| **C5** | Hydration | `src/components/views/dataset-detail-view.tsx`, date formatting helpers | SSR vs client `localStorage` access in `useState` initializer | Mount guard for `localStorage` & `suppressHydrationWarning` |
| **C6** | Chat Stream | `src/components/assistant/use-assistant-chat.ts`, `assistant-panel.tsx` | Missing `AbortController` cancellation; zombie stream loops | Add `AbortController`, signal binding, unmount abort, stop button |
| **C7** | Form Double-Submit | `invite-member-dialog.tsx`, `datasets-view.tsx`, `organizations-view.tsx` | Unprotected submission handlers allowing duplicate API calls | Add form wrappers, pending locks, move `onClose` to `onSuccess` |
| **C8** | Table Selection | `src/components/views/dataset-detail-view.tsx` | Out-of-page record IDs retained across pagination and filter change | Add `useEffect` reset on filter/page change; fix select-all math |
| **C9** | Centralized Toasts | `src/components/providers.tsx` | Silent failure for unhandled mutations in TanStack Query | Configure `MutationCache({ onError })` and `QueryCache` |
| **C10** | Auth & Network | `src/app/login/page.tsx`, `api/auth/callback/route.ts` | Raw `SyntaxError` on HTML 502 responses; unhandled promise rejections | Safe error response parser and promise catch blocks |

---
*Report completed by Explorer M1 (`explorer_m1_frontend`).*
