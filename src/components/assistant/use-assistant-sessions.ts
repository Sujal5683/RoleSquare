/**
 * use-assistant-sessions.ts
 *
 * React hook for managing the 7-day AI chat history.
 *
 * Fetches the list of sessions from /api/assistant/sessions and
 * provides methods to:
 *   - Load a session's full message history for display
 *   - Delete a session (soft-delete)
 *   - Create a new session
 *
 * Sessions are refreshed on mount and whenever `refetch()` is called.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import type { AssistantSession, AssistantSessionDetail } from "./types";

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAssistantSessions() {
  const [sessions, setSessions] = useState<AssistantSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<AssistantSessionDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── List sessions ──────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AssistantSession[] = await res.json();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Load session detail (with decrypted messages) ─────────────────────

  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoadingDetail(true);
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

  // ── Delete session ─────────────────────────────────────────────────────

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/assistant/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Remove from local list immediately (optimistic update)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
    }
  }, [selectedSession]);

  // ── Clear selected session ────────────────────────────────────────────

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
