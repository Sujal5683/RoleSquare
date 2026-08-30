"use client";

import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes stale time
        gcTime: 24 * 60 * 60 * 1000, // 24 hours gc time
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const client = getQueryClient();
  const [persister, setPersister] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPersister(
        createSyncStoragePersister({
          storage: window.localStorage,
        })
      );
    }
  }, []);

  // Apply theme class to <html> based on store (synced with next-themes-style)
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  // Use PersistQueryClientProvider if persister is ready, otherwise standard QueryClientProvider (e.g. for SSR)
  const QueryProvider = persister ? PersistQueryClientProvider : QueryClientProvider;

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {persister ? (
        <PersistQueryClientProvider
          client={client}
          persistOptions={{
            persister,
            maxAge: 24 * 60 * 60 * 1000,
            dehydrateOptions: {
              shouldDehydrateQuery: (query) => {
                // Only persist specific query keys that are not highly sensitive
                const key = query.queryKey[0] as string;
                return ["schemas", "schema", "sources", "source", "dashboard", "datasets", "dataset"].includes(key);
              },
            },
          }}
        >
          {children}
        </PersistQueryClientProvider>
      ) : (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )}
    </ThemeProvider>
  );
}
