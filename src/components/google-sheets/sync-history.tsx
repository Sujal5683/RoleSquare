"use client";

// SyncHistory — paginated list of past sync events with status icons, durations,
// schema-change diffs, and AI-agent error descriptions.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  GitMerge,
  History,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Edit3,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SchemaDiff {
  type: "added" | "removed" | "changed";
  columnName: string;
  fromType?: string;
  toType?: string;
  detail?: string;
}

interface SyncEvent {
  id: string;
  status: string;
  direction: string;
  triggeredBy: string;
  rowsAdded: number;
  rowsUpdated: number;
  rowsDeleted: number;
  conflicts: number;
  errors: number;
  errorDetail: string | null;
  schemaChanges: unknown | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

const STATUS_ICON = {
  success: { icon: CheckCircle2, className: "text-emerald-400" },
  partial: { icon: AlertTriangle, className: "text-amber-400" },
  failed: { icon: XCircle, className: "text-red-400" },
  schema_change: { icon: AlertTriangle, className: "text-amber-400" },
  running: { icon: Loader2, className: "text-blue-400 animate-spin" },
};

interface SyncHistoryProps {
  sheetMappingId?: string;
  datasetId?: string;
  className?: string;
}

// ── Schema diff renderer ──────────────────────────────────────────────────────

function parseSchemaDiffs(raw: unknown): SchemaDiff[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed as SchemaDiff[];
  } catch {
    return [];
  }
}

function SchemaDiffSection({ diffs }: { diffs: SchemaDiff[] }) {
  if (!diffs.length) return null;
  return (
    <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400 mb-1.5">
        Schema Changes
      </p>
      {diffs.map((diff, i) => (
        <div key={i} className="flex items-center gap-2 text-[10px]">
          {diff.type === "added" && (
            <>
              <span className="flex items-center gap-1 text-emerald-400">
                <Plus className="h-2.5 w-2.5" />
                Added
              </span>
              <span className="font-mono text-foreground/80">{diff.columnName}</span>
              {diff.toType && (
                <Badge variant="outline" className="text-[9px] py-0 px-1 border-emerald-500/30 text-emerald-400">
                  {diff.toType}
                </Badge>
              )}
            </>
          )}
          {diff.type === "removed" && (
            <>
              <span className="flex items-center gap-1 text-red-400">
                <Minus className="h-2.5 w-2.5" />
                Removed
              </span>
              <span className="font-mono text-foreground/80">{diff.columnName}</span>
              {diff.fromType && (
                <Badge variant="outline" className="text-[9px] py-0 px-1 border-red-500/30 text-red-400">
                  {diff.fromType}
                </Badge>
              )}
            </>
          )}
          {diff.type === "changed" && (
            <>
              <span className="flex items-center gap-1 text-blue-400">
                <Edit3 className="h-2.5 w-2.5" />
                Changed
              </span>
              <span className="font-mono text-foreground/80">{diff.columnName}</span>
              {diff.fromType && diff.toType && (
                <span className="text-muted-foreground">
                  {diff.fromType} → {diff.toType}
                </span>
              )}
            </>
          )}
          {diff.detail && (
            <span className="text-muted-foreground italic">{diff.detail}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

function SyncEventCard({ event }: { event: SyncEvent }) {
  const [expanded, setExpanded] = useState(
    event.status === "schema_change" || event.status === "failed" || event.status === "partial"
  );

  const statusCfg =
    STATUS_ICON[event.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.failed;
  const Icon = statusCfg.icon;

  const diffs = parseSchemaDiffs(event.schemaChanges);
  const hasDetails =
    diffs.length > 0 || !!event.errorDetail;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-card p-3.5 shadow-sm transition-all hover:shadow-md hover:border-border">
      <div className="absolute inset-0 bg-gradient-to-br from-muted/20 to-transparent pointer-events-none" />
      <div className="relative z-10 space-y-2">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", statusCfg.className)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium capitalize">
              {event.status === "schema_change"
                ? "Schema Mismatch"
                : event.status.replace("_", " ")}
            </span>
            <Badge variant="outline" className="text-[10px] py-0">
              {event.triggeredBy}
            </Badge>
            <Badge variant="outline" className="text-[10px] py-0 capitalize">
              {event.direction?.replace("_", " ") ?? "sync"}
            </Badge>
            {event.durationMs && (
              <span className="text-[10px] text-muted-foreground">
                {event.durationMs < 1000
                  ? `${event.durationMs}ms`
                  : `${(event.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(event.startedAt), {
              addSuffix: true,
            })}
          </p>
        </div>
        {/* Expand toggle */}
        {hasDetails && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title={expanded ? "Collapse details" : "Expand details"}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        {event.rowsAdded > 0 && (
          <span className="text-emerald-400">+{event.rowsAdded} added</span>
        )}
        {event.rowsUpdated > 0 && (
          <span className="text-blue-400">~{event.rowsUpdated} updated</span>
        )}
        {event.rowsDeleted > 0 && (
          <span className="text-red-400">-{event.rowsDeleted} deleted</span>
        )}
        {event.conflicts > 0 && (
          <span className="text-orange-400">
            {event.conflicts} conflict{event.conflicts > 1 ? "s" : ""}
          </span>
        )}
        {event.errors > 0 && (
          <span className="text-red-400">{event.errors} error{event.errors > 1 ? "s" : ""}</span>
        )}
        {!event.rowsAdded && !event.rowsUpdated && !event.rowsDeleted &&
          !event.conflicts && !event.errors && (
            <span>No changes</span>
          )}
      </div>

      {/* Expandable details */}
      {expanded && hasDetails && (
        <div className="space-y-3 pt-2 mt-2 border-t border-border/40">
          {/* Schema change diffs */}
          {diffs.length > 0 && <SchemaDiffSection diffs={diffs} />}

          {/* Error / description detail */}
          {event.errorDetail && (
            <div className="rounded-lg border border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/5 p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400/90 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                {event.status === "schema_change" ? "Mismatch Details" : "Sync Errors"}
              </p>
              <div className="text-[11px] text-red-400/80 font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                {event.errorDetail}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SyncHistory({ sheetMappingId, datasetId, className }: SyncHistoryProps) {
  const { data, isLoading } = useQuery<{
    events: SyncEvent[];
    total: number;
  }>({
    queryKey: ["sync-history", sheetMappingId || datasetId],
    queryFn: () => {
      if (sheetMappingId) {
        return api.get(`/api/google-sheets/mappings/${sheetMappingId}/history?limit=20&offset=0`);
      }
      return api.get(`/api/datasets/${datasetId}/import-history?limit=20&offset=0`);
    },
    enabled: !!sheetMappingId || !!datasetId,
    refetchInterval: 30_000,
  });

  const events = data?.events ?? [];

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground py-6", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading sync history…</span>
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className={cn("text-center py-10 text-muted-foreground", className)}>
        <History className="mx-auto h-8 w-8 mb-2" />
        <p className="text-sm">No sync runs yet.</p>
        <p className="text-xs mt-1">Run a sync to see history here.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-muted-foreground">
        {data?.total} total runs · showing last {events.length}
      </p>
      <ScrollArea className="max-h-[500px]">
        <div className="space-y-1.5 pr-1">
          {events.map((event) => (
            <SyncEventCard key={event.id} event={event} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
