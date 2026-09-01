# Frontend Architecture & State Survey Report

**Explorer**: Explorer 1 (Frontend Architecture & State Survey)  
**Date**: 2026-09-01  
**Working Directory**: `c:\CDS IIT JMU\.agents\explorer_survey_frontend`  
**Target Codebase**: `c:\CDS IIT JMU`  

---

## 1. Executive Summary

RoleSquare is a Next.js 16 (React 19, Tailwind CSS 4, Radix UI / Shadcn) AI-native SaaS application designed to extract structured, governed, evidence-backed datasets from Google Workspace services (Gmail, Drive, Docs, Sheets, Forms).

The frontend is structured as a **Hybrid Server-Rendered / Single-Page Application (SPA)**:
- **Public & Auth Routes**: Standard SSR/SSG App Router pages (`/`, `/about`, `/contact`, `/faq`, `/privacy`, `/terms`, `/login`).
- **Workspace**: A single Server Component route (`/workspace/page.tsx`) that prefetches the authenticated user session on the server to prevent blank-screen waterfalls, and delegates rendering to `<WorkspaceClient>`, which mounts an in-memory view-router (`<AppShell>`) driven by **Zustand** and synchronized with **TanStack Query v5** and **Supabase Realtime**.

---

## 2. Directory Structure & File Map

