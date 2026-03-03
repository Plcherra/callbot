import { createClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client authenticated with a Bearer token.
 * Used by mobile API routes that receive Authorization: Bearer <access_token>.
 * The token is the Supabase session access_token from the Flutter app.
 */
export function createClientFromToken(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase URL or anon key not configured");
  }
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Extract Bearer token from request headers.
 * Returns null if no valid Bearer token is present.
 */
export function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}
