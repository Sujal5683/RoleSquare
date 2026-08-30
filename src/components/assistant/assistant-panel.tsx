/**
 * assistant-panel.tsx
 *
 * Main AI assistant slide-in panel.
 *
 * Layout when history sidebar is open:
 *   ┌────────────────┬──────────────────────────────┐
 *   │ Session        │ Header                        │
 *   │ Sidebar        │ Context ribbon                │
 *   │ (7-day         │ Message list                  │
 *   │  history)      │ Activity log drawer           │
 *   │                │ Input bar (mic, text, send)   │
 *   └────────────────┴──────────────────────────────┘
 *
 * Notes:
 *  - The "suggestion mode" toggle lives INSIDE the input bar (left of the textarea)
 *  - The welcome card and starter prompts are hidden once the user sends a message
 *  - The welcome card uses Lucide icons instead of emojis
 *  - The animate-ping on the FAB has been removed (subtle pulse only when unread)
 */

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { cn } from "@/lib/utils";
import {
  X, Send, Mic, MicOff, Loader2, RefreshCw,
  History, Zap, Database, LayoutDashboard,
  Bot, Trash2, Search, Users, Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

import { useAssistantChat, STARTER_PROMPTS } from "./use-assistant-chat";
import { useAssistantSessions } from "./use-assistant-sessions";
import { MessageBubble } from "./message-bubble";
import { SessionSidebar } from "./session-sidebar";
import { ActivityLogDrawer } from "./activity-log-drawer";
import type { Message } from "./types";

// ── Welcome card capability rows ──────────────────────────────────────────

const CAPABILITIES = [
  { icon: LayoutDashboard, label: "Read data",    detail: "Dashboard stats, datasets, records" },
  { icon: Lightbulb,       label: "Create",       detail: "Schemas, datasets (AI-guided)" },
  { icon: Database,        label: "Edit",         detail: "Update schemas, rename datasets" },
  { icon: Trash2,          label: "Delete",       detail: "With confirmation — always" },
  { icon: Zap,             label: "Trigger jobs", detail: "Gmail scans, retry failed jobs" },
  { icon: Search,          label: "Search",       detail: "Anything across your workspace" },
  { icon: Users,           label: "Members",      detail: "View and update roles" },
];

// ── Component ─────────────────────────────────────────────────────────────

export function AssistantPanel() {
  const assistantOpen = useAppStore((s) => s.assistantOpen);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);
  const selectedSourceId = useAppStore((s) => s.selectedSourceId);
  const selectedDatasetId = useAppStore((s) => s.selectedDatasetId);
  const selectedSchemaId = useAppStore((s) => s.selectedSchemaId);

  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Chat hook ──────────────────────────────────────────────────────────
  const {
    messages,
    isLoading,
    activeModel,
    suggestionMode,
    sessionId,
    activityLog,
    sendMessage,
    confirmAction,
    skipAction,
    retryMessage,
    undoAction,
    loadHistorySession,
    clearChat,
    toggleSuggestionMode,
  } = useAssistantChat();

  // ── Session history hook ───────────────────────────────────────────────
  const {
    sessions,
    isLoading: sessionsLoading,
    isLoadingDetail,
    loadSession,
    deleteSession,
    fetchSessions,
    clearSelectedSession,
  } = useAssistantSessions();

  // ── Speech input ───────────────────────────────────────────────────────
  const { interimTranscript, isListening, isSupported, toggle: toggleMic } = useSpeechInput({
    onFinalTranscript: (text) => setInput((prev) => (prev ? prev + " " + text : text)),
  });

  // ── Auto-scroll ────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Keyboard send ──────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      handleSend();
    }
  }

  function handleSend() {
    const text = (input + (interimTranscript ? " " + interimTranscript : "")).trim();
    if (!text || isLoading) return;
    sendMessage(text);
    setInput("");
  }

  // ── Load a historical session ──────────────────────────────────────────
  async function handleSelectSession(sid: string) {
    const detail = await loadSession(sid);
    if (detail) {
      const msgs: Message[] = detail.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        toolName: m.toolName ?? undefined,
        toolResult: m.toolResult ?? undefined,
        modelUsed: m.modelUsed ?? undefined,
        undoToken: m.undoToken ?? undefined,
        timestamp: m.timestamp,
      }));
      loadHistorySession(msgs, sid);
      setShowHistory(false);
    }
  }

  function handleNewSession() {
    clearChat();
    clearSelectedSession();
    setShowHistory(false);
  }

  // ── Derived state ──────────────────────────────────────────────────────

  // Whether to show the welcome card and starter prompts
  // Hide once the user has sent at least one message
  const hasUserMessages = messages.some((m) => m.role === "user");
  const hasPendingAction = messages.some((m) => m.pendingAction && !m.actionResolved);

  if (!assistantOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
        onClick={() => setAssistantOpen(false)}
      />

      {/* Outer panel */}
      <div
        className={cn(
          "fixed right-0 top-0 bottom-0 z-50 flex",
          "border-l bg-background shadow-2xl",
          "transition-transform duration-300 ease-out",
          assistantOpen ? "translate-x-0" : "translate-x-full",
          showHistory ? "w-full max-w-[720px]" : "w-full max-w-[440px]"
        )}
      >
        {/* ── History sidebar (collapsible) ──────────────────────────── */}
        {showHistory && (
          <div className="w-[240px] shrink-0">
            <SessionSidebar
              sessions={sessions}
              activeSessionId={sessionId}
              isLoading={sessionsLoading || isLoadingDetail}
              onSelectSession={handleSelectSession}
              onDeleteSession={deleteSession}
              onNewSession={handleNewSession}
              onRefresh={fetchSessions}
            />
          </div>
        )}

        {/* ── Main chat area ─────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Header */}
          <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
            {/* AI avatar + title */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <img
                src="/RoleSquare_Ai.svg"
                alt="AI"
                className="h-4 w-4 object-contain invert dark:invert-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold leading-none">AI Assistant</p>
                {suggestionMode && (
                  <Badge
                    className="h-4 px-1.5 text-[9px] border-0"
                    style={{ background: "rgba(6,182,212,0.15)", color: "rgb(6,182,212)" }}
                  >
                    ✦ Suggest
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground truncate font-mono">
                {activeModel
                  ? activeModel.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                  : "Powered by Gemini"}
              </p>
            </div>

            {/* Header action buttons — history, activity log, clear, close */}
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showHistory ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => { setShowHistory((v) => !v); if (!showHistory) fetchSessions(); }}
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showHistory ? "Hide history" : "Chat history"}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showActivityLog ? "secondary" : "ghost"}
                    size="icon"
                    className="relative h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowActivityLog((v) => !v)}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {activityLog.length > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                        {activityLog.length}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Activity log ({activityLog.length})</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={clearChat}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New conversation</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setAssistantOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close (Alt+A)</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Context ribbon */}
          {(selectedSourceId || selectedDatasetId || selectedSchemaId) && (
            <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/30 px-4 py-1.5 text-[10px] text-muted-foreground">
              <Zap className="h-3 w-3 text-primary" />
              <span>Context:</span>
              {selectedSourceId && <Badge variant="secondary" className="h-4 text-[9px] px-1.5">source</Badge>}
              {selectedDatasetId && <Badge variant="secondary" className="h-4 text-[9px] px-1.5">dataset</Badge>}
              {selectedSchemaId && <Badge variant="secondary" className="h-4 text-[9px] px-1.5">schema</Badge>}
            </div>
          )}

          {/* Pending action warning ribbon */}
          {hasPendingAction && (
            <div className="shrink-0 flex items-center gap-2 border-b bg-amber-50 px-4 py-1.5 text-[10px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
              <Zap className="h-3 w-3" />
              Respond to the action request below before sending a new message.
            </div>
          )}

          {/* Message list */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Welcome card — hidden once user sends a message */}
            {!hasUserMessages && (
              <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Workspace AI Assistant</p>
                    <p className="text-[10px] text-muted-foreground">Powered by Gemini · End-to-end encrypted</p>
                  </div>
                </div>
                <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                  I can read, create, and manage everything in your workspace. Write actions always ask for your confirmation first.
                </p>
                <div className="grid grid-cols-1 gap-1">
                  {CAPABILITIES.map(({ icon: Icon, label, detail }) => (
                    <div key={label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="font-medium text-foreground w-16 shrink-0">{label}</span>
                      <span className="text-muted-foreground truncate">{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="space-y-4">
              {messages
                .filter((m) => m.id !== "welcome") // Welcome is handled above as a card
                .map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    onChipClick={(val, action) => {
                      if (action === "fill") {
                        setInput(val);
                        inputRef.current?.focus();
                      } else {
                        sendMessage(val);
                        setInput("");
                      }
                    }}
                    onConfirm={confirmAction}
                    onSkip={skipAction}
                    onUndo={undoAction}
                    onRetry={retryMessage}
                  />
                ))}
            </div>

            {/* Loading dots — shown only when the placeholder is empty (before first token) */}
            {isLoading && messages[messages.length - 1]?.content === "" && (
              <div className="mt-4 flex gap-2.5">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-border bg-muted/60 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Activity log drawer */}
          {showActivityLog && (
            <ActivityLogDrawer
              entries={activityLog}
              onUndo={(token) => undoAction(token)}
              isLoading={isLoading}
            />
          )}

          {/* Starter prompts — hidden once user starts chatting */}
          {!hasUserMessages && (
            <div className="shrink-0 border-t bg-muted/10 px-4 py-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Try asking
              </p>
              <div className="flex flex-wrap gap-1.5">
                {STARTER_PROMPTS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { sendMessage(s); setInput(""); }}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Input area ───────────────────────────────────────────── */}
          <div className="shrink-0 border-t bg-card px-3 pb-3 pt-2.5">

            {/* Live speech interim transcript */}
            {interimTranscript && (
              <p className="mb-1.5 px-1 text-xs italic text-muted-foreground">
                🎙 {interimTranscript}
              </p>
            )}

            {/*
              Unified input container:
              ┌─────────────────────────────────────────────────────────┐
              │ [💡 Suggest]  [  Textarea (flex-1)  ]  [🎙 Mic] [➤ Send]│
              └─────────────────────────────────────────────────────────┘
              All controls share the same rounded container with a single
              border that highlights cyan when suggestion mode is active.
            */}
            <div
              className={cn(
                "flex items-end gap-1.5 rounded-2xl border bg-background px-2 py-2 transition-all duration-200",
                suggestionMode
                  ? "border-cyan-500/50 ring-1 ring-cyan-500/20"
                  : "border-border focus-within:border-border focus-within:ring-1 focus-within:ring-primary/30"
              )}
            >
              {/* Suggestion mode toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleSuggestionMode}
                    className={cn(
                      "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                      suggestionMode
                        ? "bg-cyan-500/15 text-cyan-500 hover:bg-cyan-500/25"
                        : "text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Lightbulb className="h-[15px] w-[15px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {suggestionMode ? "Suggestion mode ON — click to disable" : "Enable suggestion mode"}
                </TooltipContent>
              </Tooltip>

              {/* Textarea — no border of its own, container provides the border */}
              <textarea
                ref={inputRef}
                id="assistant-input"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 144) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  hasPendingAction
                    ? "Respond to the action above first…"
                    : isListening
                    ? "Listening…"
                    : suggestionMode
                    ? "Describe what you need…"
                    : "Ask anything…"
                }
                rows={1}
                disabled={isLoading || hasPendingAction}
                className={cn(
                  "flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed",
                  "placeholder:text-muted-foreground/50 focus:outline-none",
                  "disabled:opacity-50 overflow-y-auto"
                )}
                style={{ minHeight: 32, maxHeight: 144 }}
              />

              {/* Mic button (borderless, ghost inside the container) */}
              {isSupported && (
                <button
                  type="button"
                  onClick={toggleMic}
                  className={cn(
                    "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                    isListening
                      ? "text-destructive animate-pulse bg-destructive/10"
                      : "text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                  )}
                  title={isListening ? "Stop recording" : "Voice input"}
                >
                  {isListening ? <MicOff className="h-[15px] w-[15px]" /> : <Mic className="h-[15px] w-[15px]" />}
                </button>
              )}

              {/* Send button — filled circle, adapts color to suggestion mode */}
              <button
                type="button"
                disabled={(!input.trim() && !interimTranscript) || isLoading || hasPendingAction}
                onClick={handleSend}
                className={cn(
                  "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                  "disabled:opacity-30 disabled:cursor-not-allowed",
                  suggestionMode
                    ? "bg-cyan-500 text-white hover:bg-cyan-400"
                    : "bg-primary text-primary-foreground hover:bg-primary/85"
                )}
                title="Send (Enter)"
              >
                {isLoading
                  ? <Loader2 className="h-[15px] w-[15px] animate-spin" />
                  : <Send className="h-[15px] w-[15px]" />}
              </button>
            </div>

            {/* Footer disclaimer */}
            <p className="mt-1.5 text-center text-[9px] text-muted-foreground/40">
              Encrypted · 7-day history · {suggestionMode ? "Suggestion mode active" : "Normal mode"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
