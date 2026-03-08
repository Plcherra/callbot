# Flutter App – Beta Launch Checklist & Polish Plan

**Current readiness: ~72%**

---

## Readiness Snapshot

| Category | Status | Notes |
|----------|--------|-------|
| Core flows | ✅ | Auth, dashboard, onboarding, checkout, receptionists, call handling |
| Call history | Done | Empty state added |
| Permissions | ⚠️ | Notifications OK; mic/background may need attention |
| Error states | Done | Friendly messages in AppStrings |
| App icon/splash | Done | Regenerated via flutter_launcher_icons & flutter_native_splash |
| TestFlight/APK | ✅ | BETA_BUILD.md has solid steps |
| Beta onboarding | Done | BETA_ONBOARDING_GUIDE.md |

---

## 1. Missing UI Screens & Polish

### 1.1 Onboarding tour (first-time user)
- **Current**: 4-step wizard (Calendar → Phone → Receptionist → Test Call) on `/onboarding`
- **Gap**: No lightweight “tour” overlay (e.g. tooltips or highlights) for first-time users
- **Suggestion**: Add a simple “Welcome” overlay on first dashboard visit with 2–3 key actions (e.g. “Create receptionist”, “Connect calendar”). Use `shared_preferences` to show once.

### 1.2 Call history stub
- **Current**: Receptionist detail fetches `call_usage` and renders list
- **Gap**: When `_callHistory.isEmpty`, the section is hidden; no “No calls yet” placeholder
- **Fix**: Show a friendly empty state card: “No calls yet. When customers call your AI receptionist, they’ll appear here.”

### 1.3 Settings polish
- **Current**: Billing, Calendar, Sign out; “Business name & address” `onTap` is empty
- **Gaps**:
  - No editable phone field in Settings (phone is referenced in onboarding but not surfaced)
  - Business name/address: either implement or remove/hide for beta
- **Suggestion**: Add “Default phone” field that navigates to web dashboard or opens a simple edit dialog if you add the API.

---

## 2. Permissions

| Permission | Android | iOS | Notes |
|------------|---------|-----|-------|
| Notifications | ✅ `POST_NOTIFICATIONS` + runtime request | ✅ FCM permission request | PushService handles |
| Microphone | ❌ Not declared | ❌ No `NSMicrophoneUsageDescription` | CallKit listen-in may need mic; add if you enable VoIP audio |
| Background | `remote-notification` via FCM | `UIBackgroundModes: remote-notification` | Sufficient for push call alerts |
| VoIP (CallKit) | N/A | Consider `voip` in UIBackgroundModes | If CallKit acts as VoIP client |

**Action**: Add `NSMicrophoneUsageDescription` to `Info.plist` if users will listen to calls; otherwise skip. Current flow uses native dialer for outbound and CallKit for incoming UI only (no in-app audio), so mic may not be required yet.

---

## 3. Error States & User Feedback

| Screen | Current | Suggestion |
|--------|---------|------------|
| Login/Signup | AuthException shown as text | ✅ OK; consider toast instead of inline for transient errors |
| Dashboard | Full-page error + Retry | ✅ OK |
| Receptionist detail | “Receptionist not found” | ✅ OK |
| API errors (billing, calendar) | `SnackBar(content: Text('Error: $e'))` | Replace with user-friendly copy, e.g. “Couldn’t open billing. Try again.” |
| Network offline | Not handled | Add connectivity check or retry on `SocketException` |
| Push token registration | Silent fail in debug | OK for beta; ensure backend `/api/mobile/push-token` exists |

**Quick wins**:
- Centralize error strings (e.g. `AppStrings.couldNotOpenBilling`)
- Add `RefreshIndicator` where lists can be retried (already on dashboard, receptionist detail)

---

## 4. App Icon & Splash Finalization

- **Config**: `flutter_launcher_icons` and `flutter_native_splash` in `pubspec.yaml`; `assets/icon/app_icon.png` exists
- **Steps**:
  1. Ensure `assets/icon/app_icon.png` is 1024×1024 (or at least 512×512)
  2. Run: `flutter pub run flutter_launcher_icons` and `flutter pub run flutter_native_splash:create`
  3. Verify `android/app/src/main/res/mipmap-*/` and `ios/Runner/Assets.xcassets/` contain generated icons
  4. Check splash color (`#5E35B1`) and image look correct on device

---

## 5. TestFlight + APK Distribution

See **BETA_BUILD.md** for full steps. Summary:

### TestFlight (iOS)
1. Open `ios/Runner.xcworkspace` in Xcode; configure signing
2. `flutter build ipa --release --dart-define=...`
3. Upload via Xcode Organizer or `xcrun altool`
4. Add internal testers in App Store Connect → TestFlight

### APK (Android)
1. `flutter build apk --release --dart-define=...`
2. Share `build/app/outputs/flutter-apk/app-release.apk` via link or file host
3. Testers enable “Install from unknown sources” for your source

### Checklist before distribution
- [ ] Version and build number bumped in `pubspec.yaml`
- [ ] API_BASE_URL, SUPABASE_* point to production
- [ ] Firebase/Google Services configured for production
- [ ] Run full validation checklist from BETA_BUILD.md

---

## 6. Beta User Onboarding Guide

Create a short guide (PDF or Notion/Google Doc) for testers:

1. **Get the app** – TestFlight invite (iOS) or APK link (Android)
2. **Create account** – Sign up with email or Google
3. **Subscribe** – Choose a plan and complete Stripe Checkout (use test cards in Stripe test mode)
4. **Finish setup** – Connect Google Calendar, add default phone in Settings, create first receptionist
5. **Test a call** – Call your receptionist’s number from another phone
6. **What to test** – Incoming call alerts, dashboard minutes, call history, billing portal
7. **Feedback** – How to report bugs (email, form, etc.)

---

## 5 Small Polish Tasks (<2 hours each)

| # | Task | Est. | Status |
|---|------|------|--------|
| 1 | **Call history empty state** – Add “No calls yet” card when `_callHistory.isEmpty` | 30 min | Done |
| 2 | **Error message polish** – Replace raw `$e` in SnackBars with friendly copy for billing/calendar | 45 min | Done |
| 3 | **Regenerate app icon & splash** – Run generators, verify on device | 20 min | Done |
| 4 | **Beta onboarding doc** – 1-pager with steps 1–7 above | 1 hr | Done (BETA_ONBOARDING_GUIDE.md) |
| 5 | **First-time welcome overlay** – Simple “Create your first receptionist” prompt on first dashboard visit | 1 hr | Done |

---

## Priority Order for Beta

1. Call history empty state
2. Regenerate icon/splash
3. Beta onboarding guide
4. Error message polish
5. First-time welcome (nice-to-have)
