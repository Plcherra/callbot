-- Billing/Quota SQL Test Queries
-- Run in Supabase SQL Editor. Replace USER_ID and RECEPTIONIST_ID with real UUIDs.

-- 1. Test increment_user_plan_usage RPC (simulates CDR webhook)
SELECT increment_user_plan_usage(
  'USER_ID'::uuid,   -- replace with real user id
  'inbound',         -- or 'outbound'
  1.5                -- billed minutes (6-sec increments)
);

-- 2. Verify user_plans usage
SELECT user_id, billing_plan,
       allocated_inbound_minutes, used_inbound_minutes,
       allocated_outbound_minutes, used_outbound_minutes,
       overage_rate_cents, payg_rate_cents
FROM user_plans
WHERE user_id = 'USER_ID'::uuid;

-- 3. Insert test call_usage (to simulate CDR before RPC)
-- Get a receptionist_id: SELECT id, user_id FROM receptionists WHERE user_id = 'USER_ID' LIMIT 1;
INSERT INTO call_usage (
  receptionist_id, user_id, call_sid, started_at, ended_at,
  duration_seconds, direction, billed_minutes, status
) VALUES (
  'RECEPTIONIST_ID'::uuid,
  'USER_ID'::uuid,
  'test-' || gen_random_uuid()::text,
  NOW() - interval '3 minutes',
  NOW(),
  180,
  'outbound',
  3.0,
  'completed'
)
ON CONFLICT (call_sid) DO NOTHING;

-- Then run increment_user_plan_usage for the same call
SELECT increment_user_plan_usage('USER_ID'::uuid, 'outbound', 3.0);

-- 4. Check PAYG users' call_usage for previous month (billing query)
SELECT u.id, u.billing_plan,
       COALESCE(SUM(cu.payg_minutes), SUM(cu.billed_minutes), SUM(cu.duration_seconds)/60.0) as total_minutes
FROM users u
LEFT JOIN call_usage cu ON cu.user_id = u.id
  AND cu.ended_at >= date_trunc('month', CURRENT_DATE - interval '1 month')::date
  AND cu.ended_at < date_trunc('month', CURRENT_DATE)::date
WHERE u.billing_plan = 'subscription_payg'
GROUP BY u.id, u.billing_plan;

-- 5. Check overage for fixed plans (uses user_plans.used_*)
SELECT up.user_id, up.billing_plan,
       up.allocated_inbound_minutes + up.allocated_outbound_minutes as allocated,
       up.used_inbound_minutes + up.used_outbound_minutes as used,
       GREATEST(0, (up.used_inbound_minutes + up.used_outbound_minutes)
                  - (up.allocated_inbound_minutes + up.allocated_outbound_minutes)) as overage_minutes,
       up.overage_rate_cents
FROM user_plans up
WHERE up.billing_plan != 'subscription_payg'
  AND up.allocated_inbound_minutes IS NOT NULL;