```
c:\CDS IIT JMU\src\
├── app/                                 # Next.js App Router root
│   ├── layout.tsx                       # Root layout (Fonts, Providers, Toaster, Sonner, PWA registration)
│   ├── page.tsx                         # Landing page Server Component (delegates to LandingView)
│   ├── globals.css                      # Global styles, Tailwind directives, theme variables
│   ├── about/page.tsx                   # Public About page
│   ├── contact/page.tsx                 # Public Contact page
│   ├── faq/page.tsx                     # Public FAQ page
│   ├── privacy/page.tsx                 # Public Privacy policy
│   ├── terms/page.tsx                   # Public Terms of service
│   ├── login/page.tsx                   # Auth page (Login, Signup, Forgot, 2FA TOTP, Google OAuth)
│   ├── auth/auth-code-error/page.tsx    # Auth error destination page
│   ├── workspace/
│   │   ├── page.tsx                     # Server Component (prefetches session with React cache)
│   │   └── workspace-client.tsx         # Client root hosting AppShell and dynamic view switcher
│   └── api/                             # Next.js Route Handlers (40+ endpoints)
├── components/                          # UI components
│   ├── app-shell.tsx                    # Master workspace layout (nav, org switcher, command palette, realtime)
│   ├── providers.tsx                    # ThemeProvider (next-themes), QueryClientProvider (TanStack Query)
│   ├── command-palette.tsx              # Global Cmd+K command palette and debounced search
│   ├── notifications-dropdown.tsx       # Header alert popover (connection alerts, review queue)
│   ├── keyboard-shortcuts-dialog.tsx    # Shortcut cheat sheet (?)
│   ├── sidebar-jobs-widget.tsx          # Real-time background job progress and retry/cancel widget
│   ├── ai-studio/                       # AI Studio sub-tabs and extraction wizard
│   │   ├── extraction-wizard.tsx        # Multi-step guided data extraction wizard
│   │   ├── extraction-runs-tab.tsx      # Job monitoring, status badges, retry actions
│   │   ├── agent-logs-tab.tsx           # Structured agent execution logs with JSON viewer
│   │   └── model-cost-tab.tsx           # Token consumption, model breakdown, cost charts
│   ├── assistant/                       # AI Workspace Assistant
│   │   ├── assistant-button.tsx         # Floating trigger button with unread counter
│   │   ├── assistant-panel.tsx          # Slide-in chat interface with action cards and chips
│   │   ├── activity-log-drawer.tsx      # Action history and undo log drawer
│   │   ├── message-bubble.tsx           # Rich message renderer with markdown and tool cards
│   │   ├── pending-action-card.tsx      # Confirmation card for destructive write tools
│   │   ├── session-sidebar.tsx          # Saved chat sessions sidebar
│   │   ├── use-assistant-chat.ts        # Core chat hook (SSE streaming, tool confirmation, undo)
│   │   ├── use-assistant-sessions.ts    # Chat session persistence hook
│   │   └── types.ts                     # Assistant domain types
│   ├── datasets/                        # Dataset utility dialogs
│   │   └── assign-schema-dialog.tsx     # Schema assignment / creation dialog
│   ├── google-sheets/                   # Google Sheets 2-way sync subsystem
│   │   ├── google-sheets-panel.tsx      # Slide-in integration drawer
│   │   ├── sync-dashboard.tsx           # Sync status, schedule configuration, manual trigger
│   │   ├── sync-history.tsx             # Past sync logs and statistics
│   │   ├── link-sheet-wizard.tsx        # Link existing/new Google Spreadsheet
│   │   ├── import-wizard.tsx            # Import sheet data into dataset
│   │   ├── export-wizard.tsx            # Export dataset into Google Sheet
│   │   ├── org-sheets-wizard.tsx        # Organization-level Sheets manager
│   │   ├── column-mapping.tsx           # Visual schema-to-sheet column mapper
│   │   ├── conflict-resolver.tsx        # 3-way visual conflict resolution modal
│   │   ├── destructive-change-confirmation.tsx # Schema modification safety confirmation
│   │   ├── schema-diff-viewer.tsx       # Visual diff viewer for modified columns
│   │   ├── sheet-preview.tsx            # Live spreadsheet preview grid
│   │   ├── spreadsheet-selector.tsx     # Google Drive spreadsheet picker
│   │   ├── tab-selector.tsx             # Worksheet tab selector
│   │   └── sync-status-badge.tsx        # Visual status indicator for sync health
│   ├── layout/                          # Layout utilities
│   │   └── global-progress.tsx          # Global background task indicator
│   ├── public/                          # Public marketing layout components
│   │   ├── public-header.tsx            # Marketing navigation header
│   │   └── public-footer.tsx            # Marketing footer with links
│   ├── settings/                        # Settings components
│   │   └── profile-avatar.tsx           # Profile picture upload and cropping dialog
│   ├── sharing/                         # Sharing components
│   │   ├── new-share-request-dialog.tsx # Modal to share dataset with users/orgs
│   │   └── share-button.tsx             # Quick share trigger button
│   ├── source/                          # Source configuration rule editors
│   │   ├── attachment-rule-editor.tsx   # File extension, size, and naming filters
│   │   ├── cron-editor.tsx              # Visual cron scheduler and expression builder
│   │   ├── date-rule-editor.tsx         # Date range and dynamic relative date filters
│   │   └── drive-link-rule-editor.tsx   # Drive folder and file link matching rules
│   ├── ui/                              # Radix UI / Tailwind reusable primitives (52 components)
│   │   ├── page-elements.tsx            # PageHeader, StatCard, LoadingState, EmptyState, ErrorState
│   │   ├── status-badge.tsx             # StatusBadge, ConfidenceBadge, FieldTypeBadge, RoleBadge
│   │   ├── skeletons/                   # 14 specialized skeleton loaders
│   │   └── ...                          # Accordion, Button, Dialog, Sheet, Table, Tabs, Toaster, etc.
│   └── views/                           # 14 Primary Workspace Views
│       ├── dashboard-view.tsx           # KPIs, activity charts, review queue, recent runs
│       ├── audit-timeline.tsx           # Interactive audit event feed
│       ├── audit-view.tsx               # Compliance audit logs with filtering and export
│       ├── dataset-detail-view.tsx      # 2700-line Airtable-style data grid with undo/redo
│       ├── dataset-inline-edit.tsx      # Inline cell editor with keyboard navigation
│       ├── datasets-view.tsx            # Dataset list/grid/column explorer
│       ├── schema-builder-view.tsx      # Visual schema designer with dnd-kit and AI generator
│       ├── sources-view.tsx             # Ingestion sources list, status controls, scan triggers
│       ├── source-builder-view.tsx      # 5-step stepper for source configuration
│       ├── ai-studio-view.tsx           # AI Studio with tabs (Wizard, Sandbox, Insights)
│       ├── members-view.tsx             # Team members, role changes, invites
│       ├── invitations-view.tsx         # Incoming and outgoing organization invitations
│       ├── organizations-view.tsx       # Multi-org management and plan quotas
│       ├── usage-view.tsx               # Token, storage, email consumption analytics
│       ├── settings-view.tsx            # Profile, security, 2FA, billing, webhooks, API keys
│       ├── invite-member-dialog.tsx     # Member invitation modal
│       ├── landing-view.tsx             # Marketing homepage with live demo links
│       └── sharing/                     # Sharing Center sub-views
│           ├── sharing-view.tsx         # Tab container (Received, Owned, Requests)
│           ├── received-tab.tsx         # Datasets shared with current org
│           ├── owned-tab.tsx            # Datasets shared by current org
│           ├── requests-tab.tsx         # Inbound/outbound share requests
│           ├── sharing-details-sheet.tsx# Granular permission & scoping inspector
│           └── shared-components.tsx    # Shared UI elements for governance
├── hooks/                               # Custom React Hooks
│   ├── use-active-org.ts                # Reads active org ID from Zustand store
│   ├── use-debounce.ts                  # Generic value debouncing hook
│   ├── use-mobile.ts                    # Responsive breakpoint detection hook
│   ├── use-speech-input.ts              # Web Speech API voice input hook
│   └── use-toast.ts                     # Toast dispatcher hook
├── lib/                                 # Shared utilities, services, domain logic
│   ├── store.ts                         # Zustand global client store (persist middleware)
│   ├── api-client.ts                    # Fetch wrapper with org header, timeout, retry
│   ├── query-keys.ts                    # Centralized TanStack Query key factory
│   ├── types.ts                         # Shared TypeScript domain types and DTOs
│   ├── utils.ts                         # Class merging (cn), number formatting, text helpers
│   ├── auth.ts                          # Server-side auth helper (getCurrentUser with React cache)
│   └── supabase/                        # Supabase SSR and browser clients
└── middleware.ts                        # Edge auth middleware protecting /workspace & /api
```

