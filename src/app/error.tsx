"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("App Router Error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-8 w-8" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Something went wrong!</h2>
          <p className="text-muted-foreground">
            An unexpected error occurred while loading this page. Our team has been notified.
          </p>
        </div>

        {error.message && (
          <Alert variant="destructive" className="text-left w-full">
            <AlertTitle>Error details</AlertTitle>
            <AlertDescription className="font-mono text-xs break-all">
              {error.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-4">
          <Button onClick={() => reset()} size="lg">
            Try again
          </Button>
          <Button variant="outline" size="lg" onClick={() => window.location.href = '/'}>
            Go Home
          </Button>
        </div>
      </div>
    </div>
  );
}
