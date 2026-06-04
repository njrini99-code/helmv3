-- device_tokens: SECURITY DEFINER takeover RPC for the
-- iPhone-changes-hands case (Sentry JAVASCRIPT-NEXTJS-54 / NEXTJS-56,
-- ~3 events / 24h).
--
-- Background: registerDeviceToken() previously upserted into
-- device_tokens ON CONFLICT (token). When user A logs out of an iPhone
-- and user B logs in on the same device, the iOS bridge fires the same
-- APNs token. The UPDATE policy `USING (auth.uid() = user_id)` rejects
-- B against the existing row (owner = A) — "new row violates row-level
-- security policy (USING expression)".
--
-- Earlier iteration of this migration broadened the UPDATE policy to
-- `USING (true) WITH CHECK (auth.uid() = user_id)`. CodeRabbit (PR #218,
-- 🟠 Major) flagged that USING (true) lets any authenticated caller
-- target any row by primary key (UUIDs are unguessable in practice, but
-- the surface widening is unnecessary).
--
-- This migration takes the cleaner path: a SECURITY DEFINER RPC
-- `claim_device_token(token, platform, device_name)` that performs the
-- upsert in elevated context. The original strict UPDATE policy
-- `USING (auth.uid() = user_id)` stays in place — the only path that
-- can reassign a row is the RPC, which authenticates `auth.uid()`
-- internally and constrains the resulting row to the caller.
--
-- The application server action (push-notifications.ts) is updated to
-- call this RPC instead of `.from('device_tokens').upsert(...)`.
--
-- Search_path pinning + REVOKE PUBLIC/anon + GRANT EXECUTE TO
-- authenticated follow the conventions established in
-- 20260602165152_harden_search_path_and_revoke_anon_admin_fns.sql.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + REVOKE/GRANT IF (the only
-- non-idempotent piece would be CREATE POLICY, which we don't touch).

CREATE OR REPLACE FUNCTION public.claim_device_token(
  p_token text,
  p_platform text,
  p_device_name text DEFAULT NULL
)
RETURNS public.device_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.device_tokens;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR length(p_token) = 0 OR length(p_token) > 512 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;
  IF p_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'invalid_platform' USING ERRCODE = '22023';
  END IF;
  IF p_device_name IS NOT NULL AND length(p_device_name) > 256 THEN
    RAISE EXCEPTION 'invalid_device_name' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.device_tokens (user_id, token, platform, device_name, active, failed_count)
  VALUES (v_uid, p_token, p_platform, p_device_name, true, 0)
  ON CONFLICT (token) DO UPDATE
    SET user_id = v_uid,
        platform = EXCLUDED.platform,
        device_name = EXCLUDED.device_name,
        active = true,
        failed_count = 0,
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_device_token(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_device_token(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_device_token(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_device_token(text, text, text) TO service_role;
