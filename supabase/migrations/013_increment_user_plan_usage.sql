-- Increment user_plans usage for quota tracking after each call (CDR).
-- Called from app/api/telnyx/cdr/route.ts after insertCallUsage.

CREATE OR REPLACE FUNCTION public.increment_user_plan_usage(
  p_user_id UUID,
  p_direction TEXT,
  p_minutes NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_minutes IS NULL OR p_minutes <= 0 THEN
    RETURN;
  END IF;
  IF p_direction = 'inbound' THEN
    UPDATE user_plans
    SET used_inbound_minutes = COALESCE(used_inbound_minutes, 0) + p_minutes,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_direction = 'outbound' THEN
    UPDATE user_plans
    SET used_outbound_minutes = COALESCE(used_outbound_minutes, 0) + p_minutes,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;
