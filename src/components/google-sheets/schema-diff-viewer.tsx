"use client";

// SchemaDiffViewer
// Displays detected schema changes between app columns and Google Sheet headers.
// Destructive changes (deleted columns) are highlighted in red.
// Non-destructive changes (inserts, renames, reorders) are shown in yellow.
// User must explicitly confirm or reject each destructive change.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  Plus,
  Trash2,
  RefreshCw,
  MoveVertical,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SchemaDiff {
  type: "renamed" | "deleted" | "inserted" | "reordered" | "type_changed" | "duplicate" | "blank_header";
  columnId?: string;
  name?: string;
  oldValue?: string;
  newValue?: string;
  position?: number;
  affectedRows?: number;
  isDestructive: boolean;
  description: string;
}

interface SchemaDiffViewerProps {
  diffs: SchemaDiff[];
  onApply?: () => void;
  onDismiss?: () => void;
  isApplying?: boolean;
  readOnly?: boolean;
  className?: string;
}

const DIFF_ICONS = {
  renamed: RefreshCw,
  deleted: Trash2,
  inserted: Plus,
  reordered: MoveVertical,
  type_changed: RefreshCw,
  duplicate: Copy,
  blank_header: AlertTriangle,
};

const DIFF_COLORS = {
  renamed: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  deleted: "text-red-400 border-red-500/30 bg-red-500/10",
  inserted: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  reordered: "text-slate-400 border-slate-500/30 bg-slate-500/10",
  type_changed: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  duplicate: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  blank_header: "text-amber-400 border-amber-500/30 bg-amber-500/10",
};

export function SchemaDiffViewer({
  diffs,
  onApply,
  onDismiss,
  isApplying = false,
  readOnly = false,
  className,
}: SchemaDiffViewerProps) {
  const hasDestructive = diffs.some((d) => d.isDestructive);
  const destructiveCount = diffs.filter((d) => d.isDestructive).length;

  if (!diffs.length) {
    return (
      <div className={cn("text-sm text-muted-foreground text-center py-4", className)}>
        No schema changes detected.
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Warning banner */}
      {hasDestructive && (
        <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-red-400">
              {destructiveCount} destructive change{destructiveCount > 1 ? "s" : ""} detected
            </p>
            <p className="text-xs text-muted-foreground">
              These changes will permanently modify the application schema and may cause data loss.
              Review carefully before applying.
            </p>
          </div>
        </div>
      )}

      {/* Diff list */}
      <div className="space-y-1.5">
        {diffs.map((diff, i) => {
          const Icon = DIFF_ICONS[diff.type] ?? AlertTriangle;
          const colorClass = DIFF_COLORS[diff.type] ?? DIFF_COLORS.blank_header;
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-md border px-3 py-2.5",
                colorClass
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] py-0 capitalize border-current/30")}
                  >
                    {diff.type.replace("_", " ")}
                  </Badge>
                  {diff.isDestructive && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 border-red-500/40 text-red-400"
                    >
                      Destructive
                    </Badge>
                  )}
                  {diff.affectedRows !== undefined && diff.affectedRows > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      affects {diff.affectedRows.toLocaleString()} rows
                    </span>
                  )}
                </div>
                <p className="text-xs">{diff.description}</p>
                {diff.oldValue && diff.newValue && (
                  <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
                    <code className="rounded bg-current/10 px-1 py-0.5 font-mono">
                      {diff.oldValue}
                    </code>
                    <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                    <code className="rounded bg-current/10 px-1 py-0.5 font-mono">
                      {diff.newValue}
                    </code>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      {!readOnly && (onApply || onDismiss) && (
        <div className="flex items-center justify-end gap-2 pt-1">
          {onDismiss && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDismiss}
              disabled={isApplying}
            >
              Keep Previous Schema
            </Button>
          )}
          {onApply && (
            <Button
              size="sm"
              variant={hasDestructive ? "destructive" : "default"}
              onClick={onApply}
              disabled={isApplying}
            >
              {isApplying
                ? "Applying…"
                : hasDestructive
                ? "Apply (Destructive)"
                : "Apply Changes"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
