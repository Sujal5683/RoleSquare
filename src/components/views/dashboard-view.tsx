"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type { DashboardData, AuditLogDTO } from "@/lib/types";
import { PageHeader, StatCard, LoadingState, EmptyState } from "@/components/ui/page-elements";
import { StatusBadge, ConfidenceBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  FileJson,
  Brain,
  TrendingUp,
  Zap,
  Eye,
  CheckCircle2,
  ArrowRight,
  Plus,
  Pencil,
  Trash2,
  Share2,
  Download,
  Calendar,
  AlertCircle,
  LayoutDashboard,
} from "lucide-react";
import { Area as RechartsArea, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltipRaw, XAxis as RechartsXAxis, YAxis as RechartsYAxis, BarChart as RechartsBarChart, Bar as RechartsBar, Legend as RechartsLegend } from "recharts";

// Workaround for Recharts + React 19 type definitions
const Area = RechartsArea as any;
const XAxis = RechartsXAxis as any;
const YAxis = RechartsYAxis as any;
const RechartsTooltip = RechartsTooltipRaw as any;
const BarChart = RechartsBarChart as any;
const Bar = RechartsBar as any;
const Legend = RechartsLegend as any;


import { AuditTimeline } from "./audit-timeline";

type ExtendedDashboardData = DashboardData & {
  chartData: Array<{ date: string; records: number; jobs: number }>;
};

