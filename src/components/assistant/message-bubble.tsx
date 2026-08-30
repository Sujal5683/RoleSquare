/**
 * message-bubble.tsx
 *
 * Renders a single message turn in the AI assistant chat.
 *
 * Features:
 *   - Markdown rendering with custom styled table component
 *   - Copy button on BOTH user and AI messages (hover-reveal)
 *   - Collapsible long messages (> 20 lines)
 *   - Streaming cursor animation
 *   - Inline pending-action confirmation card
 *   - Parse error banner with retry button
 *   - Undo button for completed write actions
 *   - Collapsible tool result block
 *   - Quick-reply chips
 */

"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import {
  Bot, User, CheckCircle2, Terminal, ChevronDown, ChevronUp,
  Copy, Check, RotateCcw, AlertCircle,
} from "lucide-react";
import type { Message, PendingAction } from "./types";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { PendingActionCard } from "./pending-action-card";

// ── Copy button ───────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={cn(
            "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            className
          )}
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : "Copy"}</TooltipContent>
    </Tooltip>
  );
}

// ── Action pill (completed action indicator) ──────────────────────────────

function ActionPill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      <CheckCircle2 className="h-3 w-3" />
      {text}
    </span>
  );
}

// ── Tool result block (collapsible) ───────────────────────────────────────

function ToolResultBlock({ name, result }: { name: string; result: unknown }) {
  const [open, setOpen] = useState(false);
  const str = JSON.stringify(result, null, 2);

  return (
    <div className="mt-1 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground"
      >
        <Terminal className="h-3 w-3 shrink-0" />
        <span className="font-mono font-medium">{name}</span>
        <span className="ml-auto">{open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
      </button>
      {open && (
        <pre className="max-h-48 overflow-auto px-3 pb-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {str}
        </pre>
      )}
    </div>
  );
}

// ── Custom markdown table ─────────────────────────────────────────────────

/**
 * Renders markdown tables as styled HTML tables.
 * Passed to ReactMarkdown as a custom component override.
 */
const markdownComponents = {
  table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="border-b bg-muted/60 text-muted-foreground" {...props}>{children}</thead>
  ),
  th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className="border-t px-3 py-1.5 text-muted-foreground" {...props}>{children}</td>
  ),
  tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className="transition-colors hover:bg-muted/30" {...props}>{children}</tr>
  ),
  // Style code blocks
  code: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
    const isInline = !className;
    return isInline ? (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]" {...props}>{children}</code>
    ) : (
      <code className="block overflow-x-auto font-mono text-[11px]" {...props}>{children}</code>
    );
  },
};

// ── Timestamp formatter ───────────────────────────────────────────────────

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Message bubble ────────────────────────────────────────────────────────

export interface MessageBubbleProps {
  msg: Message;
  onChipClick: (value: string, action?: "send" | "fill") => void;
  onConfirm: (msgId: string, action: PendingAction) => void;
  onSkip: (msgId: string) => void;
  onUndo: (undoToken: string, msgId: string) => void;
  onRetry: () => void;
}

export function MessageBubble({
  msg,
  onChipClick,
  onConfirm,
  onSkip,
  onUndo,
  onRetry,
}: MessageBubbleProps) {
  const isUser = msg.role === "user";
  const [collapsed, setCollapsed] = useState(false);
  const lines = msg.content.split("\n");
  const isLong = lines.length > 20;

  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          isUser ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <img src="/RoleSquare_Ai.svg" alt="AI" className="h-3.5 w-3.5 object-contain invert dark:invert-0" />
        )}
      </div>

      {/* Bubble + extras */}
      <div className={cn("flex max-w-[85%] flex-col gap-1", isUser && "items-end")}>
        {/* Main bubble */}
        <div
          className={cn(
            "group relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm border border-border bg-muted/60 text-foreground"
          )}
        >
          {/* Streaming cursor */}
          {msg.isStreaming && (
            <span className="mr-1 inline-block h-2 w-0.5 animate-pulse rounded-full bg-current align-middle" />
          )}

          {/* Message content */}
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:text-xs prose-pre:bg-muted/80">
              {isLong && collapsed ? (
                <>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents as any}>
                    {lines.slice(0, 20).join("\n").replace(/\[SUGGESTION_READY\]/gi, "").trim() + "\n…"}
                  </ReactMarkdown>
                  <button onClick={() => setCollapsed(false)} className="mt-1 text-xs text-primary underline-offset-2 hover:underline">
                    Show more ↓
                  </button>
                </>
              ) : (
                <>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents as any}>
                    {msg.content.replace(/\[SUGGESTION_READY\]/gi, "").trim()}
                  </ReactMarkdown>
                  {isLong && (
                    <button onClick={() => setCollapsed(true)} className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
                      Collapse ↑
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Copy button — hover-reveal on BOTH user and AI messages */}
          {!msg.isStreaming && msg.content && (
            <div
              className={cn(
                "absolute top-1.5 opacity-0 group-hover:opacity-100 transition-opacity",
                isUser ? "left-1.5" : "right-1.5"
              )}
            >
              <CopyButton text={msg.content} />
            </div>
          )}
        </div>

        {/* Parse error banner */}
        {msg.retryAvailable && !msg.isStreaming && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-amber-700 dark:text-amber-300">Response parse error.</span>
            <button
              onClick={onRetry}
              className="ml-auto rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-600"
            >
              Retry
            </button>
          </div>
        )}

        {/* Pending action confirmation card */}
        {msg.pendingAction && !msg.isStreaming && (
          <PendingActionCard
            action={msg.pendingAction}
            resolved={!!msg.actionResolved}
            onConfirm={() => onConfirm(msg.id, msg.pendingAction!)}
            onSkip={() => onSkip(msg.id)}
          />
        )}

        {/* Tool result block */}
        {msg.toolName && msg.toolResult !== undefined && !msg.pendingAction && (
          <ToolResultBlock name={msg.toolName} result={msg.toolResult} />
        )}

        {/* Quick-reply chips */}
        {msg.chips && msg.chips.length > 0 && !msg.isStreaming && !msg.actionResolved && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {msg.chips.map((chip) => (
              <button
                key={chip.value}
                onClick={() => onChipClick(chip.value, chip.action)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all hover:scale-105",
                  chip.variant === "destructive"
                    ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
                    : chip.variant === "outline"
                    ? "border-border bg-background text-muted-foreground hover:bg-muted"
                    : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Message footer: timestamp + model + undo */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
          {msg.modelUsed && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
              {msg.modelUsed}
            </span>
          )}
          {/* Undo button — only shown when action is undoable and not yet undone */}
          {msg.undoToken && !msg.isStreaming && (
            <button
              onClick={() => onUndo(msg.undoToken!, msg.id)}
              className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Undo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
