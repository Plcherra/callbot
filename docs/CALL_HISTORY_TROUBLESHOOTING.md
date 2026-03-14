# Call History Not Showing – Troubleshooting

## Why Calls Show 0 / "No calls yet"

The dashboard and call history depend on two webhook flows:

1. **call.initiated** → `/api/telnyx/voice` → inserts row in `call_logs`
2. **call.hangup** / **call.call-ended** → CDR handler → finalizes `call_logs` (status=completed), inserts `call_usage`

If either flow fails, you see empty or zero counts.

---

## Root Cause: CDR Events Go to Voice Webhook, Not CDR

**Telnyx sends all call events to the same Event Webhook URL** (the one configured for your Voice API Application). Typical setup:

- Event Webhook URL: `https://your-domain.com/api/telnyx/voice`
- Events: `call.initiated`, `call.answered`, `call.hangup`, `call.call-ended`, etc.

The voice webhook handles `call.initiated` and `call.answered` but **does not handle** `call.hangup` or `call.call-ended`. Those events hit `/api/telnyx/voice`, return 200, and are ignored.

The CDR endpoint `/api/telnyx/cdr` **never receives** these events, so:

- `call_logs` are never finalized (status stays `initiated` / `answered` / `streaming`)
- `call_usage` is never populated
- Dashboard `get_dashboard_summary` counts only `status='completed'` → **0 calls**
- Minutes are never aggregated → **0 minutes**

---

## Fix: Handle call.hangup in the Voice Webhook

The voice webhook must recognize `call.hangup` and `call.call-ended` and invoke the CDR logic. The backend implements this by forwarding those events to `handle_cdr_webhook`.

---

## Other Possible Causes

### 1. call_logs Never Inserted

If `receptionist_id` or `user_id` is missing, no row is inserted on `call.initiated`.

**Check in Supabase:**

```sql
SELECT id, name, telnyx_phone_number, inbound_phone_number, user_id, status
FROM receptionists
WHERE status = 'active';
```

- `telnyx_phone_number` or `inbound_phone_number` must match the DID Telnyx sends (e.g. `+16176137764`)
- `user_id` must be set

### 2. Wrong Webhook Base URL

If `TELNYX_WEBHOOK_BASE_URL` is `http://localhost:8000`, Telnyx (in the cloud) cannot reach your server. Use your public URL, e.g. `https://echodesk.us`.

### 3. Verify call_logs in Supabase

```sql
SELECT id, call_control_id, receptionist_id, status, started_at, ended_at, duration_seconds
FROM call_logs
ORDER BY started_at DESC
LIMIT 20;
```

- If rows exist with `status` = `initiated` / `answered` / `streaming` → CDR is not running; apply the voice-webhook fix.
- If no rows → voice webhook is not inserting; check receptionist lookup and logs.