---

## 3. Key Pages, Views, Layouts & Routing Structure

### 3.1 Routing Architecture

The codebase combines Next.js Server Components with a Client-Side In-Memory View Router:

1. **Edge Middleware (`src/middleware.ts`)**:
   - Intercepts all requests except `PUBLIC_PATHS` (`/`, `/about`, `/faq`, `/contact`, `/privacy`, `/terms`, `/login`, auth callbacks, health check, PWA assets).
   - Validates the Supabase session token via `@supabase/ssr`.
   - Redirects unauthenticated requests to `/login?next=<path>` while preserving session cookie updates.

2. **Root Layout (`src/app/layout.tsx`)**:
   - Root HTML/Body container with Geist font variables.
   - Registers service worker `/sw.js` for PWA offline capabilities.
   - Mounts `<Providers>` (`ThemeProvider`, `QueryClientProvider`), Radix `<Toaster />`, and Sonner `<SonnerToaster />`.

3. **Workspace Server Entry Point (`src/app/workspace/page.tsx`)**:
   - Server Component that executes `getCurrentUser()` directly on the server.
   - Uses `React.cache()` to share the JWT verification and database lookup with middleware in 0ms extra network time.
   - Pre-populates `initialSession` (User DTO and Organization memberships) and passes it directly to `<WorkspaceClient>`.

4. **Client Workspace Host (`src/app/workspace/workspace-client.tsx`)**:
   - Client component reading `useAppStore(s => s.view)`.
   - Renders `<AppShell initialSession={initialSession}>` containing the active view component conditionally.

### 3.2 Key Views & Layout Breakdown

