"use client";

import { useAppStore } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { LandingView } from "@/components/views/landing-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { SourcesView } from "@/components/views/sources-view";
import { SourceBuilderView } from "@/components/views/source-builder-view";
import { DatasetsView } from "@/components/views/datasets-view";
import { DatasetDetailView } from "@/components/views/dataset-detail-view";
import { SchemaBuilderView } from "@/components/views/schema-builder-view";
import { AiStudioView } from "@/components/views/ai-studio-view";
import { OrganizationsView } from "@/components/views/organizations-view";
import { MembersView } from "@/components/views/members-view";
import { SharingView } from "@/components/views/sharing-view";
import { AuditView } from "@/components/views/audit-view";
import { SettingsView } from "@/components/views/settings-view";

export default function Home() {
  const view = useAppStore((s) => s.view);

  return (
    <AppShell>
      {view === "landing" && <LandingView />}
      {view === "dashboard" && <DashboardView />}
      {view === "sources" && <SourcesView />}
      {view === "source-builder" && <SourceBuilderView />}
      {view === "datasets" && <DatasetsView />}
      {view === "dataset-detail" && <DatasetDetailView />}
      {view === "schema-builder" && <SchemaBuilderView />}
      {view === "ai-studio" && <AiStudioView />}
      {view === "organizations" && <OrganizationsView />}
      {view === "members" && <MembersView />}
      {view === "sharing" && <SharingView />}
      {view === "audit" && <AuditView />}
      {view === "settings" && <SettingsView />}
    </AppShell>
  );
}
