"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ViewId } from "./types";

// Session context (mock auth — the platform assumes the logged-in user
// is alice@acme.io owner of Acme Intelligence for demo purposes)
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface AppState {
  // Navigation
  view: ViewId;
  setView: (v: ViewId) => void;

  // Context selections (carried between views)
  selectedOrganizationId: string | null;
  setOrganization: (id: string) => void;

  selectedSourceId: string | null;
  openSource: (id: string | null) => void;

  selectedDatasetId: string | null;
  openDataset: (id: string | null) => void;

  selectedSchemaId: string | null;
  openSchema: (id: string | null) => void;

  selectedRecordId: string | null;
  openRecord: (id: string | null) => void;

  // Sidebar collapse (mobile)
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Theme
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (t: "light" | "dark") => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: "landing",
      setView: (v) => set({ view: v }),

      selectedOrganizationId: null,
      setOrganization: (id) => set({ selectedOrganizationId: id }),

      selectedSourceId: null,
      openSource: (id) => set({ selectedSourceId: id, view: "source-builder" }),

      selectedDatasetId: null,
      openDataset: (id) => set({ selectedDatasetId: id, view: "dataset-detail" }),

      selectedSchemaId: null,
      openSchema: (id) => set({ selectedSchemaId: id, view: "schema-builder" }),

      selectedRecordId: null,
      openRecord: (id) => set({ selectedRecordId: id }),

      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      theme: "light",
      toggleTheme: () =>
        set({ theme: get().theme === "light" ? "dark" : "light" }),
      setTheme: (t) => set({ theme: t }),
    }),
    {
      name: "wip-app-store",
      partialize: (s) => ({
        view: s.view,
        selectedOrganizationId: s.selectedOrganizationId,
        theme: s.theme,
      }),
    }
  )
);
