/**
 * use-assistant-chat.ts
 *
 * Core chat hook for the AI assistant. Manages the in-memory message list
 * for the current conversation turn, handles streaming, confirmation,
 * undo, retry, and suggestion mode.
 *
 * PERSISTENCE: Messages are saved server-side (encrypted) via the chat and
 * confirm routes. This hook manages only the in-memory view needed for the
 * current UI session. History is loaded separately via use-assistant-sessions.
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import type { Message, PendingAction, ActivityEntry } from "./types";

// ── Welcome message ───────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: `👋 Hi! I'm your **Workspace AI Assistant**.

I can help you **read, create, edit, and manage** everything in this platform:

| Capability | Examples |
|---|---|
| 📊 **Read data** | Dashboard stats, dataset records, schema fields |
| ✨ **Create** | New schemas (with AI suggestions), datasets, sources |
| ✏️ **Edit** | Update schemas, rename datasets |
| 🗑️ **Delete** | Remove schemas or datasets (with confirmation) |
| ⚡ **Trigger jobs** | Gmail scans, retry failed jobs |
| 🔍 **Search** | Find anything across your workspace |

> All write actions require your **confirmation** before executing. Undo is available for create operations.

What would you like to do?`,
  timestamp: Date.now(),
};

export const STARTER_PROMPTS = [
  "Show me a dashboard summary",
  "List my schemas",
  "Create a schema for tracking invoices",
  "What AI jobs are currently running?",
];

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAssistantChat(initialSessionId?: string) {
  // Start with an empty message list — the panel renders the welcome card separately
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [suggestionMode, setSuggestionMode] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);

  /**
   * Always-current ref to messages. Used inside sendMessage to avoid stale
   * closure bugs where `messages` captured at callback-creation time lags
   * behind actual state (e.g. still sees the previous turn’s streaming bubble).
   */
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Track the last user message for retry functionality
  const lastUserMessageRef = useRef<string>("");

  // App store selectors
  const assistantOpen = useAppStore((s) => s.assistantOpen);
  const bumpUnread = useAppStore((s) => s.bumpAssistantUnread);
  const view = useAppStore((s) => s.view);
  const selectedSourceId = useAppStore((s) => s.selectedSourceId);
  const selectedDatasetId = useAppStore((s) => s.selectedDatasetId);
  const selectedSchemaId = useAppStore((s) => s.selectedSchemaId);
  const setView = useAppStore((s) => s.setView);

  // ── Navigation handler ──────────────────────────────────────────────────

  const handleNavigate = useCallback(
    (toolResult: unknown) => {
      if (
        toolResult &&
        typeof toolResult === "object" &&
        "navigateTo" in toolResult &&
        typeof (toolResult as { navigateTo: unknown }).navigateTo === "string"
      ) {
        setView((toolResult as { navigateTo: string }).navigateTo as Parameters<typeof setView>[0]);
      }
    },
    [setView]
  );

  // ── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      lastUserMessageRef.current = text.trim();

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };

      const placeholder: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        isStreaming: true,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, placeholder]);
      setIsLoading(true);

      // Build history using the ref (always fresh) so we never include stale
      // streaming placeholders or content from the current in-flight turn.
      const history = messagesRef.current
        .filter(
          (m) =>
            // Exclude: welcome message, any still-streaming placeholder, empty content
            m.id !== "welcome" &&
            !m.isStreaming &&
            m.content.trim().length > 0 &&
            (m.role === "user" || m.role === "assistant")
        )
        .slice(-20)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      history.push({ role: "user", content: text.trim() });

      try {
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            context: { view, sourceId: selectedSourceId, datasetId: selectedDatasetId, schemaId: selectedSchemaId },
            sessionId,
            mode: suggestionMode ? "suggest" : "chat",
          }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accText = "";
        let usedModel = "";
        let toolName: string | undefined;
        let toolResult: unknown;
        let pendingAction: PendingAction | undefined;
        let newSessionId: string | undefined;
        let parseError = false;
        let buffer = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            
            // Keep the last partial line in the buffer
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const event = JSON.parse(trimmed);
                switch (event.type) {
                  case "token":
                    accText += event.text;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === placeholder.id ? { ...m, content: accText, isStreaming: true } : m
                      )
                    );
                    break;
                  case "tool":
                    toolName = event.name;
                    toolResult = event.result;
                    if (event.name === "navigate") handleNavigate(event.result);
                    break;
                  case "pending":
                    // Write tool awaiting confirmation — do NOT execute
                    pendingAction = {
                      tool: event.tool,
                      args: event.args,
                      label: event.label,
                      risk: event.risk,
                      sessionId: event.sessionId,
                    };
                    break;
                  case "parse_error":
                    parseError = true;
                    break;
                  case "done":
                    usedModel = event.modelUsed ?? "";
                    newSessionId = event.sessionId;
                    break;
                }
              } catch {
                // Partial chunk — skip
              }
            }
          }
        }

        // Update session ID from server response
        if (newSessionId && newSessionId !== sessionId) {
          setSessionId(newSessionId);
        }

        // Finalize the placeholder message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id
              ? {
                  ...m,
                  content: accText,
                  isStreaming: false,
                  modelUsed: usedModel || undefined,
                  toolName,
                  toolResult,
                  pendingAction,
                  retryAvailable: parseError,
                  chips: buildChips(accText),
                }
              : m
          )
        );

        if (usedModel) setActiveModel(usedModel);
        if (!assistantOpen) bumpUnread();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id
              ? { ...m, content: `❌ **Error:** ${errMsg}\n\nPlease try again.`, isStreaming: false, retryAvailable: true }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, view, selectedSourceId, selectedDatasetId, selectedSchemaId, assistantOpen, bumpUnread, handleNavigate, sessionId, suggestionMode]
  );

  // ── Confirm a pending write action ────────────────────────────────────────

  const confirmAction = useCallback(
    async (msgId: string, action: PendingAction) => {
      // Mark the message as resolved immediately (prevents double-confirm)
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, actionResolved: true } : m))
      );

      setIsLoading(true);
      try {
        const res = await fetch("/api/assistant/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool: action.tool,
            args: action.args,
            sessionId,
            label: action.label,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          // Show error inline
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "assistant",
              content: `❌ **Action failed:** ${data.error ?? "Unknown error"}`,
              timestamp: Date.now(),
            },
          ]);
          return;
        }

        // Add completion message with optional undo button
        const completionMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: `✅ **Done:** ${data.label}`,
          timestamp: Date.now(),
          undoToken: data.undoToken,
        };
        setMessages((prev) => [...prev, completionMsg]);

        // Log to activity log for undo tracking
        if (data.label) {
          const entry: ActivityEntry = {
            id: generateId(),
            label: data.label,
            undoToken: data.undoToken,
            undone: false,
            timestamp: Date.now(),
          };
          setActivityLog((prev) => [entry, ...prev].slice(0, 50));
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant",
            content: `❌ **Error during action:** ${err instanceof Error ? err.message : "Unknown error"}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId]
  );

  // ── Skip a pending action ─────────────────────────────────────────────────

  const skipAction = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, actionResolved: true } : m
      )
    );
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: "assistant",
        content: "↩ Action cancelled. No changes were made.",
        timestamp: Date.now(),
      },
    ]);
  }, []);

  // ── Retry last message ────────────────────────────────────────────────────

  const retryMessage = useCallback(() => {
    const lastMsg = lastUserMessageRef.current;
    if (lastMsg) sendMessage(lastMsg);
  }, [sendMessage]);

  // ── Undo a completed action ───────────────────────────────────────────────

  const undoAction = useCallback(
    async (undoToken: string, msgId?: string) => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/assistant/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ undoToken }),
        });

        const data = await res.json();

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "assistant",
              content: `❌ **Undo failed:** ${data.error ?? "Unknown error"}`,
              timestamp: Date.now(),
            },
          ]);
          return;
        }

        // Mark the original message's undo as consumed
        if (msgId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { ...m, undoToken: undefined } : m))
          );
        }
        // Mark in activity log
        setActivityLog((prev) =>
          prev.map((e) => (e.undoToken === undoToken ? { ...e, undone: true } : e))
        );

        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant",
            content: `↩ **Undone:** ${data.message}`,
            timestamp: Date.now(),
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant",
            content: `❌ **Undo error:** ${err instanceof Error ? err.message : "Unknown error"}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // ── Load a historical session into view ───────────────────────────────────

  const loadHistorySession = useCallback(
    (sessionMessages: Message[], loadedSessionId: string) => {
      setMessages(sessionMessages);
      setSessionId(loadedSessionId);
      setActivityLog([]);
    },
    []
  );

  // ── Clear / new chat ──────────────────────────────────────────────────────

  const clearChat = useCallback(() => {
    setMessages([]);
    setActiveModel(null);
    setSessionId(undefined);
    setActivityLog([]);
  }, []);

  // ── Toggle suggestion mode ────────────────────────────────────────────────

  const toggleSuggestionMode = useCallback(() => {
    setSuggestionMode((prev) => !prev);
  }, []);

  return {
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
  };
}

// ── Chip extractor ─────────────────────────────────────────────────────────

/**
 * Extracts CLARIFY/CONFIRM markers from the response to generate quick-reply chips.
 * The model uses these markers to trigger confirmation dialogs.
 */
function buildChips(content: string) {
  const chips: Array<{ label: string; value: string; variant: "default" | "destructive" | "outline"; action?: "send" | "fill" }> = [];
  if (/CLARIFY:/i.test(content)) {
    chips.push(
      { label: "Yes, proceed", value: "Yes, please proceed.", variant: "default", action: "send" },
      { label: "Cancel", value: "No, cancel that.", variant: "outline", action: "send" }
    );
  }
  if (/\[SUGGESTION_READY\]/i.test(content)) {
    chips.push(
      { label: "Continue", value: "Yes, continue and execute this plan.", variant: "default", action: "send" },
      { label: "Comment", value: "I have some comments: ", variant: "outline", action: "fill" }
    );
  }
  return chips.length > 0 ? chips : undefined;
}
