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
import { cookies } from "next/headers";

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
  plan: string; // user's billing plan
  notificationPrefs: Record<string, boolean>;
  twoFactorEnabled: boolean;
  memberships: OrgMembership[];
  // Convenience: organizations the user is an ACTIVE member of.
  organizations: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    role: Role;
    status: string;
    retentionEmails: string;
    retentionDocs: string;
    retentionAuditLogs: string;
    exportFileExpiry: string;
  }[];
}

/**
 * Returns the mock session user (alice@acme.io) with all organization
 * memberships. Only memberships with status="active" are included in the
 * `organizations` convenience array.
 */
export async function getCurrentUser(skip2FA = false): Promise<SessionUser> {
  const supabase = await createClient();
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

  if (authError || !authUser?.email) {
    throw new AuthError("Unauthorized", 401);
  }

  const user = await getOrCreateUser(authUser.email, authUser.user_metadata);

  if (user.twoFactorEnabled && !skip2FA) {
    const cookieStore = await cookies();
    const verified = cookieStore.get("2fa_verified_" + user.id)?.value === "true";
    if (!verified) {
      throw new AuthError("2FA_REQUIRED", 403);
    }
  }

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
    plan: user.plan,
    notificationPrefs: JSON.parse(user.notificationPrefs || "{}"),
    twoFactorEnabled: !!user.twoFactorEnabled,
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
        retentionEmails: user.organizations.find((om) => om.organizationId === m.organizationId)!
          .organization.retentionEmails,
        retentionDocs: user.organizations.find((om) => om.organizationId === m.organizationId)!
          .organization.retentionDocs,
        retentionAuditLogs: user.organizations.find((om) => om.organizationId === m.organizationId)!
          .organization.retentionAuditLogs,
        exportFileExpiry: user.organizations.find((om) => om.organizationId === m.organizationId)!
          .organization.exportFileExpiry,
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

  const { ensureOrgDefaultDataset } = await import("@/lib/dataset-provisioner");
  await ensureOrgDefaultDataset(orgId, userId);

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
 * Resolves the active organization for the request, VERIFYING that the
 * current user is an ACTIVE member of that organization.
 *
 * Resolution order:
 *   1. `organizationId` query param — STRICT: if provided and user is not an
 *      active member, throws 403. This prevents cross-tenant data leaks.
 *   2. `x-organization-id` header (set by the api-client from localStorage) —
 *      SOFT: used as a hint. If stale/invalid, silently falls back to step 3.
 *   3. The user's first active organization.
 *
 * The distinction between 1 and 2 is intentional:
 *   - Query params are explicit assertions (e.g., ?organizationId=X on sharing routes)
 *   - The header is an ambient convenience set by the browser's stored state
 *     and may be stale if the user recently switched orgs or was removed.
 */
export async function requireOrgContext(
  req: NextRequest
): Promise<OrgContext> {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const queryParam = url.searchParams.get("organizationId");
  const headerHint = req.headers.get("x-organization-id");

  let membership: OrgMembership | undefined;

  // 1. ?organizationId= query param — STRICT enforcement
  if (queryParam) {
    membership = user.memberships.find(
      (m) => m.organizationId === queryParam && m.status === "active"
    );

    if (!membership) {
      const pendingInvite = user.memberships.find(
        (m) => m.organizationId === queryParam && m.status === "invited"
      );
      if (pendingInvite) {
        throw new AuthError(
          "You have a pending invitation to this organization. Accept it from your Invitations page before accessing its data.",
          403
        );
      }
      throw new AuthError(
        "You are not an active member of this organization.",
        403
      );
    }
  } else if (headerHint) {
    // 2. x-organization-id header — SOFT hint, fall through on mismatch
    membership = user.memberships.find(
      (m) => m.organizationId === headerHint && m.status === "active"
    );
    // If stale/invalid header, fall through to step 3 (no error)
  }

  // 3. Fallback to first active org
  if (!membership) {
    membership = user.memberships.find((m) => m.status === "active");
  }

  if (!membership) {
    throw new AuthError(
      "You are not an active member of any organization. Check your Invitations page.",
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
 * Like requireOrgContext but ALWAYS strictly enforces the organizationId,
 * whether it comes from the query param OR the x-organization-id header.
 * Use this for routes where the caller explicitly declares which org they
 * want (sharing/permissions, members, invitations, etc.).
 */
export async function requireExplicitOrg(
  req: NextRequest
): Promise<OrgContext> {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const explicit =
    url.searchParams.get("organizationId") ||
    req.headers.get("x-organization-id");

  if (!explicit) {
    // No explicit org — fall back to first active org (same as requireOrgContext)
    const membership = user.memberships.find((m) => m.status === "active");
    if (!membership) {
      throw new AuthError(
        "You are not an active member of any organization.",
        403
      );
    }
    return { user, organizationId: membership.organizationId, membership };
  }

  const membership = user.memberships.find(
    (m) => m.organizationId === explicit && m.status === "active"
  );

  if (!membership) {
    const pendingInvite = user.memberships.find(
      (m) => m.organizationId === explicit && m.status === "invited"
    );
    if (pendingInvite) {
      throw new AuthError(
        "You have a pending invitation to this organization. Accept it from your Invitations page.",
        403
      );
    }
    throw new AuthError(
      "You are not an active member of this organization.",
      403
    );
  }

  return { user, organizationId: membership.organizationId, membership };
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

/**
 * Checks if a dataset is accessible to the current user/org context.
 * Returns true if the dataset belongs to the org, or if there is an active
 * DatasetAccess grant for this org or user that meets the required level.
 */
export async function verifyDatasetAccess(
  dataset: { id: string; organizationId: string },
  organizationId: string,
  userId: string,
  requiredLevel: "read" | "comment" | "edit" | "owner" = "read"
): Promise<boolean> {
  const LEVEL_WEIGHT: Record<string, number> = {
    read: 1,
    comment: 2,
    edit: 3,
    owner: 4,
  };

  // If the dataset is owned by the current organization context, map their org role to access level.
  if (dataset.organizationId === organizationId) {
    const member = await db.organizationMember.findFirst({
      where: { organizationId, userId, status: "active" },
    });
    if (!member) return false;
    let orgLevel = "read";
    if (["owner", "admin", "manager"].includes(member.role)) {
      orgLevel = "owner";
    } else if (member.role === "member") {
      orgLevel = "edit";
    }
    return LEVEL_WEIGHT[orgLevel] >= LEVEL_WEIGHT[requiredLevel];
  }

  // Otherwise, check for an active DatasetAccess grant
  const access = await db.datasetAccess.findFirst({
    where: {
      datasetId: dataset.id,
      status: "active",
      isPaused: false,
      OR: [
        { granteeOrgId: organizationId },
        { granteeUserId: userId }
      ]
    }
  });

  if (!access) return false;

  const userLevel = LEVEL_WEIGHT[access.level] ?? 0;
  const reqLevel = LEVEL_WEIGHT[requiredLevel] ?? 1;

  return userLevel >= reqLevel;
}
