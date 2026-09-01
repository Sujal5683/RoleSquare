// Server Component — runs on the server, fetches session before any client JS executes.
// This eliminates the blank-screen waterfall that occurred when the workspace was
// "use client" and had to wait for a /api/session round-trip before rendering anything.
//
// Flow (before this change):
//   Server → sends empty HTML shell
//   Client → hydrates, fires useEffect → GET /api/session (~200-300ms)
//   Client → receives session → renders nav/sidebar/content
//
// Flow (after this change):
//   Server → fetches session (~0ms extra, reuses the same in-process auth call)
//   Server → sends HTML with session data already embedded in the RSC payload
//   Client → hydrates with session data already available, no extra network call

import { getCurrentUser } from "@/lib/auth";
import { WorkspaceClient } from "./workspace-client";
import type { SessionUser } from "@/lib/store";

export default async function WorkspacePage() {
  // getCurrentUser() is wrapped with React cache() in auth.ts — if middleware or
  // another server component in the same request already called it, this is free.
  // If not, it validates the JWT locally (no network call) and fetches the user
  // row from the DB. Either way, the result is ready before the HTML is sent.
  let initialSession: {
    user: SessionUser;
    organizations: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      role: string;
      status: string;
    }[];
  } | null = null;

  try {
    const user = await getCurrentUser();
    initialSession = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name || user.email,
        avatarUrl: user.avatarUrl,
      },
      organizations: user.organizations.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        plan: o.plan,
        role: o.role,
        status: o.status,
      })),
    };
  } catch {
    // Auth failure is handled by middleware redirect to /login.
    // If we somehow reach here without a session, render the client which
    // will handle the 401 response via the api-client redirect logic.
  }

  return <WorkspaceClient initialSession={initialSession} />;
}
