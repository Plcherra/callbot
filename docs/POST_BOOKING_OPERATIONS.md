# Post-Booking Operations — Follow-up Workflow

## Overview

Business owners can manage appointment follow-up: send or resend confirmation messages, attach payment links, service instructions, addresses, and video meeting links.

## Follow-up Section (Appointment Detail)

- **Confirmation status**: Sent / Not sent
- **Last sent timestamp**: When confirmation SMS was last sent
- **Channel**: SMS (for now)
- **Payment link attached**: Yes / No
- **Instructions attached**: Yes / No

## Actions

| Action | Description |
|--------|-------------|
| Send confirmation | Opens message composer; sends SMS to caller |
| Resend confirmation | Same as above; shown after first send |
| Payment link | Add or edit payment URL |
| Service instructions | Add or edit prep instructions for customer |
| Address | For `location_type=customer_address` |
| Meeting link | For `location_type=video_meeting` |
| Address / link | For other types (generic) |

## Message Composer

- Shows default template built from: `followup_message_resolved` + payment_link + meeting_instructions + location
- User can edit before sending
- Tone: concise, business-safe

## Service-Type Aware Fields

- **Address-based** (`location_type=customer_address`): Shows Address field
- **Video call** (`location_type=video_meeting`): Shows Meeting link field
- **Generic / no service**: Shows "Generic appointment" warning; Address/link field available

## Backend Endpoints

- `POST /api/mobile/appointments/:id/send-confirmation`  
  - Body: `{ "message"?: string }`  
  - Sends SMS to `caller_number` via Telnyx. Updates `confirmation_message_sent_at`, `payment_link_sent_at`.

## Backend Fields

- `meeting_instructions` — Prep instructions (PATCH)
- `confirmation_message_sent_at` — Set when SMS sent
- `payment_link_sent_at` — Set when SMS included payment link
- `location_type` — Drives address vs video link UI (`customer_address`, `video_meeting`, etc.)
