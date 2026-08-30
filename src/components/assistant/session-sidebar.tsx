/**
 * session-sidebar.tsx
 *
 * 7-day chat history sidebar shown inside the assistant panel.
 * Lists past conversation sessions grouped by day.
 * Clicking a session loads its decrypted message history into the chat view.
 */

"use client";

import { useState } from "react";
import { Trash2, MessageSquare, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssistantSession } from "./types";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface SessionSidebarProps {
  sessions: AssistantSession[];
  activeSessionId: string | undefined;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewSession: () => void;
  onRefresh: () => void;
}

// ── Day grouping helpers ──────────────────────────────────────────────────

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0);
  const days = Math.round(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupByDay(sessions: AssistantSession[]): Array<{ label: string; items: AssistantSession[] }> {
  const map = new Map<string, AssistantSession[]>();
  for (const s of sessions) {
    const label = getDayLabel(s.updatedAt);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(s);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

// ── Component ─────────────────────────────────────────────────────────────

export function SessionSidebar({
  sessions,
  activeSessionId,
  isLoading,
  onSelectSession,
  onDeleteSession,
  onNewSession,
  onRefresh,
}: SessionSidebarProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const groups = groupByDay(sessions);

  async function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation(); // Don't trigger onSelectSession
    setDeletingId(sessionId);
    await onDeleteSession(sessionId);
    setDeletingId(null);
  }

  return (
    <div className="flex h-full flex-col border-r bg-muted/20">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Chat History
        </span>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh history</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* New conversation button */}
      <div className="shrink-0 p-2">
        <button
          onClick={onNewSession}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          New conversation
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Loading history…
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-muted-foreground">
            No previous conversations
          </div>
        ) : (
          groups.map(({ label, items }) => (
            <div key={label} className="mb-2">
              {/* Day label */}
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              {/* Session items */}
              {items.map((session) => (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={cn(
                    "group flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-xs transition-colors",
                    session.id === activeSessionId
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {/* Session icon + title */}
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-tight">{session.title}</p>
                    <p className="mt-0.5 text-[10px] opacity-60">{session.messageCount} messages</p>
                    {session.suggestionMode && (
                      <span className="mt-0.5 inline-block rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                        ✨ Suggest
                      </span>
                    )}
                  </div>
                  {/* Delete button (hover-only) */}
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    disabled={deletingId === session.id}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                  >
                    {deletingId === session.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer: retention notice */}
      <div className="shrink-0 border-t px-3 py-2 text-center text-[9px] text-muted-foreground">
        Conversations are stored for 7 days
      </div>
    </div>
  );
}
