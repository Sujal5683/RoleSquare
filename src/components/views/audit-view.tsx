"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { AuditLogDTO } from "@/lib/types";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  History,
  Filter,
  Search,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  User,
  Bot,
  Cpu,
  Plus,
  AlertCircle,
Copy, } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy HH:mm:ss");
  } catch {
    return "—";
  }
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function truncateId(id: string | null | undefined, max = 8): string {
  if (!id) return "—";
  return id.length <= max ? id : `${id.slice(0, max)}…`;
}

// ── Entity & action options ──────────────────────────────────────────────

const ENTITY_OPTIONS = [
  { value: "all", label: "All entities" },
  { value: "source", label: "Source" },
  { value: "dataset", label: "Dataset" },
  { value: "schema", label: "Schema" },
  { value: "record", label: "Record" },
  { value: "connection", label: "Connection" },
  { value: "member", label: "Member" },
  { value: "job", label: "Job" },
  { value: "organization", label: "Organization" },
];

const ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "scan", label: "Scan" },
  { value: "extract", label: "Extract" },
  { value: "approve", label: "Approve" },
  { value: "share", label: "Share" },
  { value: "export", label: "Export" },
];

// Color maps for actor types
export const ACTOR_TYPE_STYLE: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  user: {
    label: "User",
    className:
      "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    icon: <User className="h-3 w-3" />,
  },
  system: {
    label: "System",
    className:
      "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: <Cpu className="h-3 w-3" />,
  },
  ai: {
    label: "AI",
    className:
      "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    icon: <Bot className="h-3 w-3" />,
  },
};

// Color maps for actions
export const ACTION_STYLE: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  update: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  delete: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  scan: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  extract: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  approve:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  share: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  export: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

import { useActiveOrg } from "@/hooks/use-active-org";

import { AuditTimeline } from "./audit-timeline";

// ── Helpers ────────────────────────────────────────────────────────────────

export function renderObjectDiff(data: any): React.ReactNode {
  if (data === null || data === undefined || data === "") return <span className="text-xs text-muted-foreground">—</span>;
  if (typeof data !== "object") {
    return <span className="text-xs text-muted-foreground">Updated</span>;
  }
  if (Array.isArray(data)) {
    return <span className="text-xs text-muted-foreground">{data.length} items modified</span>;
  }

  const entries = Object.keys(data);
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <ul className="space-y-1 list-disc list-inside text-muted-foreground">
      {entries.map((key) => {
        const formattedKey = key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase())
          .trim();
        return (
          <li key={key} className="text-xs">
            {formattedKey}
          </li>
        );
      })}
    </ul>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export function AuditView() {
  const activeOrgId = useActiveOrg();
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);

  // Build the query URL
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (entity !== "all") params.set("entity", entity);
    if (action !== "all") params.set("action", action);
    params.set("limit", "200");
    return params.toString();
  }, [entity, action]);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["audit", entity, action, activeOrgId],
    queryFn: () =>
      api.get<{ data: AuditLogDTO[]; total: number; page: number; pageSize: number }>(
        `/api/audit?${queryParams}`
      ),
    enabled: !!activeOrgId,
  });

  // Client-side filtering by date range and search term
  const filteredLogs = useMemo(() => {
    const logs = data?.data ?? [];
    let result = logs;
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      result = result.filter((l) => new Date(l.createdAt) >= from);
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      result = result.filter((l) => new Date(l.createdAt) <= to);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (l) =>
          (l.entityId ?? "").toLowerCase().includes(q) ||
          (l.reason ?? "").toLowerCase().includes(q) ||
          (l.actorName ?? "").toLowerCase().includes(q) ||
          l.entity.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q)
      );
    }
    return result;
  }, [data, fromDate, toDate, search]);

  const visibleLogs = filteredLogs.slice(0, visibleCount);
  const hasMore = visibleLogs.length < filteredLogs.length;

  const handleExport = () => {
    try {
      const payload = JSON.stringify(filteredLogs, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Audit logs exported", {
        description: `${filteredLogs.length} log(s) downloaded as JSON.`,
      });
    } catch {
      toast.error("Export failed");
    }
  };

  const handleResetFilters = () => {
    setEntity("all");
    setAction("all");
    setFromDate("");
    setToDate("");
    setSearch("");
    setVisibleCount(50);
  };

  const hasActiveFilters =
    entity !== "all" ||
    action !== "all" ||
    !!fromDate ||
    !!toDate ||
    !!search.trim();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Logs"
        description="Every change in the platform is recorded here — from source scans to record approvals, sharing decisions, and member role changes. Filter, search, and export for compliance."
        icon={<History className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={!activeOrgId || isFetching}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={!filteredLogs.length}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Export JSON
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <Card>
        <CardHeader >
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 text-primary" />
            Filters
          </CardTitle>
          <CardDescription>
            Narrow down the timeline by entity, action, date range, or keyword.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Entity</Label>
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="from-date">
                From date
              </Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="to-date">
                To date
              </Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by entity ID, reason, actor, or entity name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader >
          <CardTitle className="flex items-center justify-between text-base">
            <span>Timeline</span>
            <span className="text-xs font-normal text-muted-foreground">
              {filteredLogs.length} of {data?.total ?? 0} log(s)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState rows={5} />
          ) : isError ? (
            <ErrorState
              message="Failed to load audit logs"
              onRetry={() => refetch()}
            />
          ) : !visibleLogs || visibleLogs.length === 0 ? (
            <EmptyState
              icon={
                hasActiveFilters ? (
                  <Filter className="h-5 w-5" />
                ) : (
                  <History className="h-5 w-5" />
                )
              }
              title={
                hasActiveFilters
                  ? "No logs match your filters"
                  : "No audit logs yet"
              }
              description={
                hasActiveFilters
                  ? "Try widening your date range or clearing some filters."
                  : "Activity in your organization will appear here as it happens."
              }
            />
          ) : (
            <AuditTimeline
              logs={visibleLogs}
              hasMore={hasMore}
              onLoadMore={() => setVisibleCount((c) => c + 50)}
              loadMoreRemaining={Math.min(50, filteredLogs.length - visibleCount)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
