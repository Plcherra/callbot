#!/bin/bash
# Test billing/quota pipeline: CDR usage increment, quota check, cron.
# Prereqs: APP_URL, CRON_SECRET, AUTH_TOKEN (Bearer for mobile), USER_ID.

set -e
APP_URL="${APP_URL:-http://localhost:3000}"
CRON_SECRET="${CRON_SECRET:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
USER_ID="${USER_ID:-}"

echo "=== Billing/Quota Test Script ==="
echo "APP_URL=$APP_URL"

# 1. Manual usage insert (simulate CDR) + RPC increment
echo ""
echo "--- 1. SQL: Insert test call_usage and increment user_plan_usage ---"
echo "Run in Supabase SQL Editor (replace USER_ID and RECEPTIONIST_ID):"
echo ""
cat << 'SQL'
-- Insert a test call (replace placeholders)
INSERT INTO call_usage (
  receptionist_id, user_id, call_sid, started_at, ended_at,
  duration_seconds, direction, billed_minutes, status
) VALUES (
  'RECEPTIONIST_ID'::uuid,
  'USER_ID'::uuid,
  'test-call-' || gen_random_uuid()::text,
  NOW() - interval '5 minutes',
  NOW(),
  120,
  'inbound',
  2.0,
  'completed'
)
ON CONFLICT DO NOTHING;

-- Manually increment user_plans (simulates CDR webhook)
SELECT increment_user_plan_usage(
  'USER_ID'::uuid,
  'inbound',
  2.0
);

-- Verify usage
SELECT user_id, used_inbound_minutes, used_outbound_minutes
FROM user_plans
WHERE user_id = 'USER_ID'::uuid;
SQL

# 2. Quota check
echo ""
echo "--- 2. Curl: Check outbound quota ---"
if [ -n "$AUTH_TOKEN" ]; then
  curl -s -H "Authorization: Bearer $AUTH_TOKEN" "$APP_URL/api/quota-check" | jq . 2>/dev/null || curl -s -H "Authorization: Bearer $AUTH_TOKEN" "$APP_URL/api/quota-check"
else
  echo "Set AUTH_TOKEN for Bearer auth, or use cookie. Example:"
  echo "  curl -s -H 'Authorization: Bearer <token>' $APP_URL/api/quota-check"
fi

# 3. Cron billing
echo ""
echo "--- 3. Curl: Trigger payg-billing cron ---"
if [ -n "$CRON_SECRET" ]; then
  curl -s -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/payg-billing" | jq . 2>/dev/null || curl -s -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/payg-billing"
else
  echo "Set CRON_SECRET. Example:"
  echo "  curl -s -H 'Authorization: Bearer <CRON_SECRET>' $APP_URL/api/cron/payg-billing"
fi

echo ""
echo "=== Done ==="
