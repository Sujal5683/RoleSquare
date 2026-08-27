import { useState } from "react";
import type { AuditLogDTO } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, ChevronRight, AlertCircle } from "lucide-react";
import {
  ACTOR_TYPE_STYLE,
  ACTION_STYLE,
  initials,
  relativeTime,
  formatDateTime,
  renderObjectDiff,
} from "./audit-view";

interface AuditTimelineProps {
  logs: AuditLogDTO[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadMoreRemaining?: number;
}

export function AuditTimeline({
  logs,
  hasMore,
  onLoadMore,
  loadMoreRemaining = 0,
}: AuditTimelineProps) {
  const [diffDialog, setDiffDialog] = useState<AuditLogDTO | null>(null);

  return (
    <>
      <div className="relative max-h-[40rem] overflow-y-auto pr-2">
        {/* Vertical line */}
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />
        <ol className="space-y-4 pt-2 pb-4">
          {logs.map((log) => {
            const actorStyle =
              ACTOR_TYPE_STYLE[log.actorType] ?? ACTOR_TYPE_STYLE.system;
            const actionStyle =
              ACTION_STYLE[log.action] ?? "bg-muted text-muted-foreground";
            return (
              <li key={log.id} className="relative pl-12">
                {/* Dot */}
                <div
                  className={`absolute left-[12px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-background ${actionStyle}`}
                >
                  <span className="block h-1.5 w-1.5 rounded-full bg-current" />
                </div>
                <div className="rounded-lg border p-2.5 transition-colors hover:bg-muted/30">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    {/* Actor and Action */}
                    <div className="flex items-center gap-2 sm:w-[220px] md:w-[260px] shrink-0">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px] font-medium">
                          {initials(log.actorName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-xs font-medium truncate max-w-[100px]"
                            title={log.actorName ?? "Unknown actor"}
                          >
                            {log.actorName ?? "Unknown actor"}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1 py-0 text-[9px] font-medium uppercase tracking-wide shrink-0 ${actorStyle.className}`}
                          >
                            {actorStyle.icon}
                            {actorStyle.label}
                          </span>
                          <span
                            className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium uppercase tracking-wide shrink-0 ${actionStyle}`}
                          >
                            {log.action}
                          </span>
                        </div>
                        <p
                          className="text-[10px] text-muted-foreground mt-0.5 truncate"
                          title={formatDateTime(log.createdAt)}
                        >
                          {relativeTime(log.createdAt)} ·{" "}
                          {formatDateTime(log.createdAt)}
                        </p>
                      </div>
                    </div>

                    {/* Entity and Reason */}
                    <div className="flex-1 flex flex-col justify-center min-w-0 border-l-0 sm:border-l pl-0 sm:pl-4 border-border">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="font-normal capitalize shrink-0 text-[10px] px-1 py-0 h-4"
                        >
                          {log.entity}
                        </Badge>
                        {log.entityName ? (
                          <span
                            className="text-xs font-medium truncate"
                            title={log.entityName}
                          >
                            {log.entityName}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground italic">
                            Unnamed
                          </span>
                        )}
                      </div>
                      {log.reason && (
                        <p
                          className="mt-1 text-[11px] text-muted-foreground truncate"
                          title={log.reason}
                        >
                          <span className="font-medium text-foreground">
                            Reason:
                          </span>{" "}
                          {log.reason}
                        </p>
                      )}
                    </div>

                    {/* Action Button */}
                    {(log.before || log.after) && (
                      <div className="shrink-0 mt-1 sm:mt-0">
                        <button
                          onClick={() => setDiffDialog(log)}
                          className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/70 transition-colors"
                        >
                          <ChevronRight className="h-3 w-3" />
                          View diff
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Load more */}
        {hasMore && onLoadMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={onLoadMore}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Load {loadMoreRemaining} more
            </Button>
          </div>
        )}
      </div>

      {/* Diff dialog */}
      <Dialog
        open={!!diffDialog}
        onOpenChange={(open) => {
          if (!open) setDiffDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-primary" />
              Change details
            </DialogTitle>
            <DialogDescription>
              {diffDialog?.actorName ?? "Unknown actor"} ·{" "}
              <span className="capitalize">{diffDialog?.action}</span> on{" "}
              <span className="capitalize">{diffDialog?.entity}</span> ·{" "}
              {diffDialog ? formatDateTime(diffDialog.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2 max-h-96 overflow-y-auto">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Before
              </p>
              <div className="rounded-md bg-destructive/5 border border-destructive/20 p-3">
                {renderObjectDiff(diffDialog?.before)}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                After
              </p>
              <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-3">
                {renderObjectDiff(diffDialog?.after)}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
