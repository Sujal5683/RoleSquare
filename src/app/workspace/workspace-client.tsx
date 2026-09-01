"use client";

import { useAppStore, type SessionUser } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { GlobalProgress } from "@/components/layout/global-progress";
import { DashboardView } from "@/components/views/dashboard-view";
import { SourcesView } from "@/components/views/sources-view";
import { SourceBuilderView } from "@/components/views/source-builder-view";
import { DatasetsView } from "@/components/views/datasets-view";
import { DatasetDetailView } from "@/components/views/dataset-detail-view";
import { SchemaBuilderView } from "@/components/views/schema-builder-view";
import { AiStudioView } from "@/components/views/ai-studio-view";
import { UsageView } from "@/components/views/usage-view";
import { OrganizationsView } from "@/components/views/organizations-view";
import { MembersView } from "@/components/views/members-view";
import { SharingView } from "@/components/views/sharing/sharing-view";
import { AuditView } from "@/components/views/audit-view";
import { SettingsView } from "@/components/views/settings-view";
import { InvitationsView } from "@/components/views/invitations-view";

interface InitialSession {
  user: SessionUser;
  organizations: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    role: string;
    status: string;
  }[];
}

interface WorkspaceClientProps {
  initialSession: InitialSession | null;
}

export function WorkspaceClient({ initialSession }: WorkspaceClientProps) {
  const view = useAppStore((s) => s.view);

  return (
    <AppShell initialSession={initialSession}>
      {view === "dashboard" && <DashboardView />}
      {view === "sources" && <SourcesView />}
      {view === "source-builder" && <SourceBuilderView />}
      {view === "datasets" && <DatasetsView />}
      {view === "dataset-detail" && <DatasetDetailView />}
      {view === "schema-builder" && <SchemaBuilderView />}
      {view === "ai-studio" && <AiStudioView />}
      {view === "usage" && <UsageView />}
      {view === "organizations" && <OrganizationsView />}
      {view === "members" && <MembersView />}
      {view === "invitations" && <InvitationsView />}
      {view === "sharing" && <SharingView />}
      {view === "audit" && <AuditView />}
      {view === "settings" && <SettingsView />}
      <GlobalProgress />
    </AppShell>
  );
}
