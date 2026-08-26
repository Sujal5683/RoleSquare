"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
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
  Activity,
  Inbox,
  ArrowUpRight
} from "lucide-react";

export function LandingView() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/10">
      {/* Header */}
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative py-24 md:py-32 lg:py-40 border-b overflow-hidden">
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          <div className="relative mx-auto max-w-7xl px-4 md:px-6 text-center">
            <Badge variant="outline" className="mb-6 rounded-full px-3 py-1 font-medium bg-muted/50">
              <Sparkles className="mr-2 h-3.5 w-3.5 text-primary" />
              Next-Generation Workspace Extraction
            </Badge>
            <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Turn unstructured workspace data into{" "}
              <span className="text-muted-foreground">structured intelligence.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
              Connect Gmail, Drive, Docs, and Sheets. Our AI-native extraction engine automatically categorizes, validates, and builds production-ready datasets from your daily operations.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild className="w-full sm:w-auto h-12 px-8">
                <Link href="/workspace">
                  Open Workspace
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto h-12 px-8 bg-background">
                <Link href="/workspace">
                  <Activity className="mr-2 h-4 w-4 text-muted-foreground" />
                  View Live Demo
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Pre-loaded with sample datasets. No credit card required.
            </p>
          </div>
        </section>

        {/* Pipeline / Platform Overview */}
        <section id="platform" className="py-20 bg-muted/30 border-b">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight">The Extraction Pipeline</h2>
              <p className="mt-4 text-muted-foreground">
                A deterministic, versioned, and fully auditable pipeline that processes your data at scale.
              </p>
            </div>
            
            <div className="grid gap-6 md:grid-cols-5">
              {[
                { icon: Inbox, title: "Ingest", desc: "Connect sources via OAuth", color: "text-blue-500" },
                { icon: GitBranch, title: "Filter", desc: "Apply matching rules", color: "text-indigo-500" },
                { icon: Brain, title: "Extract", desc: "AI-driven parsing", color: "text-violet-500" },
                { icon: ShieldCheck, title: "Validate", desc: "Check constraints", color: "text-emerald-500" },
                { icon: Database, title: "Dataset", desc: "Structured output", color: "text-rose-500" },
              ].map((step, i) => (
                <Card key={i} className="relative border-border/50 bg-background shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3 text-center">
                    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <step.icon className={`h-5 w-5 ${step.color}`} />
                    </div>
                    <CardTitle className="text-base">{step.title}</CardTitle>
                    <CardDescription className="text-xs">{step.desc}</CardDescription>
                  </CardHeader>
                  {i < 4 && (
                    <ArrowRight className="hidden md:block absolute -right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/30 z-10" />
                  )}
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Core Capabilities */}
        <section className="py-20 border-b">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-bold tracking-tight">Core Capabilities</h2>
                <p className="mt-4 text-muted-foreground">
                  Everything you need to orchestrate complex data extraction workflows with enterprise-grade governance.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((cap, i) => (
                <Card key={i} className="bg-background shadow-sm border-border/50 transition-colors hover:border-primary/20">
                  <CardHeader>
                    <div className="mb-2 w-fit rounded-md bg-primary/10 p-2 text-primary">
                      <cap.icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">{cap.title}</CardTitle>
                    <CardDescription className="leading-relaxed mt-1">{cap.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Security & Evidence */}
        <section id="security" className="py-20 bg-muted/30 border-b">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              <div>
                <Badge variant="outline" className="mb-4">
                  <Lock className="mr-1.5 h-3.5 w-3.5" /> Enterprise Security
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight mb-4">
                  Evidence-first architecture.
                </h2>
                <p className="text-lg text-muted-foreground mb-8">
                  Unlike black-box AI tools, every extracted value maintains a verifiable link to its source document, complete with confidence scores and exact page references.
                </p>
                <div className="space-y-4">
                  {SECURITY_POINTS.map((pt, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-sm text-foreground">{pt}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <Card className="shadow-lg border-border/50">
                  <CardHeader className="border-b bg-muted/50 py-4 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Evidence Record</CardTitle>
                    </div>
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20">
                      High Confidence
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0">
                    <pre className="p-4 text-xs font-mono text-muted-foreground overflow-x-auto"><code>{`{
  "dataset": "vendor_invoices",
  "field": "total_amount",
  "value": 4500.00,
  "confidence": 0.98,
  "evidence": "Total Due: $4,500.00",
  "source_file": "invoice_october.pdf",
  "page_number": 1,
  "model": "gemini-1.5-pro",
  "extracted_at": "2026-08-26T10:30:00Z"
}`}</code></pre>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-20 border-b">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
              <p className="mt-4 text-muted-foreground">
                Scale your extraction pipeline effortlessly.
              </p>
            </div>
            
            <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
              {PRICING.map((tier) => (
                <Card key={tier.name} className={`flex flex-col border-border/50 shadow-sm ${tier.featured ? 'border-primary shadow-md relative' : ''}`}>
                  {tier.featured && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                      Most Popular
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle>{tier.name}</CardTitle>
                    <CardDescription>{tier.desc}</CardDescription>
                    <div className="mt-4 flex items-baseline text-4xl font-bold">
                      {tier.price}
                      {tier.price !== "Custom" && <span className="ml-1 text-sm font-normal text-muted-foreground">/mo</span>}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-3 text-sm">
                      {tier.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardContent className="pt-0 mt-auto">
                    <Button variant={tier.featured ? "default" : "outline"} className="w-full" asChild>
                      <Link href="/workspace">{tier.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-20 bg-muted/30 border-b">
          <div className="mx-auto max-w-3xl px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight">Frequently Asked Questions</h2>
              <p className="mt-4 text-muted-foreground">Everything you need to know about the product and billing.</p>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger className="text-left font-medium text-base">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 bg-primary text-primary-foreground">
          <div className="mx-auto max-w-4xl px-4 md:px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Start structuring your workspace data today
            </h2>
            <p className="mt-6 text-lg text-primary-foreground/80 max-w-2xl mx-auto">
              Deploy your first extraction pipeline in minutes. Connect your Google account and watch your unstructured data become operational intelligence.
            </p>
            <div className="mt-10 flex justify-center">
              <Button size="lg" variant="secondary" asChild className="h-12 px-8">
                <Link href="/workspace">
                  Create your free account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <PublicFooter />
    </div>
  );
}

const CAPABILITIES = [
  { icon: Mail, title: "Gmail Integration", description: "Historical scan and incremental sync via Gmail history cursors. Watch auto-renewal before 7-day expiry." },
  { icon: GitBranch, title: "Visual Rule Builder", description: "Sender, subject, body, date, attachment, and link filters as deterministic condition groups." },
  { icon: FileText, title: "Document Processing", description: "Extract from PDF, DOCX, XLSX, CSV, TXT, HTML, Docs, and Sheets. Chunked and page-preserving." },
  { icon: Sparkles, title: "Schema-Driven AI", description: "Define fields with exact types, instructions, and validations. Prompts are auto-generated under the hood." },
  { icon: Database, title: "Queryable Datasets", description: "Dynamic data grid with filters, sorts, saved views, and CSV/Excel exporting capabilities." },
  { icon: Network, title: "Governed Sharing", description: "Request, approve, and revoke access at dataset, view, record, field, and row levels." },
];

const SECURITY_POINTS = [
  "Encrypted OAuth tokens at rest with strict key rotation",
  "Row-level isolation keyed on organization ID across the database",
  "Service-role credentials confined entirely to backend workers",
  "Prompt-injection defense: source content treated as untrusted",
  "Append-only audit logs for all AI actions, mutations, and exports",
];

const PRICING = [
  {
    name: "Starter",
    desc: "For personal power users",
    price: "$0",
    cta: "Start free",
    featured: false,
    features: [
      "1 Google account connection",
      "3 active extraction sources",
      "1,000 AI tokens per month",
      "Standard CSV export",
      "7-day audit history retention",
    ],
  },
  {
    name: "Team",
    desc: "For collaborative teams",
    price: "$49",
    cta: "Start 14-day trial",
    featured: true,
    features: [
      "5 Google accounts per org",
      "Unlimited extraction sources",
      "100,000 AI tokens per month",
      "Role-based access control",
      "90-day audit history retention",
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
      "Custom AI quotas & fine-tuning",
      "SSO integration & security review",
      "Unlimited audit retention",
    ],
  },
];

const FAQS = [
  {
    q: "How secure is my data?",
    a: "We employ enterprise-grade security. OAuth tokens are encrypted at rest with strict key rotation. Your data sits in isolated, row-level secured PostgreSQL tables. We do not use your data to train our own models, and we employ prompt-injection defense mechanisms."
  },
  {
    q: "Do I need technical skills to use the platform?",
    a: "No! The Workspace Intelligence Platform is designed with a visual rule builder that lets you easily define extraction schemas. If you can define the columns you want in a spreadsheet, our AI will figure out how to extract that data from your emails and documents."
  },
  {
    q: "What data sources are currently supported?",
    a: "We currently support deep integration with Google Workspace. You can extract data from Gmail (emails, threads, attachments) and Google Drive (Docs, Sheets, PDFs, standard documents). We are continuously adding more enterprise connectors."
  },
  {
    q: "How does the AI handle large documents?",
    a: "Our ingestion pipeline automatically chunks and parses large PDFs, HTML, and text documents while preserving structural context and page references. This allows the AI to accurately find and extract fields even from hundred-page reports without hitting context limits."
  },
  {
    q: "Can I export the extracted datasets?",
    a: "Absolutely. Any dataset you build can be easily exported as a standard CSV file, or synced directly into an external Google Sheet for downstream reporting and analytics."
  }
];