| View ID | Primary Component | Key Features & Interactions | Component Type |
|---|---|---|---|
| `dashboard` | `DashboardView` | 6 KPI cards, 7d/30d/90d activity AreaChart (Recharts), recent source runs with live progress, review queue quick-action drawer, audit activity timeline. | Client (`use client`) |
| `sources` | `SourcesView` | Grid/list view of Google connectors, real-time status toggles (active/paused), manual scan triggers, clone/delete sources, run history drawer. | Client (`use client`) |
| `source-builder` | `SourceBuilderView` | 5-step stepper: Connector select → Ingestion filters (date/attachment/drive links) → Schema/dataset destination → Schedule (real-time/cron) → Review. | Client (`use client`) |
| `datasets` | `DatasetsView` | Dataset catalog with search, view modes (grid/list/columns), Google Sheets sync indicators, export (CSV/JSON), schema assignment modal. | Client (`use client`) |
| `dataset-detail` | `DatasetDetailView` | 2700-line Airtable-style spreadsheet grid, inline cell editing, undo/redo stack (`Ctrl+Z`/`Ctrl+Y`), confidence filters, evidence drawer, bulk approve/reject/delete. | Client (`use client`) |
| `schema-builder` | `SchemaBuilderView` | Visual schema editor, drag-and-drop field reordering (`@dnd-kit`), field validation rules, AI schema generation from prompt, test sandbox extraction. | Client (`use client`) |
| `ai-studio` | `AiStudioView` | Tabs: Guided Extraction Wizard, Test Sandbox, Live Extraction Runs monitor, Agent Logs inspector, Model Cost & Token Analytics. | Client (`use client`) |
| `sharing` | `SharingView` | Tabbed governance center: Shared with me (`ReceivedTab`), Shared by me (`OwnedTab`), Share Requests (`RequestsTab`), field-level permission sheet. | Client (`use client`) |
| `organizations` | `OrganizationsView` | Multi-tenant organization manager, plan quotas, member counts, slug generation, org creation and editing dialogs. | Client (`use client`) |
| `members` | `MembersView` | Team member list, role updates (Owner, Admin, Manager, Member, Viewer), member removal, invitation modal. | Client (`use client`) |
| `invitations` | `InvitationsView` | Incoming pending invites (Accept/Decline), outgoing pending invites (Resend/Revoke), role preview. | Client (`use client`) |
| `usage` | `UsageView` | Real-time token consumption metrics, cost breakdown by model/metric, monthly trends, plan quota progress bars. | Client (`use client`) |
| `audit` | `AuditView` | Immutable audit trail with actor/entity filters, before/after JSON diffs, timestamp range filters, CSV export. | Client (`use client`) |
| `settings` | `SettingsView` | 7 sub-tabs: Profile (avatar crop), Connected Google Accounts, Security (2FA TOTP setup/disable), Notifications, Billing, Data Retention, Integrations/API Keys. | Client (`use client`) |

---

## 4. State Management Mechanisms

### 4.1 State Hierarchy Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Zustand Store (`useAppStore`)                   │
│  - Active View (`view`)                - Active Org ID (`selectedOrganizationId`)
│  - Active Resource IDs (source/dataset) - Theme (`light`/`dark`)       │
│  - Sidebar Collapsed States            - Assistant Open/Unread Counter │
│  - Recent Items (Persisted)            - Dismissed/Read Notifications  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│      TanStack React Query v5     │   │     Supabase Realtime Channel    │
│  - Query Caching (staleTime 30s) │   │  - Push events on AiJob, Source, │
│  - Optimistic Mutation Updates   │   │    SourceRun, Dataset, Record,   │
│  - Centralized Keys (`qk`)       │   │    Schema                        │
│  - Request Retries & Invalidation│   │  - Debounced cache invalidation  │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

### 4.2 Zustand Global Client Store (`src/lib/store.ts`)
- Configured with `persist` middleware saving key properties to `localStorage` under key `"wip-app-store"`:
  - `view`: Current workspace active view ID.
  - `selectedOrganizationId`: Active organization ID.
  - `theme`: `"light"` | `"dark"`.
  - `recentItems`: Array of up to 10 recently accessed datasets, sources, schemas, and records.
  - `desktopSidebarOpen`: Desktop sidebar toggle state.
  - `dismissedNotifications` & `readNotifications`: Set of notification IDs.
- Unpersisted ephemeral state: `sourceBuilderDraft`, `sourceBuilderStep`, `selectedRecordId`, `sidebarOpen` (mobile), `assistantOpen`, `assistantUnread`.

### 4.3 TanStack Query v5 (`src/components/providers.tsx` & `src/lib/query-keys.ts`)
- `QueryClient` initialized with:
  - `staleTime`: 30,000 ms (30 seconds).
  - `gcTime`: 600,000 ms (10 minutes).
  - `refetchOnWindowFocus`: `false` (delegated to Realtime push invalidation).
  - `refetchOnMount`: `true`.
  - `retry`: 2 with exponential backoff (`Math.min(1000 * 2 ** attempt, 10_000)`).
- Query keys factory (`src/lib/query-keys.ts`) defines prefixes and org-scoped keys.

