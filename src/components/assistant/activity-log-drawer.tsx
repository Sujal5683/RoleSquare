/**
 * activity-log-drawer.tsx
 *
 * Slide-down activity log showing all write actions performed by the AI
 * in the current session, with per-action undo buttons.
 *
 * Shown/hidden via the clock icon in the assistant panel header.
 */

"use client";

import { RotateCcw, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "./types";

interface ActivityLogDrawerProps {
  entries: ActivityEntry[];
  onUndo: (undoToken: string) => void;
  isLoading: boolean;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function ActivityLogDrawer({ entries, onUndo, isLoading }: ActivityLogDrawerProps) {
  if (entries.length === 0) {
    return (
      <div className="border-t bg-muted/20 px-4 py-4 text-center text-xs text-muted-foreground">
        <Clock className="mx-auto mb-1.5 h-4 w-4 opacity-40" />
        No actions yet this session
      </div>
    );
  }

  return (
    <div className="border-t bg-muted/10">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b px-4 py-2">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Activity Log
        </span>
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
          {entries.length}
        </span>
      </div>

      {/* Entries */}
      <div className="max-h-48 overflow-y-auto">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={cn(
              "flex items-center gap-2 border-b px-4 py-2 text-xs last:border-0",
              entry.undone && "opacity-50"
            )}
          >
            {/* Status icon */}
            {entry.undone ? (
              <RotateCcw className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
            )}

            {/* Label + time */}
            <div className="min-w-0 flex-1">
              <p className={cn("truncate font-medium", entry.undone && "line-through text-muted-foreground")}>
                {entry.label}
              </p>
              <p className="text-[10px] text-muted-foreground">{formatRelativeTime(entry.timestamp)}</p>
            </div>

            {/* Undo button */}
            {entry.undoToken && !entry.undone && (
              <button
                onClick={() => onUndo(entry.undoToken!)}
                disabled={isLoading}
                className="shrink-0 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                ↩ Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
