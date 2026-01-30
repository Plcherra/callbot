import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/app/actions/google";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { google } from "googleapis";

const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI!;
const clientId = process.env.GOOGLE_CLIENT_ID!;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // userId

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard?error=missing_params`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${appUrl}/dashboard?error=no_refresh_token`);
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    oauth2Client.setCredentials(tokens);
    const oauth2 = await google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const calendarId = userInfo.email ?? "primary";

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("users")
      .update({
        calendar_id: calendarId,
        calendar_refresh_token: tokens.refresh_token,
        updated_at: new Date().toISOString(),
      })
      .eq("id", state);

    if (error) {
      console.error("Google callback update error:", error);
      return NextResponse.redirect(`${appUrl}/dashboard?error=db_error`);
    }

    return NextResponse.redirect(`${appUrl}/dashboard?calendar=connected`);
  } catch (err) {
    console.error("Google callback error:", err);
    return NextResponse.redirect(`${appUrl}/dashboard?error=oauth_failed`);
  }
}
