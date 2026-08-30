"use client";

// AgentLogsTab — structured per-agent log viewer for AI Studio.
//
// Features:
//   - Agent filter dropdown (All / Extractor / Analyst / Validator / Transformer / Researcher / Assistant / System)
//   - Level filter (All / Info / Warn / Error / Debug)
//   - Job filter (if a job is pre-selected from context)
//   - Auto-refresh every 5s when a running job is selected
//   - Structured log line: [timestamp] [AGENT] [LEVEL] message {metadata?}
//   - Color-coded levels

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { sanitizeSensitiveIds } from "@/lib/serialize";
import type { AgentLogDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState } from "@/components/ui/page-elements";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Terminal } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentLogListResponse {
  data: AgentLogDTO[];
  total: number;
}

interface AgentLogsTabProps {
  /** Pre-selected job ID (from extraction runs tab context) */
  jobId?: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const AGENT_KEYS = [
  { value: "all", label: "All agents" },
  { value: "extractor", label: "Extractor" },
  { value: "analyst", label: "Analyst" },
  { value: "validator", label: "Validator" },
  { value: "transformer", label: "Transformer" },
  { value: "researcher", label: "Researcher" },
  { value: "assistant", label: "Assistant" },
  { value: "system", label: "System" },
];

const LOG_LEVELS = [
  { value: "all", label: "All levels" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "debug", label: "Debug" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function levelColor(level: string) {
  switch (level) {
    case "error": return "text-red-500";
    case "warn":  return "text-amber-500";
    case "debug": return "text-slate-400";
    default:      return "text-emerald-500";
  }
}

function agentColor(agentKey: string) {
  switch (agentKey) {
    case "extractor":   return "text-blue-500";
    case "analyst":     return "text-purple-500";
    case "validator":   return "text-emerald-500";
    case "transformer": return "text-cyan-500";
    case "researcher":  return "text-orange-500";
    case "assistant":   return "text-pink-500";
    default:            return "text-muted-foreground";
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export function AgentLogsTab({ jobId }: AgentLogsTabProps) {
  const [agentKey, setAgentKey] = useState("all");
  const [level, setLevel] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const scrollRef = useRef<HTMLDivElement>(null);

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (agentKey !== "all") params.set("agentKey", agentKey);
  if (level !== "all") params.set("level", level);
  if (jobId) params.set("jobId", jobId);

  const { data, isLoading, refetch } = useQuery<AgentLogListResponse>({
    queryKey: ["agent-logs", agentKey, level, jobId, page],
    queryFn: () => api.get<AgentLogListResponse>(`/api/agent-logs?${params.toString()}`),
  });

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const handleFilterChange = useCallback(() => {
    setPage(1);
  }, []);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <Select
          value={agentKey}
          onValueChange={(v) => { setAgentKey(v); handleFilterChange(); }}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGENT_KEYS.map((k) => (
              <SelectItem key={k.value} value={k.value} className="text-xs">
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={level}
          onValueChange={(v) => { setLevel(v); handleFilterChange(); }}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOG_LEVELS.map((l) => (
              <SelectItem key={l.value} value={l.value} className="text-xs">
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>

        <span className="ml-auto text-[11px] text-muted-foreground">
          {total.toLocaleString()} log {total === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Log terminal */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed space-y-0.5"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <LoadingState rows={3} />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground text-xs">No log entries match the current filters.</p>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2 hover:bg-muted/60 rounded px-1 py-0.5 transition-colors">
              {/* Timestamp */}
              <span className="text-muted-foreground shrink-0 w-20">{formatTime(log.createdAt)}</span>

              {/* Agent */}
              <span className={`shrink-0 w-16 font-semibold uppercase text-[10px] tracking-wide ${agentColor(log.agentKey)}`}>
                {log.agentKey}
              </span>

              {/* Level */}
              <span className={`shrink-0 w-12 font-medium uppercase text-[10px] ${levelColor(log.level)}`}>
                {log.level}
              </span>

              {/* Message */}
              <span className="text-foreground break-all flex-1">
                {log.message?.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[ID]")
                  .replace(/\bc[a-z0-9]{24}\b/gi, "[ID]")
                  .replace(/\b(req|org|user|proj)_[a-zA-Z0-9]{16,}\b/gi, "[ID]")}
              </span>

              {/* Metadata (Confidence, Tokens, Cost) */}
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {(log.metadata as any).tokensUsed !== undefined && (
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded border border-indigo-500/20 whitespace-nowrap">
                      {(log.metadata as any).tokensUsed} tokens
                    </span>
                  )}
                  {(log.metadata as any).costUsd !== undefined && (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap">
                      ${Number((log.metadata as any).costUsd).toFixed(5)}
                    </span>
                  )}
                  {(log.metadata as any).confidenceScore !== undefined && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 whitespace-nowrap">
                      {(log.metadata as any).confidenceScore}% conf
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
