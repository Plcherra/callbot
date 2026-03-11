/**
 * Centralized env access with fallbacks.
 * Public/safe values can be used anywhere. Server-only getters must only be
 * imported in server code (API routes, server components, server actions).
 */

import { z } from "zod";

// --- Public / shared (safe for client) ---

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

export function getTelnyxWebhookBase(): string {
  return (
    process.env.TELNYX_WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://echodesk.us"
  ).replace(/\/$/, "");
}

export function getTelnyxWsBase(): string {
  return getTelnyxWebhookBase().replace(/^https?/, "ws");
}

// --- Server-only getters (do not import in client components) ---

function isServer(): boolean {
  return typeof window === "undefined";
}

export function getSupabaseUrl(): string {
  if (!isServer()) return "";
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
}

export function getSupabaseAnonKey(): string {
  if (!isServer()) return "";
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
}

export function getSupabaseServiceRoleKey(): string {
  if (!isServer()) return "";
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

export function getInternalApiKey(): string {
  if (!isServer()) return "";
  return (process.env.INTERNAL_API_KEY || "").trim();
}

export function getVoiceServerApiKey(): string {
  if (!isServer()) return "";
  return (process.env.VOICE_SERVER_API_KEY || "").trim();
}

// --- Validation ---

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "NEXT_PUBLIC_SUPABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),
  TELNYX_API_KEY: z.string().min(1, "TELNYX_API_KEY is required"),
  // Optional but recommended for full functionality
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  TELNYX_WEBHOOK_BASE_URL: z.string().optional(),
});

export type EnvValidationResult = {
  success: true;
} | {
  success: false;
  errors: string[];
};

/**
 * Validate critical env vars. Returns result; does not throw.
 * Use validateEnvOrThrow() for fail-fast behavior.
 */
export function validateEnv(): EnvValidationResult {
  const result = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    TELNYX_API_KEY: process.env.TELNYX_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    TELNYX_WEBHOOK_BASE_URL: process.env.TELNYX_WEBHOOK_BASE_URL,
  });

  if (result.success) return { success: true };
  const errors = result.error.errors.map(
    (e) => `${e.path.join(".")}: ${e.message}`
  );
  return { success: false, errors };
}

/**
 * Validate critical env vars. Throws with clear message if any required var is missing.
 * Call only from server (instrumentation, API routes, server components).
 */
export function validateEnvOrThrow(): void {
  const result = validateEnv();
  if (!result.success) {
    throw new Error(
      `Environment validation failed. Missing or invalid:\n${result.errors.join("\n")}`
    );
  }
}
