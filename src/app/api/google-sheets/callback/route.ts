import { NextRequest, NextResponse } from "next/server";
import { GoogleOAuthService } from "@/lib/services/google-oauth";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  try {
    const integration = await GoogleOAuthService.handleCallback(code, state);
    
    // Redirect back to the UI indicating success
    return NextResponse.redirect(new URL(`/dashboard/organizations/${integration.organizationId}/settings?sheets_connected=true`, request.url));
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
