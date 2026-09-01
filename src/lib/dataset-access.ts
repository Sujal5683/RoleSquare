// RoleSquare — Dataset Access Resolution
//
// Single source of truth for answering "can this user/org see this dataset?".
// Used by all dataset-reading API routes to enforce access control.

import { db } from "@/lib/db";

export type AccessLevel = "owner" | "read" | "comment" | "edit" | "none";

export interface AccessResult {
  allowed: boolean;
  level: AccessLevel;
  isOwner: boolean;
  accessId?: string; // DatasetAccess.id if grant-based
}

/**
 * Resolves whether a user (with their active org) may access a dataset.
 *
 * Checks in priority order:
 *  1. Ownership — dataset belongs to the user's active org → "owner"
 *  2. Org-level DatasetAccess grant → respects the granted level
 *  3. User-level DatasetAccess grant → respects the granted level
 *
 * Returns { allowed: false, level: "none" } if no access found.
 */
export async function resolveDatasetAccess(
  datasetId: string,
  userId: string,
  orgId: string
): Promise<AccessResult> {
  // 1. Check ownership
  const dataset = await db.dataset.findUnique({
    where: { id: datasetId },
    select: { organizationId: true },
  });

  if (!dataset) {
    return { allowed: false, level: "none", isOwner: false };
  }

  if (dataset.organizationId === orgId) {
    return { allowed: true, level: "owner", isOwner: true };
  }

  // 2 & 3. Check org-level and user-level grants in parallel
  const [orgAccess, userAccess] = await Promise.all([
    db.datasetAccess.findFirst({
      where: {
        datasetId,
        granteeOrgId: orgId,
        status: "active",
        isPaused: false,
      },
      select: { id: true, level: true },
    }),
    db.datasetAccess.findFirst({
      where: {
        datasetId,
        granteeUserId: userId,
        status: "active",
        isPaused: false,
      },
      select: { id: true, level: true },
    }),
  ]);

  // Org grant takes precedence over user grant
  if (orgAccess) {
    return {
      allowed: true,
      level: orgAccess.level as AccessLevel,
      isOwner: false,
      accessId: orgAccess.id,
    };
  }

  if (userAccess) {
    return {
      allowed: true,
      level: userAccess.level as AccessLevel,
      isOwner: false,
      accessId: userAccess.id,
    };
  }

  return { allowed: false, level: "none", isOwner: false };
}

/**
 * Returns all dataset IDs that a user (userId + orgId) can access.
 * Used by the datasets list endpoint to include shared datasets.
 */
export async function getAccessibleDatasetIds(
  userId: string,
  orgId: string
): Promise<{
  ownedIds: string[];
  sharedAccesses: Array<{
    datasetId: string;
    level: string;
    accessId: string;
    ownerOrgId: string;
  }>;
}> {
  // Run all three queries in parallel — they are independent
  const [ownedDatasets, orgGrants, userGrants] = await Promise.all([
    db.dataset.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    }),
    db.datasetAccess.findMany({
      where: { granteeOrgId: orgId, status: "active", isPaused: false },
      select: { id: true, datasetId: true, level: true, ownerOrgId: true },
    }),
    db.datasetAccess.findMany({
      where: { granteeUserId: userId, status: "active", isPaused: false },
      select: { id: true, datasetId: true, level: true, ownerOrgId: true },
    }),
  ]);

  const ownedIds = ownedDatasets.map((d) => d.id);

  // Merge, deduplicate (org grant takes precedence if both exist)
  const sharedMap = new Map<
    string,
    { datasetId: string; level: string; accessId: string; ownerOrgId: string }
  >();

  for (const g of [...orgGrants, ...userGrants]) {
    if (!ownedIds.includes(g.datasetId) && !sharedMap.has(g.datasetId)) {
      sharedMap.set(g.datasetId, {
        datasetId: g.datasetId,
        level: g.level,
        accessId: g.id,
        ownerOrgId: g.ownerOrgId,
      });
    }
  }

  return {
    ownedIds,
    sharedAccesses: Array.from(sharedMap.values()),
  };
}

/**
 * Verifies that a user has write access to a dataset.
 * Uses parallel queries to minimize latency.
 */
export async function verifyDatasetWriteAccess(
  datasetId: string,
  userId: string,
  orgId: string
): Promise<boolean> {
  const dataset = await db.dataset.findUnique({
    where: { id: datasetId },
    select: { organizationId: true },
  });
  if (!dataset) return false;

  if (dataset.organizationId === orgId) {
    const member = await db.organizationMember.findFirst({
      where: { organizationId: orgId, userId, status: "active" },
      select: { role: true },
    });
    if (!member) return false;
    return ["owner", "admin", "manager", "member"].includes(member.role);
  }

  const access = await db.datasetAccess.findFirst({
    where: {
      datasetId,
      status: "active",
      isPaused: false,
      OR: [{ granteeOrgId: orgId }, { granteeUserId: userId }],
    },
    select: { level: true },
  });
  if (!access) return false;
  return ["edit", "owner"].includes(access.level);
}
