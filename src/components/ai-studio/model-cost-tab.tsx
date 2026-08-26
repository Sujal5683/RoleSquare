"use client";

// ModelCostTab — per-model cost breakdown from real AiOutput rows.
//
// Features:
//   - Summary card: total cost, total tokens, total calls
//   - Per-model table: model | prompt tokens | completion tokens | calls | cost
//   - Daily cost sparkline (simple CSS bars)
//   - All data from /api/usage which now returns aiCost breakdown

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { LoadingState } from "@/components/ui/page-elements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DollarSign, Cpu, Hash } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface PerModelEntry {
  model: string;
  displayName: string;
  promptTokens: number;
  completionTokens: number;
  tokensUsed: number;
  totalCostUsd: number;
  calls: number;
}

interface DailyCostEntry {
  date: string;
  costUsd: number;
}

interface UsageResponse {
  metrics: unknown[];
  aiCost: {
    perModel: PerModelEntry[];
    dailyCost: DailyCostEntry[];
    totalCostUsd: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCalls: number;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(costUsd: number) {
  if (costUsd === 0) return "$0.0000";
  if (costUsd < 0.0001) return `$${costUsd.toExponential(3)}`;
  return `$${costUsd.toFixed(4)}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ModelCostTab() {
  const { data, isLoading } = useQuery<UsageResponse>({
    queryKey: ["usage-detailed"],
    queryFn: () => api.get<UsageResponse>("/api/usage"),
    refetchInterval: 30000,
  });

  if (isLoading) return <LoadingState rows={6} />;

  const aiCost = data?.aiCost ?? {
    perModel: [],
    dailyCost: [],
    totalCostUsd: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCalls: 0,
  };

  const maxDailyCost = Math.max(...aiCost.dailyCost.map((d) => d.costUsd), 0.0001);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wide">Total Cost (month)</span>
            </div>
            <p className="text-2xl font-bold">{formatCost(aiCost.totalCostUsd)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Hash className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wide">Total Tokens</span>
            </div>
            <p className="text-2xl font-bold">
              {formatTokens(aiCost.totalPromptTokens + aiCost.totalCompletionTokens)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatTokens(aiCost.totalPromptTokens)} prompt + {formatTokens(aiCost.totalCompletionTokens)} completion
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Cpu className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wide">API Calls</span>
            </div>
            <p className="text-2xl font-bold">{aiCost.totalCalls.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily cost chart (CSS sparkline) */}
      {aiCost.dailyCost.length > 0 && (
        <Card>
          <CardHeader >
            <CardTitle className="text-sm">Daily Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24 mt-2">
              {aiCost.dailyCost.map((d) => {
                const pct = (d.costUsd / maxDailyCost) * 100;
                return (
                  <div
                    key={d.date}
                    className="flex-1 flex flex-col justify-end group h-full relative"
                    title={`${d.date}: ${formatCost(d.costUsd)}`}
                  >
                    <div
                      className="w-full rounded-t bg-primary/40 group-hover:bg-primary transition-colors"
                      style={{ height: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{aiCost.dailyCost[0]?.date}</span>
              <span>{aiCost.dailyCost[aiCost.dailyCost.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-model table */}
      <Card>
        <CardHeader >
          <CardTitle className="text-sm">Per-Model Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {aiCost.perModel.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No AI outputs recorded yet. Run an extraction to see cost data.
            </p>
          ) : (
            <div className="max-h-[40vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-[10px] text-muted-foreground uppercase tracking-wide">
                    <th className="text-left pb-2 pr-3">Model</th>
                    <th className="text-right pb-2 pr-3">Prompt Tokens</th>
                    <th className="text-right pb-2 pr-3">Completion Tokens</th>
                    <th className="text-right pb-2 pr-3">Calls</th>
                    <th className="text-right pb-2">Cost (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {aiCost.perModel
                    .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
                    .map((m) => (
                      <tr key={m.model} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 pr-3">
                          <p className="font-medium">{m.displayName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{m.model}</p>
                        </td>
                        <td className="text-right py-2 pr-3 font-mono tabular-nums">
                          {formatTokens(m.promptTokens)}
                        </td>
                        <td className="text-right py-2 pr-3 font-mono tabular-nums">
                          {formatTokens(m.completionTokens)}
                        </td>
                        <td className="text-right py-2 pr-3 tabular-nums">{m.calls}</td>
                        <td className="text-right py-2 font-medium text-primary tabular-nums">
                          {formatCost(m.totalCostUsd)}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-medium">
                    <td className="pt-2 pr-3">Total</td>
                    <td className="pt-2 pr-3 text-right font-mono tabular-nums">
                      {formatTokens(aiCost.totalPromptTokens)}
                    </td>
                    <td className="pt-2 pr-3 text-right font-mono tabular-nums">
                      {formatTokens(aiCost.totalCompletionTokens)}
                    </td>
                    <td className="pt-2 pr-3 text-right tabular-nums">{aiCost.totalCalls}</td>
                    <td className="pt-2 text-right text-primary tabular-nums">
                      {formatCost(aiCost.totalCostUsd)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
