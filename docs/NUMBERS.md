# Phone numbers

We use **Telnyx** for phone number provisioning. Each receptionist can have a Telnyx DID or bring your own.

- **Provider**: Telnyx only.
- **New number**: Choose an area code when creating a receptionist; a Telnyx DID is provisioned and configured with the voice webhook.
- **Bring your own**: Add your existing Telnyx phone number ID when creating a receptionist; the webhook is configured on that number.
- **Voice**: Telnyx routes calls to the Next.js WebSocket at `/api/voice/stream` (see [TELNYX_SETUP.md](TELNYX_SETUP.md), [VOICE_SETUP.md](VOICE_SETUP.md)).
