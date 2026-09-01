// API client helpers — all calls go through Next.js API routes (no direct
// access to backend services from the browser, per the plan's guardrails).\n//
// On 401 Unauthorized responses, the client automatically redirects to /login
// to prompt re-authentication.
//
// Network resilience:
//   - 30s AbortController timeout (configurable) prevents requests from hanging
//     indefinitely on institutional/public Wi-Fi that drops long-lived TCP connections.
//   - Automatic retry (up to 3 times) for TypeError network failures (ECONNRESET,
//     "Failed to fetch", iOS "Load failed") with exponential backoff.
//   - Non-idempotent mutations (POST/PATCH/PUT/DELETE) are NOT retried to prevent
//     duplicate side effects.

import { withRetry } from "@/lib/with-retry";

/** Default timeout for all API requests (ms). Override per-call via options. */
const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static [Symbol.hasInstance](instance: any) {
    return instance?.name === "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "signal"> {
  /** Per-request timeout override in ms (default: 30 000) */
  timeoutMs?: number;
}

/**
 * Returns the active organization ID from Zustand's in-memory store.
 * Avoids the previous approach of `localStorage.getItem + JSON.parse` on every
 * request, which triggered a full parse of the serialized store each time.
 */
function getStoredOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    // Import inline to avoid circular dependencies — this module is loaded before
    // the store module in some bundler orderings.

    const { useAppStore } = require("@/lib/store");
    return useAppStore.getState().selectedOrganizationId ?? null;
  } catch {
    // Final fallback: parse localStorage (same as before, only reached on error)
    try {
      const storeStr = localStorage.getItem("wip-app-store");
      if (storeStr) {
        return JSON.parse(storeStr)?.state?.selectedOrganizationId ?? null;
      }
    } catch {}
    return null;
  }
}

async function request<T>(
  url: string,
  options?: RequestOptions
): Promise<T> {
  const orgId = getStoredOrgId();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> || {}),
  };

  if (orgId) {
    headers["x-organization-id"] = orgId;
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options ?? {};
  const method = (fetchOptions.method ?? "GET").toUpperCase();
  // Only retry idempotent methods (GET, HEAD) — retrying mutations can cause
  // duplicate side effects (double-creation, double-billing, etc.).
  const isIdempotent = method === "GET" || method === "HEAD";

  const doFetch = async (): Promise<T> => {
    const controller = new AbortController();
    const timerId = setTimeout(
      () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
      timeoutMs
    );

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) {
        // On 401, the session has expired or is missing — redirect to login.
        // On 403 with 2FA_REQUIRED, the user needs to complete 2FA.
        const isUnauthorized = res.status === 401;
        const is2FaRequired =
          res.status === 403 && data?.error === "2FA_REQUIRED";

        if ((isUnauthorized || is2FaRequired) && typeof window !== "undefined") {
          const loginUrl = new URL("/login", window.location.origin);
          loginUrl.searchParams.set("next", window.location.pathname);
          window.location.href = loginUrl.toString();
          // Reject so components don't process stale state
          return Promise.reject(new ApiError("Redirecting to login...", res.status));
        }
        throw new ApiError(
          data?.error || `Request failed (${res.status})`,
          res.status,
          data
        );
      }
      return data as T;
    } finally {
      clearTimeout(timerId);
    }
  };

  if (isIdempotent) {
    // Wrap GETs in withRetry so network-level drops are retried automatically.
    return withRetry(doFetch, {
      maxAttempts: 4,
      baseDelayMs: 300,
      label: url,
    });
  }

  // Non-idempotent methods: single attempt, no retry.
  return doFetch();
}

export const api = {
  get: <T>(url: string, opts?: RequestOptions) => request<T>(url, opts),
  post: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(url, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    }),
  patch: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(url, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    }),
  put: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(url, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    }),
  delete: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(url, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    }),
};
