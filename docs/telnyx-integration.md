# Telnyx Integration

How Telnyx webhooks arrive, signature validation, and what endpoints handle what.

## Webhook Flow

1. **Caller dials DID** → Telnyx receives call
2. **Telnyx sends** `POST` to `TELNYX_WEBHOOK_BASE_URL/api/telnyx/voice` with `event_type: call.initiated`
3. **Our backend** (Python): validates signature, looks up receptionist, answers, starts stream
4. **Telnyx connects** WebSocket to `wss://{base}/api/voice/stream?call_sid=...`
5. **On hangup:** Telnyx sends `call.call-ended` / `call.hangup` to `https://echodesk.us/api/telnyx/cdr` (Next.js)

## Endpoints

| Telnyx event      | URL                     | Handler   | Purpose                          |
|-------------------|-------------------------|-----------|----------------------------------|
| `call.initiated`  | `/api/telnyx/voice`     | Python    | Answer, stream_start, FCM push   |
| `call.call-ended` | `/api/telnyx/cdr`       | Next.js   | Insert usage, send call_ended    |
| `call.hangup`     | `/api/telnyx/cdr`       | Next.js   | Same as call-ended               |

## Signature Validation

Telnyx signs webhooks. We verify before processing.

### Ed25519 (API v2, recommended)

- Env: `TELNYX_PUBLIC_KEY` (base64 or PEM from Telnyx Portal → Account → Public Key)
- Headers: `telnyx-signature-ed25519`, `telnyx-timestamp`
- If not set: webhook accepted but warning logged
- If set and invalid: `403 Forbidden` (calls won't answer)

### HMAC (API v1)

- Env: `TELNYX_WEBHOOK_SECRET`
- Header: `t-signature` or `telnyx-signature`

**Fix 403 on calls:** Set `TELNYX_PUBLIC_KEY` in production.

## Portal Configuration

1. **Voice API Application** (Real-Time Communications → Voice → Voice API Applications)
   - Create or edit app
   - Event Webhook URL: `https://echodesk.us/api/telnyx/voice`
   - CDR Webhook URL: `https://echodesk.us/api/telnyx/cdr`
2. **Connection ID** → `TELNYX_CONNECTION_ID` (for outbound, provisioning)
