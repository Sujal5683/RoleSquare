"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { cn } from "@/lib/utils";
import {
  X,
  Send,
  Mic,
  MicOff,
  Sparkles,
  Loader2,
  RefreshCw,
  Bot,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useAssistantChat, STARTER_PROMPTS } from "./use-assistant-chat";
import { MessageBubble } from "./message-bubble";

export function AssistantPanel() {
  const assistantOpen = useAppStore((s) => s.assistantOpen);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);
  const selectedSourceId = useAppStore((s) => s.selectedSourceId);
  const selectedDatasetId = useAppStore((s) => s.selectedDatasetId);
  const selectedSchemaId = useAppStore((s) => s.selectedSchemaId);

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    isLoading,
    activeModel,
    sendMessage,
    clearChat,
  } = useAssistantChat();

  const { interimTranscript, isListening, isSupported, toggle: toggleMic } = useSpeechInput({
    onFinalTranscript: (text) => {
      setInput((prev) => (prev ? prev + " " + text : text));
    },
  });

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input + (interimTranscript ? " " + interimTranscript : ""));
      setInput("");
    }
  }

  function handleSend() {
    sendMessage(input + (interimTranscript ? " " + interimTranscript : ""));
    setInput("");
  }

  if (!assistantOpen) return null;

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
        onClick={() => setAssistantOpen(false)}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 bottom-0 z-50 flex flex-col",
          "w-full max-w-[420px] border-l bg-background shadow-2xl",
          "transition-transform duration-300 ease-out",
          assistantOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none">AI Assistant</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
              {activeModel ? (
                <span className="font-mono">{activeModel}</span>
              ) : (
                "Powered by Gemini"
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={clearChat}
              title="Clear conversation"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setAssistantOpen(false)}
              title="Close (Alt+A)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Context ribbon */}
        {(selectedSourceId || selectedDatasetId || selectedSchemaId) && (
          <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/30 px-4 py-1.5 text-[10px] text-muted-foreground">
            <Zap className="h-3 w-3 text-primary" />
            <span>Context:</span>
            {selectedSourceId && <Badge variant="secondary" className="h-4 text-[9px] px-1.5">source:{selectedSourceId.slice(0, 6)}…</Badge>}
            {selectedDatasetId && <Badge variant="secondary" className="h-4 text-[9px] px-1.5">dataset:{selectedDatasetId.slice(0, 6)}…</Badge>}
            {selectedSchemaId && <Badge variant="secondary" className="h-4 text-[9px] px-1.5">schema:{selectedSchemaId.slice(0, 6)}…</Badge>}
          </div>
        )}

        {/* Message list */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 group">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onChipClick={(val) => {
                sendMessage(val);
                setInput("");
              }}
            />
          ))}

          {/* Loading indicator (only before first token) */}
          {isLoading && messages[messages.length - 1]?.content === "" && (
            <div className="flex gap-2.5">
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary">
                <Bot className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3 border border-border">
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

        {/* Starter suggestions */}
        {messages.length === 1 && (
          <div className="shrink-0 border-t bg-muted/20 px-4 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Try asking
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    sendMessage(s);
                    setInput("");
                  }}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="shrink-0 border-t bg-card p-3">
          {interimTranscript && (
            <p className="mb-1.5 px-1 text-xs italic text-muted-foreground">
              🎙 {interimTranscript}
            </p>
          )}

          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                id="assistant-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "Listening…" : "Ask anything… (Enter to send)"}
                rows={1}
                disabled={isLoading}
                className={cn(
                  "w-full resize-none rounded-xl border bg-background px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/60",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50",
                  "disabled:opacity-50 transition-all",
                  "max-h-36 overflow-y-auto"
                )}
                style={{ minHeight: 44, fieldSizing: "content" } as React.CSSProperties}
              />
            </div>

            {isSupported && (
              <Button
                type="button"
                variant={isListening ? "destructive" : "outline"}
                size="icon"
                className={cn(
                  "h-10 w-10 shrink-0 rounded-xl transition-all",
                  isListening && "animate-pulse"
                )}
                onClick={toggleMic}
                title={isListening ? "Stop recording" : "Start voice input"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}

            <Button
              type="button"
              size="icon"
              disabled={(!input.trim() && !interimTranscript) || isLoading}
              onClick={handleSend}
              className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              title="Send (Enter)"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          <p className="mt-1.5 text-center text-[9px] text-muted-foreground/50">
            AI can make mistakes. Verify important actions before confirming.
          </p>
        </div>
      </div>
    </>
  );
}
