import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const user = await getCurrentUser();
    
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    
    const cookieStore = await cookies();
    cookieStore.delete("2fa_verified_" + user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disable 2FA" },
      { status: 500 }
    );
  }
}
