// Workspace Intelligence Platform — server-side authorization helpers.
//
// This module provides the ONLY entry point for resolving the current
// session user and their active organization context. All API routes
// MUST use `requireOrgContext` (or a role-specific variant) to ensure:
//
//   1. The user is a real, active member of the organization.
//   2. The user has the required role for the action.
//   3. Removed/invited members cannot access data.
//   4. Cross-tenant access via `?organizationId=<other_org>` is blocked.
//
// The session is currently mock-authenticated as alice@acme.io. When real
// auth is added, only `getCurrentUser` needs to change — the role checks
// and membership enforcement stay the same.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "manager" | "member" | "viewer";

// Role hierarchy: a role can perform actions allowed to its level OR
// any level below it. owner > admin > manager > member > viewer.
const ROLE_LEVEL: Record<Role, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

export interface OrgMembership {
  id: string; // OrganizationMember.id
  organizationId: string;
  userId: string;
  role: Role;
  status: string; // active | invited | removed
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string; // global role: user | admin
  memberships: OrgMembership[];
  // Convenience: organizations the user is an ACTIVE member of.
  organizations: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    role: Role;
    status: string;
  }[];
}

/**
 * Returns the mock session user (alice@acme.io) with all organization
 * memberships. Only memberships with status="active" are included in the
 * `organizations` convenience array.
 */
export async function getCurrentUser(): Promise<SessionUser> {
  const supabase = await createClient();
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

  if (authError || !authUser?.email) {
    throw new AuthError("Unauthorized", 401);
  }

  const user = await getOrCreateUser(authUser.email, authUser.user_metadata);

  const memberships: OrgMembership[] = user.organizations.map((m) => ({
    id: m.id,
    organizationId: m.organizationId,
    userId: m.userId,
    role: m.role as Role,
    status: m.status,
  }));

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    memberships,
    organizations: memberships
      .filter((m) => m.status === "active")
      .map((m) => ({
        id: m.organizationId,
        name: user.organizations.find((om) => om.organizationId === m.organizationId)!
          .organization.name,
        slug: user.organizations.find((om) => om.organizationId === m.organizationId)!
          .organization.slug,
        plan: user.organizations.find((om) => om.organizationId === m.organizationId)!
          .organization.plan,
        role: m.role,
        status: m.status,
      })),
  };
}

/**
 * Finds the User row for a given email. If it doesn't exist (first login),
 * auto-creates:
 *   1. A User row linked to the Supabase Auth identity.
 *   2. A default Organization (slug derived from email domain).
 *   3. An OrganizationMember row with role="owner".
 *
 * This makes signup completely self-service — no manual DB seeding needed.
 */
async function getOrCreateUser(
  email: string,
  metadata: Record<string, unknown> = {}
) {
  const existing = await db.user.findFirst({
    where: { email },
    include: { organizations: { include: { organization: true } } },
  });
  if (existing) return existing;

  // --- First login: provision user + org ---
  const name = (metadata.full_name as string) || (metadata.name as string) || email.split("@")[0];
  const avatarUrl = (metadata.avatar_url as string) || null;

  // Derive org slug from the email domain (or username if personal)
  const [localPart, domain] = email.split("@");
  const orgName = domain && !["gmail.com", "outlook.com", "yahoo.com", "hotmail.com"].includes(domain)
    ? domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1)
    : `${localPart}'s Workspace`;
  const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Ensure slug uniqueness
  let slug = baseSlug;
  let attempt = 0;
  while (await db.organization.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  // Transactionally create user + org + member
  const userId = (await import("crypto")).randomUUID();
  const orgId = (await import("crypto")).randomUUID();
  const memberId = (await import("crypto")).randomUUID();

  const newUser = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { id: userId, email, name, avatarUrl, role: "user" },
    });
    const org = await tx.organization.create({
      data: { id: orgId, name: orgName, slug, createdBy: userId },
    });
    await tx.organizationMember.create({
      data: {
        id: memberId,
        organizationId: org.id,
        userId: user.id,
        role: "owner",
        status: "active",
      },
    });
    return user;
  });

  // Reload with full relations
  return db.user.findFirstOrThrow({
    where: { id: newUser.id },
    include: { organizations: { include: { organization: true } } },
  });
}


