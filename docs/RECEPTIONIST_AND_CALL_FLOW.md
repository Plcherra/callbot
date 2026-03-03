# Receptionist Creation & Call Flow

How receptionists and phone numbers are created, and where to monitor everything.

---

## 1. Create Receptionist Flow (Web or Mobile)

```
User clicks "Create Receptionist"
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  createReceptionist (app/actions/createReceptionist.ts)          │
│  or POST /api/mobile/receptionists/create                        │
└─────────────────────────────────────────────────────────────────┘
         │
         ├─► Check: user has active subscription
         ├─► Check: Google Calendar connected (calendar_refresh_token)
         │
         ├─── If "New number" ───────────────────────────────────────┐
         │         │                                                  │
         │         ▼                                                  │
         │    provisionTelnyxNumber(areaCode)                         │
         │         │                                                  │
         │         ├─► Telnyx API: search available numbers           │
         │         │   GET /v2/available_phone_numbers?...            │
         │         │                                                  │
         │         ├─► Telnyx API: order number                       │
         │         │   POST /v2/phone_numbers                         │
         │         │   → Returns: id (phone_number_id), phone_number   │
         │         │                                                  │
         │         └─► Telnyx API: configure voice webhook            │
         │             PATCH /v2/phone_numbers/{id}                   │
         │             body: { webhook_url: "https://echodesk.us/     │
         │                     api/telnyx/voice" }                    │
         │                                                           │
         └─── If "Bring your own" ──────────────────────────────────┤
                   │                                                  │
                   └─► (Optional) configureExistingTelnyxNumber       │
                       if provider_sid provided                       │
                                                                     │
         ◄──────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase: INSERT into receptionists                             │
│  - user_id, name, phone_number, inbound_phone_number             │
│  - telnyx_phone_number_id, telnyx_phone_number                   │
│  - calendar_id, status, extra_instructions                       │
└─────────────────────────────────────────────────────────────────┘
         │
         ├─► Supabase: INSERT staff, promos (from wizard)
         └─► Supabase: UPDATE users (onboarding_completed_at)
```

---

## 2. What Creates What

| Created By | What | Where Stored |
|------------|------|--------------|
| **Telnyx API** | Phone number (DID) | Telnyx account, linked to your Connection |
| **Your app** | `receptionists` row | Supabase `receptionists` table |
| **Your app** | `staff`, `promos` rows | Supabase (if wizard data) |
| **Telnyx** | Voice webhook config | Stored on the Telnyx phone number record |

The Telnyx number is **provisioned in your Telnyx account** and **configured** to send call events to your app. Your app stores the mapping (`receptionist_id` ↔ `telnyx_phone_number`) in Supabase.

---

## 3. Incoming Call Flow

```
Caller dials DID
      │
      ▼
Telnyx receives call
      │
      ▼
Telnyx webhook: POST https://echodesk.us/api/telnyx/voice
      event_type: "call.initiated"
      payload: { to: our DID, from: caller }
      │
      ▼
Your app: getReceptionistByPhoneNumber(supabase, ourDid)
      → Look up receptionists.telnyx_phone_number or inbound_phone_number
      │
      ▼
Your app: answer + stream_start
      → Telnyx API: answer call, start streaming to WebSocket
      │
      ▼
Voice pipeline: /api/voice/stream
      → Deepgram (STT) → Grok (LLM) → ElevenLabs (TTS)
      → Fetches prompt from /api/receptionist-prompt
      → Calendar via /api/voice/calendar
      │
      ▼
Call ends
      │
      ▼
Telnyx webhook: POST https://echodesk.us/api/telnyx/cdr
      event_type: "call.call-ended" or "call.hangup"
      payload: { duration_millis, to, from, ... }
      │
      ▼
Your app: insertCallUsage() → Supabase call_usage
      → supabase.rpc("increment_user_plan_usage")
```

---

## 4. Where to Monitor

### Telnyx Portal (portal.telnyx.com)

| Section | What to check |
|---------|----------------|
| **Phone Numbers** | All DIDs you own; status, voice URL |
| **Connections** | Call Control connection; webhook URL |
| **Webhooks** | Configure `call.initiated` → `/api/telnyx/voice`, `call.call-ended` / `call.hangup` → `/api/telnyx/cdr` |
| **Logs / Events** | Webhook delivery, API errors |

### Supabase (supabase.com dashboard)

| Table | Purpose |
|-------|---------|
| `receptionists` | All receptionists; `telnyx_phone_number`, `telnyx_phone_number_id`, `inbound_phone_number` |
| `call_usage` | Call records; `started_at`, `ended_at`, `duration_seconds`, `direction`, `transcript` |
| `usage_snapshots` | Per-receptionist usage per period (from cron) |
| `user_plans` | Allocated/used minutes, quota |

### Echodesk Web App

| Page | What you see |
|------|--------------|
| **Dashboard** | Subscription, receptionists list, total minutes |
| **Receptionists** | List of receptionists |
| **Receptionist detail** (`/receptionists/[id]`) | Overview, call history (from `call_usage`), outbound call |
| **Settings** | Billing portal, plan split |

### Your VPS / Server

| Where | What |
|-------|------|
| `pm2 logs callbot` | App logs; errors from Telnyx, CDR, voice pipeline |
| `pm2 show callbot` | Process status, env vars |

---

## 5. Env Vars Required for Creation

| Variable | Used when |
|----------|-----------|
| `TELNYX_API_KEY` | Provisioning and configuring numbers |
| `TELNYX_WEBHOOK_BASE_URL` | Building voice webhook URL (e.g. `https://echodesk.us`) |
| `TELNYX_CONNECTION_ID` | Optional for provisioning; required for outbound calls |

---

## 6. Telnyx Webhook Configuration

Telnyx must know where to send events. Two approaches:

**A. Per-number (automatic)**  
`configureVoiceUrl()` sets `webhook_url` on each number via the Telnyx API. No extra Portal setup for that number.

**B. Connection-level**  
In [Telnyx Portal](https://portal.telnyx.com) → Connections → Your Connection → set Event Webhook URL to `https://echodesk.us/api/telnyx/voice`.

**CDR**  
In Portal → Webhooks (or your Connection) → add URL `https://echodesk.us/api/telnyx/cdr` for `call.call-ended` and `call.hangup`.
