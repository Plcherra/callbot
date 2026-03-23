# Appointment Review — Backend Fields

This document lists the backend fields used by the appointment review workflow and their requirements for full functionality.

## Database (appointments table)

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | ✓ | Primary key |
| `receptionist_id` | UUID | ✓ | FK to receptionists |
| `event_id` | TEXT | ✓ | Google Calendar event ID |
| `start_time` | TIMESTAMPTZ | ✓ | Appointment start |
| `end_time` | TIMESTAMPTZ | ✓ | Appointment end |
| `duration_minutes` | INTEGER | ✓ | Duration |
| `summary` | TEXT | ✓ | Title/summary |
| `description` | TEXT | | Event description |
| `service_id` | UUID | | FK to services (nullable for generic) |
| `service_name` | TEXT | | Resolved or user-provided service name |
| `location_type` | TEXT | | e.g. customer_address, video_meeting |
| `location_text` | TEXT | | Free-form location (Zoom link, etc.) |
| `customer_address` | TEXT | | Structured address when applicable |
| `price_cents` | INTEGER | | Price if known |
| `notes` | TEXT | | Owner notes / instructions |
| `status` | TEXT | ✓ | confirmed \| needs_review \| cancelled \| completed |
| `caller_number` | TEXT | | E.164 from voice call (set at booking) |
| `call_log_id` | UUID | | FK to call_logs for transcript (optional) |
| `booking_mode` | TEXT | | service_based \| generic |
| `followup_mode` | TEXT | | Resolved follow-up mode |
| `followup_message_resolved` | TEXT | | Resolved follow-up message |
| `payment_link` | TEXT | | Payment URL if configured |
| `meeting_instructions` | TEXT | | Meeting instructions |
| `owner_selected_platform` | TEXT | | Video platform label |
| `internal_followup_notes` | TEXT | | Internal notes |
| `confirmation_message_sent_at` | TIMESTAMPTZ | | When confirmation SMS was sent |
| `payment_link_sent_at` | TIMESTAMPTZ | | When payment link was sent |
| `created_at` | TIMESTAMPTZ | ✓ | Created timestamp |
| `updated_at` | TIMESTAMPTZ | ✓ | Updated timestamp |

## API Endpoints

- `GET /api/mobile/appointments` — List appointments (optional `?status=`)
- `GET /api/mobile/appointments/:id` — Get single appointment
- `PATCH /api/mobile/appointments/:id` — Update (status, service_name, notes, payment_link, location_text, customer_address, internal_followup_notes, meeting_instructions)
- `POST /api/mobile/appointments/:id/send-confirmation` — Send confirmation SMS. Body: `{ "message"?: string }`. If message omitted, backend builds from appointment (followup_message_resolved + payment_link + meeting_instructions + location).

## Fields for Full Functionality

### Currently Populated

- `caller_number`: Set at booking from `params.caller_phone` (voice pipeline).
- `status`: Set at booking — `needs_review` for generic, `confirmed` for service-based.
- `booking_mode`: Set at booking.

### TODO / Future Enhancements

1. **Transcript**: Requires `call_log_id` linking appointment to `call_logs`. The voice pipeline would need to pass `call_control_id` or `call_log_id` when creating the appointment so we can correlate. Until then, transcript shows "—" in the UI.

2. **Confirmation message status**: `confirmation_message_sent_at` is not yet set when SMS is sent at booking. Add an UPDATE after successful `telnyx_sms.send_sms` in `_booking.py` to set this timestamp.

3. **Payment link sent**: `payment_link_sent_at` — same as above when payment link is included in the SMS.

4. **Send confirmation message** (manual action): `POST /api/mobile/appointments/:id/send-confirmation` — Sends SMS via Telnyx to `caller_number`. Updates `confirmation_message_sent_at` and `payment_link_sent_at` on success.

5. **Calendar sync on reject**: When status is set to `cancelled`, optionally delete the Google Calendar event. Currently we only update the DB.

## UI Fallbacks

The mobile app uses TODO-safe fallbacks when fields are missing:

- `caller_number` null → show "—"
- `transcript` null → omit transcript section
- `confirmation_message_sent_at` null → show "—"
- `receptionist_name` → from joined receptionists map; fallback "—"
- `service_name` null/empty → show "Generic appointment"
