// Next.js Edge Middleware — session-based route protection.
//
// All routes except the login page and the Supabase/Google auth callbacks
// require a valid Supabase session cookie. Unauthenticated requests are
// redirected to /login.
//
// The middleware runs on the Edge Runtime using @supabase/ssr to refresh
// the session cookie on every request (keeping it alive).

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that are always publicly accessible (no auth required)
const PUBLIC_PATHS = [
  "/",
  "/about",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/login",
  "/api/auth/callback",              // Supabase email code exchange
  "/api/google/callback",            // Google OAuth token exchange (Gmail/Drive)
  "/api/google-sheets/auth/callback", // Google OAuth token exchange (Sheets)
  "/api/health",                     // health check
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Propagate cookie mutations from the Supabase client to the response
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session — IMPORTANT: do not add code between createServerClient
  // and getUser() as it may cause subtle cookie-refresh bugs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If no session and the route is not public, redirect to /login
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // Preserve the original destination so we can redirect back after login
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
