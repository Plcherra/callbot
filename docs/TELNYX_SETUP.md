# Telnyx Setup (echodesk voice AI)

This guide covers Telnyx configuration for voice webhooks, DIDs, and CDR.

## Environment Variables

```bash
TELNYX_API_KEY=your_api_key
TELNYX_PUBLIC_KEY=  # for webhook verification (optional if using TELNYX_WEBHOOK_SECRET)
TELNYX_WEBHOOK_SECRET=  # for HMAC webhook verification
TELNYX_WEBHOOK_BASE_URL=https://echodesk.us
TELNYX_CONNECTION_ID=  # optional, for Call Control connection
```

## Webhooks

Configure in [Telnyx Portal](https://portal.telnyx.com) → Messaging → Webhooks (or Voice):

| Event | URL |
|-------|-----|
| `call.initiated` | `https://echodesk.us/api/telnyx/voice` |
| `call.call-ended` | `https://echodesk.us/api/telnyx/cdr` |
| `call.hangup` | `https://echodesk.us/api/telnyx/cdr` |

## Where to Find the "Connection" (Call Control) in the Portal

**There is no separate "Connections" nav item** for Call Control. Telnyx renamed it. The equivalent is:

1. **Left nav**: **Real-Time Communications** → **Voice** → **Programmable Voice**
2. **Tabs**: Click **Voice API Applications** (the first tab)
3. This is your Call Control / Connection setup. Click **Create Voice App** if you don't have one yet.

When you create a Voice App (or open an existing one), the **ID** shown in the app details is your `TELNYX_CONNECTION_ID`. Copy that ID into `.env.local` / your VPS env.

The "Connections" dropdown in **Reporting → Detailed Records** is only for filtering reports; it is not where you create or manage Call Control connections.

---

## DID Provisioning

1. Sign up at [portal.telnyx.com](https://portal.telnyx.com), complete KYC.
2. Buy 1–2 test US local DIDs ($1/mo each).
3. Create a **Voice API Application** (see above) and set its webhook URL to `https://echodesk.us/api/telnyx/voice`.
4. Assign your numbers to that application (or they auto-link when provisioned via our backend with `TELNYX_CONNECTION_ID` set).

## Elastic SIP Trunk

For SIP-based routing:

1. Create Elastic SIP Trunk in Telnyx Portal.
2. Point inbound to your Cloudflare domain or Hetzner IP.
3. Configure authentication (IP allowlist or digest).
4. Link DIDs to the trunk.

## CDR Webhook

Telnyx sends CDR events on call end. Configure CDR webhook URL to `https://echodesk.us/api/telnyx/cdr`.

## Local Testing

Use ngrok or Cloudflare Tunnel to expose your local server:

```bash
ngrok http 3000
# Set TELNYX_WEBHOOK_BASE_URL to the ngrok URL
```

Run the custom server for WebSocket support:

```bash
node server.js
```
