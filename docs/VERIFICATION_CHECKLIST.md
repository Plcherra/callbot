# Receptionist Config and Call Logs — Verification Checklist

Run through this checklist to validate the implementation.

## Prerequisites

- Apply migration `016_receptionist_config_and_call_logs.sql` to Supabase
- Backend running with Telnyx webhooks configured
- Mobile app connected to backend API

## Verification Steps

1. **Save greeting in app**
   - Open a receptionist's Settings → Instructions tab
   - Set a custom greeting (e.g. "Hello! This is the test line. How can I help?")
   - Tap Save
   - Confirm "Saved" toast appears

2. **Place test call**
   - Call the receptionist's phone number from another phone

3. **Confirm spoken greeting changed**
   - The AI should speak your custom greeting, not the default
   - Check backend logs for: `[receptionist config] ... greeting_source=custom`

4. **Confirm call row appears**
   - In Supabase Table Editor, open `call_logs`
   - Find a row with `call_control_id` matching the call
   - Verify `status` is `completed`, `duration_seconds` is set

5. **Confirm dashboard count increments**
   - Open the app Dashboard
   - Verify "Total Calls" and "Total Minutes" have increased
   - Verify "Recent Calls" section shows the new call (if implemented)

## Additional Checks

- **Core Instructions**: Change system prompt in Settings → Instructions, place a test call, verify AI behavior reflects the change
- **Voice ID**: Set a custom ElevenLabs voice_id in Settings, place a test call, verify different voice
- **Short calls**: Hang up immediately after answer — call should still appear in call_logs with `duration_seconds` ≥ 0
