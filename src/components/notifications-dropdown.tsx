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
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface Notification {
  id: string;
  type: "alert" | "review" | "job" | "info";
  icon: LucideIcon;
  title: string;
  description: string;
  timestamp: string;
  action?: { label: string; view: "dashboard" | "sources" | "datasets" | "sharing" | "ai-studio" | "organizations" };
  read: boolean;
}

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const setView = useAppStore((s) => s.setView);
  const openDataset = useAppStore((s) => s.openDataset);
  const dismissedNotifications = useAppStore((s) => s.dismissedNotifications);
  const readNotifications = useAppStore((s) => s.readNotifications);
  const markAsRead = useAppStore((s) => s.markAsRead);
  const markAllAsRead = useAppStore((s) => s.markAllAsRead);
  const dismissNotification = useAppStore((s) => s.dismissNotification);
  const dismissAllNotifications = useAppStore((s) => s.dismissAllNotifications);

  const activeOrgId = useAppStore((s) => s.selectedOrganizationId);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["dashboard", activeOrgId],
    queryFn: () => api.get<DashboardData>(activeOrgId ? `/api/dashboard?organizationId=${activeOrgId}` : "/api/dashboard"),
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
    for (const rec of data.reviewQueue) {
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
      id: `failed-jobs-${data.kpis.aiJobsFailed}`,
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
      id: `running-jobs-${data.kpis.aiJobsRunning}`,
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

  // Pending Invitations
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => api.get<{ organizations: Array<{ id: string; name: string; userStatus: string; createdAt?: string }> }>("/api/session"),
  });
  
  if (session?.organizations) {
    for (const org of session.organizations) {
      if (org.userStatus === "invited") {
        notifications.push({
          id: `invite-${org.id}`,
          type: "info",
          icon: Bell,
          title: "Organization Invitation",
          description: `You've been invited to join ${org.name}.`,
          timestamp: org.createdAt || new Date().toISOString(),
          action: { label: "View invitations", view: "organizations" },
          read: false,
        });
      }
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

  notifications.forEach(n => { if (n.id !== 'all-clear') n.read = readNotifications.includes(n.id); });
  const visibleNotifications = notifications.filter((n) => !dismissedNotifications.includes(n.id));
  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

  const handleAction = (n: Notification) => {
    markAsRead(n.id);
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
    dismissNotification(id);
  };

  const typeColors: Record<string, string> = {
    alert: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    review: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    job: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    info: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip><TooltipTrigger asChild>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
                        <Bell className="h-4 w-4" />
                        {unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </Button>
      </PopoverTrigger>
      </TooltipTrigger><TooltipContent>Notifications</TooltipContent></Tooltip>
      <PopoverContent
        align="end"
        className="w-[90vw] sm:w-96 p-0 flex flex-col overflow-hidden max-h-[85vh]"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
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
        <div className="flex-1 overflow-y-auto min-h-0">
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
                    <Tooltip><TooltipTrigger asChild><button
                                              onClick={(e) => dismiss(n.id, e)}
                                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground"
                                            >
                                              <X className="h-3.5 w-3.5" />
                                            </button></TooltipTrigger><TooltipContent>Dismiss</TooltipContent></Tooltip>
                  </div>
                );
              })
            )}
          </div>
        </div>
        {visibleNotifications.length > 0 && (
          <div className="border-t bg-card px-4 py-2 shrink-0 flex items-center justify-between gap-2 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <Button
              variant="ghost"
              size="sm"
              className="w-1/2 text-xs shrink"
              onClick={() => {
                markAllAsRead(notifications.map((n) => n.id));
              }}
            >
              Mark all as read
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-1/2 text-xs shrink"
              onClick={() => {
                dismissAllNotifications(notifications.map((n) => n.id));
              }}
            >
              Clear all
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
