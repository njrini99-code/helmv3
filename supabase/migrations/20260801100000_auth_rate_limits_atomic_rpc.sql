-- check_rate_limit_atomic: collapse the rate limiter's read-modify-write into
-- one statement.
--
-- THE RACE. `src/lib/auth/supabase-rate-limit.ts` used to SELECT the row, await
-- a full network round-trip, compute `newCount = count + 1` in JavaScript,
-- evaluate the limit, and only then UPDATE. N concurrent requests for the same
-- key therefore all read the same `count` and all pass the check — the LOGIN
-- limit (5/min, the brute-force gate in the golf/baseball/lifting auth actions)
-- amplifies by however many requests fit in that window. The window-reset branch
-- was worse: it upserted `count = 1` unconditionally, so a burst straddling the
-- boundary reset the counter repeatedly.
--
-- `INSERT … ON CONFLICT (key) DO UPDATE` takes a row lock on the conflicting
-- tuple and re-reads it under that lock, so the increment, the window roll and
-- the block stamp all happen in one atomic statement. `auth_rate_limits`
-- already has `PRIMARY KEY (key)` — no index work needed.
--
-- Why `p_max_attempts` is a parameter: the block must be stamped in the SAME
-- statement as the increment, which means the threshold has to be known to the
-- statement. The limiter's per-endpoint configs stay in TypeScript
-- (`RATE_LIMITS`); only the value travels.
--
-- NOTE FOR THE REVIEWER: an earlier draft of this comment claimed this mirrors
-- `public.record_failed_login(…)` for `login_attempts`. It does not — that
-- function does not exist in production (verified 2026-08-01). There is no
-- existing precedent in this database for this shape; review it on its own
-- merits. `src/lib/auth/account-lockout.ts` still does its `login_attempts`
-- read-modify-write in TypeScript and is NOT changed by this migration.
--
-- DEPLOY ORDERING: this migration is currently UNAPPLIED and (as authored) was
-- untracked in git. `src/lib/auth/supabase-rate-limit.ts` therefore detects
-- PGRST202 and falls back to the pre-existing non-atomic limiter, so shipping
-- code ahead of this migration degrades the limiter rather than breaking login.
-- Apply this to remove that fallback path.
--
-- Semantics preserved from the TypeScript it replaces:
--   * an ACTIVE block (`blocked_until > now()`) freezes the row — the count and
--     window do not advance while blocked, exactly as the old early-return did,
--     so a 15-minute block is not shortened by a 1-minute window rolling over;
--   * an EXPIRED block clears on the next call;
--   * an expired window resets the count to 1 and restamps `window_start`.
--
-- service_role only. The limiter runs on the admin client; nothing user-facing
-- may call this or a caller could burn another key's budget (or, worse, roll a
-- window it is being limited by). Hence the revoke below grants EXECUTE to
-- service_role and to no one else — `authenticated` is deliberately excluded.

CREATE OR REPLACE FUNCTION public.check_rate_limit_atomic(
  p_key text,
  p_window_ms bigint,
  p_max_attempts integer,
  p_block_ms bigint DEFAULT NULL
)
RETURNS TABLE (
  count integer,
  window_start timestamp with time zone,
  blocked_until timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  INSERT INTO public.auth_rate_limits AS arl (key, count, window_start, blocked_until, updated_at)
  VALUES (p_key, 1, now(), NULL, now())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      -- Frozen while an active block stands.
      WHEN arl.blocked_until IS NOT NULL AND arl.blocked_until > now() THEN arl.count
      WHEN arl.window_start + make_interval(secs => p_window_ms / 1000.0) < now() THEN 1
      ELSE arl.count + 1
    END,
    window_start = CASE
      WHEN arl.blocked_until IS NOT NULL AND arl.blocked_until > now() THEN arl.window_start
      WHEN arl.window_start + make_interval(secs => p_window_ms / 1000.0) < now() THEN now()
      ELSE arl.window_start
    END,
    blocked_until = CASE
      WHEN arl.blocked_until IS NOT NULL AND arl.blocked_until > now() THEN arl.blocked_until
      WHEN p_block_ms IS NOT NULL
        AND (
          CASE
            WHEN arl.window_start + make_interval(secs => p_window_ms / 1000.0) < now() THEN 1
            ELSE arl.count + 1
          END
        ) > p_max_attempts
        THEN now() + make_interval(secs => p_block_ms / 1000.0)
      ELSE NULL
    END,
    updated_at = now()
  RETURNING arl.count, arl.window_start, arl.blocked_until;
$function$;

-- A fresh CREATE FUNCTION in `public` is EXECUTE-able by PUBLIC by default, and
-- this one runs with definer rights over a service_role-only table.
--
-- The phrase above is deliberately NOT the literal rule trigger: this comment
-- previously read "...is SECURITY DEFINER over...", and
-- helmv3-security-definer-without-search-path matched the PROSE, then looked
-- for a search_path clause near line 94 and found none — blocking the Review
-- Gate on a function that does pin it (line 60-61:
-- `SECURITY DEFINER` / `SET search_path TO 'public', 'pg_temp'`).
-- nosemgrep: helmv3-security-definer-without-search-path -- comment, not a definition; the real one at line 60 pins search_path.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_atomic(text, bigint, integer, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_atomic(text, bigint, integer, bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_atomic(text, bigint, integer, bigint) TO service_role;

COMMENT ON FUNCTION public.check_rate_limit_atomic(text, bigint, integer, bigint) IS
  'Atomic rate-limit increment for auth_rate_limits. Returns the post-increment row. service_role only.';
