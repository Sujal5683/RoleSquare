"use client";

import { useMemo, useState } from "react";
import { useActiveOrg } from "@/hooks/use-active-org";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type {
  GoogleConnectionDTO,
  UsageMetricDTO,
  UserDTO,
} from "@/lib/types";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
  StatCard,
} from "@/components/ui/page-elements";
import {
  StatusBadge,
  PlanBadge,
  RoleBadge,
} from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings as SettingsIcon,
  User as UserIcon,
  Link2,
  Lock,
  Bell,
  CreditCard,
  Trash2,
  Plug,
  Mail,
  HardDrive,
  FileText,
  Table as TableIcon,
  FormInput,
  Slack,
  Zap,
  Webhook,
  RefreshCw,
  Plus,
  Check,
  X,
  ShieldCheck,
  Smartphone,
  Key,
  Cpu,
  FileDown,
  HardDriveDownload,
  AlertTriangle,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Main component ───────────────────────────────────────────────────────

export function SettingsView() {
  const [tab, setTab] = useState("profile");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Manage your profile, connected accounts, security, notifications, billing, data retention, and integrations."
        icon={<SettingsIcon className="h-5 w-5" />}
      />

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="w-full flex flex-col lg:flex-row gap-4 lg:items-start"
      >
        <TabsList
          className="lg:w-56 lg:h-fit lg:grid lg:grid-cols-1 lg:gap-1 h-auto flex-wrap lg:sticky lg:top-16"
        >
          <TabsTrigger value="profile" className="justify-start">
            <UserIcon className="mr-2 h-3.5 w-3.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="accounts" className="justify-start">
            <Link2 className="mr-2 h-3.5 w-3.5" />
            Connected Accounts
          </TabsTrigger>
          <TabsTrigger value="security" className="justify-start">
            <Lock className="mr-2 h-3.5 w-3.5" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="justify-start">
            <Bell className="mr-2 h-3.5 w-3.5" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="billing" className="justify-start">
            <CreditCard className="mr-2 h-3.5 w-3.5" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="retention" className="justify-start">
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Data Retention
          </TabsTrigger>
          <TabsTrigger value="integrations" className="justify-start">
            <Plug className="mr-2 h-3.5 w-3.5" />
            Integrations
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-w-0 space-y-4">
          <TabsContent value="profile" className="mt-0">
            <ProfileSection />
          </TabsContent>
          <TabsContent value="accounts" className="mt-0">
            <ConnectedAccountsSection />
          </TabsContent>
          <TabsContent value="security" className="mt-0">
            <SecuritySection />
          </TabsContent>
          <TabsContent value="notifications" className="mt-0">
            <NotificationsSection />
          </TabsContent>
          <TabsContent value="billing" className="mt-0">
            <BillingSection />
          </TabsContent>
          <TabsContent value="retention" className="mt-0">
            <DataRetentionSection />
          </TabsContent>
          <TabsContent value="integrations" className="mt-0">
            <IntegrationsSection />
            <div className="mt-4">
              <ApiKeysSection />
            </div>
            <div className="mt-4">
              <WebhooksSection />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ── Session hook (shared) ────────────────────────────────────────────────

interface SessionResponse {
  user: UserDTO;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    role: string;
    status: string;
  }>;
}

function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => api.get<SessionResponse>("/api/session"),
  });
}

// ── Profile section ──────────────────────────────────────────────────────

