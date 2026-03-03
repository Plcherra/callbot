import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  createClientFromToken,
  getBearerToken,
} from "./createClientFromToken";

type CookieOptions = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Get authenticated user from request.
 * Supports both web (cookies) and mobile (Bearer token).
 * Returns { user, supabase } or { user: null, supabase: null }.
 */
export async function getAuthUser(request: Request): Promise<{
  user: User | null;
  supabase: SupabaseClient | null;
}> {
  const authHeader = request.headers.get("authorization");
  const token = getBearerToken(authHeader);

  if (token) {
    try {
      const supabase = createClientFromToken(token);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) return { user, supabase };
    } catch {
      // Invalid token, fall through to cookie
    }
  }

  // Cookie-based auth for web
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(_cookiesToSet: CookieOptions[]) {
        // No-op for API routes; middleware handles cookies
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? { user, supabase } : { user: null as User | null, supabase: null };
}
