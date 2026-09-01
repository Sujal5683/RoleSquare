"use client";

import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // staleTime=30s — data is considered fresh for 30 seconds after a fetch.
        // After 30s it becomes stale and will be refetched in the background on
        // next mount/focus. For real-time data, the Supabase Realtime channel in
        // app-shell.tsx already invalidates caches the moment the DB changes, so
        // this window doesn't cause stale data to linger — it only prevents
        // unnecessary refetches when data genuinely hasn't changed.
        staleTime: 30_000,

        // Keep unused data for 10 minutes before garbage collecting.
        gcTime: 10 * 60 * 1000,

        // Do NOT refetch on window focus — Supabase Realtime push invalidations
        // handle data freshness. Re-fetching every tab-switch floods the server.
        refetchOnWindowFocus: false,

        // Refetch when a component first mounts if data is stale (older than staleTime).
        refetchOnMount: true,

        // Reconnect refetch — useful when going offline/online.
        refetchOnReconnect: true,

        // Retry failed requests up to 2 times with exponential backoff.
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
      mutations: {
        // Surface errors by default unless the mutation has its own onError.
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const client = getQueryClient();

  // Apply theme class to <html> based on store (synced with next-themes-style)
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
