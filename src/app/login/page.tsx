"use client";

import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";

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
  
  let next = searchParams.get("next") || "/workspace";
  if (!next.startsWith("/") || next.startsWith("//") || next === "/") {
    next = "/workspace";
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
        let origin = window.location.origin;
        if (origin.includes("0.0.0.0")) origin = origin.replace("0.0.0.0", "localhost");
        
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/api/auth/callback?next=/workspace`,
        });
        if (error) throw error;
        setSuccess("Check your email for a password reset link.");
        return;
      }

      if (mode === "signup") {
        let origin = window.location.origin;
        if (origin.includes("0.0.0.0")) origin = origin.replace("0.0.0.0", "localhost");
        
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${origin}/api/auth/callback?next=${next}`,
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

  function getRedirectUrl(nextPath: string) {
    let origin = window.location.origin;
    // Browser quirk: if origin is 0.0.0.0, replace it with localhost so the redirect doesn't fail
    if (origin.includes("0.0.0.0")) {
      origin = origin.replace("0.0.0.0", "localhost");
    }
    return `${origin}/api/auth/callback?next=${nextPath}`;
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl(next),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong with Google sign-in");
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
          className="absolute -top-16 left-0 flex items-center text-sm font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground px-3 py-1.5 rounded-md transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Link>

        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="inline-block">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-transparent shadow-lg hover:scale-105 transition-transform">
              <img src="/Logo.svg" alt="RoleSquare Logo" className="h-full w-full object-contain" />
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
                <div className="flex justify-center py-2">
                  <InputOTP
                    maxLength={6}
                    value={token2fa}
                    onChange={(val) => setToken2fa(val.replace(/\D/g, ""))}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
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

          {/* Social Logins */}
          {(mode === "login" || mode === "signup") && (
            <div className="mt-6">
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border bg-background py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-60 transition-all"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google
              </button>
            </div>
          )}

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
                className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition"
              >
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          RoleSquare · Secured by Supabase Auth
        </p>
      </div>
    </div>
  );
}
