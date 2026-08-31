"use client";

// GoogleSheetsAccountSelector
// Shows connected Sheets accounts for the org and allows:
//   - Selecting which account to use for an operation
//   - Connecting a new Google account (separate from app login)
//   - Disconnecting an existing account
//
// This component NEVER shows tokens. Clearly labeled as separate from app login.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  LogIn,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  UserCircle2,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetsAccount {
  id: string;
  googleEmail: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: "active" | "expired" | "revoked" | "degraded";
  spreadsheetCount: number;
}

interface GoogleSheetsAccountSelectorProps {
  value?: string | null; // selected sheetsAccountId
  onSelect: (accountId: string) => void;
  className?: string;
}

const STATUS_CONFIG = {
  active: { label: "Connected", className: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle2 },
  expired: { label: "Expired", className: "bg-amber-500/15 text-amber-400", icon: WifiOff },
  revoked: { label: "Revoked", className: "bg-red-500/15 text-red-400", icon: AlertCircle },
  degraded: { label: "Issue", className: "bg-amber-500/15 text-amber-400", icon: AlertCircle },
};

export function GoogleSheetsAccountSelector({
  value,
  onSelect,
  className,
}: GoogleSheetsAccountSelectorProps) {
  const { selectedOrganizationId } = useAppStore();
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery<SheetsAccount[]>({
    queryKey: ["sheets-accounts", selectedOrganizationId],
    queryFn: () => api.get("/api/google-sheets/accounts"),
    enabled: !!selectedOrganizationId,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const resp = await api.post<{ authorizeUrl: string }>("/api/google-sheets/auth", {
        returnTo: window.location.pathname,
      });
      // Navigate to Google consent screen
      window.location.href = resp.authorizeUrl;
    },
    onError: () => toast.error("Failed to start Google authorization"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (accountId: string) =>
      api.delete(`/api/google-sheets/accounts/${accountId}`),
    onSuccess: () => {
      toast.success("Google Sheets account disconnected");
      // Match the query key on line 85 — must include selectedOrganizationId
      queryClient.invalidateQueries({ queryKey: ["sheets-accounts", selectedOrganizationId] });
    },
    onError: () => toast.error("Failed to disconnect account"),
  });

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading accounts…</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Clarity notice — separate from app login */}
      <p className="text-xs text-muted-foreground bg-blue-500/5 border border-blue-500/20 rounded-md px-3 py-2">
        <strong>Note:</strong> This connects a Google account specifically for Sheets access.
        It is separate from your application login and Gmail integration.
      </p>

      {accounts.length === 0 ? (
        <Button
          variant="outline"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          className="w-full border-dashed"
          id="connect-google-sheets-btn"
        >
          {connectMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Connect Google Account for Sheets
        </Button>
      ) : (
        <div className="space-y-2">
          {/* Account selector */}
          <Select value={value || ""} onValueChange={onSelect}>
            <SelectTrigger id="sheets-account-select" className="w-full">
              <SelectValue placeholder="Select a Google account…" />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)] sm:max-w-md overflow-hidden">
              {accounts.map((account) => {
                const statusCfg = STATUS_CONFIG[account.status] ?? STATUS_CONFIG.active;
                const Icon = statusCfg.icon;
                return (
                  <SelectItem key={account.id} value={account.id} className="w-full">
                    <div className="flex items-center gap-2 max-w-[250px] sm:max-w-[350px]">
                      {account.avatarUrl ? (
                         
                        <img
                          src={account.avatarUrl}
                          alt=""
                          className="h-5 w-5 rounded-full shrink-0"
                        />
                      ) : (
                        <UserCircle2 className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm truncate">{account.googleEmail}</span>
                        {account.displayName && (
                          <span className="text-xs text-muted-foreground truncate">
                            {account.displayName}
                          </span>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("ml-auto text-[10px] py-0 shrink-0", statusCfg.className)}
                      >
                        <Icon className="mr-1 h-2.5 w-2.5" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Account actions */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              className="text-xs text-muted-foreground h-7"
              id="add-another-sheets-account-btn"
            >
              <Plus className="mr-1 h-3 w-3" />
              Use different account
            </Button>

            {value && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => connectMutation.mutate()}
                    className="text-xs"
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Re-authorize this account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => disconnectMutation.mutate(value)}
                    className="text-xs text-red-400 focus:text-red-400"
                    disabled={disconnectMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Disconnect account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
