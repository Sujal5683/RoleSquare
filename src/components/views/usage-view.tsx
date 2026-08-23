"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { PageHeader, StatCard, LoadingState, EmptyState } from "@/components/ui/page-elements";
import { JobTypeBadge, StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  type TooltipProps,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Mail,
  FileText,
  Download,
  Cpu,
  DollarSign,
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Brain,
  type LucideIcon,
} from "lucide-react";

interface UsageTrends {
  dailyTokens: { date: string; tokens: number; cost: number }[];
  jobTypeData: { type: string; count: number; fill: string }[];
  jobStatusData: { status: string; count: number }[];
  costByMetric: { metricType: string; value: number; cost: number }[];
  modelUsage: { model: string; tokens: number; calls: number; cost: number }[];
  monthlySummary: {
    currentMonthTokens: number;
    prevMonthTokens: number;
    tokenTrend: number;
    currentMonthEmails: number;
    prevMonthEmails: number;
    emailTrend: number;
    currentMonthCost: number;
    prevMonthCost: number;
    costTrend: number;
  };
  quota: {
    plan: string;
    limit: number;
    used: number;
    remaining: number;
    percent: number;
  };
  quotas: {
    id: string;
    name: string;
    limit: number;
    used: number;
    remaining: number;
    percent: number;
  }[];
  counts: {
    sources: number;
    datasets: number;
    totalJobs: number;
    totalOutputs: number;
    totalTokens: number;
  };
}

