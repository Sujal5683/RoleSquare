import { useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import type { Message, QuickChip } from "./types";

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function extractChips(content: string): { cleaned: string; chips: QuickChip[] } {
  const chips: QuickChip[] = [];
  let cleaned = content;

  const clarifyMatch = content.match(/CLARIFY:\s*(.+)/);
  if (clarifyMatch) {
    cleaned = content.replace(/CLARIFY:\s*.+/, "").trim();
    chips.push(
      { label: "Yes, proceed", value: "Yes, please proceed.", variant: "default" },
      { label: "No, cancel", value: "No, cancel that.", variant: "outline" }
    );
  }

  const confirmMatch = content.match(/CONFIRM:\s*(.+)/);
  if (confirmMatch) {
    const action = confirmMatch[1].trim();
    cleaned = content.replace(/CONFIRM:\s*.+/, `> ⚠️ Confirm: **${action}**`).trim();
    chips.push(
      { label: "✓ Yes, do it", value: `Confirmed. Please proceed: ${action}`, variant: "destructive" },
      { label: "✗ Cancel", value: "Cancel, don't do it.", variant: "outline" }
    );
  }

  return { cleaned, chips };
}

export const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: `👋 Hi! I'm your **Workspace AI Assistant**.

I can help you with anything in this platform:
- 📊 **View** dashboards, sources, datasets, schemas
- 🔍 **Search** across all your data
- ⚡ **Trigger** Gmail scans and AI extractions  
- 🔁 **Retry** failed jobs or cancel running ones
- 🧭 **Navigate** to any section instantly
- 💬 **Answer** questions about your data

What would you like to do?`,
  timestamp: Date.now(),
};

export const STARTER_PROMPTS = [
  "Show me a dashboard summary",
  "List my active sources",
  "What AI jobs are currently running?",
  "Search for invoices",
];

export function useAssistantChat() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  const assistantOpen = useAppStore((s) => s.assistantOpen);
  const bumpUnread = useAppStore((s) => s.bumpAssistantUnread);
  const view = useAppStore((s) => s.view);
  const selectedSourceId = useAppStore((s) => s.selectedSourceId);
  const selectedDatasetId = useAppStore((s) => s.selectedDatasetId);
  const selectedSchemaId = useAppStore((s) => s.selectedSchemaId);
  const setView = useAppStore((s) => s.setView);

  const handleNavigate = useCallback(
    (toolResult: unknown) => {
      if (
        toolResult &&
        typeof toolResult === "object" &&
        "navigateTo" in toolResult &&
        typeof (toolResult as { navigateTo: unknown }).navigateTo === "string"
      ) {
        const dest = (toolResult as { navigateTo: string }).navigateTo;
        setView(dest as Parameters<typeof setView>[0]);
      }
    },
    [setView]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };

      const assistantPlaceholder: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        isStreaming: true,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
      setIsLoading(true);

      const history = [...messages, userMsg]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .filter((m) => m.id !== "welcome")
        .slice(-20)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      try {
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            context: {
              view,
              sourceId: selectedSourceId,
              datasetId: selectedDatasetId,
              schemaId: selectedSchemaId,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accText = "";
        let usedModel = "";
        let toolName: string | undefined;
        let toolResult: unknown;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter((l) => l.trim());

            for (const line of lines) {
              try {
                const event = JSON.parse(line);
                if (event.type === "token") {
                  accText += event.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantPlaceholder.id
                        ? { ...m, content: accText, isStreaming: true }
                        : m
                    )
                  );
                } else if (event.type === "tool") {
                  toolName = event.name;
                  toolResult = event.result;
                  if (event.name === "navigate") handleNavigate(event.result);
                } else if (event.type === "done") {
                  usedModel = event.modelUsed ?? "";
                }
              } catch {
                // Partial JSON chunk — skip
              }
            }
          }
        }

        const { cleaned, chips } = extractChips(accText);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantPlaceholder.id
              ? {
                  ...m,
                  content: cleaned,
                  isStreaming: false,
                  modelUsed: usedModel,
                  toolName,
                  toolResult,
                  chips: chips.length > 0 ? chips : undefined,
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
            m.id === assistantPlaceholder.id
              ? {
                  ...m,
                  content: `❌ **Error:** ${errMsg}\n\nPlease try again.`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      isLoading, messages, view, selectedSourceId, selectedDatasetId,
      selectedSchemaId, assistantOpen, bumpUnread, handleNavigate,
    ]
  );

  const clearChat = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setActiveModel(null);
  }, []);

  return {
    messages,
    isLoading,
    activeModel,
    sendMessage,
    clearChat,
  };
}
