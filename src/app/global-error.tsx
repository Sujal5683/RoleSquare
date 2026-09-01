"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-background text-foreground">
          <div className="mx-auto flex max-w-md flex-col items-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-10 w-10" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">Critical Error</h2>
              <p className="text-muted-foreground">
                A critical error occurred at the root level of the application.
              </p>
            </div>

            <div className="flex gap-4 mt-4">
              <Button onClick={() => reset()} size="lg">
                Try again
              </Button>
              <Button variant="outline" size="lg" onClick={() => window.location.href = '/'}>
                Go Home
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