function ProfileSection() {
  const { data: session, isLoading } = useSession();
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");

  // Render-time sync — only update local state when session first loads or
  // the user's name on the server changes.
  const serverName = session?.user.name ?? "";
  if (serverName && serverName !== savedName && !name) {
    setSavedName(serverName);
    setName(serverName);
  }

  const queryClient = useQueryClient();
  const updateProfileMutation = useMutation({
    mutationFn: (newName: string) => api.patch("/api/session", { name: newName }),
    onSuccess: (_, newName) => {
      setSavedName(newName);
      toast.success("Profile saved", {
        description: `Your display name is now "${newName}".`,
      });
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: () => toast.error("Failed to save profile"),
  });

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty");
      return;
    }
    updateProfileMutation.mutate(trimmed);
  };

  if (isLoading) return <LoadingState rows={3} />;
  if (!session) {
    return (
      <ErrorState message="Failed to load profile" />
    );
  }

  const activeOrg = session.organizations[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>
          Update your personal information. Email address cannot be changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Avatar + identity */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg font-medium">
              {initials(session.user.name ?? session.user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <p className="font-medium text-base">
              {session.user.name ?? session.user.email}
            </p>
            <p className="text-sm text-muted-foreground">
              {session.user.email}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <RoleBadge role={activeOrg?.role ?? "viewer"} />
              {activeOrg && (
                <Badge variant="outline" className="font-normal">
                  {activeOrg.name}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Editable form */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              value={session.user.email}
              disabled
              className="bg-muted text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Email is locked. Contact support to change it.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!name.trim() || name === savedName}>
            <Check className="mr-2 h-3.5 w-3.5" />
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Connected Accounts section ───────────────────────────────────────────

function ConnectedAccountsSection() {
  const queryClient = useQueryClient();
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] =
    useState<GoogleConnectionDTO | null>(null);

  const activeOrgId = useActiveOrg();

  const {
    data: connections,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["google-connections", activeOrgId],
    queryFn: () =>
      api.get<GoogleConnectionDTO[]>("/api/google-connections"),
    enabled: !!activeOrgId,
  });

  const refreshMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch<GoogleConnectionDTO>(`/api/google-connections/${id}`),
    onSuccess: (c) => {
      toast.success("Connection refreshed", {
        description: `${c.googleEmail} is now active until ${relativeTime(c.watchExpiresAt)}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["google-connections"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to refresh";
      toast.error("Refresh failed", { description: msg });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<GoogleConnectionDTO>(`/api/google-connections/${id}`),
    onSuccess: (c) => {
      toast.success("Connection disconnected", {
        description: `${c.googleEmail} has been revoked.`,
      });
      queryClient.invalidateQueries({ queryKey: ["google-connections"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDisconnectTarget(null);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Failed to disconnect";
      toast.error("Disconnect failed", { description: msg });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Connected Google accounts</CardTitle>
            <CardDescription>
              Google accounts used as ingestion sources. Refresh to extend the
              watch, reconnect to re-authenticate, or disconnect to revoke.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={!activeOrgId || isFetching}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setConnectOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Connect new account
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState rows={3} />
        ) : isError ? (
          <ErrorState
            message="Failed to load connections"
            onRetry={() => refetch()}
          />
        ) : !connections || connections.length === 0 ? (
          <EmptyState
            icon={<Link2 className="h-5 w-5" />}
            title="No Google accounts connected"
            description="Connect a Google account to start ingesting emails, documents, and spreadsheets."
            action={
              <Button size="sm" onClick={() => setConnectOpen(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Connect account
              </Button>
            }
          />
        ) : (
          <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {connections.map((c) => (
              <div
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{c.googleEmail}</p>
                      {c.status === "active" && c.watchExpiresAt && new Date(c.watchExpiresAt).getTime() > Date.now() + 86400000 ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 gap-1 h-5 text-[10px]">
                          <ShieldCheck className="h-3 w-3" /> Healthy
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 gap-1 h-5 text-[10px]">
                          <AlertTriangle className="h-3 w-3" /> Re-auth needed
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={c.status} />
                      <span className="text-xs text-muted-foreground">
                        Watch expires {relativeTime(c.watchExpiresAt)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · Last sync {relativeTime(c.lastSyncAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {c.scopes.map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="font-mono text-[10px] font-normal"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refreshMutation.mutate(c.id)}
                    disabled={refreshMutation.isPending}
                  >
                    <RefreshCw
                      className={`mr-1.5 h-3.5 w-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => refreshMutation.mutate(c.id)}
                    disabled={refreshMutation.isPending}
                  >
                    Reconnect
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDisconnectTarget(c)}
                    disabled={disconnectMutation.isPending}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Connect dialog */}
      <ConnectAccountDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
      />

      {/* Disconnect confirm */}
      <AlertDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke access for{" "}
              <span className="font-medium text-foreground">
                {disconnectTarget?.googleEmail}
              </span>
              . All sources using this connection will stop running until a new
              account is connected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={disconnectMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (disconnectTarget)
                  disconnectMutation.mutate(disconnectTarget.id);
              }}
            >
              {disconnectMutation.isPending
                ? "Disconnecting…"
                : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ConnectAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleAuthorize() {
    setLoading(true);
    try {
      // Get the OAuth URL from the server (it embeds user+org context in state)
      const result = await api.post<{ authorizeUrl: string }>("/api/google-connections");
      if (result.authorizeUrl) {
        // Navigate the browser to Google's consent screen
        window.location.href = result.authorizeUrl;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start authorization";
      toast.error("Authorization failed", { description: msg });
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect Google Account</DialogTitle>
          <DialogDescription>
            You&apos;ll be redirected to Google to authorize access to your Gmail and
            Drive. We request read-only permissions only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">Permissions requested:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>✓ <strong>Gmail</strong> — read emails (read-only)</li>
              <li>✓ <strong>Drive</strong> — list &amp; read files (read-only)</li>
              <li>✓ <strong>Profile</strong> — your Google email address</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            You can revoke access at any time from your Google Account settings or
            from this page.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleAuthorize} disabled={loading}>
            {loading ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plug className="mr-2 h-3.5 w-3.5" />
            )}
            Authorize with Google
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Security section ─────────────────────────────────────────────────────

function SecuritySection() {
  const [twoFactor, setTwoFactor] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    toast.success("Password updated", {
      description: "Your password has been changed successfully.",
    });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="space-y-4">
      {/* Active sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-primary" />
            Active sessions
          </CardTitle>
          <CardDescription>
            Devices and browsers currently signed in to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <Smartphone className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  This browser{" "}
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    Current
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {typeof navigator !== "undefined"
                    ? navigator.userAgent.split(") ")[0]?.split("(")[1] ?? "Unknown"
                    : "Unknown"}{" "}
                  · Active now
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" disabled>
              Current
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-primary" />
            Password
          </CardTitle>
          <CardDescription>
            Change your password regularly to keep your account secure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleChangePassword}
            className="grid gap-4 sm:grid-cols-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="current-pw">Current password</Label>
              <Input
                id="current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New password</Label>
              <Input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <Button type="submit" size="sm">
                <Key className="mr-2 h-3.5 w-3.5" />
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Two-factor authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security with a TOTP app like Google
            Authenticator or 1Password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {twoFactor ? "Enabled" : "Disabled"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {twoFactor
                  ? "You will be prompted for a 6-digit code at sign-in."
                  : "Enable 2FA to protect your account from unauthorized access."}
              </p>
            </div>
            <Switch
              checked={twoFactor}
              onCheckedChange={(v) => {
                setTwoFactor(v);
                toast.success(v ? "2FA enabled" : "2FA disabled");
              }}
              className="shrink-0"
            />
          </div>
        </CardContent>
      </Card>

      {/* API keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4 text-primary" />
            API keys
          </CardTitle>
          <CardDescription>
            Generate long-lived tokens to access the platform API
            programmatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Key className="h-5 w-5" />}
            title="Coming soon"
            description="API key management is on the roadmap. For now, all API access happens through the signed-in browser session."
          />
        </CardContent>
      </Card>

      {/* OAuth scopes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            OAuth scopes
          </CardTitle>
          <CardDescription>
            The Google API scopes requested by the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            "gmail.readonly",
            "gmail.metadata",
            "drive.metadata.readonly",
            "drive.file",
            "docs",
            "spreadsheets",
            "forms.body",
          ].map((s) => (
            <div
              key={s}
              className="flex items-center justify-between rounded-md border p-2.5"
            >
              <code className="text-xs font-mono">{s}</code>
              <Badge variant="outline" className="font-normal text-emerald-700 dark:text-emerald-300">
                <Check className="mr-1 h-3 w-3" />
                Granted
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Notifications section ────────────────────────────────────────────────

interface NotificationPref {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

const NOTIFICATION_PREFS: NotificationPref[] = [
  {
    key: "source_run_completed",
    label: "Source run completed",
    description: "When an ingestion run finishes scanning and parsing.",
    defaultEnabled: true,
  },
  {
    key: "extraction_ready",
    label: "Extraction ready for review",
    description: "When AI extraction finishes and records await approval.",
    defaultEnabled: true,
  },
  {
    key: "review_needed",
    label: "Review needed",
    description: "When records are flagged as needs_review due to low confidence.",
    defaultEnabled: true,
  },
  {
    key: "sharing_request_received",
    label: "Sharing request received",
    description: "When another organization requests access to a dataset.",
    defaultEnabled: true,
  },
  {
    key: "connection_expired",
    label: "Connection expired",
    description: "When a Google connection's watch is about to expire.",
    defaultEnabled: true,
  },
];

function NotificationsSection() {
  // Mock — store toggles in local state only.
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      NOTIFICATION_PREFS.map((p) => [p.key, p.defaultEnabled])
    )
  );

  const toggle = (key: string, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    toast.success(value ? "Notification enabled" : "Notification disabled", {
      description: NOTIFICATION_PREFS.find((p) => p.key === key)?.label,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-primary" />
          Notification preferences
        </CardTitle>
        <CardDescription>
          Choose which events trigger an in-app notification or email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {NOTIFICATION_PREFS.map((p) => (
          <div
            key={p.key}
            className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-medium truncate">{p.label}</p>
              <p className="text-xs text-muted-foreground break-words">{p.description}</p>
            </div>
            <Switch
              checked={!!prefs[p.key]}
              onCheckedChange={(v) => toggle(p.key, v)}
              aria-label={p.label}
              className="shrink-0"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Billing section ──────────────────────────────────────────────────────

const USAGE_METRIC_META: Record<
  string,
  { label: string; icon: React.ReactNode; suffix?: string }
> = {
  tokens: {
    label: "Tokens used",
    icon: <Cpu className="h-4 w-4" />,
    suffix: "tok",
  },
  emails_scanned: {
    label: "Emails scanned",
    icon: <Mail className="h-4 w-4" />,
  },
  documents_parsed: {
    label: "Documents parsed",
    icon: <FileText className="h-4 w-4" />,
  },
  exports: {
    label: "Exports run",
    icon: <FileDown className="h-4 w-4" />,
  },
  storage: {
    label: "Storage used",
    icon: <HardDriveDownload className="h-4 w-4" />,
    suffix: "MB",
  },
};

function BillingSection() {
  const { data: session } = useSession();
  const activeOrgId = useActiveOrg();

  const {
    data: usage,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["usage", activeOrgId],
    queryFn: () => api.get<UsageMetricDTO[]>("/api/usage"),
    enabled: !!activeOrgId,
  });

  const activeOrg = session?.organizations?.[0];
  const plan = (activeOrg?.plan ?? "free") as "free" | "team" | "enterprise";

  const usageByType: Record<string, number> = {};
  for (const m of usage ?? []) {
    usageByType[m.metricType] = (usageByType[m.metricType] ?? 0) + m.value;
  }

  return (
    <div className="space-y-4">
      {/* Current plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-primary" />
            Current plan
          </CardTitle>
          <CardDescription>
            Manage your subscription tier and billing cycle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <PlanBadge plan={plan} />
                  <span className="text-xs text-muted-foreground capitalize">
                    {plan} plan
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {plan === "free"
                    ? "Limited to 1,000 records / month"
                    : plan === "team"
                      ? "10,000 records / month, priority support"
                      : "Unlimited records, dedicated support, SSO"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.info("Invoices", { description: "Invoice history is not available in this demo." })}>
                View invoices
              </Button>
              <Button size="sm" onClick={() => toast.info("Upgrade plan", { description: "Plan upgrades are not available in this demo." })}>
                Upgrade plan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage summary */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Usage this month</CardTitle>
              <CardDescription>
                Consumption across the current billing cycle.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={!activeOrgId || isFetching}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState rows={3} />
          ) : isError ? (
            <ErrorState message="Failed to load usage" onRetry={() => refetch()} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(USAGE_METRIC_META).map(([key, meta]) => {
                const value = usageByType[key] ?? 0;
                const display =
                  key === "tokens" && value >= 1000
                    ? `${(value / 1000).toFixed(1)}k`
                    : key === "storage"
                      ? `${(value / 1024 / 1024).toFixed(1)} MB`
                      : String(value);
                return (
                  <StatCard
                    key={key}
                    label={meta.label}
                    value={display}
                    icon={meta.icon}
                    hint={`Current month`}
                  />
                );
              })}
              {usage && usage.length === 0 && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <EmptyState
                    icon={<CreditCard className="h-5 w-5" />}
                    title="No usage yet"
                    description="Usage metrics will appear here once you start running extraction jobs."
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Data Retention section ───────────────────────────────────────────────

function DataRetentionSection() {
  const [emailRetention, setEmailRetention] = useState("90");
  const [docRetention, setDocRetention] = useState("365");
  const [auditRetention, setAuditRetention] = useState("365");
  const [exportExpiry, setExportExpiry] = useState("7d");

  const handleScheduleDeletion = () => {
    toast.info("Data deletion scheduled", {
      description: "A deletion job has been queued. You will be notified by email before it runs.",
    });
  };

  const handleExportAll = () => {
    toast.info("GDPR export queued", {
      description: "A complete export of your data has been queued. You will receive a download link by email.",
    });
  };

  const retentionSelect = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[]
  ) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {retentionSelect(
          "Email retention",
          emailRetention,
          setEmailRetention,
          [
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
            { value: "365", label: "365 days" },
          ]
        )}
        {retentionSelect(
          "Document retention",
          docRetention,
          setDocRetention,
          [
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
            { value: "365", label: "365 days" },
          ]
        )}
        {retentionSelect(
          "Audit log retention",
          auditRetention,
          setAuditRetention,
          [
            { value: "90", label: "90 days" },
            { value: "365", label: "365 days" },
            { value: "forever", label: "Forever" },
          ]
        )}
        {retentionSelect(
          "Export file expiry",
          exportExpiry,
          setExportExpiry,
          [
            { value: "24h", label: "24 hours" },
            { value: "7d", label: "7 days" },
            { value: "30d", label: "30 days" },
          ]
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently delete data or request a complete export of your
            personal data (GDPR-style).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div>
              <p className="text-sm font-medium">Schedule data deletion</p>
              <p className="text-xs text-muted-foreground">
                Queue a job to permanently delete emails, documents, and
                records older than your retention policy.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:text-destructive shrink-0"
              onClick={handleScheduleDeletion}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Schedule deletion
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Export all data</p>
              <p className="text-xs text-muted-foreground">
                Trigger a GDPR-style export job. You&apos;ll receive a download
                link by email when it&apos;s ready.
              </p>
            </div>
            <Button variant="outline" onClick={handleExportAll} className="shrink-0">
              <FileDown className="mr-2 h-3.5 w-3.5" />
              Export all data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Integrations section ─────────────────────────────────────────────────

interface IntegrationDef {
  key: string;
  name: string;
  icon: React.ReactNode;
  status: "connected" | "available" | "coming_soon";
  description: string;
}

function IntegrationsSection() {
  // Use google-connections to infer which Google integrations are active
  const activeOrgId = useActiveOrg();
  const { data: connections } = useQuery({
    queryKey: ["google-connections", activeOrgId],
    queryFn: () =>
      api.get<GoogleConnectionDTO[]>("/api/google-connections"),
    enabled: !!activeOrgId,
  });

  // Determine which Google services are reachable from any connection's scopes
  const connectedServices = new Set<string>();
  for (const c of connections ?? []) {
    for (const s of c.scopes ?? []) {
      if (s.includes("gmail")) connectedServices.add("gmail");
      if (s.includes("drive")) connectedServices.add("drive");
      if (s.includes("docs")) connectedServices.add("docs");
      if (s.includes("spreadsheets")) connectedServices.add("sheets");
      if (s.includes("forms")) connectedServices.add("forms");
    }
  }
  // If at least one connection exists, mark all Google services as connected
  // (scopes vary in real OAuth flows — this keeps the UX consistent).
  if (connections && connections.length > 0) {
    ["gmail", "drive", "docs", "sheets"].forEach((s) =>
      connectedServices.add(s)
    );
  }

  const integrations: IntegrationDef[] = [
    {
      key: "gmail",
      name: "Gmail",
      icon: <Mail className="h-4 w-4" />,
      status: connectedServices.has("gmail") ? "connected" : "available",
      description: "Ingest emails, attachments, and threads as structured records.",
    },
    {
      key: "drive",
      name: "Google Drive",
      icon: <HardDrive className="h-4 w-4" />,
      status: connectedServices.has("drive") ? "connected" : "available",
      description: "Discover and parse files stored in Drive folders.",
    },
    {
      key: "docs",
      name: "Google Docs",
      icon: <FileText className="h-4 w-4" />,
      status: connectedServices.has("docs") ? "connected" : "available",
      description: "Extract structured data from Google Docs content.",
    },
    {
      key: "sheets",
      name: "Google Sheets",
      icon: <TableIcon className="h-4 w-4" />,
      status: connectedServices.has("sheets") ? "connected" : "available",
      description: "Read and write structured rows to Google Sheets.",
    },
    {
      key: "forms",
      name: "Google Forms",
      icon: <FormInput className="h-4 w-4" />,
      status: connectedServices.has("forms") ? "connected" : "available",
      description: "Ingest form responses as dataset records.",
    },
    {
      key: "slack",
      name: "Slack",
      icon: <Slack className="h-4 w-4" />,
      status: "coming_soon",
      description: "Send notifications to Slack channels when jobs complete.",
    },
    {
      key: "zapier",
      name: "Zapier",
      icon: <Zap className="h-4 w-4" />,
      status: "coming_soon",
      description: "Connect the platform to thousands of apps via Zapier.",
    },
    {
      key: "webhook",
      name: "Webhooks",
      icon: <Webhook className="h-4 w-4" />,
      status: "coming_soon",
      description: "Receive HTTP callbacks for every platform event.",
    },
  ];

  const handleConfigure = (def: IntegrationDef) => {
    if (def.status === "coming_soon") {
      toast.info("Coming soon", {
        description: `${def.name} integration is on the roadmap.`,
      });
    } else if (def.status === "connected") {
      toast.info("Configure", {
        description: `Configuration for ${def.name} is not available in this demo.`,
      });
    } else {
      toast.info("Connect", {
        description: `${def.name} requires connecting a Google account first.`,
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4 text-primary" />
          Integrations
        </CardTitle>
        <CardDescription>
          Connect external services to extend the platform&apos;s capabilities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {integrations.map((def) => (
            <div
              key={def.key}
              className="flex flex-col gap-2 rounded-lg border p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {def.icon}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{def.name}</p>
                    {def.status === "connected" && (
                      <Badge variant="secondary" className="text-[10px] font-normal text-emerald-700 dark:text-emerald-300">
                        <Check className="mr-1 h-2.5 w-2.5" />
                        Connected
                      </Badge>
                    )}
                    {def.status === "available" && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        Available
                      </Badge>
                    )}
                    {def.status === "coming_soon" && (
                      <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                        Coming soon
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{def.description}</p>
              <div className="mt-auto pt-2">
                <Button
                  size="sm"
                  variant={def.status === "connected" ? "outline" : "default"}
                  className="w-full"
                  disabled={def.status === "coming_soon"}
                  onClick={() => handleConfigure(def)}
                >
                  {def.status === "connected" ? "Configure" : "Connect"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Webhooks section ─────────────────────────────────────────────────────

interface WebhookDTO {
  id: string;
  url: string;
  secret: string | null;
  events: string[];
  status: string;
  lastTriggeredAt: string | null;
  lastResponseCode: number | null;
  failureCount: number;
  createdAt: string;
}

const WEBHOOK_EVENTS = [
  { value: "source.run_completed", label: "Source run completed" },
  { value: "extraction.completed", label: "Extraction completed" },
  { value: "review.needed", label: "Review needed" },
  { value: "job.failed", label: "Job failed" },
  { value: "sharing.requested", label: "Sharing requested" },
  { value: "record.approved", label: "Record approved" },
];

function WebhooksSection() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([
    "source.run_completed",
    "extraction.completed",
    "review.needed",
    "job.failed",
  ]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; statusCode: number; elapsed: number; responseBody: string }>>({});

  const activeOrgId = useActiveOrg();
  const { data: webhooks = [], isLoading: loading } = useQuery({
    queryKey: ["webhooks", activeOrgId],
    queryFn: () =>
      api.get<WebhookDTO[]>("/api/webhooks"),
    enabled: !!activeOrgId,
  });

  const createMutation = useMutation({
    mutationFn: (vars: { url: string; secret: string | null; events: string[] }) =>
      api.post<WebhookDTO>("/api/webhooks", vars),
    onSuccess: () => {
      toast.success("Webhook created");
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setCreateOpen(false);
      setNewUrl("");
      setNewSecret("");
    },
    onError: () => toast.error("Failed to create webhook"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<WebhookDTO>(`/api/webhooks/${id}`),
    onSuccess: () => {
      toast.success("Webhook deleted");
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: () => toast.error("Failed to delete webhook"),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean; statusCode: number; elapsed: number; responseBody: string }>(`/api/webhooks/${id}/test`),
    onMutate: (id) => setTestingId(id),
    onSuccess: (result, id) => {
      setTestResult((prev) => ({ ...prev, [id]: result }));
      if (result.success) {
        toast.success("Test ping succeeded", {
          description: `HTTP ${result.statusCode} in ${result.elapsed}ms`,
        });
      } else {
        toast.error("Test ping failed", {
          description: result.responseBody?.slice(0, 100) || `HTTP ${result.statusCode}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: () => toast.error("Test failed"),
    onSettled: () => setTestingId(null),
  });

  const handleCreate = () => {
    if (!newUrl.trim()) return;
    createMutation.mutate({
      url: newUrl,
      secret: newSecret || null,
      events: newEvents,
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this webhook?")) return;
    deleteMutation.mutate(id);
  };

  const handleTest = (id: string) => {
    testMutation.mutate(id);
  };

  const toggleEvent = (event: string) => {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="h-4 w-4" /> Webhooks
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Send real-time event notifications to external systems.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add webhook
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : webhooks.length === 0 ? (
          <EmptyState
            icon={<Webhook className="h-5 w-5" />}
            title="No webhooks configured"
            description="Add a webhook to receive real-time event notifications when sources complete runs, extractions finish, or jobs fail."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add webhook
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {Array.isArray(webhooks) && webhooks.map((w) => {
              const result = testResult[w.id];
              return (
                <div key={w.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs font-mono truncate max-w-md">{w.url}</code>
                        <Badge
                          variant={
                            w.status === "active" ? "default" :
                            w.status === "failing" ? "destructive" : "secondary"
                          }
                          className="text-[9px] capitalize"
                        >
                          {w.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {w.events.map((e) => (
                          <Badge key={e} variant="outline" className="text-[9px] font-mono">
                            {e}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {w.lastTriggeredAt
                          ? `Last triggered ${new Date(w.lastTriggeredAt).toLocaleString()}`
                          : "Never triggered"}
                        {w.lastResponseCode ? ` · HTTP ${w.lastResponseCode}` : ""}
                        {w.failureCount > 0 && ` · ${w.failureCount} failures`}
                      </p>
                      {result && (
                        <div className={`mt-2 rounded-md p-2 text-xs ${result.success ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`}>
                          <p className="font-medium">
                            {result.success ? "✓ Ping succeeded" : "✗ Ping failed"} — HTTP {result.statusCode} in {result.elapsed}ms
                          </p>
                          {result.responseBody && (
                            <pre className="mt-1 text-[10px] opacity-80 overflow-x-auto max-h-20">{result.responseBody}</pre>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTest(w.id)}
                        disabled={testingId === w.id}
                      >
                        {testingId === w.id ? (
                          <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <Zap className="mr-1.5 h-3 w-3" />
                        )}
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(w.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create dialog */}
        {createOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCreateOpen(false)}>
            <div className="bg-background rounded-lg border p-4 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-1">Add webhook</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Configure an external endpoint to receive event notifications.
              </p>
              <div className="space-y-4">
                <div>
                  <Label>Endpoint URL</Label>
                  <Input
                    placeholder="https://api.example.com/webhooks/wip"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Secret (optional)</Label>
                  <Input
                    type="password"
                    placeholder="Sent as X-WIP-Signature header"
                    value={newSecret}
                    onChange={(e) => setNewSecret(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Events to subscribe</Label>
                  <div className="space-y-2 mt-2">
                    {WEBHOOK_EVENTS.map((e) => (
                      <label key={e.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newEvents.includes(e.value)}
                          onChange={() => toggleEvent(e.value)}
                          className="rounded"
                        />
                        <span className="text-sm">{e.label}</span>
                        <code className="text-[10px] text-muted-foreground font-mono">{e.value}</code>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!newUrl.trim()}>
                  Create webhook
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── API Keys Section ───────────────────────────────────────────────────────

function ApiKeysSection() {
  const [keys, setKeys] = useState<{ id: string; name: string; lastUsedAt: string | null }[]>([
    { id: "key_abc123", name: "Production API", lastUsedAt: new Date().toISOString() },
  ]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a name for the API key");
      return;
    }
    const mockKey = `sk_${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}`;
    setCreatedKey(mockKey);
    setKeys([...keys, { id: `key_${Math.random().toString(36).substring(2, 8)}`, name: newKeyName, lastUsedAt: null }]);
    setNewKeyName("");
  };

  const handleRevoke = (id: string) => {
    setKeys(keys.filter((k) => k.id !== id));
    toast.success("API key revoked");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          API Keys
        </CardTitle>
        <CardDescription>
          Manage API keys used to programmatically interact with Workspace Intelligence Platform.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {createdKey && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-400 flex items-center gap-2">
              <Check className="h-4 w-4" />
              API Key Created
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-500 mt-1 mb-3">
              Please copy this key now. You won't be able to see it again!
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs flex-1 bg-white dark:bg-black px-3 py-2 rounded border break-all">
                {createdKey}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(createdKey);
                  toast.success("Copied to clipboard");
                }}
              >
                Copy
              </Button>
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setCreatedKey(null)}>Dismiss</Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Key name (e.g., 'Production Sync')"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Generate New Key
          </Button>
        </div>

        {keys.length > 0 ? (
          <div className="border rounded-lg overflow-hidden mt-4">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground border-b">
                <tr>
                  <th className="py-2 px-3 text-left font-medium">Name</th>
                  <th className="py-2 px-3 text-left font-medium">Key Prefix</th>
                  <th className="py-2 px-3 text-left font-medium">Last Used</th>
                  <th className="py-2 px-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-muted/20">
                    <td className="py-2 px-3 font-medium">{k.name}</td>
                    <td className="py-2 px-3 font-mono text-xs">sk_...{k.id.slice(-4)}</td>
                    <td className="py-2 px-3 text-muted-foreground text-xs">
                      {k.lastUsedAt ? formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true }) : "Never"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleRevoke(k.id)}>
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Key className="h-4 w-4"/>} title="No API keys" description="Create an API key to get started." />
        )}
      </CardContent>
    </Card>
  );
}
