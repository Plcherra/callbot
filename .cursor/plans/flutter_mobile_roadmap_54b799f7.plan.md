---
name: Flutter Mobile Roadmap
overview: The Flutter app is already ~70% of Phase 2 complete. This plan maps what exists, identifies gaps, and proposes prioritized next steps to reach a launchable mobile-first product.
todos: []
isProject: false
---

# Flutter Mobile App — Current State & Next Steps

## Current State Summary

You already have a **substantial Flutter app** in `[mobile/](mobile/)` that mirrors the core web flow. The backend stays unchanged; Flutter consumes the same Next.js APIs.

### What Exists (Phases 1–2 Mostly Done)


| Area                    | Status  | Notes                                                                                                                                                                    |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Project setup**       | Done    | `pubspec.yaml` with supabase_flutter, go_router, http, app_links, webview_flutter                                                                                        |
| **Landing**             | Done    | Hero, pricing teaser, demo video, testimonials — `[landing_screen.dart](mobile/lib/screens/landing/landing_screen.dart)`                                                 |
| **Auth**                | Done    | Login, signup (with plan query param) — Supabase auth                                                                                                                    |
| **Dashboard**           | Partial | Stats, receptionist list, upgrade CTA — **usage minutes show 0** (not wired)                                                                                             |
| **Receptionist wizard** | Done    | 6 steps: Basics, Phone, Instructions, Business, Advanced, Review — `[create_receptionist_screen.dart](mobile/lib/screens/receptionists/create_receptionist_screen.dart)` |
| **Receptionist detail** | Done    | Call Now (tel:), Start outbound call (API), call history, settings link                                                                                                  |
| **Settings / Checkout** | Done    | Billing portal, upgrade, deep links for Stripe + Google OAuth                                                                                                            |
| **Deep links**          | Done    | `echodesk://checkout`, `echodesk://google-callback`, `echodesk://settings` — `[deep_link_handler.dart](mobile/lib/services/deep_link_handler.dart)`                      |
| **Outbound call**       | Done    | Uses `POST /api/telnyx/outbound` from `[receptionist_detail_screen.dart](mobile/lib/screens/receptionists/receptionist_detail_screen.dart)`                              |


### What’s Missing vs. Your Proposed Plan


| Area                   | Gap                                                                                                                                      | Effort               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Usage minutes**      | Dashboard reads `billing_plan_metadata.included_minutes` but never fetches `usage_snapshots` or aggregates `call_usage` — minutes stay 0 | 1–2 days             |
| **Riverpod**           | Not used; all screens are StatefulWidget. Optional for now                                                                               | 1–2 weeks if desired |
| **Firebase + Push**    | No firebase_core, firebase_messaging, flutter_local_notifications                                                                        | 2–4 weeks            |
| **Incoming call push** | No FCM when a call arrives; no full-screen call UI                                                                                       | 4–8 weeks            |
| **In-app live call**   | No WebSocket/audio pipeline in the app (Telnyx handles audio server-side)                                                                | 6–12 weeks           |
| **Polish**             | Icons, splash, onboarding tour, in-app purchase, store submission                                                                        | 4–8 weeks            |


---

## Architecture: Backend Unchanged

```mermaid
flowchart TB
    subgraph Mobile [Flutter App]
        Landing[Landing]
        Auth[Login / Signup]
        Dashboard[Dashboard]
        Wizard[Create Receptionist]
        Detail[Receptionist Detail]
        Settings[Settings]
    end

    subgraph Backend [Next.js]
        API[/api/mobile/*]
        TelnyxAPI[/api/telnyx/outbound]
        SupabaseDB[(Supabase)]
    end

    subgraph External [External]
        Telnyx[Telnyx]
        Stripe[Stripe]
        Google[Google OAuth]
    end

    Mobile -->|Bearer token| API
    Mobile -->|Bearer token| TelnyxAPI
    API --> SupabaseDB
    TelnyxAPI --> Telnyx
    API --> Stripe
    API --> Google
```



