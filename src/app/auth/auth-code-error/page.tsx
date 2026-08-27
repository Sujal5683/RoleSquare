import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
            <AlertCircle className="h-8 w-8" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Authentication Error</h1>
        <p className="text-muted-foreground">
          There was an error verifying your authentication. This can happen if the link you clicked has expired or was already used, or if Google login is not correctly configured.
        </p>
        <Link 
          href="/login" 
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Login
        </Link>
      </div>
    </div>
  );
}
