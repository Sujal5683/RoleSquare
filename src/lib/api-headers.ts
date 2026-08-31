/**
 * api-headers.ts
 *
 * Standard HTTP headers for all JSON API responses.
 *
 * WHY: Next.js App Router GET route handlers may be cached at the Vercel edge
 * unless explicitly told not to. Without Cache-Control: no-store, stale data
 * can be served to clients even after mutations — particularly on the first
 * load after a deploy or after an edge-cached response is reused.
 *
 * Apply to every GET /api/* route that returns dynamic, user-specific data.
 */

/** Drop-in headers object for NextResponse.json() calls. */
export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

/**
 * Wraps a plain object with standard no-store cache headers.
 * Usage:
 *   return NextResponse.json(data, { headers: noStore() });
 */
export function noStore(): HeadersInit {
  return NO_STORE_HEADERS;
}
