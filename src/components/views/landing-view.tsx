"use client";

import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Mail,
  Database,
  Sparkles,
  ShieldCheck,
  FileText,
  Search,
  GitBranch,
  Users,
  ArrowRight,
  CheckCircle2,
  Lock,
  Eye,
  Workflow,
  Layers,
  Cloud,
  Brain,
  FileSearch,
  Network,
} from "lucide-react";

export function LandingView() {
  const setView = useAppStore((s) => s.setView);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-4 w-4" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold">Workspace</span>
              <span className="text-[10px] text-muted-foreground">Intelligence Platform</span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#capabilities" className="text-muted-foreground hover:text-foreground">Capabilities</a>
            <a href="#use-cases" className="text-muted-foreground hover:text-foreground">Use cases</a>
            <a href="#security" className="text-muted-foreground hover:text-foreground">Security</a>
            <a href="#integrations" className="text-muted-foreground hover:text-foreground">Integrations</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setView("dashboard")}>
              Sign in
            </Button>
            <Button size="sm" onClick={() => setView("dashboard")}>
              Get started
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-5 gap-1.5">
              <Sparkles className="h-3 w-3" /> AI-native · Evidence-backed · Multi-tenant
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Turn Gmail & Drive into{" "}
              <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                structured, queryable datasets
              </span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              A backend-first, AI-native SaaS that converts emails, attachments, Drive
              resources, Docs, Sheets, and Forms into governed, evidence-backed records —
              through an asynchronous extraction pipeline with full auditability.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={() => setView("dashboard")} className="w-full sm:w-auto">
                Open the platform
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setView("ai-studio")}
                className="w-full sm:w-auto"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Try AI Studio
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card · Demo workspace pre-loaded with sample data
            </p>
          </div>

          {/* Pipeline illustration */}
          <div className="mt-16 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { icon: Mail, label: "Gmail/Drive", desc: "Sources" },
              { icon: GitBranch, label: "Rules", desc: "Filter & match" },
              { icon: Brain, label: "AI Extract", desc: "Gemini" },
              { icon: ShieldCheck, label: "Validate", desc: "Evidence" },
              { icon: Database, label: "Datasets", desc: "Queryable" },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="relative rounded-xl border bg-card p-4 text-center shadow-sm">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                  {i < 4 && (
                    <ArrowRight className="hidden sm:block absolute -right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="border-b py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              One composable pipeline, every output
            </h2>
            <p className="mt-4 text-muted-foreground">
              The entire platform reduces to one pipeline abstraction: SOURCE + SCHEMA +
              POLICY → DATASET. Every Gmail rule, every schema, every extraction shares the
              same orchestration, audit, and governance backbone.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              return (
                <div
                  key={cap.title}
                  className="group rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold">{cap.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    {cap.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section id="use-cases" className="border-b bg-muted/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Built for operational intelligence
            </h2>
            <p className="mt-4 text-muted-foreground">
              From personal productivity to enterprise-wide governance — the same pipeline
              scales from one inbox to millions of messages.
            </p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {USE_CASES.map((uc) => {
              const Icon = uc.icon;
              return (
                <div key={uc.title} className="rounded-xl border bg-background p-6">
                  <Icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 text-sm font-semibold">{uc.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{uc.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-b py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge variant="outline" className="mb-4 gap-1.5">
                <Lock className="h-3 w-3" /> Security & Governance
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Evidence-bound by default. Tenant-isolated by design.
              </h2>
              <p className="mt-4 text-muted-foreground">
                No AI-extracted value is ever persisted without an evidence snippet, source
                reference, confidence score, and timestamp. Multi-tenant isolation is enforced
                at the database layer, with role-aware access for owners, admins, managers,
                members, and viewers.
              </p>
              <ul className="mt-6 space-y-3">
                {SECURITY_POINTS.map((pt) => (
                  <li key={pt} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Evidence viewer</span>
                  </div>
                  <Badge variant="outline">94% confidence</Badge>
                </div>
                <div className="rounded-lg bg-muted/50 p-4">
                  <p className="text-xs font-mono text-muted-foreground">{"// dataset_values"}</p>
                  <pre className="mt-2 text-xs leading-relaxed overflow-x-auto"><code>{`{
  "field": "company",
  "value": "TechCorp",
  "confidence": 0.98,
  "evidence": "From: placements@techcorp.com",
  "source_file": "email-body",
  "page_number": 1,
  "model": "gemini-1.5-pro",
  "prompt_version": "v2",
  "extracted_at": "2025-10-19T08:14:22Z"
}`}</code></pre>
                </div>
                <p className="text-xs text-muted-foreground">
                  Every value carries a defensible trail back to its source — making the
                  platform auditable rather than a black-box AI tool.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="border-b py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Native Google Workspace integration
            </h2>
            <p className="mt-4 text-muted-foreground">
              Connect one or more Google accounts. Ingest from Gmail, Drive, Docs, Sheets, and
              Forms — with watch renewal and history reconciliation built in.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {INTEGRATIONS.map((i) => (
              <div
                key={i.name}
                className="flex items-center gap-3 rounded-xl border bg-card p-4"
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
                  style={{ background: i.color }}
                >
                  <i.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Pricing</h2>
            <p className="mt-4 text-muted-foreground">
              Start free. Scale to enterprise with usage-based AI billing and shared-dataset
              collaboration across organizations.
            </p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl border p-6 ${
                  tier.featured ? "border-primary bg-primary/5 shadow-md" : "bg-card"
                }`}
              >
                {tier.featured && (
                  <Badge className="mb-3">Most popular</Badge>
                )}
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{tier.desc}</p>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  {tier.price !== "Custom" && (
                    <span className="text-sm text-muted-foreground">/mo</span>
                  )}
                </div>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  variant={tier.featured ? "default" : "outline"}
                  onClick={() => setView("dashboard")}
                >
                  {tier.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-primary p-10 text-center text-primary-foreground shadow-lg">
            <h2 className="text-3xl font-bold tracking-tight">
              Operationalize your inbox today
            </h2>
            <p className="mt-3 text-primary-foreground/80">
              Open the live demo workspace — pre-loaded with sources, schemas, datasets, and
              evidence-backed extraction runs.
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="mt-6"
              onClick={() => setView("dashboard")}
            >
              Open demo workspace
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-background py-10 mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium">Workspace Intelligence Platform</span>
            </div>
            <p className="text-xs text-muted-foreground">
              © 2025 WIP · Built with Next.js 16 · Evidence-backed AI extraction
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

const CAPABILITIES = [
  {
    icon: Mail,
    title: "Gmail source engine",
    description:
      "Historical scan + incremental sync via Gmail history cursors. Watch auto-renewal before 7-day expiry, with reconciliation on gaps.",
  },
  {
    icon: GitBranch,
    title: "Visual rule builder",
    description:
      "Sender, subject, body, date, attachment, and link filters as deterministic condition groups — versioned, replayable, audited.",
  },
  {
    icon: FileText,
    title: "Document processing",
    description:
      "PDF, DOCX, XLSX, CSV, TXT, HTML, Docs, Sheets. Chunked, page-preserving, and extraction-ready.",
  },
  {
    icon: Sparkles,
    title: "Schema-driven extraction",
    description:
      "Define fields with types, instructions, and validation. Prompts are auto-generated, versioned, and hashed for traceability.",
  },
  {
    icon: Eye,
    title: "Evidence-first contract",
    description:
      "Every value carries a confidence score, evidence snippet, source file, page/chunk reference, model name, and timestamp.",
  },
  {
    icon: Database,
    title: "Airtable-style datasets",
    description:
      "Dynamic grid with filters, sorts, saved views, evidence drawer, change history, and CSV/JSON/Excel export.",
  },
  {
    icon: ShieldCheck,
    title: "Validation & review",
    description:
      "Type checks, business rules, cross-field validation, conflict detection, and human-review queues for low-confidence values.",
  },
  {
    icon: Network,
    title: "Governed sharing",
    description:
      "Request, approve, and revoke access at dataset, view, record, field, and row levels — every action audited.",
  },
  {
    icon: Workflow,
    title: "Async job pipeline",
    description:
      "BullMQ-style queues (gmail-scan, document-parse, ai-extract, validate, export) with retries, DLQ, and progress tracking.",
  },
];

const USE_CASES = [
  { icon: FileSearch, title: "Placement cells", description: "Auto-extract job opportunities from placement emails into structured records." },
  { icon: FileText, title: "Invoice processing", description: "Parse vendor invoices from Gmail + PDFs into payable datasets." },
  { icon: Users, title: "Support ticketing", description: "Convert inbound support emails into prioritized ticket records." },
  { icon: Layers, title: "Research synthesis", description: "Aggregate research links, Docs, and Sheets into a queryable corpus." },
];

const SECURITY_POINTS = [
  "Encrypted OAuth tokens at rest with key rotation strategy",
  "Row-level isolation keyed on organization_id across every table",
  "Service-role credentials confined to backend workers — never exposed to browser",
  "Prompt-injection defense: source content marked as untrusted data",
  "Per-organization AI quotas, rate limits, and cost-abuse detection",
  "Append-only audit logs for AI actions, mutations, exports, and access changes",
];

const INTEGRATIONS = [
  { name: "Gmail", desc: "Push + history sync", icon: Mail, color: "#EA4335" },
  { name: "Google Drive", desc: "Recursive traversal", icon: Cloud, color: "#4285F4" },
  { name: "Google Docs", desc: "Content extraction", icon: FileText, color: "#4285F4" },
  { name: "Google Sheets", desc: "Structured rows", icon: Layers, color: "#34A853" },
  { name: "Google Forms", desc: "Response capture", icon: FileSearch, color: "#9334E6" },
  { name: "Pub/Sub", desc: "Watch notifications", icon: Workflow, color: "#FBBC05" },
  { name: "pgvector", desc: "Semantic RAG", icon: Search, color: "#0F172A" },
  { name: "Gemini AI", desc: "Extraction engine", icon: Brain, color: "#1A73E8" },
];

const PRICING = [
  {
    name: "Free",
    desc: "For personal power users",
    price: "$0",
    cta: "Start free",
    featured: false,
    features: [
      "1 Google account",
      "3 active sources",
      "Manual schema builder",
      "1,000 AI tokens / month",
      "CSV export",
      "7-day audit history",
    ],
  },
  {
    name: "Team",
    desc: "For collaborative teams",
    price: "$49",
    cta: "Start 14-day trial",
    featured: true,
    features: [
      "5 Google accounts / org",
      "Unlimited sources",
      "Shared datasets & views",
      "100,000 AI tokens / month",
      "Role-based access control",
      "Field/row-level sharing",
      "90-day audit history",
    ],
  },
  {
    name: "Enterprise",
    desc: "For governed organizations",
    price: "Custom",
    cta: "Contact sales",
    featured: false,
    features: [
      "Unlimited accounts & orgs",
      "Cross-org dataset sharing",
      "Custom AI quotas & fallbacks",
      "Advanced RAG & agents",
      "SSO + security review",
      "Unlimited audit retention",
      "SLA + dedicated support",
    ],
  },
];
