"use client";

// SyncStatusBadge
// Compact pill badge showing the sync status of a dataset → sheet mapping.
// Used on dataset cards in the datasets list view.

import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  XCircle,
  Pause,
  GitMerge,
  RefreshCw,
  Unlink,
  WifiOff,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SyncStatus =
  | "active"
  | "syncing"
  | "paused"
  | "error"
  | "schema_mismatch"
  | "conflict"
  | "unlinked"
  | "expired"
  | "inaccessible";

interface SyncStatusBadgeProps {
  status: SyncStatus;
  lastSyncAt?: string | null;
  conflictCount?: number;
  className?: string;
  showLabel?: boolean;
}

const STATUS_CONFIG: Record<
  SyncStatus,
  { label: string; icon: React.ElementType; className: string; tooltip: string }
> = {
  active: {
    label: "Synced",
    icon: CheckCircle2,
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    tooltip: "Data is synchronized with Google Sheets",
  },
  syncing: {
    label: "Syncing",
    icon: Loader2,
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    tooltip: "Sync in progress…",
  },
  paused: {
    label: "Paused",
    icon: Pause,
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    tooltip: "Sync is paused",
  },
  error: {
    label: "Error",
    icon: XCircle,
    className: "bg-red-500/15 text-red-400 border-red-500/30",
    tooltip: "Sync failed — check the sync log for details",
  },
  schema_mismatch: {
    label: "Mismatch",
    icon: AlertTriangle,
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    tooltip: "Column structure has changed in the Google Sheet — review required",
  },
  conflict: {
    label: "Conflict",
    icon: GitMerge,
    className: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    tooltip: "There are unresolved sync conflicts that require your attention",
  },
  unlinked: {
    label: "Unlinked",
    icon: Unlink,
    className: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    tooltip: "Not linked to Google Sheets",
  },
  expired: {
    label: "Expired",
    icon: WifiOff,
    className: "bg-red-500/15 text-red-400 border-red-500/30",
    tooltip: "Google Sheets connection has expired — reconnect your account",
  },
  inaccessible: {
    label: "Inaccessible",
    icon: WifiOff,
    className: "bg-red-500/15 text-red-400 border-red-500/30",
    tooltip: "Cannot access the linked Google Sheet — check permissions",
  },
};

export function SyncStatusBadge({
  status,
  lastSyncAt,
  conflictCount,
  className,
  showLabel = true,
}: SyncStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unlinked;
  const Icon = config.icon;

  const tooltipText =
    conflictCount && conflictCount > 0
      ? `${conflictCount} conflict${conflictCount > 1 ? "s" : ""} need resolution`
      : config.tooltip;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              config.className,
              className
            )}
          >
            <Icon
              className={cn("h-3 w-3 shrink-0", status === "syncing" && "animate-spin")}
            />
            {showLabel && config.label}
            {conflictCount && conflictCount > 0 ? (
              <span className="ml-0.5 rounded-full bg-orange-500 px-1 text-[9px] text-white font-bold">
                {conflictCount}
              </span>
            ) : null}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-center text-xs">
          {tooltipText}
          {lastSyncAt && (
            <div className="mt-0.5 text-muted-foreground">
              Last sync: {new Date(lastSyncAt).toLocaleTimeString()}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
