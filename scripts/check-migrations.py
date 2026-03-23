#!/usr/bin/env python3
"""Check that required DB migrations (030, 031, 032) are applied. Exit 0 if OK, 1 if missing."""

import os
import sys

# Add project root for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

def main():
    try:
        from backend.supabase_client import create_service_role_client
    except ImportError:
        print("check-migrations: supabase_client not found; skipping")
        return 0

    supabase = create_service_role_client()

    # Check call_logs optional columns (031, 032)
    try:
        supabase.table("call_logs").select(
            "id, outcome, recording_status, recording_url, recorded_at, recording_duration_seconds"
        ).limit(1).execute()
    except Exception as e:
        err = (str(e) or "").lower()
        if "does not exist" in err or ("column" in err and ("not found" in err or "unknown" in err)):
            print("MISSING: call_logs optional columns (migrations 031, 032)")
            return 1
        raise

    # Check appointments review columns (030)
    try:
        supabase.table("appointments").select(
            "id, status, caller_number, call_log_id, confirmation_message_sent_at, payment_link_sent_at"
        ).limit(1).execute()
    except Exception as e:
        err = (str(e) or "").lower()
        if "does not exist" in err or ("column" in err and ("not found" in err or "unknown" in err)):
            print("MISSING: appointments review columns (migration 030)")
            return 1
        raise

    print("OK: migrations 030, 031, 032 applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