### 4.4 Supabase Realtime Push Invalidation (`src/components/app-shell.tsx:211-294`)
- Single persistent WebSocket channel: `realtime-all-${activeOrgId}`.
- Listens to Postgres table change events:
  - `AiJob` → Invalidates `["ai-jobs"]` and `["ai-job", id]`.
  - `Source` → Invalidates `["sources", activeOrgId]`.
  - `SourceRun` → Invalidates `["source-runs", sourceId]` and `["sources", activeOrgId]`.
  - `Dataset` → Invalidates `["datasets", activeOrgId]`, `["dataset", id]`, `["dashboard", activeOrgId]`.
  - `DatasetRecord` → Debounced by 300ms (to prevent refetch storms during 500+ row batch extractions); invalidates `["dataset-records", datasetId]` and `["dataset", datasetId]`.
  - `Schema` → Invalidates `["schemas", activeOrgId]` and `["schema", id]`.

### 4.5 HTTP API Client (`src/lib/api-client.ts`)
- All requests flow through `api.get`, `api.post`, `api.patch`, `api.put`, `api.delete`.
- Automatically retrieves `selectedOrganizationId` from Zustand's in-memory store and attaches header `x-organization-id: <orgId>`.
- Wraps every request in an `AbortController` with a 30-second timeout.
- Uses `withRetry` on idempotent methods (`GET`, `HEAD`) up to 4 attempts for transient network drops (ECONNRESET, iOS "Load failed").
- Automatically intercepts `401 Unauthorized` and `403 Forbidden` (`2FA_REQUIRED`) responses to redirect to `/login?next=...`.

---

## 5. Potential Risk Areas & Deficiencies

### Risk 1: Absence of React & Next.js Error Boundaries
- **Observation**:
  - A search for `ErrorBoundary` across `src/` yields 0 results.
  - In `src/app/`, there are no `error.tsx`, `global-error.tsx`, or `not-found.tsx` route error boundaries.
- **Logic Chain**:
  - In React 19 / Next.js 16, any uncaught runtime exception thrown during component rendering (e.g. malformed JSON in a record field, unexpected null in nested DTO, Recharts SVG dimension error) unmounts the entire component tree up to the nearest error boundary.
  - Because no error boundary exists at the layout, view, or panel level, an isolated error in a single component crashes the entire workspace to a blank white screen.
- **Severity**: **High**.

---

### Risk 2: Optimistic Mutation Cache Key Mismatch in Inline Edit & Batch Actions
- **Observation**:
  1. In `src/components/views/dataset-detail-view.tsx` (lines 517-534), the query is registered as:
     ```tsx
     queryKey: ["dataset-records", datasetId, page, statusFilter]
     ```
     The data returned has the shape: `{ data: DatasetRecordDTO[], total: number, page: number, pageSize: number }`.
  2. In `src/components/views/dataset-inline-edit.tsx` (lines 65-86), `onMutate` performs:
     ```tsx
     const previousRecords = queryClient.getQueryData(["dataset-records", datasetId]);
     queryClient.setQueryData(["dataset-records", datasetId], (old: any) => {
       if (!old || !old.records) return old;
       return { ...old, records: old.records.map(...) };
     });
     ```
  3. In `dataset-detail-view.tsx` lines 640-652 (`statusMutation`), `setQueryData` also targets `["dataset-records", datasetId]` instead of `["dataset-records", datasetId, page, statusFilter]`.
- **Logic Chain**:
  - `getQueryData` and `setQueryData` in TanStack Query require an exact key match. Calling `getQueryData(["dataset-records", datasetId])` returns `undefined` because the cache only contains `["dataset-records", datasetId, page, statusFilter]`.
  - Even if the key matched, `old.records` is `undefined` because the API response property name is `old.data`.
  - As a result, the optimistic update completely fails silently, creating a temporary desync until network re-fetch completes.
- **Severity**: **High**.

---

### Risk 3: Query Key Discrepancies Across Views
- **Observation**:
  - `src/lib/query-keys.ts` line 53 defines `qk.members(orgId) => ["members", orgId]`.
  - `src/components/views/members-view.tsx` line 300 uses `["organizations", activeOrgId, "members"]`.
  - `src/components/assistant/use-assistant-chat.ts` line 53 invalidates `["organizations"]`.
  - `src/lib/query-keys.ts` line 54 defines `qk.invitations(orgId) => ["invitations", orgId]`, but `invitations-view.tsx` queries `["invitations", "incoming"]` and `["invitations", "outgoing", activeOrgId]`.
  - `src/lib/query-keys.ts` line 58 defines `qk.usage(orgId) => ["usage", orgId]`, but `usage-view.tsx` line 97 and `settings-view.tsx` line 1262 query `["usage-trends", orgId]`.
