# Phone numbers

We use **Vapi** for phone number provisioning. Each receptionist gets one Vapi phone number when you create them; there is no shared global number.

- **Limit**: 10 free US numbers per Vapi account. If you hit this limit, creating a new receptionist will fail with a clear message.
- **Beyond 10**: Contact Vapi support or add a provider (e.g. Twilio, Telnyx) later for additional numbers.
- **No `VAPI_PHONE_NUMBER_ID`**: The legacy env var is no longer used; numbers are created per receptionist via the Vapi API.
