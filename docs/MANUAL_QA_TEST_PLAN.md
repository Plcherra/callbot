# Echodesk – Manual QA Test Plan (3-Day Launch)

**Audience:** Founder / single tester  
**Goal:** Run in one sitting (2–4 hours) before launch.  
**Severity:** **P0** = launch blocker | **P1** = fix before launch | **P2** = document and fix soon.

Use a real device for calls and push; simulator is fine for the rest. Have one test Google account, one test phone number, and Stripe test mode enabled.

---

## 1. Onboarding

| # | Steps | Expected result | Severity if it fails |
|---|--------|------------------|----------------------|
| 1.1 | Sign up with email + password. Complete email confirmation if required. | Account created; after login you land on dashboard or are redirected to **Onboarding**. | P0 |
| 1.2 | As new user, confirm you are **redirected to Onboarding** (not left on dashboard). | You see onboarding steps (Connect calendar, Set phone, Create receptionist, Test call). | P0 |
| 1.3 | Tap “Connect Google Calendar” and complete OAuth in browser. Return to app (deep link or reopen). | Calendar step shows as done; “Connected as &lt;email&gt;” or similar. | P0 |
| 1.4 | Tap “Set default phone” and go to Settings → Integrations. Enter a test phone (E.164). Save. Return to Onboarding. | Phone step shows as done. | P1 |
| 1.5 | Tap “I’ll do this later” (skip). | Onboarding marked complete; you land on dashboard. | P1 |
| 1.6 | Log out, log in again. | You are not sent back to onboarding; dashboard loads. | P1 |

---

## 2. Receptionist wizard

| # | Steps | Expected result | Severity if it fails |
|---|--------|------------------|----------------------|
| 2.1 | From dashboard or Receptionists, tap **Create receptionist**. Go through: Basics (name, mode Personal, calendar ID), Phone (new number with area code or bring your own), Instructions (prompt, optional greeting), Business (skip or add one service), Call behavior (voice preset, max duration), Review. | Each step validates; you can move Next/Back; no crash. | P0 |
| 2.2 | On Basics, leave name empty and tap Next. | Error: “Name is required” (or equivalent). | P1 |
| 2.3 | On Phone (new number), choose an area code and continue. | Area code is sent; no “Other” that silently becomes 212. | P1 |
| 2.4 | On Review, **do not** check the consent box and tap Create. | Error: consent required. | P1 |
| 2.5 | Check consent and tap Create. | Success screen with receptionist name and phone number; “Copy” and “Test call” / “View receptionist” work. | P0 |
| 2.6 | Confirm **no** “Transfer to human” or “Take voicemail” option in the wizard. | Only voice preset and max duration (and similar) are shown in Call behavior. | P1 |

---

## 3. Google Calendar

| # | Steps | Expected result | Severity if it fails |
|---|--------|------------------|----------------------|
| 3.1 | Settings → Integrations (or equivalent). | You see Google Calendar status: “Connected as &lt;email&gt;” or “Not connected.” | P1 |
| 3.2 | If connected, open Google Calendar (web or app) and note current events. | Calendar loads; no app crash. | P2 |
| 3.3 | In app, open a receptionist → Settings → Calendar tab. | Calendar status shows (e.g. connected account, booking calendar). | P1 |
| 3.4 | Disconnect calendar (if there’s a disconnect action) or use an account with no calendar. Create a receptionist that requires calendar. | Clear error that calendar must be connected, or creation fails with a clear message. | P0 |

---

## 4. Phone calls

| # | Steps | Expected result | Severity if it fails |
|---|--------|------------------|----------------------|
| 4.1 | From receptionist success or detail, tap **Test call** (or dial the receptionist number from another phone). | Call connects; you hear the AI greeting (and any recording notice). | P0 |
| 4.2 | Say something (e.g. “I’d like to book an appointment”). | AI responds; no long silence or drop. | P0 |
| 4.3 | End the call from your side. | Call ends; no hang. | P1 |
| 4.4 | Check receptionist **Call history** (or dashboard call count). | The test call appears with duration/status. | P1 |
| 4.5 | From the app, trigger an **outbound** test call if the feature exists. | Call is placed and connects (or clear error if not allowed). | P1 |

---

## 5. Booking

