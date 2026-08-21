// GET /api/sources/[id]/emails?page=1&limit=20&status=matched
//
// Returns paginated Email rows for a source, including attachment count
// and Drive link count. Used by the Source Builder view to display
// fetched emails after a scan run.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const { id: sourceId } = await params;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const status = url.searchParams.get("status") ?? undefined;
    const skip = (page - 1) * limit;

    // Verify the source belongs to this org
    const source = await db.source.findFirst({
      where: { id: sourceId, organizationId },
      select: { id: true },
    });
    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    const where = {
      sourceId,
      ...(status ? { processingStatus: status } : {}),
    };

    const [emails, total] = await Promise.all([
      db.email.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip,
        take: limit,
        include: {
          _count: {
            select: { attachments: true, links: true },
          },
        },
      }),
      db.email.count({ where }),
    ]);

    return NextResponse.json({
      emails: emails.map((e) => ({
        id: e.id,
        googleMessageId: e.googleMessageId,
        threadId: e.threadId,
        fromAddress: e.fromAddress,
        toAddress: e.toAddress,
        subject: e.subject,
        snippet: e.snippet,
        receivedAt: e.receivedAt.toISOString(),
        processingStatus: e.processingStatus,
        attachmentCount: e._count.attachments,
        linkCount: e._count.links,
        createdAt: e.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list emails" },
      { status: 500 }
    );
  }
}