export function UsageView() {
  const setView = useAppStore((s) => s.setView);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["usage-trends"],
    queryFn: () => api.get<UsageTrends>("/api/usage/trends"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Usage & Billing" description="Token consumption, costs, and quota trends." icon={<TrendingUp className="h-5 w-5" />} />
        <LoadingState rows={4} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Usage & Billing" description="Token consumption, costs, and quota trends." icon={<TrendingUp className="h-5 w-5" />} />
        <EmptyState title="No data" description="Usage data could not be loaded." />
      </div>
    );
  }

  const ms = data.monthlySummary;
  const fmt = (n: number) => n.toLocaleString();
  const fmtMoney = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usage & Billing"
        description="Track AI token consumption, extraction costs, and quota utilization across your organization."
        icon={<TrendingUp className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tokens (this month)"
          value={fmt(ms.currentMonthTokens)}
          icon={<Zap className="h-4 w-4" />}
          trend={{
            value: `${Math.abs(ms.tokenTrend).toFixed(1)}%`,
            positive: ms.tokenTrend >= 0,
          }}
          hint={ms.prevMonthTokens > 0 ? `vs ${fmt(ms.prevMonthTokens)} last month` : "first month"}
        />
        <StatCard
          label="Cost (this month)"
          value={fmtMoney(ms.currentMonthCost)}
          icon={<DollarSign className="h-4 w-4" />}
          trend={{
            value: `${Math.abs(ms.costTrend).toFixed(1)}%`,
            positive: ms.costTrend <= 0,
          }}
          hint="at $0.001 / 1K tokens"
        />
        <StatCard
          label="Emails scanned"
          value={fmt(ms.currentMonthEmails)}
          icon={<Mail className="h-4 w-4" />}
          trend={{
            value: `${Math.abs(ms.emailTrend).toFixed(1)}%`,
            positive: ms.emailTrend >= 0,
          }}
          hint={ms.prevMonthEmails > 0 ? `vs ${fmt(ms.prevMonthEmails)} last month` : "first month"}
        />
        <StatCard
          label="Quota used"
          value={`${data.quota.percent.toFixed(1)}%`}
          icon={<Activity className="h-4 w-4" />}
          hint={`${fmt(data.quota.used)} / ${fmt(data.quota.limit)} tokens`}
        />
      </div>

      {/* Quotas progress bars */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Quota utilization
            <Badge variant="outline" className="ml-auto capitalize">
              {data.quota.plan} plan
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {data.quotas?.map(q => (
            <div key={q.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{q.name}</span>
                <span className="text-muted-foreground">
                  {fmt(q.used)} / {fmt(q.limit)}
                </span>
              </div>
              <Progress
                value={q.percent}
                className="h-2"
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{fmt(q.remaining)} remaining</span>
                <span>
                  {q.percent < 60 ? (
                    <span className="text-emerald-600">Healthy</span>
                  ) : q.percent < 85 ? (
                    <span className="text-amber-600">Approaching limit</span>
                  ) : (
                    <span className="text-destructive">Near limit</span>
                  )}
                </span>
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <button
              className="text-sm text-primary hover:underline"
              onClick={() => setView("settings")}
            >
              Upgrade plan →
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Daily token consumption chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Daily token consumption
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              Last 30 days
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyTokens}>
                <defs>
                  <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted-foreground/20" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5)}
                  interval={4}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  content={({ active, payload, label }: TooltipProps<number, string>) =>
                    active && payload && payload.length > 0 ? (
                      <div className="rounded-lg border bg-popover p-3 shadow-md">
                        <p className="text-xs font-medium mb-1">{label}</p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Tokens:</span>{" "}
                          <span className="font-semibold tabular-nums">
                            {fmt(payload[0]?.value || 0)}
                          </span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Cost:</span>{" "}
                          <span className="font-semibold tabular-nums">
                            {fmtMoney((payload[0]?.payload as { cost: number })?.cost || 0)}
                          </span>
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  fill="url(#tokenGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Job type distribution + Job status distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              Job type distribution
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                {data.counts.totalJobs} total
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.jobTypeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted-foreground/20" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="type"
                    tick={{ fontSize: 9 }}
                    width={110}
                  />
                  <Tooltip
                    content={({ active, payload }: TooltipProps<number, string>) =>
                      active && payload && payload.length > 0 ? (
                        <div className="rounded-lg border bg-popover p-2 shadow-md">
                          <p className="text-xs font-medium">{payload[0]?.payload.type}</p>
                          <p className="text-sm tabular-nums">
                            {payload[0]?.value} jobs
                          </p>
                        </div>
                      ) : null
                    }
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {data.jobTypeData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Job status distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.jobStatusData}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={40}
                  >
                    {data.jobStatusData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={STATUS_COLORS[entry.status] || "#94a3b8"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }: TooltipProps<number, string>) =>
                      active && payload && payload.length > 0 ? (
                        <div className="rounded-lg border bg-popover p-2 shadow-md">
                          <p className="text-xs font-medium capitalize">
                            {payload[0]?.payload.status}
                          </p>
                          <p className="text-sm tabular-nums">
                            {payload[0]?.value} jobs
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={20}
                    iconType="circle"
                    formatter={(v) => (
                      <span className="text-xs capitalize">{v}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Model usage table + Cost breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Model usage */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Model usage breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.modelUsage.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<Brain className="h-5 w-5" />}
                    title="No AI calls yet"
                    description="Run an extraction to see model usage."
                  />
                </div>
              ) : (
                data.modelUsage.map((m) => (
                  <div key={m.model} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      <Brain className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium font-mono truncate">{m.model}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.calls} calls ·{" "}
                        <span title="Total tokens">{fmt(m.tokens)} tokens</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{fmtMoney(m.cost)}</p>
                      <p className="text-[10px] text-muted-foreground">est. cost</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cost breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Cost breakdown
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                This month
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.costByMetric.map((m) => (
                <div key={m.metricType} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    {getMetricIcon(m.metricType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium capitalize">
                      {m.metricType.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {fmt(m.value)} units
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{fmtMoney(m.cost)}</p>
                    <p className="text-[10px] text-muted-foreground">est. cost</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-sm font-bold tabular-nums">
                  {fmtMoney(data.costByMetric.reduce((s, m) => s + m.cost, 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary counts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Platform summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryItem icon={Activity} label="Total jobs" value={data.counts.totalJobs} />
            <SummaryItem icon={Brain} label="AI outputs" value={data.counts.totalOutputs} />
            <SummaryItem icon={Zap} label="Total tokens" value={data.counts.totalTokens} />
            <SummaryItem icon={Mail} label="Sources" value={data.counts.sources} />
            <SummaryItem icon={FileText} label="Datasets" value={data.counts.datasets} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-2 text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function getMetricIcon(metricType: string): React.ReactNode {
  switch (metricType) {
    case "ai_tokens":
      return <Zap className="h-4 w-4" />;
    case "emails_scanned":
      return <Mail className="h-4 w-4" />;
    case "documents_parsed":
      return <FileText className="h-4 w-4" />;
    case "exports":
      return <Download className="h-4 w-4" />;
    case "storage":
      return <Cpu className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
}

const STATUS_COLORS: Record<string, string> = {
  success: "#34d399",
  failed: "#fb7185",
  running: "#fbbf24",
  queued: "#94a3b8",
  retry: "#22d3ee",
  dlq: "#f43f5e",
};
