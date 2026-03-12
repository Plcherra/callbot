#!/usr/bin/env npx tsx
/**
 * Cross-check shared env vars between Next.js and Python backend.
 * Run from project root: npx tsx scripts/validate-env-crosscheck.ts
 * Or: npm run validate:env:crosscheck
 *
 * - Compares NEXT_PUBLIC_APP_URL vs APP_API_BASE_URL (warn if different)
 * - Checks INTERNAL_API_KEY presence
 * - Optionally pings health endpoints
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const scriptDir =
  typeof import.meta !== "undefined" && import.meta.url
    ? path.dirname(fileURLToPath(import.meta.url))
    : __dirname;
const root = path.resolve(scriptDir, "..");

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, "utf-8");
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
  }
  return { ...env, ...process.env } as Record<string, string>;
}

const env = loadEnv();

const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
const appApiBase = (env.APP_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const internalKey = (env.INTERNAL_API_KEY ?? "").trim();

let hasWarnings = false;

// APP_URL vs APP_API_BASE_URL
if (appUrl && appApiBase && appUrl !== appApiBase) {
  console.warn(
    "validate-env-crosscheck: NEXT_PUBLIC_APP_URL differs from APP_API_BASE_URL"
  );
  console.warn("  NEXT_PUBLIC_APP_URL:", appUrl);
  console.warn("  APP_API_BASE_URL:", appApiBase);
  console.warn(
    "  In production these usually match. If using ngrok/tunnel for backend, ensure backend can reach Next.js."
  );
  hasWarnings = true;
}

// INTERNAL_API_KEY - required when backend calls Next.js internal APIs
if (!internalKey) {
  console.warn(
    "validate-env-crosscheck: INTERNAL_API_KEY not set. Backend→Next.js internal APIs (FCM push, quota) will fail."
  );
  hasWarnings = true;
}

if (!hasWarnings) {
  console.log("validate-env-crosscheck: OK – shared config consistent");
} else {
  console.log("validate-env-crosscheck: completed with warnings (exit 0)");
}
process.exit(0);