- **Logic Chain**:
  - When components or assistant tools call `queryClient.invalidateQueries({ queryKey: qk.members(orgId) })`, the active query in `members-view.tsx` is NOT invalidated because the keys differ.
- **Severity**: **Medium**.

---

### Risk 4: Organization Switching State Desynchronization
- **Observation**:
  - In `src/lib/store.ts` line 100: `setOrganization: (id) => set({ selectedOrganizationId: id })`.
  - In `src/components/app-shell.tsx` line 499: `onClick={() => setActiveOrgId(o.id)}`.
- **Logic Chain**:
  - When a user switches organizations while viewing a specific resource (e.g. `view: "dataset-detail"`, `selectedDatasetId: "ds-123"` belonging to Org A), `setOrganization` updates `selectedOrganizationId` to Org B.
  - The view remains on `dataset-detail` with `selectedDatasetId = "ds-123"`.
  - Next, `dataset-detail-view.tsx` fires `GET /api/datasets/ds-123` with header `x-organization-id: Org B`.
  - The backend returns `404 Not Found` or `403 Forbidden` because dataset `ds-123` does not belong to Org B.
- **Severity**: **Medium**.

---

### Risk 5: SSR / Client Hydration Mismatches
- **Observation**:
  1. In `src/components/views/dataset-detail-view.tsx` lines 419-430:
     ```tsx
     const [savedViews, setSavedViews] = useState(() => {
       if (typeof window === "undefined") return [];
       try {
         const raw = localStorage.getItem(`wip-saved-views-${datasetId}`);
         return raw ? JSON.parse(raw) : [];
       } catch { return []; }
     });
     ```
     At line 1033: `{savedViews.length > 0 && (...)}`.
  2. Relative date calculation via `formatDistanceToNow(new Date(iso))` is executed during render in `AuditView`, `SettingsView`, `InvitationsView`, `SharingView`, `SourcesView`, `DatasetsView`.
- **Logic Chain**:
  - During server pre-rendering of client components, `savedViews` is initialized to `[]`. In browser hydration, if `localStorage` has saved views, the initial client DOM contains buttons not present in server HTML.
  - `formatDistanceToNow` calculates time relative to invocation time. Time differences between SSR generation and browser hydration produce text mismatch errors in React 19.
- **Severity**: **Medium**.

---

### Risk 6: Unhandled Promise Rejections in Login and Event Handlers
- **Observation**:
  - In `src/app/login/page.tsx` lines 44-60:
    ```tsx
    useEffect(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          fetch("/api/session", { cache: "no-store" }).then(async (res) => { ... });
        }
      });
    }, [next, router, supabase]);
    ```
    Neither `getSession()` nor `fetch("/api/session")` contains a `.catch()` block.
- **Logic Chain**:
  - If a user opens `/login` while offline or if the backend request fails with network error, the promise rejection is unhandled and caught by the browser window `unhandledrejection` handler.
- **Severity**: **Low-Medium**.

---

### Risk 7: AI Assistant Streaming Request Abort Lifecycle
- **Observation**:
  - In `src/components/assistant/use-assistant-chat.ts` lines 183-260, `sendMessage` initiates an SSE stream via `fetch("/api/assistant/chat", { method: "POST", ... })`.
  - No `AbortController` signal is attached to the fetch request, and no cleanup aborts the reader in `useEffect` on unmount.
- **Logic Chain**:
  - If the user closes the assistant panel or initiates a new chat while a stream is in progress, the reader loop continues processing chunks in the background and calling `setMessages` on unmounted/reset state.
- **Severity**: **Low-Medium**.

---

## 6. Comprehensive Feature & Flow Inventory

### 6.1 Authentication & Profile Flows
1. **Email / Password Sign-in & Sign-up**: With email verification callback.
2. **Google OAuth One-Click Login**: Offline access token acquisition.
3. **Password Reset Flow**: Supabase email reset trigger and redirect.
4. **Two-Factor Authentication (TOTP)**: QR code generation (`/api/2fa/setup`), verification (`/api/2fa/verify`), session enforcement, disable 2FA (`/api/2fa/disable`).
5. **Profile Avatar Management**: Image upload, canvas cropping (`react-image-crop`), base64 preview, database persistence.

