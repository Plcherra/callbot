# Call History – Required Migrations

The mobile call history API (`/api/mobile/receptionists/{id}/call-history`) uses these `call_logs` columns. The backend is compatible with older schemas and will fall back to a reduced column set when optional columns are missing, but applying these migrations provides full functionality.

## Base columns (always required)

From **016_receptionist_config_and_call_logs.sql**:
- `id`, `call_control_id`, `receptionist_id`, `user_id`, `from_number`, `to_number`, `direction`, `status`
- `started_at`, `answered_at`, `streaming_started_at`, `ended_at`, `duration_seconds`, `cost_cents`, `transcript`, `created_at`

## Optional columns (apply migrations if missing)

| Column                    | Migration                             | Purpose                                      |
|---------------------------|----------------------------------------|----------------------------------------------|
| `outcome`                 | **032_call_logs_outcome.sql**          | Explicit outcome (booked, missed, completed) |
| `recording_status`        | **031_call_logs_recording_fields.sql** | Recording availability status                |
| `recording_url`           | **031_call_logs_recording_fields.sql** | Playback URL                                 |
| `recorded_at`             | **031_call_logs_recording_fields.sql** | When recording was saved                     |
| `recording_duration_seconds` | **031_call_logs_recording_fields.sql** | Duration of the recording                    |

## VPS / remote DB

If the API logs `[CALL_HISTORY_SCHEMA_FALLBACK] using_reduced_select=true` or startup warns about missing columns, run:

```bash
# Apply both migrations (order: 031 then 032)
supabase db push
# or manually:
psql $DATABASE_URL -f supabase/migrations/031_call_logs_recording_fields.sql
psql $DATABASE_URL -f supabase/migrations/032_call_logs_outcome.sql
```

After applying, call history will return the full column set and the fallback will no longer be used.
