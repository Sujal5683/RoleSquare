"use client";

// SyncDashboard
// Shows current sync status, stats, quick actions (sync now, pause, unlink),
// conflict count, and links to history and conflict resolution.
// Shown in a side panel or inline on the dataset detail page.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  GitMerge,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Trash2,
  Unlink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { SyncStatusBadge } from "@/components/google-sheets/sync-status-badge";
import { ConflictResolver } from "@/components/google-sheets/conflict-resolver";
import { DestructiveChangeConfirmation } from "@/components/google-sheets/destructive-change-confirmation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SheetMappingDTO {
  id: string;
  datasetName: string;
  spreadsheetId: string;
  spreadsheetName: string;
  spreadsheetUrl: string | null;
  sheetsAccount: { email: string; status: string };
  sheetName: string;
  direction: string;
  status: string;
  pendingConflicts: number;
  syncState: {
    enabled: boolean;
    conflictStrategy: string;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    nextSyncAt: string | null;
    syncedRows: number;
    errorCount: number;
    conflictCount: number;
  } | null;
}

interface ConflictRecord {
  id: string;
  recordId: string;
  columnId: string;
  columnName: string;
  appValue: unknown;
  sheetValue: unknown;
  lastSyncedValue: unknown;
  detectedAt: string;
}

interface SyncDashboardProps {
  sheetMappingId: string;
  onUnlinked?: () => void;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SyncDashboard({
  sheetMappingId,
  onUnlinked,
  className,
}: SyncDashboardProps) {
  const queryClient = useQueryClient();
  const [showConflicts, setShowConflicts] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  // Load mapping
  const { data: mapping, isLoading } = useQuery<SheetMappingDTO>({
    queryKey: ["sheet-mapping", sheetMappingId],
    queryFn: () => api.get(`/api/google-sheets/mappings/${sheetMappingId}`),
    refetchInterval: 15_000, // poll every 15 s
  });

  // Load conflicts
  const { data: conflicts = [] } = useQuery<ConflictRecord[]>({
    queryKey: ["conflicts", sheetMappingId],
    queryFn: () =>
      api.get(`/api/google-sheets/mappings/${sheetMappingId}/conflicts`),
    enabled: (mapping?.pendingConflicts ?? 0) > 0,
  });

  // Mutations
  const syncNow = useMutation({
    mutationFn: () =>
      api.post(`/api/google-sheets/mappings/${sheetMappingId}/sync`, {}),
    onSuccess: () => {
      toast.success("Sync started");
      queryClient.invalidateQueries({ queryKey: ["sheet-mapping", sheetMappingId] });
    },
    onError: () => toast.error("Failed to start sync"),
  });

  const togglePause = useMutation({
    mutationFn: () =>
      api.patch(`/api/google-sheets/mappings/${sheetMappingId}`, {
        status: mapping?.syncState?.enabled ? "paused" : "active",
        enabled: !mapping?.syncState?.enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sheet-mapping", sheetMappingId] });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () =>
      api.delete(`/api/google-sheets/mappings/${sheetMappingId}`),
    onSuccess: () => {
      toast.success("Dataset unlinked from Google Sheets");
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      onUnlinked?.();
    },
    onError: () => toast.error("Failed to unlink"),
  });

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground py-6", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading sync status…</span>
      </div>
    );
  }

  if (!mapping) {
    return (
      <div className={cn("text-sm text-muted-foreground py-4 text-center", className)}>
        Mapping not found.
      </div>
    );
  }

  const { syncState } = mapping;
  const isSyncing = mapping.status === "syncing";
  const isPaused = mapping.status === "paused" || !syncState?.enabled;
  const syncStatus = mapping.pendingConflicts > 0 ? "conflict" : (mapping.status as any);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <SyncStatusBadge
              status={syncStatus}
              lastSyncAt={syncState?.lastSyncAt}
              conflictCount={mapping.pendingConflicts}
            />
            <span className="text-xs text-muted-foreground">
              {mapping.spreadsheetName} / {mapping.sheetName}
            </span>
            {mapping.spreadsheetUrl && (
              <a
                href={mapping.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            via {mapping.sheetsAccount.email}
          </p>
        </div>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => syncNow.mutate()} disabled={isSyncing}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Sync Now
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => togglePause.mutate()}>
              {isPaused ? (
                <><Play className="mr-2 h-3.5 w-3.5" />Resume Sync</>
              ) : (
                <><Pause className="mr-2 h-3.5 w-3.5" />Pause Sync</>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setUnlinkOpen(true)}
              className="text-red-400 focus:text-red-400"
            >
              <Unlink className="mr-2 h-3.5 w-3.5" />
              Unlink Sheet
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Last sync"
          value={
            syncState?.lastSyncAt
              ? formatDistanceToNow(new Date(syncState.lastSyncAt), { addSuffix: true })
              : "Never"
          }
          icon={Clock}
        />
        <StatCard
          label="Rows synced"
          value={(syncState?.syncedRows ?? 0).toLocaleString()}
          icon={CheckCircle2}
          valueColor="text-emerald-400"
        />
        <StatCard
          label="Conflicts"
          value={mapping.pendingConflicts.toString()}
          icon={GitMerge}
          valueColor={mapping.pendingConflicts > 0 ? "text-orange-400" : undefined}
        />
      </div>

      {/* Direction badge */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="text-[10px]">
          {mapping.direction === "bidirectional"
            ? "↕ Two-way"
            : mapping.direction === "to_sheet"
            ? "→ App to Sheet"
            : "← Sheet to App"}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          Conflicts: {syncState?.conflictStrategy ?? "flag"}
        </Badge>
      </div>

      {/* Sync now CTA */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => syncNow.mutate()}
        disabled={isSyncing || syncNow.isPending}
        id="sync-now-btn"
      >
        {syncNow.isPending ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
        )}
        Sync Now
      </Button>

      {/* Conflicts section */}
      {mapping.pendingConflicts > 0 && (
        <>
          <Separator />
          <div>
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setShowConflicts((v) => !v)}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-orange-400">
                <GitMerge className="h-3.5 w-3.5" />
                {mapping.pendingConflicts} Conflict{mapping.pendingConflicts > 1 ? "s" : ""}
              </span>
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  showConflicts && "rotate-90"
                )}
              />
            </button>
            {showConflicts && (
              <div className="mt-3">
                <ConflictResolver
                  sheetMappingId={sheetMappingId}
                  conflicts={conflicts}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Error banner */}
      {(syncState?.errorCount ?? 0) > 0 && mapping.status === "error" && (
        <div className="flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Last sync had {syncState?.errorCount ?? 0} error
            {(syncState?.errorCount ?? 0) > 1 ? "s" : ""}. Check sync history for details.
          </span>
        </div>
      )}

      {/* Unlink confirmation */}
      <DestructiveChangeConfirmation
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        title="Unlink Google Sheet"
        description="This dataset will no longer sync with Google Sheets. Existing application data is preserved. The Google Sheet is not affected."
        confirmLabel="Unlink"
        onConfirm={() => {
          setUnlinkOpen(false);
          unlinkMutation.mutate();
        }}
        isLoading={unlinkMutation.isPending}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  valueColor,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  valueColor?: string;
}) {
  return (
    <div className="rounded-md border bg-card/50 px-3 py-2.5 space-y-1">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide">
        <Icon className="h-2.5 w-2.5" />
        {label}
      </div>
      <p className={cn("text-sm font-semibold", valueColor)}>{value}</p>
    </div>
  );
}
