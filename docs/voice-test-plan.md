# Voice AI Level 2 – Manual Test Plan & Performance Targets

Run this audit weekly (30–60 min). Use 3 different phones: iPhone, Android, landline.

## Performance Targets (cpx31)

| Metric | Target | How to measure |
|--------|--------|----------------|
| **Latency (with tool call)** | P95 &lt; 3.5 s | From "user stops speaking" to "first TTS chunk" — check `total_latency_ms` in logs |
| **Latency (no tool)** | P95 &lt; 2.5 s | Same, for simple Q&A turns |
| **Booking success rate** | ≥ 98% | When Calendar + Ollama healthy; count create/reschedule success vs attempts |
| **Error handling** | ≥ 99.5% | On Calendar/network errors: graceful message, no crash |
| **Memory** | &lt; 2 GB RSS | One concurrent call; no unbounded growth over 10 calls |
| **Concurrency** | ≥ 2 calls | cpx31 handles 2 concurrent streams without OOM or severe latency regression |

### Logging for Performance

The voice server logs timing per turn:
```
timing stream_sid=... speech_end=... llm_start=... llm_end=... llm_ms=...
timing stream_sid=... tts_end=... total_latency_ms=...
```

Use `pm2 logs callbot-voice -f | grep timing` to collect samples. Full transcripts are logged at call end: `call_transcript stream_sid=...`.

---

## Success Metrics (score 1–10 per scenario)

| Metric | Description |
|--------|-------------|
| **Naturalness & empathy** | Feels human, not robotic; acknowledges caller's situation |
| **Booking accuracy** | Correct service, date, time, name; event matches in Calendar |
| **Memory** | Remembers previous details in same call (e.g. "actually 11am") |
| **Speed** | Latency &lt; 1.5 s ideal (2.5 s acceptable) |
| **Error recovery** | Handles misunderstandings, low STT confidence, calendar errors gracefully |
| **Calendar sync** | Create/reschedule succeed when slots are free |

---

## 10 Test Scenarios

| # | Scenario | Steps | Pass criteria | Score (1–10) |
|---|----------|--------|----------------|--------------|
| 1 | **Happy path booking** | Call → greet → "I'd like to book a haircut tomorrow at 2pm" | AI checks calendar, creates event, confirms; event appears in Google Calendar with correct summary. | |
| 2 | **Conflict handling** | Create an event manually for a slot, then have AI book the same slot | AI reports slot unavailable and suggests alternatives from `suggested_slots`. | |
| 3 | **Reschedule** | "I need to move my appointment to 3pm" (after booking or referring to known event) | AI reschedules; event in Calendar shows new time. | |
| 4 | **Low STT confidence** | Mumble or speak very quietly | AI says "I'm sorry, I didn't catch that. Could you repeat?" — no hallucinated reply. | |
| 5 | **Clarification** | "I want an appointment" (no date/time) | AI asks for date and time one at a time, then completes booking. | |
| 6 | **Services and pricing** | "What do you offer and how much?" | Answer matches configured services and prices from receptionist settings. | |
| 7 | **Staff** | "Can I see Sarah?" (or configured staff name) | AI acknowledges and books with that staff (in event title/description). | |
| 8 | **Error recovery** | Simulate Calendar API down (wrong URL) or 401 | AI: "I'm having trouble with the calendar right now. Please try again or leave your number." No crash. | |
| 9 | **Multi-turn memory** | "Book me for Tuesday at 10am" → "Actually make it 11am" | AI uses context and updates the same booking to 11am (reschedule, not duplicate). | |
| 10 | **Barge-in** | Speak over a long AI response | N/A — not yet implemented. Document as "same as current behaviour". | |

---

## Additional Scenarios (Level 2+)

| Scenario | Steps | Pass criteria |
|----------|--------|----------------|
| **After-hours** | Call outside business hours (if configured) | AI states hours or offers callback. |
| **Price + promo** | "What's the price?" then "Any promos?" | Correct prices and promo codes. |
| **Angry caller** | Simulate frustration: "This is ridiculous!" | AI acknowledges: "I understand this is frustrating. Let me help." |
| **Transfer to human** | "I want to speak to a real person" | AI offers to take number or explains how to reach human. |

---

## Outbound Call Testing

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Call `POST /api/telnyx/outbound` with `{ receptionist_id, to }` (authenticated) | Returns `{ call_control_id, ok: true }` |
| 2 | Answer the call on the destination phone | AI greets, same voice pipeline as inbound |
| 3 | Check Supabase `call_usage` | New row with `direction = 'outbound'` |

## Quota Block Testing

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Use a fixed plan (Starter/Pro/Business) with outbound minutes exhausted | — |
| 2 | Call `POST /api/telnyx/outbound` | Returns `403` with message "No outbound minutes remaining this period" |
| 3 | PAYG users | Always allowed (no quota) |

## Automated Testing (future)

Create a weekly script that:
1. Calls Telnyx DID or uses Telnyx API to simulate inbound call
2. Sends predefined audio clips (ElevenLabs or recorded)
3. Checks Supabase for correct action (appointment created, etc.)

See [VOICE_SETUP.md](VOICE_SETUP.md) and [TELNYX_SETUP.md](TELNYX_SETUP.md) for deployment and env setup.
