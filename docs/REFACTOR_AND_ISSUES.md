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

---

## Refactor backlog (pre-launch vs post-launch)

This is a **staged** backlog designed to avoid behavior regressions close to launch. Items are grouped by when they are safest to do.

### Pre-launch (safe, low blast radius)

- **Guardrails (tests + logging)**
  - **Invariants**: Telnyx verification behavior (skip-verify allowlist), calendar tool contracts, CDR idempotency, voice tool dedupe/filler.
  - **Tests**: `backend/tests/test_telnyx_webhook_verification.py`, `backend/tests/test_calendar_tools_contract.py`, `backend/tests/test_cdr_idempotency.py`, `backend/tests/test_voice_pipeline_guardrails.py`.
  - **Rollback**: revert only test additions and keep runtime code unchanged.

- **Pure extraction refactors (no behavior change)**
  - **Mobile dashboard**: keep UI behavior identical; move data-fetch aggregation into a service (`mobile/lib/services/dashboard_service.dart`).
  - **Settings tabs**: move tab widgets into separate files under `mobile/lib/screens/receptionists/settings_tabs/` without changing API calls or form fields.
  - **Backend calendar handler**: internal split into parsing/availability/booking modules while preserving `handle_calendar_request` contract and log tags.
  - **Rollback**: revert file moves; no data migrations required.

- **Process-local state containment**
  - **Invariants**: cache/registry growth is bounded and logs warn on eviction.
  - **Rollback**: revert the wrappers; behavior returns to unbounded best-effort dicts.

### Post-launch (higher risk, schedule with flags/rollouts)

- **Boundary consolidation (reduce mixed sources-of-truth)**
  - **Goal**: mobile relies primarily on backend for usage + call history; Supabase direct reads become best-effort fallback only.
  - **Invariants**: minutes displayed match `dashboard-summary`; call history matches backend formatting.
  - **Rollout**: feature-flag mobile to prefer backend endpoints per screen; keep Supabase fallback for one release.
  - **Rollback**: flip flag back to prior behavior.

- **Voice pipeline scale hardening**
  - **Goal**: move correctness-critical call state/idempotency from process memory to shared store (Supabase or Redis).
  - **Invariants**: no duplicate tool calls per turn; “One moment…” once; no double-billing; webhook verification always enforced.
  - **Rollout**: introduce shared-store layer behind an interface; enable per-environment.
  - **Rollback**: keep process-local in-memory fallback for a short window.

- **Backend router decomposition (complete)**
  - **Goal**: split `backend/api/mobile_routes.py` into domain routers (dashboard, settings, receptionist CRUD, billing, integrations).
  - **Invariants**: route paths + response shapes unchanged; same auth handling.
  - **Rollback**: revert to single router module.
