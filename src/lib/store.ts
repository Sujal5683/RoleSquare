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

// Recently viewed item — tracked when the user opens a dataset, source,
// schema, or record. Capped to 10 entries (most recent first).
export interface RecentItem {
  id: string;
  type: "dataset" | "source" | "schema" | "record";
  name: string;
  timestamp: number;
}

interface AppState {
  // Navigation
  view: ViewId;
  setView: (v: ViewId) => void;

  // Context selections (carried between views)
  selectedOrganizationId: string | null;
  setOrganization: (id: string) => void;

  selectedSourceId: string | null;
  openSource: (id: string | null, name?: string) => void;

  selectedDatasetId: string | null;
  openDataset: (id: string | null, name?: string) => void;

  selectedSchemaId: string | null;
  openSchema: (id: string | null, name?: string) => void;

  selectedRecordId: string | null;
  openRecord: (id: string | null) => void;

  // Sidebar collapse (mobile)
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Sidebar collapse (desktop)
  desktopSidebarOpen: boolean;
  setDesktopSidebarOpen: (open: boolean) => void;

  // Theme
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (t: "light" | "dark") => void;

  // AI Assistant panel
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  assistantUnread: number;
  bumpAssistantUnread: () => void;
  clearAssistantUnread: () => void;

  // Recently viewed items (persisted across sessions)
  recentItems: RecentItem[];
  addRecent: (item: Omit<RecentItem, "timestamp">) => void;
  clearRecent: () => void;
  removeRecent: (id: string) => void;
}

const MAX_RECENT = 10;

function pushRecent(list: RecentItem[], item: Omit<RecentItem, "timestamp">): RecentItem[] {
  const next = list.filter((i) => i.id !== item.id);
  return [{ ...item, timestamp: Date.now() }, ...next].slice(0, MAX_RECENT);
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: "landing",
      setView: (v) => set({ view: v }),

      selectedOrganizationId: null,
      setOrganization: (id) => set({ selectedOrganizationId: id }),

      selectedSourceId: null,
      openSource: (id, name) =>
        set((s) => ({
          selectedSourceId: id,
          view: "source-builder",
          ...(id
            ? {
                recentItems: pushRecent(s.recentItems, {
                  id,
                  type: "source" as const,
                  name: name || id,
                }),
              }
            : {}),
        })),

      selectedDatasetId: null,
      openDataset: (id, name) =>
        set((s) => ({
          selectedDatasetId: id,
          view: "dataset-detail",
          ...(id
            ? {
                recentItems: pushRecent(s.recentItems, {
                  id,
                  type: "dataset" as const,
                  name: name || id,
                }),
              }
            : {}),
        })),

      selectedSchemaId: null,
      openSchema: (id, name) =>
        set((s) => ({
          selectedSchemaId: id,
          view: "schema-builder",
          ...(id
            ? {
                recentItems: pushRecent(s.recentItems, {
                  id,
                  type: "schema" as const,
                  name: name || id,
                }),
              }
            : {}),
        })),

      selectedRecordId: null,
      openRecord: (id) => set({ selectedRecordId: id }),

      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      desktopSidebarOpen: true,
      setDesktopSidebarOpen: (open) => set({ desktopSidebarOpen: open }),

      theme: "light",
      toggleTheme: () =>
        set({ theme: get().theme === "light" ? "dark" : "light" }),
      setTheme: (t) => set({ theme: t }),

      assistantOpen: false,
      setAssistantOpen: (open) => set({ assistantOpen: open }),
      assistantUnread: 0,
      bumpAssistantUnread: () =>
        set((s) => ({ assistantUnread: s.assistantUnread + 1 })),
      clearAssistantUnread: () => set({ assistantUnread: 0 }),

      recentItems: [],
      addRecent: (item) =>
        set((s) => ({ recentItems: pushRecent(s.recentItems, item) })),
      clearRecent: () => set({ recentItems: [] }),
      removeRecent: (id) =>
        set((s) => ({ recentItems: s.recentItems.filter((i) => i.id !== id) })),
    }),
    {
      name: "wip-app-store",
      partialize: (s) => ({
        view: s.view,
        selectedOrganizationId: s.selectedOrganizationId,
        theme: s.theme,
        recentItems: s.recentItems,
        desktopSidebarOpen: s.desktopSidebarOpen,
      }),
    }
  )
);
