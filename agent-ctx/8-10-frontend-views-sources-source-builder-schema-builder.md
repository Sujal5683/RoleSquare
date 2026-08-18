# Task 8-10 — Frontend View Builder (Sources / Source Builder / Schema Builder)

**Task ID:** 8-10
**Agent:** Frontend View Builder
**Scope:** Three React view components for the Workspace Intelligence Platform.

## Files Created

1. **`src/components/views/sources-view.tsx`** (~440 lines)
   - Sources list page with PageHeader + New source button.
   - 4 StatCards (Total, Active, Paused, Needs Attention).
   - Filter bar: name search Input + status Select.
   - Sources Table with columns: Name (with source-type icon, clickable), Status, Run state, Connection (googleEmail + StatusBadge), Schedule (mode + expr), Last run (relative), Next run (relative), Actions (Scan + DropdownMenu: View runs / Edit / Pause-Resume / Delete).
   - Scan mutation → `POST /api/sources/[id]/scan { mode: "incremental" }`.
   - Pause/Resume → `PATCH /api/sources/[id] { status }`.
   - Delete → `DELETE /api/sources/[id]` via AlertDialog.
   - View runs Dialog → `GET /api/sources/[id]/runs` (renders StatusBadge, mode, relative time, progress bar, error, stats chips).
   - Empty / Loading / Error states via existing page-elements.

2. **`src/components/views/source-builder-view.tsx`** (~1080 lines)
   - 5-step stepper: Identity → Google account → Rules → Schedule & schema → Review.
   - Step 1: name, description, sourceType (5-button icon grid: gmail/drive/docs/sheets/forms).
   - Step 2: Google account Select (fetches `/api/google-connections`) + detail card with scopes chips + empty-state "Connect account" button (POST `/api/google-connections`).
   - Step 3: dynamic rule list (filterType / operator / value) with add/remove + live rule preview.
   - Step 4: scheduleMode/scheduleExpr + Schema Select + Dataset Select + "Create new schema/dataset" links.
   - Step 5: full review summary.
   - Sticky right-column Summary panel (live updating) + Rule preview card.
   - Edit mode: when `selectedSourceId` is set, fetches `GET /api/sources/[id]` and prefills. Submit becomes "Update source" → `PATCH /api/sources/[id]` + `PUT /api/sources/[id]/rules`.
   - Create mode: `POST /api/sources` with rules array.

3. **`src/components/views/schema-builder-view.tsx`** (~970 lines)
   - Two-column layout: left = metadata + fields list, right = prompt preview + test extraction.
   - Top: schema Select dropdown + "New schema" button (Dialog with name/description → `POST /api/schemas`).
   - Metadata card: editable name/description/promptTemplate (PATCH on change, version read-only).
   - Fields list: ordered by position, drag-handle icon (visual only), name, FieldTypeBadge, required chip, options count, description/instructions preview, edit/delete icons. Scrollable (`max-h-[480px] overflow-y-auto`).
   - Field editor Dialog (separate `FieldEditorDialog` component, keyed by nonce so it remounts with fresh state): name, type (text/number/date/boolean/enum/array/multiselect), description, instructions, required (Switch), options (comma-separated, shown only for enum/multiselect). Save → `POST /api/schemas/[id]/fields` or `PATCH /api/schemas/[id]/fields/[fieldId]`.
   - Delete field → `DELETE /api/schemas/[id]/fields/[fieldId]` via AlertDialog.
   - Prompt preview card: auto-generates the LLM extraction prompt from the schema fields (system line + custom instructions + numbered field list with name/type/required/description/instructions/options + JSON return contract).
   - Test extraction card: Textarea for sample source text + "Run extraction" button → `POST /api/schemas/[id]/test-extraction { sampleText }`. Renders ExtractionResult: header (tokens + overall confidence + model + prompt version), each field card with value, ConfidenceBadge, and italic evidence quote.

## Key Decisions

- **Render-time `setState` pattern** instead of `useEffect`+`setState` for all "sync state when props/data change" cases (source prefill, default schema selection, test-result clearing, field-editor draft init). This complies with the `react-hooks/set-state-in-effect` ESLint rule that ships with this project.
- **Keyed dialog** for FieldEditorDialog — pass `key={fieldDialogNonce}` so React remounts it with fresh `useState(field ?? EMPTY_FIELD)` initialization each time it opens, eliminating the need for a `useEffect` to sync the draft.
- **`FileSchema` → `FileJson`** in my two builder views because `FileSchema` was removed from `lucide-react@^0.525.0` (the AppShell also uses `FileSchema` but is outside this task's scope per the instructions).
- **Rule value serialization**: rule `value` is stored as JSON on the backend (e.g. `["acme.io", "placements.edu"]`, `true`, or `"placement"`). On the frontend, I convert to/from a comma-separated string for the Input — `ruleValueToString` (array → "a, b", boolean → "true"/"false") and `ruleValueFromString` (comma-split → array, "true"/"false" → boolean, else string).
- **No DnD library** for field reordering — the spec said "drag handle icon (just visual, no need for actual DnD)". The `GripVertical` icon is shown for visual affordance only.
- **date-fns** `formatDistanceToNow` and `format` for relative and absolute timestamps (already in package.json).

## Verification

- `bunx eslint src/components/views/sources-view.tsx src/components/views/source-builder-view.tsx src/components/views/schema-builder-view.tsx` → **0 errors, 0 warnings**.
- `bunx tsc --noEmit` shows **0 errors** in my three files. Remaining project-wide errors are all in `examples/`, `skills/`, `page.tsx` (missing imports for other agents' view files), and pre-existing `AppShell` `FileSchema` + `dashboard-view` `sourceName` + `landing-view` `Share2` issues that belong to other tasks.
- Dev server log shows no compile errors for my files; only `page.tsx` import errors for not-yet-created view files (`sharing-view`, `audit-view`, `settings-view`, `datasets-view`, `dataset-detail-view`, `ai-studio-view`, `organizations-view`, `members-view`) — those are other agents' tasks.

## What Other Agents Should Know

- My three views assume the existing API routes from Task 4 are unchanged and the existing AppShell / store / types are unchanged.
- The Sources page calls `openSource(id)` (store action) for both "New source" (id=null) and "Edit" (id=sourceId) — both navigate to `source-builder` view, which reads `selectedSourceId` to decide create vs edit.
- The Schema Builder calls `openSchema(id)` (store action) for both new (id=null, falls back to first schema in list) and existing schemas.
- The Source Builder's "Create new schema" / "Create new dataset" links call `openSchema(null)` and `setView("datasets")` respectively — those views are owned by other agents.
- All mutations invalidate the appropriate TanStack Query keys (`sources`, `schemas`, `schema`, `datasets`, `source`, `source-runs`, `dashboard`, `google-connections`) so the rest of the app stays consistent.