### 6.2 Ingestion & Pipeline Configuration Flows
1. **Google Connector Authorization**: OAuth consent flow for Gmail, Drive, Docs, Sheets, Forms.
2. **Multi-Step Source Builder**:
   - Rule definition: Sender, Subject, Body text matching, Attachment file types and size limits, Date filters (presets, absolute ranges), Drive folder link filters.
   - Target schema assignment or auto-generated default schema.
   - Schedule mode: Real-time Webhook vs Cron interval vs Manual.
3. **Source Pipeline Execution**: Manual trigger scan, pause/resume polling, duplicate source configuration, real-time run progress monitoring.

### 6.3 Schema Builder & AI Generation Flows
1. **Visual Schema Designer**: Add/edit/delete fields, drag-and-drop reordering (`@dnd-kit`), field validation settings (min, max, regex, required, enum options).
2. **AI Schema Prompt Generator**: Natural language input to schema field synthesis.
3. **Prebuilt Templates**: One-click import for Invoices, Resumes, Support Tickets, Contracts, Real Estate.
4. **Interactive Sandbox**: Test extraction against arbitrary text with confidence scoring.
5. **Schema Versioning & Cloning**: Duplicate schema with version increment.

### 6.4 Data Grid & Evidence Exploration Flows
1. **High-Density Spreadsheet View**: Virtualized-style table, resizable column headers, sticky toolbar.
2. **Inline Cell Editing**: Double-click cell to edit, keyboard navigation (Enter to save, Escape to cancel), undo/redo stack (`Ctrl+Z`, `Ctrl+Y`).
3. **Evidence & Confidence Drawer**: Click record to open side sheet displaying extracted value, confidence score, source file link, page number, extraction model, and audit timestamps.
4. **Batch Operations**: Multi-select rows, bulk approve, bulk reject, bulk delete, export to CSV/JSON.
5. **Custom Saved Views**: Filter by status, search, and visible columns with saved view shortcuts.

### 6.5 Google Sheets 2-Way Synchronization Flows
1. **Spreadsheet Linking**: Connect dataset to Google Drive spreadsheet and specific worksheet tab.
2. **Visual Column Mapping**: Map app fields to Google Sheet columns with AI auto-mapping.
3. **2-Way Sync Engine**: Manual sync now, interval scheduling (5m, 15m, 30m, 1h, 6h, 12h, 1d, manual), pause/resume sync.
4. **3-Way Conflict Resolver**: Side-by-side comparison of local vs remote cell changes with field-by-field acceptance.
5. **Destructive Change Protection**: Safety confirmation before executing column drops or deletions.

### 6.6 Governance & Sharing Flows
1. **Cross-Organization Sharing**: Share dataset with target organization or individual email.
2. **Field-Level Masking & Row Filtering**: Restrict visible columns and filter matching rows for shared recipients.
3. **Access Level Roles**: Owner, Edit, Comment, Read access grants.
4. **Share Request Workflow**: Request access to dataset, approval/rejection queue, revoke/pause access.

### 6.7 AI Workspace Assistant Flows
1. **Chat & Task Execution**: Natural language queries for workspace metrics, dataset inspection, schema creation.
2. **Human-in-the-Loop Confirmation**: Pending action cards for write tools (delete, update, trigger) with user approval before execution.
3. **Undo Action Token**: One-click undo for assistant-created entities.
4. **Suggestion Chips**: Quick reply action pills based on assistant prompt response markers.
5. **Session History**: Multi-turn session persistence, rename/clear chat history.

### 6.8 Workspace Utilities & Shell
1. **Command Palette (`Cmd+K`)**: Instant search across sources, datasets, schemas, and records.
2. **Real-time Notifications**: Alert dropdown for Google account token expiration and review queue backlog.
3. **Sidebar Jobs Progress**: Persistent widget displaying background extraction runs with pause, stop, and retry controls.
4. **Audit Trail**: Searchable audit log with entity filters and before/after diffs.
5. **Usage & Analytics**: Token consumption trends, cost breakdown, quota tracking.
