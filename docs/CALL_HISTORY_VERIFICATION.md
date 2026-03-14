# Call History Verification Checklist

After deploying the call history DID matching fix, verify with one real inbound call.

## Prerequisites

- `TELNYX_ALLOW_RECEPTIONIST_FALLBACK` must be **unset or false** (default). Keep it disabled so bad DID matches are not masked.
- Receptionist has `telnyx_phone_number` or `inbound_phone_number` matching the Telnyx DID that receives the call.

## Verification Steps

### 1. Place one inbound test call

Call the business number (Telnyx DID) from a personal/customer phone. Answer and talk briefly, then hang up.

### 2. Check backend logs

**On call.initiated (voice webhook):**

```
[CALL_DIAG] call.initiated raw from=... to=... raw_direction=... -> direction=... our_did=... caller_number=...
[CALL_DIAG] receptionist lookup raw_did=... canonical_did=... direction=...
[CALL_DIAG] receptionist matched id=... matched_via=telnyx_phone_number|inbound_phone_number|phone_number (...)
[CALL_DIAG] call.initiated processed call_control_id=... call_logs_insert_id=... direction=... our_did=... caller=...
```

**Verify:**

- `raw_direction` = `incoming` (Telnyx value)
- `direction` = `inbound` (parsed)
- `our_did` = business/Telnyx DID (e.g. +16176137764), **not** the caller's personal number
- `caller_number` = customer phone (e.g. +16176537747)
- `matched_via` shows which receptionist field matched
- `call_logs_insert_id` = UUID (row was inserted)

**On call.hangup (CDR handler):**

```
[CALL_DIAG] CDR raw from=... to=... raw_direction=... -> direction=... our_did=... caller_number=...
[CALL_DIAG] receptionist matched id=... matched_via=...
[CALL_DIAG] call_logs finalized call_logs_finalize_id=... call_control_id=... duration_seconds=... rows_affected=...
```

**Verify:**

- Same `direction`, `our_did`, `caller_number` semantics
- `call_logs_finalize_id` = same row as insert (matched by `call_control_id`)
- `rows_affected` = 1

### 3. Check dashboard and call history

- Dashboard total calls increments
- Dashboard total minutes updates
- Receptionist call history shows the completed call with correct from/to

### 4. Check Supabase

```sql
SELECT id, call_control_id, receptionist_id, from_number, to_number, direction, status, started_at, ended_at, duration_seconds
FROM call_logs
ORDER BY started_at DESC
LIMIT 5;
```

- One new row with `status='completed'`
- `from_number` = caller (customer)
- `to_number` = business DID
- `direction` = `inbound`

## Troubleshooting

If `our_did` equals the caller number instead of the business DID:

- Check that Telnyx sends `direction: "incoming"` for inbound (the fix maps this to inbound)
- If Telnyx sends a different value, check logs for `raw_direction`

If no receptionist match:

- Ensure `telnyx_phone_number` or `inbound_phone_number` on the receptionist row matches the Telnyx DID exactly (after normalization: +1, 1, or 10 digits)
- Do **not** enable `TELNYX_ALLOW_RECEPTIONIST_FALLBACK` during verification
