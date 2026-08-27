import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    // Find active org
    const membership = user.memberships.find(m => m.status === "active");
    if (!membership) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }
    
    const invoices = await db.invoice.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" }
    });
    
    return NextResponse.json(invoices);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load invoices" },
      { status: 500 }
    );
  }
}
