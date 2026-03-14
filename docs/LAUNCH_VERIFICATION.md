# Launch Verification Guide

This document provides exact test steps, SQL queries, and expected results for verifying the P0 launch fixes.

---

## 1. Call Lifecycle Diagnostic

### Debug Logging

Temporary `[CALL_DIAG]` logs have been added to trace the call flow. When a call is placed, check backend logs for:

- `[CALL_DIAG] voice_webhook received event_type=... call_control_id=... call_session_id=... call_leg_id=...`
- `[CALL_DIAG] call_logs inserted id=... for call_control_id=...`
- `[CALL_DIAG] Forwarding call.hangup to CDR handler`
- `[CALL_DIAG] CDR received event_type=... call_control_id=...`
- `[CALL_DIAG] call_logs finalized id=... call_control_id=... duration_seconds=...`
- `[CALL_DIAG] call_usage inserted id=... for call_control_id=...`
- `[CALL_DIAG] dashboard-summary user_id=... total_calls=... total_minutes=...`

### Test Steps for Call Flow

1. **Prerequisites**
   - Backend running (e.g. `uvicorn main:app`)
   - At least one active receptionist with `telnyx_phone_number` or `inbound_phone_number` set
   - Telnyx Event Webhook URL configured to `https://<your-domain>/api/telnyx/voice` (not a separate CDR URL)

2. **Place a test call**
   - Call the receptionist's phone number from your mobile
   - Let the call connect and talk for at least 10–20 seconds
   - Hang up

3. **Verify in backend logs**
   - `call.initiated` → `call_logs inserted id=...`
   - `call.answered` → (no CDR)
   - `call.hangup` or `call.call-ended` → `Forwarding to CDR handler` → `call_logs finalized` → `call_usage inserted`

4. **Verify in Supabase** (see SQL below)

5. **Verify in Flutter app**
   - Open Dashboard → Total Calls and Total Minutes should increase
   - Open Receptionist detail → Call history should show the call

---

## 2. SQL Queries to Verify Call Logs

Run these in the Supabase SQL Editor.

### Check call_logs after a test call

```sql
SELECT
  id,
  call_control_id,
  receptionist_id,
  from_number,
  to_number,
  direction,
  status,
  started_at,
  ended_at,
  duration_seconds
FROM call_logs
ORDER BY started_at DESC
LIMIT 10;
```

**Expected:** Rows with `status = 'completed'`, `ended_at` and `duration_seconds` populated.

### Check call_usage

```sql
SELECT
  id,
  receptionist_id,
  call_sid,
  telnyx_call_control_id,
  started_at,
  ended_at,
  duration_seconds,
  direction,
  status
FROM call_usage
ORDER BY ended_at DESC
LIMIT 10;
```

**Expected:** One row per completed call, `status = 'completed'`, `duration_seconds` > 0.

### Check dashboard summary (RPC)

```sql
SELECT get_dashboard_summary('<your_user_id>'::uuid);
```

**Expected:** `{"total_calls": N, "total_seconds": S}` where N > 0 and S > 0 after a completed call.

---

## 3. Expected Dashboard Results

| Metric             | Source                          | Expected after 1 call (~30s)   |
|--------------------|----------------------------------|--------------------------------|
| Total Calls        | `get_dashboard_summary` (call_logs) | 1                              |
| Total Minutes      | `total_seconds / 60`            | ~0.5 (or actual duration)      |
| Minutes this period| `usage_snapshots` or `user_plans` | Non-zero (may lag until cron)  |
| Recent calls list  | `call_logs` top 10              | Shows the call                 |

---

## 4. Billing Portal & Checkout Test Steps

### Billing Portal

1. User **with** `stripe_customer_id`: Settings → Billing Portal
   - **Expected:** Loading indicator → Stripe portal opens in browser; SnackBar "Opening billing portal..."
2. User **without** subscription: Settings → Billing Portal
   - **Expected:** SnackBar "No billing account. Complete a subscription first."

### Subscribe / Upgrade

1. Settings → Subscribe / Upgrade
   - **Expected:** Checkout screen loads → WebView shows Stripe Checkout
2. On error (e.g. invalid plan): Retry button appears
3. Complete a test payment → Deep link returns to app → Subscription syncs

---

## 5. Receptionist Settings Verification

1. Open Receptionist → Settings → Instructions tab
2. Edit: Assistant identity, Greeting, Core instructions, Voice ID, Extra notes
3. Tap Save
   - **Expected:** "Saved" SnackBar; data persisted via PATCH API
4. Place a test call
   - **Expected:** Greeting and voice reflect saved values

---

## 6. Responsive Layout Verification

1. Run app on **tablet** or **web** (wide viewport)
2. Navigate: Dashboard, Receptionists, Receptionist detail, Settings, Landing
3. **Expected:** Content centered with max-width ~800px; no full-width stretch on large screens

---

## 7. Troubleshooting Call History

If calls still don't appear:

1. **Telnyx Event Webhook URL** must be `https://<domain>/api/telnyx/voice` (single URL for all events).
2. **Receptionist lookup:** `telnyx_phone_number` or `inbound_phone_number` must match the DID Telnyx sends (e.g. `+16176137764`).
3. **CDR payload:** Check logs for `[CALL_DIAG] CDR received` — if `call_control_id` is null, Telnyx may use different field names; the CDR handler now falls back to `call_leg_id`, `call_session_id`.

See also: [CALL_HISTORY_TROUBLESHOOTING.md](./CALL_HISTORY_TROUBLESHOOTING.md)
