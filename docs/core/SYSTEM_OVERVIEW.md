# System overview

Echodesk voice backend: inbound calls hit Telnyx, stream audio to this service over WebSocket, run speech-to-text → LLM → text-to-speech, and use calendar tools backed by Supabase + Google Calendar. Booking confirmations can trigger outbound SMS via Telnyx.

## Call flow (voice)

1. **Telnyx** sends `call.initiated` to `POST /api/telnyx/voice` (verified webhook).
2. Handler **answers** the call, caches prompt/greeting, and stores a **WebSocket stream URL** until `call.answered`.
3. On **answered**, Telnyx receives `streaming_start` with `stream_url` pointing at **`/api/voice/stream`** (derived from `TELNYX_WEBHOOK_BASE_URL` or `TELNYX_STREAM_BASE_URL`, `https` → `wss`).
4. **Bidirectional RTP** audio flows over that WebSocket; chunks go to **Deepgram** live STT.
5. **Voice pipeline** (`voice/pipeline.py`) turns finalized transcripts into **Grok** completions, optionally calling **`/api/voice/calendar`** (`check_availability`, `create_appointment`, `reschedule_appointment`).
6. Assistant text is synthesized with **Google Cloud TTS** and sent back as media on the same WebSocket to Telnyx.

## Booking flow

1. Caller asks for availability → fast path or LLM may call **`check_availability`** → tool result updates **in-memory offered slots** (`exact_slots` / `suggested_slots`) and optional `last_date_text`.
2. Caller picks a time → **slot selection** (see `VOICE_PIPELINE.md`) may map speech to an offered slot and call **`create_appointment`** directly, or the LLM calls the tool with structured args.
3. **`create_appointment`** in `calendar_api/_booking.py` writes the calendar event, persists **appointment** (and related) rows in **Supabase**, and may send **SMS** (see `SMS_FLOW.md`).
4. Spoken confirmation uses a deterministic template when possible; **`sms_followup`** metadata is attached to the in-memory **voice session** for truth-aware wording about SMS.

## SMS flow (high level)

1. After a successful booking, **`send_sms`** posts to Telnyx Messages API with **`webhook_url`** = `{TELNYX_WEBHOOK_BASE_URL}/api/telnyx/sms`.
2. **Telnyx** accepts the API request → we record **`api_accepted`** in the tool response payload for the voice layer.
3. **`message.finalized`** hits **`POST /api/telnyx/sms`** → **`sms_messages`** row is updated (`status`, optional provider errors). An in-process registry records delivery state for the **same voice call** (short-lived).

## Where state lives

| Concern | Storage |
|--------|---------|
| Current turn, debounce, Grok task, offered slots for this call | **In-process** only (voice pipeline on the WebSocket worker) |
| Prompt cache keyed by `call_control_id` | **In-memory** (`prompts/fetch.py`) |
| Pending stream URL per call | **In-memory** (`voice_webhook.py`) |
| SMS delivery hint for TTS wording | **In-memory** registry keyed by Telnyx message id |
| Receptionists, users, plans, call logs, appointments, SMS rows | **Supabase** (Postgres) |
| Calendar events | **Google Calendar** (via OAuth’d account) |

A new engineer should read **`VOICE_PIPELINE.md`**, **`SMS_FLOW.md`**, **`../ops/RUNBOOK.md`**, and **`ENV.md`** next; this file stays intentionally short.
