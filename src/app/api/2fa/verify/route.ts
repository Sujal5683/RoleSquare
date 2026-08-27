import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { verify } from "otplib";
import { db } from "@/lib/db";

import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(true);
    const body = await req.json();
    const { token } = body;
    
    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }
    
    const dbUser = await db.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.twoFactorSecret) {
      return NextResponse.json({ error: "2FA is not set up" }, { status: 400 });
    }
    
    const { verify } = await import("otplib");
    
    const result = await verify({
      token,
      secret: dbUser.twoFactorSecret,
    });
    
    if (!result.valid) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }
    
    // Enable 2FA
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });

    const cookieStore = await cookies();
    cookieStore.set("2fa_verified_" + user.id, "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to verify 2FA" },
      { status: 500 }
    );
  }
}
