# Graph Report - CDS IIT JMU  (2026-08-22)

## Corpus Check
- 173 files · ~166,476 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1452 nodes · 3562 edges · 165 communities (88 shown, 77 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ef283818`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cn
- dataset-detail-view.tsx
- sidebar.tsx
- members-view.tsx
- sharing-view.tsx
- job-runner.ts
- auth.ts
- use-toast.ts
- authErrorResponse
- Workspace Intelligence Platform — Complete SaaS Ar.md
- devDependencies
- compilerOptions
- dashboard-view.tsx
- ai-studio-view.tsx
- db.ts
- serialize.ts
- page.tsx
- schema-builder-view.tsx
- settings-view.tsx
- logAudit
- react
- source-builder-view.tsx
- Functional Scope
- components.json
- audit-view.tsx
- Workspace Intelligence Platform
- dependencies
- 15-Prompt Build Sequence
- Workspace Intelligence Platform — Worklog
- route.ts
- command-palette.tsx
- carousel.tsx
- Core Tables
- route.ts
- audit.ts
- pagination.tsx
- UI/UX Specifications
- AuthError
- form.tsx
- API Architecture
- Work Log
- drawer.tsx
- Completed Modifications
- navigation-menu.tsx
- formatValueCompact
- Completed Modifications
- Cron Review Phase 2 — Global Search + Bulk Actions + Saved Views
- Cron Review Phase 3 — Usage Dashboard + Clone + Import + Animations
- Phase 1-9 Audit + Hardening
- server.ts
- Cron Review Phase 4 — Activity Feed + Confidence Thresholds + Webhooks
- breadcrumb.tsx
- Workspace Intelligence Platform — Complete SaaS Architecture \& Build Blueprint
- toggle-group.tsx
- dev.sh
- Task 12-14 — Frontend View Builder (Orgs / Members / Sharing / Audit / Settings)
- Task 8-10 — Frontend View Builder (Sources / Source Builder / Schema Builder)
- page.tsx
- formatDateTime
- Project Status (Initial)
- Cron Review Phase — QA + Feature Additions
- accordion.tsx
- alert.tsx
- middleware.ts
- Personas
- Wireframe Specifications
- Development Roadmap
- Frontend Architecture
- Security Architecture
- Product Requirements Document
- Production Roadmap
- python-runtime-build.sh
- eslint.config.mjs
- createClient
- hover-card.tsx
- database-runtime-build.sh
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
- Queue Architecture
- DevOps Architecture
- build.sh
- mini-services-build.sh
- mini-services-install.sh
- start.sh
- class-variance-authority
- clsx
- cmdk
- @dnd-kit/core
- @dnd-kit/sortable
- @dnd-kit/utilities
- framer-motion
- googleapis
- @hookform/resolvers
- lucide-react
- @mdxeditor/editor
- next
- next-auth
- next.config.ts
- next-intl
- next-themes
- pg
- prisma
- @prisma/client
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
- @radix-ui/react-scroll-area
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
- sonner
- @supabase/ssr
- tailwind-merge
- tailwindcss-animate
- @tanstack/react-query
- @tanstack/react-table
- uuid
- vaul
- z-ai-web-dev-sdk
- zod
- zustand
- postcss.config.mjs
- test-db.js
- tailwind.config.ts
- python-runtime-build.sh
- python-runtime-container.sh
- AI Development Prompt Pack
- database-runtime-build.sh

## God Nodes (most connected - your core abstractions)
1. `cn()` - 235 edges
2. `authErrorResponse()` - 113 edges
3. `requireOrgContext()` - 102 edges
4. `logAudit()` - 84 edges
5. `AuthError` - 46 edges
6. `useAppStore` - 35 edges
7. `Workspace Intelligence Platform` - 32 edges
8. `Button()` - 25 edges
9. `getCurrentUser()` - 21 edges
10. `Functional Scope` - 20 edges

## Surprising Connections (you probably didn't know these)
- `CalendarDayButton()` --references--> `react`  [EXTRACTED]
  src/components/ui/calendar.tsx → package.json
- `Carousel()` --references--> `react`  [EXTRACTED]
  src/components/ui/carousel.tsx → package.json
- `useCarousel()` --references--> `react`  [EXTRACTED]
  src/components/ui/carousel.tsx → package.json
- `FormItem()` --references--> `react`  [EXTRACTED]
  src/components/ui/form.tsx → package.json
- `useFormField()` --references--> `react`  [EXTRACTED]
  src/components/ui/form.tsx → package.json

## Import Cycles
- None detected.

## Communities (165 total, 77 thin omitted)

### Community 0 - "cn"
Cohesion: 0.05
Nodes (42): AlertDialogOverlay(), CardAction(), CardFooter(), ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem() (+34 more)

### Community 1 - "dataset-detail-view.tsx"
Cohesion: 0.08
Nodes (36): Notification, NotificationsDropdown(), timeAgo(), Badge(), badgeVariants, Checkbox(), Popover(), PopoverContent() (+28 more)

### Community 2 - "sidebar.tsx"
Cohesion: 0.06
Nodes (38): Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle(), SheetTrigger() (+30 more)

### Community 3 - "members-view.tsx"
Cohesion: 0.09
Nodes (28): NAV_ITEMS, Avatar(), AvatarFallback(), AvatarImage(), DropdownMenu(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel() (+20 more)

### Community 4 - "sharing-view.tsx"
Cohesion: 0.12
Nodes (28): ErrorState(), PageHeader(), StatCard(), Table(), TableBody(), TableCell(), TableHead(), TableHeader() (+20 more)

### Community 5 - "job-runner.ts"
Cohesion: 0.10
Nodes (35): GET(), ExtractOptions, FieldReviewFlag, SchemaFieldInput, decodeOAuthState(), decryptToken(), encryptToken(), exchangeCodeForTokens() (+27 more)

### Community 6 - "auth.ts"
Cohesion: 0.10
Nodes (29): PATCH(), POST(), ROLE_LEVEL, verifyOrgAccess(), DELETE(), PATCH(), ROLE_LEVEL, verifyOrgAccess() (+21 more)

### Community 7 - "use-toast.ts"
Cohesion: 0.08
Nodes (31): geistMono, geistSans, metadata, getQueryClient(), makeQueryClient(), Providers(), Toaster(), Toast (+23 more)

### Community 8 - "authErrorResponse"
Cohesion: 0.16
Nodes (23): POST(), DELETE(), GET(), requireDataset(), GET(), POST(), DELETE(), GET() (+15 more)

### Community 9 - "Workspace Intelligence Platform — Complete SaaS Ar.md"
Cohesion: 0.06
Nodes (32): Best Execution Strategy, Prompt 00 — Master Operating Contract, Prompt 01 — Repository Discovery, Prompt 02 — Requirements Decomposition, Prompt 03 — Feature Contract First, Prompt 04 — Monorepo Guardrail, Prompt 05 — Database-First Implementation, Prompt 06 — Supabase RLS Review (+24 more)

### Community 10 - "devDependencies"
Cohesion: 0.06
Nodes (31): bun-types, eslint, eslint-config-next, devDependencies, bun-types, eslint, eslint-config-next, tailwindcss (+23 more)

### Community 11 - "compilerOptions"
Cohesion: 0.06
Nodes (30): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, ./src/* (+22 more)

### Community 12 - "dashboard-view.tsx"
Cohesion: 0.14
Nodes (21): Message, User, Button(), Card(), CardContent(), CardDescription(), CardHeader(), CardTitle() (+13 more)

### Community 13 - "ai-studio-view.tsx"
Cohesion: 0.10
Nodes (18): KeyboardShortcutsDialog(), Shortcut, SHORTCUTS, Dialog(), DialogContent(), DialogDescription(), DialogHeader(), DialogTitle() (+10 more)

### Community 14 - "db.ts"
Cohesion: 0.16
Nodes (17): csvEscape(), POST(), POST(), GET(), POST(), POST(), GET(), globalForPrisma (+9 more)

### Community 15 - "serialize.ts"
Cohesion: 0.24
Nodes (20): GET(), GET(), loadSchemaFields(), PATCH(), requireRecord(), loadFieldForValue(), PATCH(), requireValue() (+12 more)

### Community 16 - "page.tsx"
Cohesion: 0.11
Nodes (22): Home(), AppShell(), NavItem, DatasetsView(), formatDate(), relativeTime(), CAPABILITIES, INTEGRATIONS (+14 more)

### Community 17 - "schema-builder-view.tsx"
Cohesion: 0.16
Nodes (17): AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogTitle() (+9 more)

### Community 18 - "settings-view.tsx"
Cohesion: 0.11
Nodes (21): Switch(), OutgoingInvites(), BillingSection(), ConnectedAccountsSection(), initials(), IntegrationDef, IntegrationsSection(), NOTIFICATION_PREFS (+13 more)

### Community 19 - "logAudit"
Cohesion: 0.19
Nodes (18): POST(), DELETE(), PATCH(), requireField(), POST(), PUT(), requireSchema(), DELETE() (+10 more)

### Community 20 - "react"
Cohesion: 0.12
Nodes (17): react, react, ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent() (+9 more)

### Community 21 - "source-builder-view.tsx"
Cohesion: 0.14
Nodes (18): SearchResults, EMPTY_FORM, FILTER_TYPES, makeLocalId(), OPERATORS, RuleDraft, ruleToText(), ruleValueFromString() (+10 more)

### Community 22 - "Functional Scope"
Cohesion: 0.10
Nodes (20): AI Agents, AI Extraction System, AI Output Contract, AI Resource Bundle Model, Attachment and Document Discovery, Audit System, Dataset System, Document Processing Engine (+12 more)

### Community 23 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 24 - "audit-view.tsx"
Cohesion: 0.17
Nodes (15): Select(), SelectContent(), SelectItem(), SelectTrigger(), SelectValue(), ACTION_OPTIONS, ACTION_STYLE, ACTOR_TYPE_STYLE (+7 more)

### Community 25 - "Workspace Intelligence Platform"
Cohesion: 0.11
Nodes (18): Architectural Principles, Complete Product Requirements and Production Architecture Document, Example Column Design, Final Architecture Recommendations, Folder Structure, Foundational Tables, High-Level Architecture, Key Metrics (+10 more)

### Community 26 - "dependencies"
Cohesion: 0.12
Nodes (17): date-fns, embla-carousel-react, input-otp, dependencies, date-fns, embla-carousel-react, input-otp, @radix-ui/react-select (+9 more)

### Community 27 - "15-Prompt Build Sequence"
Cohesion: 0.12
Nodes (16): 15-Prompt Build Sequence, Prompt 10 — Implement Organization, Sharing, Permissions, and Audit, Prompt 11 — Implement Realtime, Dashboard, Exports, and Notifications, Prompt 12 — Complete Frontend UX and Design System, Prompt 13 — Full Integration and Contract Repair, Prompt 14 — Production Hardening and Security, Prompt 15 — Final Verification, Deployment, and Handoff, Prompt 1 — Inspect and Plan the Repository (+8 more)

### Community 28 - "Workspace Intelligence Platform — Worklog"
Cohesion: 0.12
Nodes (15): Files Created, Key Decisions, Stage Summary, Stage Summary, Stage Summary, Task 12-14 — Frontend View Builder (Organizations / Members / Sharing / Audit / Settings), Task 4 — Backend API Routes, Task 8-10 — Sources, Source Builder & Schema Builder Views (+7 more)

### Community 29 - "route.ts"
Cohesion: 0.22
Nodes (12): GET(), GET(), PUT(), requireSource(), GET(), POST(), requireSource(), parseJson() (+4 more)

### Community 30 - "command-palette.tsx"
Cohesion: 0.24
Nodes (12): CommandAction, CommandPalette(), timeAgo(), Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput() (+4 more)

### Community 31 - "carousel.tsx"
Cohesion: 0.20
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 32 - "Core Tables"
Cohesion: 0.14
Nodes (14): AI Extraction and Validation, Core Tables, Database Architecture, Datasets, Design Principles, Documents and Indexing, Drive and Linked Resources, Gmail and Email (+6 more)

### Community 33 - "route.ts"
Cohesion: 0.27
Nodes (9): GET(), DELETE(), PATCH(), requireConnection(), GET(), POST(), buildGoogleOAuthUrl(), offsetDate() (+1 more)

### Community 34 - "audit.ts"
Cohesion: 0.28
Nodes (9): POST(), DELETE(), GET(), loadSourceInOrg(), PATCH(), GET(), POST(), AuditInput (+1 more)

### Community 35 - "pagination.tsx"
Cohesion: 0.19
Nodes (10): buttonVariants, Calendar(), CalendarDayButton(), Pagination(), PaginationContent(), PaginationEllipsis(), PaginationLink(), PaginationLinkProps (+2 more)

### Community 36 - "UI/UX Specifications"
Cohesion: 0.15
Nodes (13): AI Studio, Dashboard, Dataset Detail, Dataset Explorer, Landing Page, Layout System, Organizations and Members, Schema Builder (+5 more)

### Community 37 - "AuthError"
Cohesion: 0.29
Nodes (7): POST(), POST(), GET(), GET(), AuthError, serializeAiJob(), serializeAiOutput()

### Community 38 - "form.tsx"
Cohesion: 0.23
Nodes (10): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext, FormItemContextValue, FormLabel() (+2 more)

### Community 39 - "API Architecture"
Cohesion: 0.17
Nodes (12): AI and Job APIs, API Architecture, API Design Principles, Authentication APIs, Dataset APIs, Example Create Source Request, Example Create Source Response, Google Connection APIs (+4 more)

### Community 40 - "Work Log"
Cohesion: 0.18
Nodes (10): 1. Read context, 2. Shared backend helpers (`src/lib/`), 3. API routes (`src/app/api/`), 4. Lint + typecheck, 5. Live verification against dev server, 6. Type-system notes / gotchas, Stage Summary, Task (+2 more)

### Community 41 - "drawer.tsx"
Cohesion: 0.18
Nodes (6): DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle()

### Community 42 - "Completed Modifications"
Cohesion: 0.18
Nodes (11): 1. Confidence Threshold Slider in Schema Builder — NEW, 2. Original AI Value Display in Evidence Drawer — NEW, 3. Health Endpoint — NEW, 4. Webhook Event Wiring — ENHANCED, 5. Review Flags in AI Studio Test Sandbox — NEW, Completed Modifications, Cron Review Phase — Confidence Threshold UI + Evidence Display + Health + Webhooks, Current Project Status Assessment (+3 more)

### Community 43 - "navigation-menu.tsx"
Cohesion: 0.22
Nodes (9): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuTrigger(), navigationMenuTriggerStyle (+1 more)

### Community 44 - "formatValueCompact"
Cohesion: 0.22
Nodes (10): EditValueDialog(), EvidenceDrawer(), FieldValueCard(), formatDateTime(), formatDateValue(), formatValueCompact(), parseForEdit(), relativeTime() (+2 more)

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

### Community 49 - "server.ts"
Cohesion: 0.28
Nodes (8): createSystemMessage(), createUserMessage(), generateMessageId(), httpServer, io, Message, User, users

### Community 50 - "Cron Review Phase 4 — Activity Feed + Confidence Thresholds + Webhooks"
Cohesion: 0.22
Nodes (9): 1. Activity Feed on Dashboard — NEW, 2. Per-Field Confidence Thresholds — NEW, 3. Webhook Configuration — NEW, Completed Modifications, Cron Review Phase 4 — Activity Feed + Confidence Thresholds + Webhooks, Current Project Status Assessment, Recommended Next Steps (Priority Order), Unresolved Issues / Risks (+1 more)

### Community 51 - "breadcrumb.tsx"
Cohesion: 0.25
Nodes (6): BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage(), BreadcrumbSeparator()

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

### Community 57 - "page.tsx"
Cohesion: 0.47
Nodes (3): LoginPageContent(), Mode, createClient()

### Community 58 - "formatDateTime"
Cohesion: 0.53
Nodes (6): AgentLogsDialog(), AgentLogsTab(), ExtractionRunsTab(), formatDateTime(), JobDetailDialog(), relativeTime()

### Community 59 - "Project Status (Initial)"
Cohesion: 0.33
Nodes (6): Architectural Boundaries (Preserved from Plan), Core Entities (from plan, adapted to Prisma), Environment Adaptation, Evidence Rule (Hard Requirement), Pages / Views (all on `/` via Zustand switcher), Project Status (Initial)

### Community 60 - "Cron Review Phase — QA + Feature Additions"
Cohesion: 0.33
Nodes (6): Cron Review Phase — QA + Feature Additions, Current Project Status Assessment, Known Environment Constraint, Recommended Next Steps (Priority Order), Unresolved Issues / Risks, Verification Results

### Community 61 - "accordion.tsx"
Cohesion: 0.40
Nodes (3): AccordionContent(), AccordionItem(), AccordionTrigger()

### Community 62 - "alert.tsx"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 63 - "middleware.ts"
Cohesion: 0.60
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

### Community 71 - "python-runtime-build.sh"
Cohesion: 0.80
Nodes (4): has_python_sources(), install_pyproject(), install_requirements(), python-runtime-build.sh script

### Community 72 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): __dirname, eslintConfig, __filename

### Community 76 - "database-runtime-build.sh"
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

### Community 87 - "Queue Architecture"
Cohesion: 0.67
Nodes (3): BullMQ Queues, Queue Architecture, Queue Design Rules

### Community 88 - "DevOps Architecture"
Cohesion: 0.67
Nodes (3): CI/CD, DevOps Architecture, Quality Gates

## Knowledge Gaps
- **516 isolated node(s):** `build.sh script`, `NEXT_TELEMETRY_DISABLED`, `database-runtime-build.sh script`, `start.sh script`, `$schema` (+511 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **77 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `dataset-detail-view.tsx`, `sidebar.tsx`, `members-view.tsx`, `sharing-view.tsx`, `use-toast.ts`, `dashboard-view.tsx`, `ai-studio-view.tsx`, `page.tsx`, `schema-builder-view.tsx`, `settings-view.tsx`, `react`, `audit-view.tsx`, `command-palette.tsx`, `carousel.tsx`, `pagination.tsx`, `form.tsx`, `drawer.tsx`, `navigation-menu.tsx`, `breadcrumb.tsx`, `toggle-group.tsx`, `accordion.tsx`, `alert.tsx`, `hover-card.tsx`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `react-dom`, `devDependencies`, `react-hook-form`, `react-resizable-panels`, `react-syntax-highlighter`, `@reactuses/core`, `recharts`, `sharp`, `sonner`, `@supabase/ssr`, `tailwind-merge`, `react`, `tailwindcss-animate`, `@tanstack/react-query`, `@tanstack/react-table`, `uuid`, `vaul`, `z-ai-web-dev-sdk`, `zod`, `zustand`, `class-variance-authority`, `clsx`, `cmdk`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `framer-motion`, `googleapis`, `@hookform/resolvers`, `lucide-react`, `@mdxeditor/editor`, `next`, `next-auth`, `next-intl`, `next-themes`, `pg`, `prisma`, `@prisma/client`, `@radix-ui/react-accordion`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-checkbox`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `dataset-detail-view.tsx`, `sidebar.tsx`, `pagination.tsx`, `form.tsx`, `use-toast.ts`, `toggle-group.tsx`, `dependencies`, `carousel.tsx`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **What connects `build.sh script`, `NEXT_TELEMETRY_DISABLED`, `database-runtime-build.sh script` to the rest of the system?**
  _516 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.049094097019286964 - nodes in this community are weakly interconnected._
- **Should `dataset-detail-view.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07536231884057971 - nodes in this community are weakly interconnected._
- **Should `sidebar.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0613107822410148 - nodes in this community are weakly interconnected._