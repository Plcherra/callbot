#!/usr/bin/env npx tsx
/**
 * Validate Next.js environment variables.
 * Run from project root: npx tsx scripts/validate-env.ts
 * Or: npm run validate:env
 *
 * Loads .env and .env.local, checks required vars, exits 1 if critical missing.
 */

import * as fs from "fs";
import * as path from "path";

// Load dotenv manually (script runs outside Next.js)
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
const envLocalPath = path.join(root, ".env.local");

function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return env;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[key] = val;
  }
  return env;
}

const env = { ...loadEnvFile(envPath), ...loadEnvFile(envLocalPath), ...process.env };

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TELNYX_API_KEY",
] as const;

const missing: string[] = [];
for (const key of REQUIRED) {
  const val = (env[key] ?? "").trim();
  if (!val) missing.push(key);
}

if (missing.length > 0) {
  console.error("validate-env: Missing required environment variables:");
  missing.forEach((k) => console.error("  -", k));
  console.error("\nCopy deploy/env/.env.example to .env.local and fill in values.");
  process.exit(1);
}

console.log("validate-env: OK – all required Next.js env vars present");
