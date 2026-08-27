import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const user = await getCurrentUser(true);
    
    // Generate a new secret
    const secret = generateSecret();
    
    // Create an otpauth:// URI
    const otpauth = generateURI({
      label: user.email,
      issuer: "Workspace Intelligence Platform",
      secret,
    });
    
    // Generate QR code data URI
    const qrCodeDataUri = await QRCode.toDataURL(otpauth);
    
    // We should save the secret temporarily, or return it to the client and let them send it back
    // Or save it directly to the user record but keep twoFactorEnabled = false until verified.
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });
    
    return NextResponse.json({
      secret,
      qrCodeDataUri,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to setup 2FA" },
      { status: 500 }
    );
  }
}
