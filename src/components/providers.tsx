"use client";

import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // staleTime=0 → stale-while-revalidate: cached data shows instantly,
        // background refetch always runs. This is the correct setting for a
        // real-time app — data is shown from cache immediately but never
        // considered "fresh" (always revalidated in the background).
        staleTime: 0,

        // Keep unused data for 10 minutes before garbage collecting.
        // Reduced from 24h to avoid stale records accumulating in memory.
        gcTime: 10 * 60 * 1000,

        // Always refetch when the browser window regains focus.
        // This means switching tabs and coming back always refreshes stale data.
        refetchOnWindowFocus: true,

        // Always refetch when a component mounts (navigating to a view).
        refetchOnMount: true,

        // Reconnect refetch — useful when going offline/online
        refetchOnReconnect: true,

        // Retry failed requests up to 2 times with exponential backoff
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
      mutations: {
        // Surface errors by default unless the mutation has its own onError
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
