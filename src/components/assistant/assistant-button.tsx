"use client";

import { useAppStore } from "@/lib/store";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export function AssistantButton() {
  const assistantOpen = useAppStore((s) => s.assistantOpen);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);
  const assistantUnread = useAppStore((s) => s.assistantUnread);
  const clearAssistantUnread = useAppStore((s) => s.clearAssistantUnread);

  function handleClick() {
    setAssistantOpen(!assistantOpen);
    if (!assistantOpen) clearAssistantUnread();
  }

  return (
    <Tooltip><TooltipTrigger asChild><button
            id="ai-assistant-button"
            onClick={handleClick}
            aria-label="Toggle AI Assistant"
            className={cn(
              "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-xl",
              assistantOpen
                ? "scale-95 opacity-90 ring-2 ring-primary ring-offset-2"
                : "scale-100 hover:scale-105"
            )}
          >
            {/* Pulse ring when closed */}
            {!assistantOpen && (
              <span className="absolute inset-0 rounded-full animate-ping bg-primary/20 pointer-events-none" />
            )}

            <Sparkles
              className={cn(
                "h-6 w-6 text-primary-foreground transition-transform duration-200",
                assistantOpen && "rotate-12"
              )}
            />

            {/* Unread badge */}
            {assistantUnread > 0 && !assistantOpen && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground shadow">
                {assistantUnread > 9 ? "9+" : assistantUnread}
              </span>
            )}
          </button></TooltipTrigger><TooltipContent>AI Assistant (Alt+A)</TooltipContent></Tooltip>
  );
}
