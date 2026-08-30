// API client helpers — all calls go through Next.js API routes (no direct
// access to backend services from the browser, per the plan's guardrails).
//
// On 401 Unauthorized responses, the client automatically redirects to /login
// to prompt re-authentication.

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

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  let orgId = null;
  if (typeof window !== "undefined") {
    try {
      const storeStr = localStorage.getItem("wip-app-store");
      if (storeStr) {
        orgId = JSON.parse(storeStr)?.state?.selectedOrganizationId;
      }
    } catch {}
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> || {}),
  };
  
  if (orgId) {
    headers["x-organization-id"] = orgId;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    // On 401, the session has expired or is missing — redirect to login
    // On 403 with 2FA_REQUIRED, the user needs to complete 2FA — redirect to login
    const isUnauthorized = res.status === 401;
    const is2FaRequired = res.status === 403 && data?.error === "2FA_REQUIRED";

    if ((isUnauthorized || is2FaRequired) && typeof window !== "undefined") {
      const loginUrl = new URL("/login", window.location.origin);
      loginUrl.searchParams.set("next", window.location.pathname);
      window.location.href = loginUrl.toString();
      // Reject the promise so the component doesn't process stale state and avoids a memory leak
      return Promise.reject(new ApiError("Redirecting to login...", res.status));
    }
    throw new ApiError(
      data?.error || `Request failed (${res.status})`,
      res.status,
      data
    );
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};
