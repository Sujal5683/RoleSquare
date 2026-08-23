import { NextRequest, NextResponse } from "next/server";
import { GoogleOAuthService } from "@/lib/services/google-oauth";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get("organizationId");
  const userId = searchParams.get("userId"); // Assume passed from authenticated frontend or session

  if (!organizationId || !userId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const url = GoogleOAuthService.getAuthUrl(organizationId, userId);
  return NextResponse.redirect(url);
}
