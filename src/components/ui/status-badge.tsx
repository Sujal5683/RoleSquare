"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type {
  JobStatus,
  JobType,
  RecordStatus,
  SourceStatus,
  ConnectionStatus,
  RunState,
  FieldType,
} from "@/lib/types";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  success: "default",
  approved: "default",
  valid: "default",
  completed: "default",
  paused: "secondary",
  idle: "secondary",
  queued: "secondary",
  invited: "secondary",
  pending: "secondary",
  needs_review: "outline",
  running: "outline",
  scanning: "outline",
  parsing: "outline",
  extracting: "outline",
  validating: "outline",
  updated: "outline",
  retry: "outline",
  cancelled: "secondary",
  error: "destructive",
  failed: "destructive",
  rejected: "destructive",
  revoked: "destructive",
  expired: "destructive",
  degraded: "destructive",
  dlq: "destructive",
  partial: "destructive",
};

export function StatusBadge({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  const safeStatus = status ?? "unknown";
  const v = statusVariant[safeStatus] ?? "secondary";
  return (
    <Badge variant={v} className={cn("capitalize font-medium", className)}>
      {safeStatus.replace("_", " ")}
    </Badge>
  );
}

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const variant: "default" | "secondary" | "destructive" | "outline" =
    pct >= 85 ? "default" : pct >= 65 ? "secondary" : pct >= 40 ? "outline" : "destructive";
  return (
    <Badge variant={variant} className="tabular-nums">
      {pct}%
    </Badge>
  );
}

const jobTypeColor: Record<JobType, string> = {
  GMAIL_SCAN: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  DRIVE_SCAN: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  DOCS_SCAN: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  SHEETS_SCAN: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  FORMS_SCAN: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  DETERMINISTIC_SYNC: "bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300",
  EMAIL_PARSE: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  ATTACHMENT_PROCESS: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  DRIVE_DISCOVERY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  DOCUMENT_PARSE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  AI_EXTRACTION: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  AI_VALIDATION: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  EXPORT: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

export function JobTypeBadge({ type }: { type: JobType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium font-mono",
        jobTypeColor[type]
      )}
    >
      {type}
    </span>
  );
}

const fieldTypeColor: Record<FieldType, string> = {
  text: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  number: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  date: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  boolean: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  enum: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  array: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  multiselect: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export function FieldTypeBadge({ type }: { type: FieldType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide",
        fieldTypeColor[type]
      )}
    >
      {type}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const variant: "default" | "secondary" | "outline" =
    role === "owner" ? "default" : role === "admin" || role === "manager" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="capitalize">
      {role}
    </Badge>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  const variant: "default" | "secondary" | "outline" =
    plan === "enterprise" ? "default" : plan === "team" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="capitalize">
      {plan}
    </Badge>
  );
}

export const STATUS_OPTIONS: { value: SourceStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "idle", label: "Idle" },
  { value: "error", label: "Error" },
];

export const RUN_STATE_LABELS: Record<RunState, string> = {
  idle: "Idle",
  scanning: "Scanning Gmail",
  parsing: "Parsing documents",
  extracting: "Extracting fields",
  validating: "Validating outputs",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  success: "Success",
  failed: "Failed",
  retry: "Retrying",
  dlq: "Dead-letter",
  cancelled: "Cancelled",
};

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  degraded: "Degraded",
};

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  valid: "Valid",
  needs_review: "Needs Review",
  rejected: "Rejected",
  approved: "Approved",
  updated: "Updated",
};
