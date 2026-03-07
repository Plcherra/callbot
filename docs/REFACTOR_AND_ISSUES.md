# Refactor & Issues Scan (Historical)

Historical record of fixes applied during codebase analysis. Some items may have been superseded by later changes.

---

## Applied Fixes

- **Telnyx webhook validation**: `validateTelnyxWebhook` in voice and CDR routes
- **Logger utility**: `app/lib/logger.ts`
- **Env helpers**: `app/lib/env.ts` (`getTelnyxWebhookBase`, `getAppUrl`)

---

## Deferred / Notes

- **promptCache**: In-memory; for multi-instance see docs/ARCHITECTURE.md
- **Supabase**: Non-null assertions on env; consider startup validation

---

## Recommendations

- **Production**: Set `TELNYX_PUBLIC_KEY` or `TELNYX_WEBHOOK_SECRET` so voice webhook signatures are validated.
- Add rate limiting on `/api/telnyx/voice` and `/api/telnyx/outbound`
- Add startup env validation (e.g. `ENV_SCHEMA`) for critical vars
- Consider replacing console in remaining files with logger gradually
