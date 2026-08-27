import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Bot, User, CheckCircle2, Terminal, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import type { Message } from "./types";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

function ActionPill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      <CheckCircle2 className="h-3 w-3" />
      {text}
    </span>
  );
}

function ToolResultBlock({ name, result }: { name: string; result: unknown }) {
  const [open, setOpen] = useState(false);
  const str = JSON.stringify(result, null, 2);
  const lines = str.split("\n");
  const isLong = lines.length > 8;

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
          {isLong && !open ? lines.slice(0, 8).join("\n") + "\n…" : str}
        </pre>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip><TooltipTrigger asChild><button
            onClick={() => {
              navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button></TooltipTrigger><TooltipContent>Copy</TooltipContent></Tooltip>
  );
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({
  msg,
  onChipClick,
}: {
  msg: Message;
  onChipClick: (value: string) => void;
}) {
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
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-primary text-primary-foreground"
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      {/* Bubble */}
      <div className={cn("flex max-w-[85%] flex-col gap-1", isUser && "items-end")}>
        <div
          className={cn(
            "relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm bg-muted/60 text-foreground border border-border"
          )}
        >
          {/* Streaming indicator */}
          {msg.isStreaming && (
            <span className="mr-1 inline-block h-2 w-0.5 animate-pulse rounded-full bg-current align-middle" />
          )}

          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:text-xs">
              {isLong && collapsed ? (
                <>
                  <ReactMarkdown>{lines.slice(0, 20).join("\n") + "\n…"}</ReactMarkdown>
                  <button
                    onClick={() => setCollapsed(false)}
                    className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Show more ↓
                  </button>
                </>
              ) : (
                <>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  {isLong && (
                    <button
                      onClick={() => setCollapsed(true)}
                      className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Collapse ↑
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Copy button on assistant messages */}
          {!isUser && !msg.isStreaming && (
            <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton text={msg.content} />
            </div>
          )}
        </div>

        {/* Tool result block */}
        {msg.toolName && msg.toolResult !== undefined && (
          <ToolResultBlock name={msg.toolName} result={msg.toolResult} />
        )}

        {/* Quick-reply chips */}
        {msg.chips && msg.chips.length > 0 && !msg.isStreaming && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {msg.chips.map((chip) => (
              <button
                key={chip.value}
                onClick={() => onChipClick(chip.value)}
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

        {/* Meta footer */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
          {msg.modelUsed && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
              {msg.modelUsed}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
