# Phone numbers

We use **Twilio** for phone number provisioning. Each receptionist can have a Twilio number or bring your own.

- **Provider**: Twilio only.
- **New number**: Choose an area code when creating a receptionist; a Twilio number is provisioned and configured with the voice webhook.
- **Bring your own**: Add your existing Twilio number SID when creating a receptionist; the webhook is configured on that number.
- **Voice**: Twilio routes calls to the self-hosted voice server (see [VOICE_SETUP.md](VOICE_SETUP.md)).
