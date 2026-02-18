"use server";

import { google } from "googleapis";

const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI!;
const clientId = process.env.GOOGLE_CLIENT_ID!;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

export async function getGoogleAuthUrl(userId: string, returnTo?: string) {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "email",
    "profile",
  ];
  const state = returnTo ? `${userId}:${returnTo}` : userId;
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}
