import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { google } from "googleapis";

// Validate environment variables at module load time
const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI;
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

if (!redirectUri || !clientId || !clientSecret) {
  console.error(
    "Missing Google OAuth environment variables. Check: NEXT_PUBLIC_GOOGLE_REDIRECT_URI, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET"
  );
}

export async function GET(req: NextRequest) {
  // Validate environment variables
  if (!redirectUri || !clientId || !clientSecret) {
    console.error("Google OAuth configuration missing");
    return NextResponse.redirect(
      `${appUrl}/dashboard?calendar=error&message=Server configuration error`
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const rawState = searchParams.get("state"); // userId or "userId:returnTo"
  const error = searchParams.get("error");

  const stateParts = rawState?.split(":");
  const state = stateParts?.[0] ?? rawState; // userId
  const returnTo = stateParts?.length === 2 ? stateParts[1] : "dashboard";

  const errorRedirectPath = returnTo === "onboarding" ? "/onboarding" : "/dashboard";

  // Handle OAuth errors from Google
  if (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(
      `${appUrl}${errorRedirectPath}?calendar=error&message=${encodeURIComponent(
        `OAuth error: ${error}`
      )}`
    );
  }

  // Validate required parameters
  if (!code) {
    console.error("Missing authorization code in callback");
    return NextResponse.redirect(
      `${appUrl}${errorRedirectPath}?calendar=error&message=${encodeURIComponent(
        "Missing authorization code"
      )}`
    );
  }

  if (!state) {
    console.error("Missing state parameter in callback");
    return NextResponse.redirect(
      `${appUrl}${errorRedirectPath}?calendar=error&message=${encodeURIComponent(
        "Missing state parameter"
      )}`
    );
  }

  // Validate state (userId) exists in database
  const supabase = createServiceRoleClient();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("id", state)
    .single();

  if (userError || !user) {
    console.error("Invalid state/userId:", state, userError);
    return NextResponse.redirect(
      `${appUrl}${errorRedirectPath}?calendar=error&message=${encodeURIComponent(
        "Invalid user"
      )}`
    );
  }

  try {
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Exchange authorization code for tokens
    console.log("Exchanging code for tokens...");
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens) {
      console.error("Failed to get tokens from Google");
      return NextResponse.redirect(
        `${appUrl}${errorRedirectPath}?calendar=error&message=${encodeURIComponent(
          "Failed to get tokens"
        )}`
      );
    }

    // Refresh token is required for offline access
    if (!tokens.refresh_token) {
      console.error("No refresh token received. User may need to grant offline access.");
      return NextResponse.redirect(
        `${appUrl}${errorRedirectPath}?calendar=error&message=${encodeURIComponent(
          "No refresh token received. Please try connecting again and ensure you grant all permissions."
        )}`
      );
    }

    // Set credentials to get user info
    oauth2Client.setCredentials(tokens);

    // Get user info to determine calendar ID
    console.log("Fetching user info from Google...");
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    if (!userInfo) {
      console.error("Failed to get user info");
      return NextResponse.redirect(
        `${appUrl}${errorRedirectPath}?calendar=error&message=${encodeURIComponent(
          "Failed to get user information"
        )}`
      );
    }

    const calendarId = userInfo.email ?? "primary";
    console.log("Calendar ID:", calendarId);

    // Save tokens to database
    console.log("Saving tokens to database for user:", state);
    const { error: updateError } = await supabase
      .from("users")
      .update({
        calendar_id: calendarId,
        calendar_refresh_token: tokens.refresh_token,
        updated_at: new Date().toISOString(),
      })
      .eq("id", state);

    if (updateError) {
      console.error("Database update error:", updateError);
      return NextResponse.redirect(
        `${appUrl}${errorRedirectPath}?calendar=error&message=${encodeURIComponent(
          "Failed to save calendar connection"
        )}`
      );
    }

    console.log("Successfully connected Google Calendar for user:", state);
    const redirectPath = returnTo === "onboarding" ? "/onboarding" : "/dashboard";
    return NextResponse.redirect(`${appUrl}${redirectPath}?calendar=connected`);
  } catch (err) {
    // Log detailed error information
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error("Google callback error:", {
      message: errorMessage,
      stack: errorStack,
      code,
      state,
    });

    // Return user-friendly error message
    return NextResponse.redirect(
      `${appUrl}${errorRedirectPath}?calendar=error&message=${encodeURIComponent(
        `Connection failed: ${errorMessage}`
      )}`
    );
  }
}
