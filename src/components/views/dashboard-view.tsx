"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type { DashboardData } from "@/lib/types";
import { PageHeader, StatCard, LoadingState, EmptyState } from "@/components/ui/page-elements";
import { StatusBadge, ConfidenceBadge, JobTypeBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Inbox,
  Database,
  Sparkles,
  AlertTriangle,
  Activity,
  Clock,
  RefreshCw,
  Mail,
  FileText,
  Brain,
  TrendingUp,
  Zap,
  Eye,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

export function DashboardView() {
  const setView = useAppStore((s) => s.setView);
  const openDataset = useAppStore((s) => s.openDataset);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/api/dashboard"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Real-time view of your ingestion pipeline, AI extraction activity, and review queue."
        icon={<Activity className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : !data ? (
        <EmptyState title="No data" description="Dashboard data could not be loaded." />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Connected Accounts"
              value={data.kpis.connectedAccounts}
              icon={<Mail className="h-4 w-4" />}
              hint="Google accounts"
            />
            <StatCard
              label="Active Sources"
              value={data.kpis.activeSources}
              icon={<Inbox className="h-4 w-4" />}
              hint="Ingestion rules"
            />
            <StatCard
              label="Records Extracted"
              value={data.kpis.recordsExtracted}
              icon={<Database className="h-4 w-4" />}
              hint="This month"
              trend={{ value: "12%", positive: true }}
            />
            <StatCard
              label="Review Queue"
              value={data.kpis.reviewQueue}
              icon={<Eye className="h-4 w-4" />}
              hint="Needs attention"
            />
            <StatCard
              label="Running Jobs"
              value={data.kpis.aiJobsRunning}
              icon={<Activity className="h-4 w-4" />}
              hint="In progress"
            />
            <StatCard
              label="Failed Jobs"
              value={data.kpis.aiJobsFailed}
              icon={<AlertTriangle className="h-4 w-4" />}
              hint="Need retry"
            />
          </div>

          {/* Recent runs + Review queue */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Recent runs */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Recent source runs</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setView("sources")}>
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {data.recentRuns.length === 0 ? (
                    <div className="p-6">
                      <EmptyState title="No runs yet" description="Trigger a scan from the Sources page." />
                    </div>
                  ) : (
                    data.recentRuns.slice(0, 6).map((run) => (
                      <div key={run.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Inbox className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {run.sourceName ?? run.sourceId.slice(0, 8)}
                            </p>
                            <StatusBadge status={run.status} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {run.mode} · {new Date(run.startedAt).toLocaleString()}
                            {run.stats && Object.keys(run.stats).length > 0 && (
                              <> · {Object.entries(run.stats).map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${v}`).join(", ")}</>
                            )}
                          </p>
                        </div>
                        {run.status === "running" && (
                          <div className="flex items-center gap-2">
                            <Progress value={run.progress} className="h-1.5 w-20" />
                            <span className="text-xs text-muted-foreground tabular-nums">{run.progress}%</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Review queue */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Review queue</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setView("datasets")}>
                  Open <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[380px] overflow-y-auto">
                  {data.reviewQueue.length === 0 ? (
                    <div className="p-6">
                      <EmptyState
                        icon={<CheckCircle2 className="h-5 w-5" />}
                        title="Queue empty"
                        description="No records need review."
                      />
                    </div>
                  ) : (
                    data.reviewQueue.slice(0, 6).map((rec) => (
                      <button
                        key={rec.id}
                        onClick={() => openDataset(rec.datasetId)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          <Eye className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {rec.values[0] ? String(rec.values[0].value) : "Record"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {rec.values.length} fields · {new Date(rec.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <ConfidenceBadge value={rec.confidence} />
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Queue health + Usage + Alerts */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Queue health */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Queue health
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.queueHealth.length === 0 ? (
                  <EmptyState title="No jobs" description="No AI jobs have run yet." />
                ) : (
                  <div className="space-y-3">
                    {data.queueHealth.map((q) => (
                      <div key={q.type} className="flex items-center gap-3">
                        <div className="w-40 shrink-0">
                          <JobTypeBadge type={q.type as any} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">
                              {q.status === "success" ? "Completed" : q.status === "failed" ? "Failed" : q.status === "running" ? "In progress" : "Queued"}
                            </span>
                            <span className="font-medium tabular-nums">{q.count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full ${
                                q.status === "success"
                                  ? "bg-emerald-500"
                                  : q.status === "failed"
                                  ? "bg-destructive"
                                  : q.status === "running"
                                  ? "bg-amber-500"
                                  : "bg-muted-foreground"
                              }`}
                              style={{ width: `${Math.min(100, q.count * 15)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Connection alerts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Sync alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[280px] overflow-y-auto">
                  {data.connectionAlerts.length === 0 ? (
                    <div className="p-4">
                      <EmptyState
                        icon={<CheckCircle2 className="h-5 w-5" />}
                        title="All healthy"
                        description="No connection issues."
                      />
                    </div>
                  ) : (
                    data.connectionAlerts.map((conn) => {
                      const expires = conn.watchExpiresAt ? new Date(conn.watchExpiresAt) : null;
                      const daysLeft = expires
                        ? Math.ceil((expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
                        : null;
                      return (
                        <div key={conn.id} className="flex items-start gap-3 px-4 py-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            <Clock className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{conn.googleEmail}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {conn.status !== "active"
                                ? `Status: ${conn.status}`
                                : daysLeft !== null
                                ? `Watch expires in ${daysLeft}d`
                                : "No watch"}
                            </p>
                          </div>
                          <StatusBadge status={conn.status} />
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Usage metrics + Recent datasets */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Usage */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Usage this month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {data.usageMetrics.map((m) => (
                    <div key={m.id} className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {m.metricType.replace(/_/g, " ")}
                      </p>
                      <p className="mt-1 text-xl font-semibold tabular-nums">
                        {m.value.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent datasets */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" /> Recent datasets
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setView("datasets")}>
                  All <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {data.recentDatasets.map((ds) => (
                    <button
                      key={ds.id}
                      onClick={() => openDataset(ds.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Database className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ds.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ds.recordCount} records · created {new Date(ds.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