| # | Steps | Expected result | Severity if it fails |
|---|--------|------------------|----------------------|
| 5.1 | Call the receptionist; when asked, say you want to book (e.g. “Tomorrow at 2pm” or “Next Monday at 10”). | AI checks availability and confirms or offers alternatives. | P0 |
| 5.2 | Accept a suggested time and give name (and any other requested info). | AI confirms the booking. | P0 |
| 5.3 | Open Google Calendar and find the event. | Event exists with correct date/time and timezone. | P0 |
| 5.4 | Call again and ask to **reschedule** the same appointment to another time. | AI reschedules; calendar event updates. | P1 |
| 5.5 | Use a timezone other than your own (e.g. “3pm Eastern”) if you’re in another zone. | Event in Google Calendar shows the intended local time. | P1 |

---

## 6. Transfer to human

| # | Steps | Expected result | Severity if it fails |
|---|--------|------------------|----------------------|
| 6.1 | In Create receptionist wizard, open the **Call behavior** step. | There is **no** “Transfer to human” or “Take voicemail” dropdown/option. | P1 |
| 6.2 | In an active call, ask to “speak to a person” or “transfer me.” | AI responds in conversation (e.g. explains how to call back or leave a message); **no** actual transfer occurs (feature not implemented). No crash. | P1 |

*Note: Transfer is not implemented. This section only checks we don’t promise it in the UI and that the app doesn’t break when the user asks.*

---

## 7. Billing / plan limits

| # | Steps | Expected result | Severity if it fails |
|---|--------|------------------|----------------------|
| 7.1 | Settings → Billing (or Subscribe/Upgrade). Tap **Subscribe** or **Open billing portal** (for users with a subscription). | Stripe Checkout or Customer Portal opens (test mode); no crash. | P0 |
| 7.2 | Complete a test subscription (Stripe test card). Return to app via deep link `echodesk://checkout?session_id=...` if applicable. | App shows subscribed state; dashboard/limits reflect the plan. | P0 |
| 7.3 | Open **Billing portal** again. | Portal opens (invoices, payment method, cancel, etc.). | P1 |
| 7.4 | If you have a plan with limited minutes, make calls until you approach or exceed the limit (or trigger quota in test). | When over limit, new inbound/outbound is rejected or blocked with a clear message. | P1 |

---

## 8. Settings

| # | Steps | Expected result | Severity if it fails |
|---|--------|------------------|----------------------|
| 8.1 | Settings → Business (or Company). Edit business name; save. | Name saves; no error. | P1 |
| 8.2 | Open a receptionist → **Instructions**. Change voice preset; tap Save. | Success (or clear error). | P1 |
| 8.3 | Open a receptionist → **Services** (or Staff/Locations/Promos for business mode). Add one item, then delete it. | **Confirmation dialog** before delete; after confirm, item is removed. | P1 |
| 8.4 | Receptionist detail → **Delete receptionist**. Confirm in the dialog. | Receptionist is removed (soft delete); you’re taken to receptionists list; number released if applicable. | P0 |
| 8.5 | Sign out from Settings (or app bar). | Session ends; you see landing or login. | P1 |

---

## 9. Landing page

| # | Steps | Expected result | Severity if it fails |
|---|--------|------------------|----------------------|
| 9.1 | Open the production landing URL in a browser (e.g. `https://echodesk.us` or your domain). | Page loads; title “AI Receptionist” / “Echodesk”; no blank or 404. | P0 |
| 9.2 | Click **Get Started** / **Log in** (or equivalent). | Navigates to app or auth; no broken link. | P0 |
| 9.3 | Check on mobile (or responsive mode). | Layout is usable; CTA and key copy are visible. | P1 |

---

## Quick checklist (order to run)

- [ ] **Onboarding:** 1.1 → 1.5 (redirect, calendar, skip)
- [ ] **Wizard:** 2.1, 2.5, 2.6 (full flow, success, no transfer option)
- [ ] **Calendar:** 3.1, 3.4 (status, required for create)
- [ ] **Calls:** 4.1, 4.2, 4.4 (inbound, reply, history)
- [ ] **Booking:** 5.1, 5.2, 5.3 (book by voice, confirm, event in Calendar)
- [ ] **Transfer:** 6.1 (no option in wizard)
- [ ] **Billing:** 7.1, 7.2 (checkout, return)
- [ ] **Settings:** 8.3, 8.4 (confirm delete, delete receptionist)
- [ ] **Landing:** 9.1, 9.2

**Rough time:** Critical path (P0) ~1–1.5 h; full plan ~2.5–4 h depending on Stripe and call setup.
