import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    console.error("DEBUG ERROR:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown", stack: err instanceof Error ? err.stack : null },
      { status: 500 }
    );
  }
}