export function DashboardView() {
  const selectedOrgId = useAppStore((s) => s.selectedOrganizationId);
  const setView = useAppStore((s) => s.setView);
  const openDataset = useAppStore((s) => s.openDataset);
  const openSource = useAppStore((s) => s.openSource);
  const openSchema = useAppStore((s) => s.openSchema);
  const recentItems = useAppStore((s) => s.recentItems);
  
  const [dateRange, setDateRange] = useState("7d");

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => api.get<{ organizations: Array<{ id: string }> }>("/api/session"),
  });

  const isValidSelectedOrg = session?.organizations?.some(o => o.id === selectedOrgId);
  const activeOrgId = (selectedOrgId && isValidSelectedOrg) ? selectedOrgId : session?.organizations?.[0]?.id ?? null;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard", activeOrgId, dateRange],
    queryFn: () => api.get<ExtendedDashboardData>(`/api/dashboard?organizationId=${activeOrgId}&dateRange=${dateRange}`),
    enabled: !!activeOrgId,
  });

  // Activity feed — recent audit events
  const { data: activityData } = useQuery({
    queryKey: ["dashboard-activity", activeOrgId],
    queryFn: () => api.get<{ data: AuditLogDTO[] }>(`/api/audit?limit=8&organizationId=${activeOrgId}`),
    enabled: !!activeOrgId,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description="Real-time view of your ingestion pipeline, AI extraction activity, and review queue."
        icon={<LayoutDashboard className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-auto min-w-[140px] h-9">
                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
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
              onClick={() => setView("settings")}
            />
            <StatCard
              label="Active Sources"
              value={data.kpis.activeSources}
              icon={<Inbox className="h-4 w-4" />}
              hint="Ingestion rules"
              onClick={() => setView("sources")}
            />
            <StatCard
              label="Records Extracted"
              value={data.kpis.recordsExtracted}
              icon={<Database className="h-4 w-4" />}
              hint="This month"
              trend={{ value: "12%", positive: true }}
              onClick={() => setView("datasets")}
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
              icon={<RefreshCw className="h-4 w-4" />}
              hint="In progress"
            />
            <StatCard
              label="Failed Jobs"
              value={data.kpis.aiJobsFailed}
              icon={<AlertTriangle className="h-4 w-4" />}
              hint="Need retry"
            />
          </div>

          {/* Time-series Chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Activity (Last {dateRange.replace('d', '')} Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full mt-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRecords" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorJobs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `${value}`} 
                    />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '6px', border: 'none', backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: '12px', padding: '6px 12px' }}
                      itemStyle={{ color: 'hsl(var(--primary-foreground))' }}
                    />
                    <Area type="monotone" dataKey="records" name="Records Extracted" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRecords)" />
                    <Area type="monotone" dataKey="jobs" name="AI Jobs" stroke="#10b981" fillOpacity={1} fill="url(#colorJobs)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Recent runs + Review queue */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Recent runs */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recent source runs</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setView("sources")}>
                  View all <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {data.recentRuns.length === 0 ? (
                    <div className="p-4">
                      <EmptyState title="No runs yet" description="Trigger a scan from the Sources page." />
                    </div>
                  ) : (
                    data.recentRuns.slice(0, 6).map((run) => (
                      <div key={run.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Inbox className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {(run as unknown as { sourceName?: string }).sourceName ?? run.sourceId.slice(0, 8)}
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
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Review queue</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setView("datasets")}>
                  Open <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[380px] overflow-y-auto">
                  {data.reviewQueue.length === 0 ? (
                    <div className="p-4">
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
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Queue health */}
            <Card className="lg:col-span-2">
              <CardHeader >
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Queue Health
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {data.queueHealth.length === 0 ? (
                  <EmptyState title="No jobs" description="No AI jobs have run yet." />
                ) : (() => {
                  const chartDataObj: Record<string, { name: string; success: number; running: number; failed: number; pending: number }> = {};
                  for (const q of data.queueHealth) {
                    if (!chartDataObj[q.type]) {
                      chartDataObj[q.type] = { name: q.type, success: 0, running: 0, failed: 0, pending: 0 };
                    }
                    chartDataObj[q.type][q.status as "success" | "running" | "failed" | "pending"] = q.count;
                  }
                  const chartData = Object.values(chartDataObj);
                  
                  return (
                    <div className="h-[300px] w-full mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartData}
                          layout="vertical"
                          margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} className="stroke-muted" />
                          <XAxis type="number" className="text-xs text-muted-foreground" />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={120} 
                            tick={{ fontSize: 10, fill: "currentColor" }} 
                            className="text-muted-foreground font-mono"
                          />
                          <RechartsTooltip 
                            cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                            contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                          <Bar dataKey="success" name="Completed" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="running" name="In Progress" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="failed" name="Failed" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="pending" name="Queued" stackId="a" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Connection alerts */}
            <Card>
              <CardHeader >
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

          {/* Recently Viewed + Recent datasets */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Recently viewed (from local store) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Recently viewed
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {recentItems.length === 0 ? (
                  <div className="p-4">
                    <EmptyState
                      icon={<Clock className="h-5 w-5" />}
                      title="Nothing yet"
                      description="Items you open will appear here for quick access."
                    />
                  </div>
                ) : (
                  <div className="divide-y max-h-[280px] overflow-y-auto">
                    {recentItems.slice(0, 6).map((item) => {
                      const Icon =
                        item.type === "source"
                          ? Inbox
                          : item.type === "dataset"
                          ? Database
                          : FileJson;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.type === "source") openSource(item.id);
                            else if (item.type === "dataset") openDataset(item.id);
                            else if (item.type === "schema") openSchema(item.id);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.name || item.id}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono capitalize">
                              {item.type}
                            </p>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {timeAgoShort(item.timestamp)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Usage */}
            <Card className="lg:col-span-1">
              <CardHeader >
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Usage this month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {(() => {
                    const findMetric = (key: string) => data.usageMetrics.find(m => m.metricType.toLowerCase() === key.toLowerCase())?.value || 0;
                    const aiTokens = findMetric('AI_TOKENS');
                    const emailsScanned = findMetric('EMAILS_SCANNED');
                    const quotaUsed = findMetric('QUOTA_USED') || 45; // Fallback dummy data
                    const cost = findMetric('COST') || 12.50; // Fallback dummy data

                    const displayMetrics = [
                      { label: "AI Tokens", value: aiTokens.toLocaleString() },
                      { label: "Quota Used", value: `${quotaUsed}%` },
                      { label: "Cost", value: `$${cost.toFixed(2)}` },
                      { label: "Emails Scanned", value: emailsScanned.toLocaleString() }
                    ];

                    return displayMetrics.map((m, i) => (
                      <div key={i} className="rounded-lg border bg-muted/30 p-3 flex justify-between items-center">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {m.label}
                        </p>
                        <p className="text-base font-semibold tabular-nums">
                          {m.value}
                        </p>
                      </div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Recent datasets */}
            <Card className="lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between">
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

          {/* Activity feed */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Activity feed
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setView("audit")}>
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-y-auto">
                {activityData?.data && activityData.data.length > 0 ? (
                  <AuditTimeline logs={activityData.data} />
                ) : (
                  <div className="p-4">
                    <EmptyState
                      icon={<Activity className="h-5 w-5" />}
                      title="No activity yet"
                      description="Audit events will appear here as you use the platform."
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function timeAgoShort(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
