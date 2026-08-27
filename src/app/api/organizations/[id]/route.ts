// GET /api/organizations/[id] — organization detail.
//   Requires: active member of the org (viewer+).
// PATCH /api/organizations/[id] — update name / plan.
//   Requires: admin+ role.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeOrganization } from "@/lib/serialize";

const ROLE_LEVEL: Record<string, number> = {
  owner: 5, admin: 4, manager: 3, member: 2, viewer: 1,
};

async function verifyOrgAccess(organizationId: string, minRole: string = "viewer") {
  const user = await getCurrentUser();
  const membership = user.memberships.find((m) => m.organizationId === organizationId);
  if (!membership || membership.status !== "active") {
    return { error: NextResponse.json({ error: "Organization not found" }, { status: 404 }), user: null, membership: null };
  }
  if ((ROLE_LEVEL[membership.role] ?? 0) < (ROLE_LEVEL[minRole] ?? 0)) {
    return {
      error: NextResponse.json(
        { error: `This action requires ${minRole} role or higher. You are a ${membership.role}.` },
        { status: 403 }
      ),
      user: null,
      membership: null,
    };
  }
  return { error: null, user, membership };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await verifyOrgAccess(id, "viewer");
    if (access.error) return access.error;

    const org = await db.organization.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      serializeOrganization(org, org._count?.members ?? 0)
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load org" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await verifyOrgAccess(id, "admin");
    if (access.error || !access.user) return access.error;
    const { user } = access;
    
    const body = await req.json().catch(() => ({}));
    const data: { 
      name?: string; 
      plan?: string; 
      slug?: string;
      retentionEmails?: string;
      retentionDocs?: string;
      retentionAuditLogs?: string;
      exportFileExpiry?: string;
    } = {};
    if (typeof body?.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (typeof body?.slug === "string" && body.slug.trim()) {
      const baseSlug = body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      let slug = baseSlug;
      let attempt = 0;
      // Ensure the slug isn't taken by another organization
      while (true) {
        const existing = await db.organization.findUnique({ where: { slug } });
        if (!existing || existing.id === id) break;
        attempt++;
        slug = `${baseSlug}-${attempt}`;
      }
      data.slug = slug;
    }
    
    if (typeof body?.retentionEmails === "string") {
      data.retentionEmails = body.retentionEmails;
    }
    if (typeof body?.retentionDocs === "string") {
      data.retentionDocs = body.retentionDocs;
    }
    if (typeof body?.retentionAuditLogs === "string") {
      data.retentionAuditLogs = body.retentionAuditLogs;
    }
    if (typeof body?.exportFileExpiry === "string") {
      data.exportFileExpiry = body.exportFileExpiry;
    }

    const before = await db.organization.findUnique({ where: { id } });
    const org = await db.organization.update({
      where: { id },
      data,
      include: { _count: { select: { members: true } } },
    });

    await logAudit({
      organizationId: id,
      actorId: user.id,
      action: "update",
      entity: "organization",
      entityId: id,
      before,
      after: { id: org.id, name: org.name, plan: org.plan },
    });

    return NextResponse.json(
      serializeOrganization(org, org._count?.members ?? 0)
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update org" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await verifyOrgAccess(id, "owner");
    if (access.error || !access.user) return access.error;
    const { user } = access;

    // Prevent deleting the user's only organization
    const activeOrgs = user.memberships.filter((m) => m.status === "active");
    if (activeOrgs.length <= 1) {
      return NextResponse.json(
        { error: "You cannot delete your only active organization." },
        { status: 400 }
      );
    }

    const before = await db.organization.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    await db.organization.delete({
      where: { id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete org" },
      { status: 500 }
    );
  }
}
