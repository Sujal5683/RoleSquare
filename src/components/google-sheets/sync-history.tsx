"use client";

// SyncHistory — paginated list of past sync events with status icons and durations.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  GitMerge,
  History,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

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
  sheetMappingId: string;
  className?: string;
}

export function SyncHistory({ sheetMappingId, className }: SyncHistoryProps) {
  const { data, isLoading } = useQuery<{
    events: SyncEvent[];
    total: number;
  }>({
    queryKey: ["sync-history", sheetMappingId],
    queryFn: () =>
      api.get(`/api/google-sheets/mappings/${sheetMappingId}/history?limit=20&offset=0`),
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
      <ScrollArea className="max-h-[420px]">
        <div className="space-y-1.5 pr-1">
          {events.map((event) => {
            const statusCfg =
              STATUS_ICON[event.status as keyof typeof STATUS_ICON] ??
              STATUS_ICON.failed;
            const Icon = statusCfg.icon;

            return (
              <div
                key={event.id}
                className="rounded-md border bg-card/50 px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", statusCfg.className)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium capitalize">
                        {event.status.replace("_", " ")}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-0">
                        {event.triggeredBy}
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
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
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

                {event.errorDetail && (
                  <p className="text-[10px] text-red-400 font-mono truncate" title={event.errorDetail}>
                    {event.errorDetail}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
