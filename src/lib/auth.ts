// Workspace Intelligence Platform — mock auth helpers.
//
// This is a single-org demo: the "session" is hardcoded to alice@acme.io,
// owner of the Acme Intelligence org. No real auth is performed.
// `requireOrgContext` returns the current user plus the active org id,
// sourced either from the `organizationId` query param or the user's
// first org as fallback.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";

const SESSION_EMAIL = "alice@acme.io";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  organizations: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    role: string;
    status: string;
  }[];
}

/**
 * Returns the mock session user (alice@acme.io) together with the list of
 * organizations she belongs to and her role in each.
 */
export async function getCurrentUser(): Promise<SessionUser> {
  const user = await db.user.findFirst({
    where: { email: SESSION_EMAIL },
    include: {
      organizations: { include: { organization: true } },
    },
  });
  if (!user) {
    throw new Error("Session user not found — did the seed run?");
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    organizations: user.organizations.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      plan: m.organization.plan,
      role: m.role,
      status: m.status,
    })),
  };
}

/**
 * Returns the active organization id for the current request:
 *   - prefers an `organizationId` query param if provided
 *   - falls back to the user's first org (Acme Intelligence)
 */
export async function getCurrentOrgId(req: NextRequest): Promise<string> {
  const url = new URL(req.url);
  const explicit = url.searchParams.get("organizationId");
  if (explicit) return explicit;

  const user = await getCurrentUser();
  const first = user.organizations[0];
  if (!first) {
    throw new Error("User does not belong to any organization");
  }
  return first.id;
}

export interface OrgContext {
  user: SessionUser;
  organizationId: string;
}

/**
 * Returns the session user + active org id, throwing on failure.
 * Use inside a try/catch in route handlers; on error respond with 500.
 */
export async function requireOrgContext(req: NextRequest): Promise<OrgContext> {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const explicit = url.searchParams.get("organizationId");
  let organizationId: string | undefined;
  if (explicit) {
    organizationId = explicit;
  } else {
    organizationId = user.organizations[0]?.id;
  }
  if (!organizationId) {
    throw new Error("No active organization for current user");
  }
  return { user, organizationId };
}
