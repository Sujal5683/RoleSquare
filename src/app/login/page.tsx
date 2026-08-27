"use client";

import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

type Mode = "login" | "signup" | "forgot" | "2fa";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  let next = searchParams.get("next") || "/";
  if (!next.startsWith("/") || next.startsWith("//")) {
    next = "/";
  }

  const initialMode = (searchParams.get("mode") as Mode) || "login";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token2fa, setToken2fa] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const supabase = createClient();

  // If already logged in, check if 2FA is needed
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetch("/api/session").then(async (res) => {
          if (res.ok) {
            router.replace(next);
          } else if (res.status === 403) {
            const data = await res.json();
            if (data.error === "2FA_REQUIRED") {
              setMode("2fa");
            }
          } else if (res.status === 401) {
            // normal, not logged in according to our backend (maybe missing user row)
            supabase.auth.signOut();
          }
        });
      }
    });
  }, [next, router, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === "2fa") {
        const res = await fetch("/api/2fa/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token2fa }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Invalid 2FA token");
        }
        router.push(next);
        router.refresh();
        return;
      }

      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/api/auth/callback?next=/`,
        });
        if (error) throw error;
        setSuccess("Check your email for a password reset link.");
        return;
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${next}`,
          },
        });
        if (error) throw error;
        setSuccess(
          "Account created! Check your email to confirm your address, then sign in."
        );
        return;
      }

      // Login
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      // Check if 2FA is required
      const res = await fetch("/api/session");
      if (!res.ok) {
        if (res.status === 403) {
          const data = await res.json();
          if (data.error === "2FA_REQUIRED") {
            setMode("2fa");
            return;
          }
        }
        throw new Error("Failed to initialize session");
      }

      // Session is set — redirect to the app
      router.push(next);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const TITLES: Record<Mode, string> = {
    login: "Sign in to your account",
    signup: "Create your account",
    forgot: "Reset your password",
    "2fa": "Two-Factor Authentication",
  };

  const SUBTITLES: Record<Mode, string> = {
    login: "Turn Google Workspace into structured datasets",
    signup: "Start building AI-powered datasets from Gmail & Drive",
    forgot: "We'll send a reset link to your email",
    "2fa": "Enter the code from your authenticator app",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/3 h-96 w-96 rounded-full bg-violet-500/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-64 w-64 rounded-full bg-fuchsia-500/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-8">
        {/* Back to Home Button */}
        <Link 
          href="/" 
          className="absolute -top-16 left-0 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Link>

        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="inline-block">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform">
              <Zap className="h-6 w-6" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {TITLES[mode]}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {SUBTITLES[mode]}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex items-start gap-2.5 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                <span>✓ {success}</span>
              </div>
            )}

            {/* 2FA Mode */}
            {mode === "2fa" && (
              <div className="space-y-1.5">
                <label htmlFor="token2fa" className="text-sm font-medium text-foreground">
                  Authentication Code
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="token2fa"
                    type="text"
                    required
                    autoComplete="one-time-code"
                    value={token2fa}
                    onChange={(e) => setToken2fa(e.target.value)}
                    placeholder="6-digit code"
                    className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring focus:ring-offset-2 transition"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
            )}

            {/* Email */}
            {mode !== "2fa" && (
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring focus:ring-offset-2 transition"
                  />
                </div>
              </div>
            )}

            {/* Password (not shown for forgot or 2fa) */}
            {mode !== "forgot" && mode !== "2fa" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-foreground">
                    Password
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="password"
                    type={showPass ? "text" : "password"}
                    required
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Min. 8 characters" : "Your password"}
                    minLength={mode === "signup" ? 8 : undefined}
                    className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-10 text-sm outline-none ring-offset-background placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring focus:ring-offset-2 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label="Toggle password visibility"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-60 transition-all"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {mode === "login" && "Sign in"}
                  {mode === "signup" && "Create account"}
                  {mode === "forgot" && "Send reset link"}
                  {mode === "2fa" && "Verify code"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Mode switcher */}
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" && (
              <>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => { setMode("signup"); setError(null); setSuccess(null); }}
                  className="font-medium text-primary hover:underline"
                >
                  Sign up
                </button>
              </>
            )}
            {mode === "signup" && (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
                  className="font-medium text-primary hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
            {(mode === "2fa" || mode === "forgot") && (
              <button
                type="button"
                onClick={async () => { 
                  if (mode === "2fa") {
                    await fetch("/api/auth/logout", { method: "POST" });
                  }
                  setMode("login"); 
                  setError(null); 
                  setSuccess(null); 
                  setToken2fa("");
                }}
                className="font-medium text-primary hover:underline"
              >
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Workspace Intelligence Platform · Secured by Supabase Auth
        </p>
      </div>
    </div>
  );
}