/**
 * Resolves the active organization for the request, VERIFYING that the
 * current user is an ACTIVE member of that organization.
 *
 * Resolution order:
 *   1. `organizationId` query param — IF the user is an active member.
 *   2. The user's first active organization (fallback).
 *
 * If the user passes `?organizationId=<org_they_dont_belong_to>`, this
 * returns a 403 Forbidden response instead of leaking data.
 */
export async function getCurrentOrgId(
  req: NextRequest
): Promise<{ organizationId: string; error?: NextResponse }> {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const explicit = url.searchParams.get("organizationId") || req.headers.get("x-organization-id");

  if (explicit) {
    const membership = user.memberships.find(
      (m) => m.organizationId === explicit && m.status === "active"
    );
    if (membership) {
      return { organizationId: explicit };
    }
    // If explicit is invalid/stale, we just fall through to the fallback below.
  }

  const firstActive = user.organizations[0];
  if (!firstActive) {
    return {
      organizationId: "",
      error: NextResponse.json(
        { error: "You are not an active member of any organization" },
        { status: 403 }
      ),
    };
  }
  return { organizationId: firstActive.id };
}

export interface OrgContext {
  user: SessionUser;
  organizationId: string;
  membership: OrgMembership;
}

/**
 * Returns the session user + active org + membership, VERIFYING that the
 * user is an ACTIVE member. If the user passes `?organizationId=` for an
 * org they don't belong to (or are removed/invited-only), this automatically
 * falls back to their first active organization. If they have none, it throws 403.
 */
export async function requireOrgContext(
  req: NextRequest
): Promise<OrgContext> {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const explicit = url.searchParams.get("organizationId") || req.headers.get("x-organization-id");

  let membership: OrgMembership | undefined;

  if (explicit) {
    membership = user.memberships.find((m) => m.organizationId === explicit && m.status === "active");
  }
  
  if (!membership) {
    membership = user.memberships.find((m) => m.status === "active");
  }

  if (!membership) {
    throw new AuthError(
      "You do not have access to this organization",
      403
    );
  }

  return {
    user,
    organizationId: membership.organizationId,
    membership,
  };
}

/**
 * Returns the session user + org context, VERIFYING that the user's role
 * meets the minimum required level.
 *
 * Usage:
 *   const ctx = await requireRole(req, "manager");
 *   // ctx.user, ctx.organizationId, ctx.membership
 */
export async function requireRole(
  req: NextRequest,
  minRole: Role
): Promise<OrgContext> {
  const ctx = await requireOrgContext(req);
  const userLevel = ROLE_LEVEL[ctx.membership.role] ?? 0;
  const requiredLevel = ROLE_LEVEL[minRole];

  if (userLevel < requiredLevel) {
    throw new AuthError(
      `This action requires ${minRole} role or higher. You are a ${ctx.membership.role}.`,
      403
    );
  }

  return ctx;
}

/**
 * Returns true if the given role meets the minimum required level.
 */
export function hasRole(userRole: string, minRole: Role): boolean {
  const userLevel = ROLE_LEVEL[userRole as Role] ?? 0;
  const requiredLevel = ROLE_LEVEL[minRole];
  return userLevel >= requiredLevel;
}

/**
 * Error class for authorization failures. Route handlers should catch
 * this and return the appropriate HTTP response.
 */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 403) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Converts an AuthError (or any error) into a NextResponse. Route handlers
 * should use this in their catch block:
 *
 *   } catch (err) {
 *     if (err instanceof AuthError) {
 *       return authErrorResponse(err);
 *     }
 *     return NextResponse.json({ error: "..." }, { status: 500 });
 *   }
 */
export function authErrorResponse(err: AuthError): NextResponse {
  return NextResponse.json(
    { error: err.message },
    { status: err.status }
  );
}
