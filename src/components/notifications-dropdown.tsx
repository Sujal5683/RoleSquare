"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Eye,
  Inbox,
  RefreshCw,
  X,
  type LucideIcon,
} from "lucide-react";
import type { DashboardData } from "@/lib/types";

interface Notification {
  id: string;
  type: "alert" | "review" | "job" | "info";
  icon: LucideIcon;
  title: string;
  description: string;
  timestamp: string;
  action?: { label: string; view: "dashboard" | "sources" | "datasets" | "sharing" | "ai-studio" };
  read: boolean;
}

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const setView = useAppStore((s) => s.setView);
  const openDataset = useAppStore((s) => s.openDataset);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/api/dashboard"),
    staleTime: 30_000,
  });

  const notifications: Notification[] = [];

  // Connection alerts
  if (data?.connectionAlerts) {
    for (const conn of data.connectionAlerts) {
      const expires = conn.watchExpiresAt ? new Date(conn.watchExpiresAt) : null;
      const daysLeft = expires
        ? Math.ceil((expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : null;
      notifications.push({
        id: `conn-${conn.id}`,
        type: "alert",
        icon: conn.status !== "active" ? AlertTriangle : Clock,
        title: conn.googleEmail,
        description:
          conn.status !== "active"
            ? `Connection status: ${conn.status}`
            : daysLeft !== null
            ? `Gmail watch expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
            : "No active watch subscription",
        timestamp: conn.lastSyncAt || new Date().toISOString(),
        action: { label: "View settings", view: "dashboard" },
        read: false,
      });
    }
  }

  // Review queue items
  if (data?.reviewQueue) {
    for (const rec of data.reviewQueue.slice(0, 3)) {
      notifications.push({
        id: `review-${rec.id}`,
        type: "review",
        icon: Eye,
        title: "Record needs review",
        description: `${rec.values.length} fields extracted with ${(rec.confidence * 100).toFixed(0)}% confidence`,
        timestamp: rec.createdAt,
        action: { label: "Review record", view: "datasets" },
        read: false,
      });
    }
  }

  // Failed jobs
  if (data?.kpis && data.kpis.aiJobsFailed > 0) {
    notifications.push({
      id: "failed-jobs",
      type: "job",
      icon: AlertTriangle,
      title: `${data.kpis.aiJobsFailed} failed job${data.kpis.aiJobsFailed === 1 ? "" : "s"}`,
      description: "Jobs in failed or dead-letter state need attention",
      timestamp: new Date().toISOString(),
      action: { label: "View jobs", view: "ai-studio" },
      read: false,
    });
  }

  // Running jobs
  if (data?.kpis && data.kpis.aiJobsRunning > 0) {
    notifications.push({
      id: "running-jobs",
      type: "job",
      icon: RefreshCw,
      title: `${data.kpis.aiJobsRunning} job${data.kpis.aiJobsRunning === 1 ? "" : "s"} running`,
      description: "Extraction and processing in progress",
      timestamp: new Date().toISOString(),
      action: { label: "View jobs", view: "ai-studio" },
      read: false,
    });
  }

  // Sharing Requests
  if (data?.pendingSharingRequests) {
    for (const req of data.pendingSharingRequests) {
      const isGrant = req.shareType === "grant";
      notifications.push({
        id: `share-${req.id}`,
        type: "info",
        icon: Inbox,
        title: isGrant ? "Dataset Shared with You" : "Data Request",
        description: isGrant
          ? `${req.requesterName || req.requestedBy} shared "${req.datasetName || 'a dataset'}"`
          : `${req.requesterName || req.requestedBy} is requesting access to data.`,
        timestamp: req.createdAt,
        action: { label: "View request", view: "sharing" },
        read: false,
      });
    }
  }

  // No notifications
  if (notifications.length === 0) {
    notifications.push({
      id: "all-clear",
      type: "info",
      icon: CheckCircle2,
      title: "All systems operational",
      description: "No alerts, no pending reviews, no failed jobs.",
      timestamp: new Date().toISOString(),
      read: true,
    });
  }

  const visibleNotifications = notifications.filter((n) => !dismissed.has(n.id));
  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

  const handleAction = (n: Notification) => {
    if (n.action) {
      if (n.action.view === "datasets" && data?.reviewQueue?.[0]) {
        openDataset(data.reviewQueue[0].datasetId);
      } else {
        setView(n.action.view);
      }
    }
    setOpen(false);
  };

  const dismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed((prev) => new Set([...prev, id]));
  };

  const typeColors: Record<string, string> = {
    alert: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    review: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    job: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    info: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[90vw] sm:w-96 p-0"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <ScrollArea className="max-h-[400px]">
          <div className="divide-y">
            {visibleNotifications.length === 0 ? (
              <div className="flex flex-col items-center py-5 text-center">
                <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-600" />
                <p className="text-sm font-medium">All caught up</p>
                <p className="text-xs text-muted-foreground">
                  No pending notifications
                </p>
              </div>
            ) : (
              visibleNotifications.map((n) => {
                const Icon = n.icon;
                return (
                  <div
                    key={n.id}
                    className="group flex items-start gap-3 px-4 py-3 hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => handleAction(n)}
                  >
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${typeColors[n.type]}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        {!n.read && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {n.description}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(n.timestamp)}
                        </span>
                        {n.action && (
                          <span className="text-[10px] font-medium text-primary">
                            {n.action.label} →
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => dismiss(n.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        {visibleNotifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                setDismissed(new Set(notifications.map((n) => n.id)));
              }}
            >
              Mark all as read
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function timeAgo(iso: string): string {
  const date = new Date(iso);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