The mobile app uses the FastAPI routes under `/api/mobile` (see `backend/api/mobile_routes.py` and `docs/core/SYSTEM_OVERVIEW.md`). No backend migration needed for this roadmap item.

---

## Recommended Next Steps (Prioritized)

### Option A: Ship MVP Faster (Recommended)

Focus on making the app usable and testable before adding push and in-app call.

1. **Wire usage minutes in the dashboard** (~1–2 days)
  - Add a mobile API or RPC to return `{ totalMinutes, includedMinutes, overageMinutes }` for the current period.
  - Web uses `usage_snapshots` + `getCurrentPeriod()` in `[app/(protected)/dashboard/page.tsx](app/(protected)`/dashboard/page.tsx). Mobile can:
    - Call a new `GET /api/mobile/usage` that aggregates for the user, or
    - Query Supabase `usage_snapshots` + `users.billing_plan_metadata` directly (like web).
  - Update `[dashboard_screen.dart](mobile/lib/screens/dashboard/dashboard_screen.dart)` to fetch and display real usage.
2. **Minor polish** (~2–3 days)
  - App icon and splash screen.
  - Fix any remaining help/onboarding empty actions (e.g. help button).
  - Basic error handling and empty states where missing.
3. **Internal beta** (~1 week)
  - TestFlight (iOS) + internal APK (Android).
  - Validate signup → checkout → create receptionist → outbound call flow end-to-end.

**Outcome:** A shippable MVP in 2–4 weeks. Users can use the app for signup, billing, and managing receptionists; “Call Now” opens the native dialer (acceptable for MVP).

---

### Option B: Add Push Notifications (Before Store Launch)

If you want push before first store release:

1. Add Firebase + FCM (~1 week)
  - `firebase_core`, `firebase_messaging`, `flutter_local_notifications`.
  - Store FCM token in `users` (new column or metadata).
  - Backend webhook: when Telnyx receives inbound call → send FCM “Incoming call from …” (no full-screen call UI yet).
2. Then do Option A (usage + polish + beta).

**Outcome:** Push for incoming calls + full MVP in 4–6 weeks. Users get notified of calls; answering still happens via native dialer or separate device.

---

### Option C: Full Telephony in-App (Longer Roadmap)

For in-app call UI (answer without leaving the app):

1. Implement Option A + B first.
2. Design WebSocket + audio pipeline:
  - Backend streams Telnyx audio to a new WebSocket endpoint.
  - Flutter connects, receives audio chunks, plays via `just_audio` or `flutter_sound`.
  - STT/TTS handled server-side (as today); app only plays/records.
3. Add full-screen incoming call UI (CallKit on iOS, ConnectionService on Android) with VoIP push.

**Effort:** 6–12 weeks after MVP. Higher complexity and device/permission edge cases.

---

## Where to Start: Concrete First Task

**Immediate next step:** Wire usage minutes in the dashboard.

- **Backend:** Either add `GET /api/mobile/usage` that returns `{ total_minutes, included_minutes, overage_minutes }` for the current user/period, or document the Supabase queries needed.
- **Flutter:** Fetch usage in `dashboard_screen.dart` (from API or Supabase), then show `totalMinutes / includedMinutes` (and overage if any) in the stats grid.

This improves trust and clarity for users and is a small, well-scoped change.

---

## Validation: PWA vs. Flutter

You asked about validating demand with a PWA first. Given the current Flutter progress:

- **Recommendation:** Continue with Flutter. You already have most of the core flow; finishing MVP (usage + polish + beta) is lower effort than building a parallel PWA.
- A PWA would share the same backend but require a separate frontend and would not give you native dialer integration, push quality, or store presence.
- If you want a quick signal: use the Flutter app as an internal APK/TestFlight build and share it with a few target users before investing in push and in-app call.

