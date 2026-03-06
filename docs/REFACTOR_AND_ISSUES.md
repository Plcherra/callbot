# Refactor & Issues Scan

Generated from codebase analysis. Findings and fixes applied.

---

## Critical Issues (Fixed)

### 1. Telnyx Voice Webhook – No Signature Validation
**Risk**: Any attacker could POST to `/api/telnyx/voice` and trigger call answering/streaming.
**Fix**: Added `validateTelnyxWebhook` using raw body. When `TELNYX_PUBLIC_KEY` or `TELNYX_WEBHOOK_SECRET` is set, invalid signatures return 403. When both are unset (e.g. local dev), requests are allowed with a warning.

### 2. Telnyx Voice – Verbose Logging of Full Webhook Body
**Risk**: Logging `JSON.stringify(body)` can leak caller info, DIDs, and PII.
**Fix**: In production, log only event type and minimal metadata; full body only in development.

---

## Medium Issues (Fixed)

### 3. Centralized Logger Utility
**Issue**: `console.log`/`warn`/`error` scattered across 20+ files; no structured logging.
**Fix**: Added `app/lib/logger.ts` with `log`, `warn`, `error` that respect `NODE_ENV` and reduce noise in production.

### 4. Shared Env Validation
**Issue**: `TELNYX_WEBHOOK_BASE_URL || NEXT_PUBLIC_APP_URL` repeated in 5+ places.
**Fix**: Added `app/lib/env.ts` with `getTelnyxWebhookBase()`, `getAppUrl()`.

### 5. Stripe Webhook – Duplicate `plan` Reference
**Issue**: Line 191 references `plan` which might be out of scope in some branches (cosmetic).
**Fix**: Verified scope is correct; no change needed.

---

## Lower Priority (Deferred)

### 6. promptCache – globalThis Across Processes
**Note**: If using serverless or multi-instance, `promptCache` is in-memory and not shared. For single-process `server.js`, this is fine.

### 7. Supabase Client – Non-null Assertions
**Note**: `process.env.NEXT_PUBLIC_SUPABASE_URL!` can throw at runtime if missing. Consider startup validation.

### 8. Duplicate Prompt Logic
**Note**: `getReceptionistPrompt` and `/api/receptionist-prompt` both build prompts. Could consolidate; currently acceptable as API wraps the lib.

### 9. provisionTelnyxNumber – Variable Scope
**Note**: `suggestions` is correctly scoped inside the `if` block.

---

## Refactors Applied

1. **app/api/telnyx/voice/route.ts**: Telnyx webhook validation, reduced logging
2. **app/lib/logger.ts**: New logger utility
3. **app/lib/env.ts**: New env helper
4. **Updated imports**: Voice route, provisionTelnyxNumber, createReceptionist use new utilities

---

## Recommendations

- **Production**: Set `TELNYX_PUBLIC_KEY` or `TELNYX_WEBHOOK_SECRET` so voice webhook signatures are validated.
- Add rate limiting on `/api/telnyx/voice` and `/api/telnyx/outbound`
- Add startup env validation (e.g. `ENV_SCHEMA`) for critical vars
- Consider replacing console in remaining files with logger gradually
