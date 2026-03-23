# Call Recording — Backend Fields

This document describes the backend fields used for call recording visibility and playback.

## Database (call_logs table)

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `recording_status` | TEXT | | One of: `available`, `processing`, `not_recorded`, `failed` |
| `recording_url` | TEXT | | Playback/download URL (e.g. from Telnyx S3) |
| `recorded_at` | TIMESTAMPTZ | | When recording was saved/ready |
| `recording_duration_seconds` | INTEGER | | Duration of the recording |

## Status values and UI behavior

| Status | UI label | Explanation shown |
|--------|----------|-------------------|
| `available` | Available | Play, Download, Copy link actions shown |
| `processing` | Processing | "Recording is being processed. Check back in a few minutes." |
| `not_recorded` | Not recorded | "This call was not recorded. Recording may be disabled or consent was not given." |
| `failed` | Failed | "Recording failed. The call may have been too short or an error occurred." |
| `null` / absent | Not recorded | Same as `not_recorded` |

## API

The call-history endpoint (`GET /api/mobile/receptionists/:id/call-history`) returns these fields for each call. The call detail screen receives this data via navigation `extra`.

## Backend population

- **call.recording.saved** (Telnyx CDR webhook): When Telnyx delivers a recording, the CDR handler updates `call_logs` with `recording_status`, `recording_url`, `recorded_at`, `recording_duration_seconds`.
- **Default**: No recording fields set → UI shows "Not recorded".

## Telnyx recording URL expiry

Telnyx default recording URLs expire in ~10 minutes. For permanent access, configure custom storage (AWS S3 or Google Cloud Storage) in Telnyx. The app will display whatever URL the backend stores; if expired, Play/Download will fail with an error.

## Behavior for missing recordings

- `recording_status` null/absent → "Not recorded" with explanation
- `recording_status` = `available` but `recording_url` empty → "Failed"
- Recording URL returns 404/403 when opened → User sees "Could not play" / "Could not open link"
