/**
 * use-assistant-sessions.ts
 *
 * React hook for managing the 7-day AI chat history.
 *
 * Fetches the list of sessions from /api/assistant/sessions and
 * provides methods to:
 *   - Load a session's full message history for display
 *   - Delete a session (soft-delete) — optimistic update
 *
 * Migrated to TanStack Query for:
 *   - Automatic refetch on window focus
 *   - Shared cache (session-sidebar + panel read the same entry)
 *   - Optimistic delete with rollback on failure
 */

"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AssistantSession, AssistantSessionDetail } from "./types";

// -- Hook --------------------------------------------------------------------

export function useAssistantSessions() {
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<AssistantSessionDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -- List sessions ---------------------------------------------------------

  const {
    data: sessions = [],
    isLoading,
    refetch: fetchSessions,
  } = useQuery<AssistantSession[]>({
    queryKey: ["assistant-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/assistant/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    // Sessions rarely change — refetch-on-focus is sufficient, no need for staleTime: 0
    staleTime: 30_000,
  });

  // -- Load session detail (with decrypted messages) ------------------------

  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/assistant/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AssistantSessionDetail = await res.json();
      setSelectedSession(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
      return null;
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  // -- Delete session — optimistic removal ----------------------------------

  const { mutate: deleteSessionMutate } = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/assistant/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onMutate: async (sessionId: string) => {
      await queryClient.cancelQueries({ queryKey: ["assistant-sessions"] });
      const previous = queryClient.getQueryData<AssistantSession[]>(["assistant-sessions"]);
      // Optimistically remove from list
      queryClient.setQueryData<AssistantSession[]>(["assistant-sessions"], (old = []) =>
        old.filter((s) => s.id !== sessionId)
      );
      if (selectedSession?.id === sessionId) setSelectedSession(null);
      return { previous };
    },
    onError: (_err: unknown, _id: string, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(["assistant-sessions"], context.previous);
      }
      setError("Failed to delete session");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-sessions"] });
    },
  });

  const deleteSession = useCallback(
    (sessionId: string) => deleteSessionMutate(sessionId),
    [deleteSessionMutate]
  );

  // -- Clear selected session -----------------------------------------------

  const clearSelectedSession = useCallback(() => {
    setSelectedSession(null);
  }, []);

  return {
    sessions,
    isLoading,
    selectedSession,
    isLoadingDetail,
    error,
    fetchSessions,
    loadSession,
    deleteSession,
    clearSelectedSession,
  };
}

