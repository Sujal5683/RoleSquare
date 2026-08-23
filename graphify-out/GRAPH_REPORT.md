# Graph Report - CDS IIT JMU  (2026-08-23)

## Corpus Check
- 197 files · ~177,486 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1560 nodes · 3847 edges · 169 communities (90 shown, 79 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a62cba7d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cn
- lib/types.ts
- sidebar.tsx
- menubar.tsx
- ai-studio-view.tsx
- job-runner.ts
- auth.ts
- use-toast.ts
- AuthError
- Workspace Intelligence Platform — Complete SaaS Ar.md
- devDependencies
- compilerOptions
- source-builder-view.tsx
- context-menu.tsx
- extraction/route.ts
- dashboard/route.ts
- app-shell.tsx
- members-view.tsx
- settings-view.tsx
- authErrorResponse
- chart.tsx
- google-client.ts
- Functional Scope
- components.json
- assistant-panel.tsx
- Workspace Intelligence Platform
- cmdk
- 15-Prompt Build Sequence
- Workspace Intelligence Platform — Worklog
- serialize.ts
- command-palette.tsx
- carousel.tsx
- Core Tables
- README.md
- db.ts
- google-auth.ts
- UI/UX Specifications
- chat/route.ts
- form.tsx
- API Architecture
- Work Log
- gemini.ts
- Completed Modifications
- drawer.tsx
- dataset-detail-view.tsx
- Completed Modifications
- Cron Review Phase 2 — Global Search + Bulk Actions + Saved Views
- Cron Review Phase 3 — Usage Dashboard + Clone + Import + Animations
- Phase 1-9 Audit + Hardening
- websocket/server.ts
- Cron Review Phase 4 — Activity Feed + Confidence Thresholds + Webhooks
- Supabase Schema Blueprint
- Workspace Intelligence Platform — Complete SaaS Architecture \& Build Blueprint
- toggle-group.tsx
- dev.sh
- Task 12-14 — Frontend View Builder (Orgs / Members / Sharing / Audit / Settings)
- Task 8-10 — Frontend View Builder (Sources / Source Builder / Schema Builder)
- export/route.ts
- relativeTime
- dropdown-menu.tsx
- Cron Review Phase — QA + Feature Additions
- AGENTS.md
- alert.tsx
- middleware.ts
- Personas
- Wireframe Specifications
- Development Roadmap
- Frontend Architecture
- Security Architecture
- Product Requirements Document
- Production Roadmap
- .zscripts/python-runtime-build.sh
- eslint.config.mjs
- createClient
- hover-card.tsx
- tests/database-runtime-build.sh
- Coding Standards
- AI Architecture
- Backend Architecture
- User Flows
- Deployment Architecture
- RLS Architecture
- Feature Specifications
- Workspace Intelligence Platform
- mini-services-start.sh
- test-db.js
- date-fns
- build.sh
- mini-services-build.sh
- mini-services-install.sh
- navigation-menu.tsx
- class-variance-authority
- clsx
- Task 12-14 — Frontend View Builder (Organizations / Members / Sharing / Audit / Settings)
- dependencies
- @dnd-kit/sortable
- test-query.ts
- framer-motion
- googleapis
- @hookform/resolvers
- lucide-react
- @mdxeditor/editor
- next
- next-auth
- next.config.ts
- embla-carousel-react
- next-themes
- pg
- prisma
- @google/generative-ai
- @radix-ui/react-accordion
- @radix-ui/react-alert-dialog
- @radix-ui/react-aspect-ratio
- @radix-ui/react-avatar
- @radix-ui/react-checkbox
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-hover-card
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-popover
- @radix-ui/react-progress
- @radix-ui/react-radio-group
- input-otp
- @radix-ui/react-separator
- @radix-ui/react-slot
- @radix-ui/react-switch
- @radix-ui/react-tabs
- @radix-ui/react-toast
- @radix-ui/react-toggle
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- react-dom
- react-hook-form
- react-resizable-panels
- react-syntax-highlighter
- @reactuses/core
- recharts
- sharp
- @radix-ui/react-select
- @supabase/ssr
- @radix-ui/react-slider
- tailwindcss-animate
- @tanstack/react-query
- @tanstack/react-table
- uuid
- react
- z-ai-web-dev-sdk
- zod
- zustand
- postcss.config.mjs
- scratch/test-db.js
- tailwind.config.ts
- tests/python-runtime-build.sh
- python-runtime-container.sh
- AI Development Prompt Pack
- .zscripts/database-runtime-build.sh
- react-day-picker
- react-markdown
- @supabase/supabase-js

## God Nodes (most connected - your core abstractions)
1. `cn()` - 247 edges
2. `authErrorResponse()` - 119 edges
3. `requireOrgContext()` - 108 edges
4. `logAudit()` - 86 edges
5. `db` - 59 edges
6. `AuthError` - 49 edges
7. `useAppStore` - 42 edges
8. `Workspace Intelligence Platform` - 32 edges
9. `Button()` - 26 edges
10. `getCurrentUser()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `extractWithLLM()`  [EXTRACTED]
  test-extract.ts → src/lib/extraction.ts
- `run()` --calls--> `callGeminiWithFallback()`  [EXTRACTED]
  test-gemini.mjs → src/lib/gemini.ts
- `run()` --calls--> `callGeminiWithFallback()`  [EXTRACTED]
  test-gemini.ts → src/lib/gemini.ts
- `main()` --calls--> `getGmailClient()`  [EXTRACTED]
  test-google-hang.ts → src/lib/google-client.ts
- `GET()` --indirect_call--> `serializeGoogleConnection()`  [INFERRED]
  src/app/api/dashboard/route.ts → src/lib/serialize.ts

## Import Cycles
- None detected.

## Communities (169 total, 79 thin omitted)

### Community 0 - "cn"
Cohesion: 0.06
Nodes (36): AccordionContent(), AccordionItem(), AccordionTrigger(), AlertDialogOverlay(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList() (+28 more)

### Community 1 - "lib/types.ts"
Cohesion: 0.07
Nodes (34): CONNECTION_STATUS_LABELS, FieldTypeBadge(), fieldTypeColor, JOB_STATUS_LABELS, jobTypeColor, RECORD_STATUS_LABELS, RoleBadge(), RUN_STATE_LABELS (+26 more)

### Community 2 - "sidebar.tsx"
Cohesion: 0.06
Nodes (41): Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle(), SheetTrigger() (+33 more)

### Community 3 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar(), MenubarCheckboxItem(), MenubarContent(), MenubarItem(), MenubarLabel(), MenubarRadioItem(), MenubarSeparator(), MenubarShortcut() (+3 more)

### Community 4 - "ai-studio-view.tsx"
Cohesion: 0.12
Nodes (25): Badge(), badgeVariants, CardContent(), Table(), TableBody(), TableCell(), TableHead(), TableHeader() (+17 more)

### Community 5 - "job-runner.ts"
Cohesion: 0.20
Nodes (16): ensureDefaultDataset(), writeDefaultDatasetRecord(), extractWithLLM(), globalForRunner, isRetryableError(), pickNextJob(), processAiExtraction(), processDeterministicSync() (+8 more)

### Community 6 - "auth.ts"
Cohesion: 0.10
Nodes (29): PATCH(), POST(), ROLE_LEVEL, verifyOrgAccess(), DELETE(), PATCH(), ROLE_LEVEL, verifyOrgAccess() (+21 more)

### Community 7 - "use-toast.ts"
Cohesion: 0.08
Nodes (31): geistMono, geistSans, metadata, getQueryClient(), makeQueryClient(), Providers(), Toaster(), Toast (+23 more)

### Community 8 - "AuthError"
Cohesion: 0.27
Nodes (9): GET(), DELETE(), PATCH(), requireConnection(), GET(), POST(), AuthError, buildGoogleOAuthUrl() (+1 more)

### Community 9 - "Workspace Intelligence Platform — Complete SaaS Ar.md"
Cohesion: 0.06
Nodes (32): Best Execution Strategy, Prompt 00 — Master Operating Contract, Prompt 01 — Repository Discovery, Prompt 02 — Requirements Decomposition, Prompt 03 — Feature Contract First, Prompt 04 — Monorepo Guardrail, Prompt 05 — Database-First Implementation, Prompt 06 — Supabase RLS Review (+24 more)

### Community 10 - "devDependencies"
Cohesion: 0.06
Nodes (31): bun-types, eslint, eslint-config-next, devDependencies, bun-types, eslint, eslint-config-next, tailwindcss (+23 more)

### Community 11 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 12 - "source-builder-view.tsx"
Cohesion: 0.08
Nodes (30): Message, User, Card(), CardDescription(), CardHeader(), CardTitle(), Input(), Label() (+22 more)

### Community 13 - "context-menu.tsx"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubContent() (+1 more)

### Community 14 - "extraction/route.ts"
Cohesion: 0.22
Nodes (14): POST(), POST(), ROLE_LEVEL, GET(), POST(), requireSource(), POST(), flagFieldsForReview() (+6 more)

### Community 15 - "dashboard/route.ts"
Cohesion: 0.28
Nodes (15): GET(), GET(), loadSchemaFields(), PATCH(), requireRecord(), GET(), POST(), requireDataset() (+7 more)

### Community 16 - "app-shell.tsx"
Cohesion: 0.05
Nodes (58): LoginPageContent(), Mode, Home(), AppShell(), NAV_ITEMS, NavItem, AssistantButton(), KeyboardShortcutsDialog() (+50 more)

### Community 17 - "members-view.tsx"
Cohesion: 0.11
Nodes (39): AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogTitle() (+31 more)

### Community 18 - "settings-view.tsx"
Cohesion: 0.11
Nodes (20): Switch(), OutgoingInvites(), BillingSection(), ConnectAccountDialog(), ConnectedAccountsSection(), initials(), IntegrationDef, IntegrationsSection() (+12 more)

### Community 19 - "authErrorResponse"
Cohesion: 0.13
Nodes (43): POST(), DELETE(), GET(), requireDataset(), POST(), DELETE(), PATCH(), requireField() (+35 more)

### Community 20 - "chart.tsx"
Cohesion: 0.25
Nodes (9): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), getPayloadConfigFromPayload(), THEMES (+1 more)

### Community 21 - "google-client.ts"
Cohesion: 0.21
Nodes (15): buildAttachmentSummary(), categoriseLinks(), ParsedEmailFields, parseEmailFields(), SIG_PATTERNS, splitSignature(), decodeBase64Url(), extractAttachments() (+7 more)

### Community 22 - "Functional Scope"
Cohesion: 0.10
Nodes (20): AI Agents, AI Extraction System, AI Output Contract, AI Resource Bundle Model, Attachment and Document Discovery, Audit System, Dataset System, Document Processing Engine (+12 more)

### Community 23 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 24 - "assistant-panel.tsx"
Cohesion: 0.12
Nodes (15): AssistantPanel(), formatTime(), MessageBubble(), Message, QuickChip, extractChips(), generateId(), STARTER_PROMPTS (+7 more)

### Community 25 - "Workspace Intelligence Platform"
Cohesion: 0.10
Nodes (21): Architectural Principles, BullMQ Queues, CI/CD, Complete Product Requirements and Production Architecture Document, DevOps Architecture, Final Architecture Recommendations, Folder Structure, High-Level Architecture (+13 more)

### Community 27 - "15-Prompt Build Sequence"
Cohesion: 0.12
Nodes (16): 15-Prompt Build Sequence, Prompt 10 — Implement Organization, Sharing, Permissions, and Audit, Prompt 11 — Implement Realtime, Dashboard, Exports, and Notifications, Prompt 12 — Complete Frontend UX and Design System, Prompt 13 — Full Integration and Contract Repair, Prompt 14 — Production Hardening and Security, Prompt 15 — Final Verification, Deployment, and Handoff, Prompt 1 — Inspect and Plan the Repository (+8 more)

### Community 28 - "Workspace Intelligence Platform — Worklog"
Cohesion: 0.12
Nodes (16): Architectural Boundaries (Preserved from Plan), Core Entities (from plan, adapted to Prisma), Environment Adaptation, Evidence Rule (Hard Requirement), Pages / Views (all on `/` via Zustand switcher), Project Status (Initial), Stage Summary, Stage Summary (+8 more)

### Community 29 - "serialize.ts"
Cohesion: 0.15
Nodes (20): POST(), POST(), GET(), GET(), GET(), loadFieldForValue(), PATCH(), requireValue() (+12 more)

### Community 30 - "command-palette.tsx"
Cohesion: 0.12
Nodes (23): CommandAction, CommandPalette(), SearchResults, timeAgo(), Shortcut, SHORTCUTS, Command(), CommandDialog() (+15 more)

### Community 31 - "carousel.tsx"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 32 - "Core Tables"
Cohesion: 0.14
Nodes (14): AI Extraction and Validation, Core Tables, Database Architecture, Datasets, Design Principles, Documents and Indexing, Drive and Linked Resources, Gmail and Email (+6 more)

### Community 33 - "README.md"
Cohesion: 0.25
Nodes (7): Description, Example, Install:, Name, nextjs_tailwind_shadcn_ts, Synopsis, Test:

### Community 34 - "db.ts"
Cohesion: 0.17
Nodes (11): GET(), GET(), POST(), GET(), JOB_TYPE_COLORS, ensureOrgDefaultDataset(), db, globalForPrisma (+3 more)

### Community 35 - "google-auth.ts"
Cohesion: 0.25
Nodes (13): GET(), decodeOAuthState(), decryptToken(), encryptToken(), exchangeCodeForTokens(), getEncryptionKey(), OAUTH_SCOPES, OAuthState (+5 more)

### Community 36 - "UI/UX Specifications"
Cohesion: 0.15
Nodes (13): AI Studio, Dashboard, Dataset Detail, Dataset Explorer, Landing Page, Layout System, Organizations and Members, Schema Builder (+5 more)

### Community 37 - "chat/route.ts"
Cohesion: 0.19
Nodes (11): AppContext, buildSystemPrompt(), ChatMessage, executeTool(), parseToolCall(), POST(), ExtractOptions, FieldReviewFlag (+3 more)

### Community 38 - "form.tsx"
Cohesion: 0.23
Nodes (10): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext, FormItemContextValue, FormLabel() (+2 more)

### Community 39 - "API Architecture"
Cohesion: 0.17
Nodes (12): AI and Job APIs, API Architecture, API Design Principles, Authentication APIs, Dataset APIs, Example Create Source Request, Example Create Source Response, Google Connection APIs (+4 more)

### Community 40 - "Work Log"
Cohesion: 0.18
Nodes (10): 1. Read context, 2. Shared backend helpers (`src/lib/`), 3. API routes (`src/app/api/`), 4. Lint + typecheck, 5. Live verification against dev server, 6. Type-system notes / gotchas, Stage Summary, Task (+2 more)

### Community 41 - "gemini.ts"
Cohesion: 0.17
Nodes (16): GET(), callGeminiWithFallback(), GeminiCallOptions, GeminiMessage, GeminiResult, getModelChainStatus(), getState(), isBlocked() (+8 more)

### Community 42 - "Completed Modifications"
Cohesion: 0.18
Nodes (11): 1. Confidence Threshold Slider in Schema Builder — NEW, 2. Original AI Value Display in Evidence Drawer — NEW, 3. Health Endpoint — NEW, 4. Webhook Event Wiring — ENHANCED, 5. Review Flags in AI Studio Test Sandbox — NEW, Completed Modifications, Cron Review Phase — Confidence Threshold UI + Evidence Display + Health + Webhooks, Current Project Status Assessment (+3 more)

### Community 43 - "drawer.tsx"
Cohesion: 0.18
Nodes (6): DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle()

### Community 44 - "dataset-detail-view.tsx"
Cohesion: 0.11
Nodes (23): Notification, NotificationsDropdown(), timeAgo(), Checkbox(), Popover(), PopoverContent(), PopoverTrigger(), Slider() (+15 more)

### Community 45 - "Completed Modifications"
Cohesion: 0.20
Nodes (10): 1. Command Palette (Cmd+K) — NEW, 2. Notifications Dropdown — NEW, 3. Keyboard Shortcuts Dialog — NEW, 4. Global Keyboard Shortcuts — NEW, 5. Improved Sidebar — ENHANCED, 6. Improved Top Bar — ENHANCED, 7. Improved Footer — ENHANCED, 8. View Transition Animations — NEW (+2 more)

### Community 46 - "Cron Review Phase 2 — Global Search + Bulk Actions + Saved Views"
Cohesion: 0.20
Nodes (10): 1. Recently Viewed Tracking — NEW, 2. Global Search API + Command Palette Integration — NEW, 3. Bulk Actions in Sources View — NEW, 4. Saved Views in Dataset Explorer — NEW, Completed Modifications, Cron Review Phase 2 — Global Search + Bulk Actions + Saved Views, Current Project Status Assessment, Recommended Next Steps (Priority Order) (+2 more)

### Community 47 - "Cron Review Phase 3 — Usage Dashboard + Clone + Import + Animations"
Cohesion: 0.20
Nodes (10): 1. Usage & Billing Dashboard — NEW VIEW, 2. Clone Actions — NEW, 3. CSV/JSON Import — NEW, 4. Landing Page Hero Animations — ENHANCED, Completed Modifications, Cron Review Phase 3 — Usage Dashboard + Clone + Import + Animations, Current Project Status Assessment, Recommended Next Steps (Priority Order) (+2 more)

### Community 48 - "Phase 1-9 Audit + Hardening"
Cohesion: 0.20
Nodes (10): Phase 1-9 Audit + Hardening, Phase 1 — Repository Audit (Complete), Phase 3 — Authorization + Tenant Isolation (Complete), Phase 5 — Job System + State Machine (Complete), Phase 6 — Webhook Event Dispatcher (Complete), Phase 7 — Schema Field Confidence Threshold (Complete), Phase 8 — Evidence Preservation (Complete), Recommended Next Steps (Priority Order) (+2 more)

### Community 49 - "websocket/server.ts"
Cohesion: 0.28
Nodes (8): createSystemMessage(), createUserMessage(), generateMessageId(), httpServer, io, Message, User, users

### Community 50 - "Cron Review Phase 4 — Activity Feed + Confidence Thresholds + Webhooks"
Cohesion: 0.22
Nodes (9): 1. Activity Feed on Dashboard — NEW, 2. Per-Field Confidence Thresholds — NEW, 3. Webhook Configuration — NEW, Completed Modifications, Cron Review Phase 4 — Activity Feed + Confidence Thresholds + Webhooks, Current Project Status Assessment, Recommended Next Steps (Priority Order), Unresolved Issues / Risks (+1 more)

### Community 51 - "Supabase Schema Blueprint"
Cohesion: 0.67
Nodes (3): Example Column Design, Foundational Tables, Supabase Schema Blueprint

### Community 52 - "Workspace Intelligence Platform — Complete SaaS Architecture \& Build Blueprint"
Cohesion: 0.25
Nodes (8): AI Extraction \& Evidence Rule, API, UI, and Roadmap Summary, Authentication \& Multi-Tenancy, Core Product Model, Gmail Sync \& Job Pipeline, Supabase Database Schema (Core Tables), System Architecture, Workspace Intelligence Platform — Complete SaaS Architecture \& Build Blueprint

### Community 53 - "toggle-group.tsx"
Cohesion: 0.43
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 54 - "dev.sh"
Cohesion: 0.57
Nodes (5): log_step_end(), log_step_start(), dev.sh script, start_mini_services(), wait_for_service()

### Community 55 - "Task 12-14 — Frontend View Builder (Orgs / Members / Sharing / Audit / Settings)"
Cohesion: 0.33
Nodes (5): Files Created, Key Decisions, Summary, Task 12-14 — Frontend View Builder (Orgs / Members / Sharing / Audit / Settings), Verification

### Community 56 - "Task 8-10 — Frontend View Builder (Sources / Source Builder / Schema Builder)"
Cohesion: 0.33
Nodes (5): Files Created, Key Decisions, Task 8-10 — Frontend View Builder (Sources / Source Builder / Schema Builder), Verification, What Other Agents Should Know

### Community 57 - "export/route.ts"
Cohesion: 0.27
Nodes (9): csvEscape(), POST(), GET(), POST(), GET(), serializeUsageMetric(), bumpUsageMetric(), currentMonthUsage() (+1 more)

### Community 58 - "relativeTime"
Cohesion: 0.36
Nodes (7): AgentLogsDialog(), AgentLogsTab(), ExtractionRunsTab(), formatDateTime(), JobDetailDialog(), ModelCostTab(), relativeTime()

### Community 59 - "dropdown-menu.tsx"
Cohesion: 0.18
Nodes (6): DropdownMenuCheckboxItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuShortcut(), DropdownMenuSubContent(), DropdownMenuSubTrigger()

### Community 60 - "Cron Review Phase — QA + Feature Additions"
Cohesion: 0.33
Nodes (6): Cron Review Phase — QA + Feature Additions, Current Project Status Assessment, Known Environment Constraint, Recommended Next Steps (Priority Order), Unresolved Issues / Risks, Verification Results

### Community 62 - "alert.tsx"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 63 - "middleware.ts"
Cohesion: 0.50
Nodes (4): config, isPublicPath(), middleware(), PUBLIC_PATHS

### Community 64 - "Personas"
Cohesion: 0.40
Nodes (5): Analyst / Reviewer, Organization Admin, Personal Power User, Personas, Team Operator

### Community 65 - "Wireframe Specifications"
Cohesion: 0.40
Nodes (5): Dashboard Wireframe, Dataset Explorer Wireframe, Global Navigation, Source Builder Wireframe, Wireframe Specifications

### Community 66 - "Development Roadmap"
Cohesion: 0.40
Nodes (5): Development Roadmap, Phase 1: Foundation, Phase 2: Gmail MVP, Phase 3: Production Core, Phase 4: Enterprise Scale

### Community 67 - "Frontend Architecture"
Cohesion: 0.40
Nodes (5): Frontend Architecture, Frontend Role, Page Inventory, Stack, State Model

### Community 68 - "Security Architecture"
Cohesion: 0.40
Nodes (5): Google OAuth and Scope Strategy, Security Architecture, Security Requirements, Threat Model, Token Handling

### Community 69 - "Product Requirements Document"
Cohesion: 0.40
Nodes (5): Problem Statement, Product Requirements Document, Solution Statement, Success Metrics, Target Outcomes

### Community 70 - "Production Roadmap"
Cohesion: 0.40
Nodes (5): Production Roadmap, Stage 1, Stage 2, Stage 3, Stage 4

### Community 71 - ".zscripts/python-runtime-build.sh"
Cohesion: 0.80
Nodes (4): has_python_sources(), install_pyproject(), install_requirements(), python-runtime-build.sh script

### Community 72 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): __dirname, eslintConfig, __filename

### Community 76 - "tests/database-runtime-build.sh"
Cohesion: 0.50
Nodes (3): DB_PUSH_CALLS, PATH, database-runtime-build.sh script

### Community 77 - "Coding Standards"
Cohesion: 0.50
Nodes (4): AI, Coding Standards, Database, General

### Community 78 - "AI Architecture"
Cohesion: 0.50
Nodes (4): AI Architecture, AI Guardrails, AI Workflow, Model Strategy

### Community 79 - "Backend Architecture"
Cohesion: 0.50
Nodes (4): Backend Architecture, NestJS Modules, Service Layer Rules, Worker Topology

### Community 80 - "User Flows"
Cohesion: 0.50
Nodes (4): Connect Account and Build Source, Review Extraction, Share Dataset, User Flows

### Community 81 - "Deployment Architecture"
Cohesion: 0.50
Nodes (4): Deployment Architecture, Environment Management, Environments, Recommended Deployment Split

### Community 82 - "RLS Architecture"
Cohesion: 0.50
Nodes (4): Example Policy Model, Helper Functions, RLS Architecture, RLS Principles

### Community 83 - "Feature Specifications"
Cohesion: 0.50
Nodes (4): Feature: Drive Discovery, Feature: Evidence Viewer, Feature: Gmail Source Ingestion, Feature Specifications

### Community 84 - "Workspace Intelligence Platform"
Cohesion: 0.50
Nodes (4): File Map, Platform Decision Summary, Requirements Index, Workspace Intelligence Platform

### Community 85 - "mini-services-start.sh"
Cohesion: 0.33
Nodes (3): main(), mini-services-start.sh script, start.sh script

### Community 92 - "navigation-menu.tsx"
Cohesion: 0.22
Nodes (9): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuTrigger(), navigationMenuTriggerStyle (+1 more)

### Community 95 - "Task 12-14 — Frontend View Builder (Organizations / Members / Sharing / Audit / Settings)"
Cohesion: 0.40
Nodes (5): Files Created, Key Decisions, Task 12-14 — Frontend View Builder (Organizations / Members / Sharing / Audit / Settings), Verification, What Other Agents Should Know

### Community 96 - "dependencies"
Cohesion: 0.12
Nodes (17): @dnd-kit/core, @dnd-kit/utilities, next-intl, dependencies, @dnd-kit/core, @dnd-kit/utilities, next-intl, @prisma/client (+9 more)

## Knowledge Gaps
- **547 isolated node(s):** `build.sh script`, `NEXT_TELEMETRY_DISABLED`, `database-runtime-build.sh script`, `$schema`, `style` (+542 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **79 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `lib/types.ts`, `sidebar.tsx`, `menubar.tsx`, `ai-studio-view.tsx`, `use-toast.ts`, `source-builder-view.tsx`, `context-menu.tsx`, `app-shell.tsx`, `members-view.tsx`, `settings-view.tsx`, `chart.tsx`, `assistant-panel.tsx`, `command-palette.tsx`, `carousel.tsx`, `form.tsx`, `drawer.tsx`, `dataset-detail-view.tsx`, `toggle-group.tsx`, `dropdown-menu.tsx`, `alert.tsx`, `hover-card.tsx`, `navigation-menu.tsx`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `Workspace Intelligence Platform` connect `Workspace Intelligence Platform` to `Workspace Intelligence Platform — Complete SaaS Ar.md`, `Functional Scope`, `Core Tables`, `UI/UX Specifications`, `API Architecture`, `Supabase Schema Blueprint`, `Personas`, `Wireframe Specifications`, `Development Roadmap`, `Frontend Architecture`, `Security Architecture`, `Product Requirements Document`, `Production Roadmap`, `Coding Standards`, `AI Architecture`, `Backend Architecture`, `User Flows`, `Deployment Architecture`, `RLS Architecture`, `Feature Specifications`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `authErrorResponse()` connect `authErrorResponse` to `db.ts`, `chat/route.ts`, `auth.ts`, `AuthError`, `extraction/route.ts`, `dashboard/route.ts`, `export/route.ts`, `serialize.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `build.sh script`, `NEXT_TELEMETRY_DISABLED`, `database-runtime-build.sh script` to the rest of the system?**
  _547 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.06294326241134751 - nodes in this community are weakly interconnected._
- **Should `lib/types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `sidebar.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05673758865248227 - nodes in this community are weakly interconnected._