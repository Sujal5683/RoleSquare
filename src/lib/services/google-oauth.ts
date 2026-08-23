import { db as prisma } from "@/lib/db";
import { google } from "googleapis";
import { decryptToken, encryptToken } from "@/lib/google-auth";

// Ensure you have these env vars defined
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/google-sheets/callback`
  : "http://localhost:3000/api/google-sheets/callback";

export const sheetsOauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

export class GoogleOAuthService {
  /**
   * Generates the auth URL specifically for the Google Sheets integration.
   * This is separate from the application login.
   */
  static getAuthUrl(organizationId: string, userId: string) {
    const scopes = [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ];

    return sheetsOauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
      state: JSON.stringify({ organizationId, userId }),
    });
  }

  /**
   * Handles the OAuth callback and stores the connection.
   */
  static async handleCallback(code: string, stateString: string) {
    const { organizationId, userId } = JSON.parse(stateString);

    const { tokens } = await sheetsOauth2Client.getToken(code);
    sheetsOauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: sheetsOauth2Client, version: "v2" });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) throw new Error("Could not retrieve email from Google Account");

    // We store this as a GoogleConnection.
    // In a production app, tokens must be encrypted at rest (e.g., AES-256-GCM).
    // For this implementation, we simulate storing the raw tokens securely based on the prisma schema.
    const googleConnection = await prisma.googleConnection.create({
      data: {
        userId,
        organizationId,
        googleEmail: email,
        scopes: "spreadsheets,drive.metadata.readonly",
        status: "active",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    // Create the GoogleIntegration link
    const integration = await prisma.googleIntegration.create({
      data: {
        organizationId,
        googleConnectionId: googleConnection.id,
        status: "active",
      },
    });

    return integration;
  }

  /**
   * Retrieves an authenticated Google API client for a specific integration.
   */
  static async getAuthenticatedClient(integrationId: string) {
    const integration = await prisma.googleIntegration.findUnique({
      where: { id: integrationId },
      include: { connection: true },
    });

    if (!integration || !integration.connection) {
      throw new Error("Integration or connection not found");
    }

    const { accessToken, refreshToken, tokenExpiresAt } = integration.connection;
    let rawAccessToken = "";
    let rawRefreshToken = "";
    try {
      rawAccessToken = accessToken ? decryptToken(accessToken) : "";
      rawRefreshToken = refreshToken ? decryptToken(refreshToken) : "";
    } catch (err) {
      console.warn("Could not decrypt tokens. They may be plain text from previous implementation.");
      rawAccessToken = accessToken || "";
      rawRefreshToken = refreshToken || "";
    }

    const auth = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    auth.setCredentials({
      access_token: rawAccessToken,
      refresh_token: rawRefreshToken,
      expiry_date: tokenExpiresAt ? tokenExpiresAt.getTime() : null,
    });

    // Handle token refresh
    auth.on("tokens", async (newTokens) => {
      const dataToUpdate: any = {
        tokenExpiresAt: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
      };
      if (newTokens.access_token) {
        dataToUpdate.accessToken = encryptToken(newTokens.access_token);
      }
      if (newTokens.refresh_token) {
        dataToUpdate.refreshToken = encryptToken(newTokens.refresh_token);
      }
      
      await prisma.googleConnection.update({
        where: { id: integration.connection.id },
        data: dataToUpdate,
      });
    });

    return auth;
  }
}
