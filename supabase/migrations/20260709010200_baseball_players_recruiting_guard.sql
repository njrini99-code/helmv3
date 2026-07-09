-- ============================================================================
-- ⏸ DEPLOY-SEQUENCED — apply to prod ONLY together with (or immediately after)
-- the production deploy that ships the W0a/W0b companion code change:
-- activateRecruitingExposure/deactivateRecruitingExposure in
-- src/app/baseball/actions/player-access.ts now write via createAdminClient()
-- (service_role). Applying this trigger while the LIVE deployment still writes
-- recruiting_activated through the anon-key authenticated client would 42501
-- every legitimate activation/withdrawal until the deploy lands.
-- Views/function siblings (20260709010000, 20260709010100) were applied to
-- prod 2026-07-09 independently — they have no code dependency.
-- ============================================================================
-- ============================================================================
-- Migration: 20260709010200_baseball_players_recruiting_guard.sql
-- Wave: W0b (Production-Readiness Mission, docs/audits/PRODUCTION_READINESS_MISSION_2026-07-09.md)
--
-- CONFIRMED P1, gap-fill fleet 2026-07-09:
--   Activate-Recruiting bypass — `updatePlayer` in use-auth.ts:165-175 does a
--   raw browser UPDATE; RLS (user_id = auth.uid(), no column guard) lets any
--   player set recruiting_activated directly, bypassing the
--   recruiting_exposure_enabled toggle. Fix = remove client write path +
--   BEFORE UPDATE trigger guard (baseball DB, check-first).
--
-- CHECK-FIRST EVIDENCE (read-only SELECTs against LIVE prod + source reads,
-- 2026-07-09 — nothing applied to any DB by this file):
--
-- 1) RLS on public.baseball_players (pg_policies, live):
--      baseball_players_update_own  PERMISSIVE  {authenticated}  UPDATE
--        qual: (user_id = ( SELECT auth.uid() AS uid))
--    No column-level restriction — any authenticated player can UPDATE ANY
--    column on their own row, including recruiting_activated, directly via
--    PostgREST. This is the confirmed leak.
--
-- 2) baseball_players columns (information_schema.columns, live):
--      recruiting_activated     boolean NOT NULL? -> nullable, default false
--      recruiting_activated_at  timestamptz, nullable
--      player_type              baseball_player_type (enum), NOT NULL
--    Live data: player_type in {'high_school' (1 row), 'college' (26 rows)}.
--
-- 3) Existing CHECK constraints already blocking college+active=true at the
--    table level (pg_constraint, live) — this is a pre-existing backstop,
--    NOT something this migration adds:
--      baseball_players_college_no_recruiting:
--        CHECK ((player_type <> 'college'::baseball_player_type)
--               OR (recruiting_activated IS NOT TRUE))
--      baseball_players_college_recruiting_check:
--        CHECK (NOT ((player_type = 'college'::baseball_player_type)
--                    AND (recruiting_activated = true)))
--    Per the W0b task spec ("College players must never activate — enforce
--    in the trigger too if player_type is on the row"), the trigger below
--    restates this same rule with a clearer RAISE EXCEPTION message ahead of
--    the raw constraint-violation error a caller would otherwise see; it is
--    intentionally redundant with points already enforced, not a new rule.
--
-- 4) THE STOP-AND-READ FINDING (this is why this migration blocks the
--    `authenticated` role outright rather than trying to distinguish
--    "the gated action" from "the raw browser write"):
--      - The gated server action, src/app/baseball/actions/player-access.ts
--        `activateRecruitingExposure` / `deactivateRecruitingExposure`, calls
--        `createClient()` from src/lib/supabase/server.ts, which is
--        `createServerClient(url, NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies })`
--        — i.e. the ANON key plus the user's session cookie.
--      - The raw browser bypass, src/hooks/use-auth.ts `updatePlayer`, calls
--        `createClient()` from src/lib/supabase/client.ts, which is also the
--        anon key plus the user's session (browser-side).
--      - BOTH resolve to the exact same Postgres role at the database layer:
--        `authenticated`, with the same auth.uid(). A BEFORE UPDATE trigger
--        (or any RLS policy) has NO signal that distinguishes "this UPDATE
--        was issued from inside the gated server action's business logic"
--        from "this UPDATE was issued directly from the browser" — they are
--        indistinguishable at the row/statement level once both present as
--        `authenticated`.
--      - Per the task's explicit instruction for this exact scenario: the
--        correct DB-side design is to block ALL `authenticated`-role writes
--        to recruiting_activated, full stop, and have the legitimate path
--        move to a service-role client instead (which IS distinguishable via
--        auth.role() = 'service_role').
--
-- COORDINATION REQUIRED WITH W0a (reported to orchestrator — this file alone
-- does not fix the feature, it only closes the bypass):
--   Once this migration is applied, `activateRecruitingExposure` AND
--   `deactivateRecruitingExposure` in src/app/baseball/actions/player-access.ts
--   WILL START FAILING with 42501 on their `.update({ recruiting_activated,
--   ... })` calls, because they currently write via the same `authenticated`
--   client as the browser (see point 4). W0a must repoint JUST those two
--   `.update()` calls at `createAdminClient()` from src/lib/supabase/admin.ts
--   (the existing service-role client factory, already used elsewhere: e.g.
--   src/app/golf/actions/auth.ts, src/lib/auth/account-lockout.ts,
--   src/lib/notifications/push.ts) — keeping every existing RLS-scoped read
--   (the ownership/eligibility checks: `ctx.activePlayerId`, player_type,
--   current recruiting_activated) on the regular `createClient()` unchanged,
--   since createAdminClient() bypasses RLS entirely and must be reached for
--   only after ownership/eligibility has already been verified through the
--   normal client. This migration and W0a's client swap must land together
--   (or this migration held until W0a ships) or legitimate players will be
--   unable to activate/deactivate recruiting exposure at all.
--
-- FIX (this file): additive BEFORE UPDATE OF recruiting_activated trigger on
-- public.baseball_players. Idempotent (CREATE OR REPLACE FUNCTION,
-- CREATE OR REPLACE TRIGGER — PG17 live, supports OR REPLACE TRIGGER).
--
-- VERIFY AFTER APPLY (paste output in the PR/approval record):
--   select tgname, pg_get_triggerdef(oid) from pg_trigger
--     where tgrelid = 'public.baseball_players'::regclass and not tgisinternal;
--   -- as authenticated (non-service-role), attempt:
--   --   update baseball_players set recruiting_activated = true where id = '<own id>';
--   -- must raise 42501. As service_role, the same update must succeed
--   -- (subject to the pre-existing college CHECK constraints).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.baseball_players_guard_recruiting_activated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only scrutinize actual changes to the column. Trigger fires whenever
  -- recruiting_activated is present in the UPDATE's SET list (see
  -- `BEFORE UPDATE OF recruiting_activated` below); a same-value write that
  -- happens to include the column must not be blocked — the spec scope is
  -- "when recruiting_activated changes value".
  IF NEW.recruiting_activated IS NOT DISTINCT FROM OLD.recruiting_activated THEN
    RETURN NEW;
  END IF;

  -- Defense-in-depth: college players can never activate recruiting exposure.
  -- Already enforced at the table level by CHECK constraints
  -- baseball_players_college_no_recruiting /
  -- baseball_players_college_recruiting_check (confirmed live, 2026-07-09).
  -- Restated here with a clearer error message per the W0b task spec
  -- ("College players must never activate ... enforce in the trigger too if
  -- player_type is on the row").
  IF NEW.recruiting_activated IS TRUE
     AND NEW.player_type = 'college'::baseball_player_type
  THEN
    RAISE EXCEPTION 'College players cannot activate recruiting exposure.'
      USING ERRCODE = '23514';
  END IF;

  -- The gated server action and the raw browser client are indistinguishable
  -- at this layer (both run as `authenticated` — see migration header,
  -- point 4), so the only correct DB-side guard is to require service_role
  -- for ANY change to this column. Skip enforcement when there is no
  -- PostgREST/JWT request context at all (direct SQL console / migration /
  -- superuser data fix) — matching the established pattern in
  -- supabase/migrations/20260528000000_baseball_recalc_body_guards.sql.
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(auth.role(), '') <> 'service_role'
  THEN
    RAISE EXCEPTION 'recruiting_activated can only be changed via the gated service-role server action path.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.baseball_players_guard_recruiting_activated() IS
  'BEFORE UPDATE OF recruiting_activated guard on public.baseball_players. Blocks any non-service-role change to recruiting_activated (closes the raw-browser-write bypass of the recruiting_exposure_enabled toggle — CONFIRMED P1, gap-fill 2026-07-09) and restates the college-player-never-activates rule already enforced by CHECK constraints. Requires the W0a companion change: activateRecruitingExposure/deactivateRecruitingExposure in src/app/baseball/actions/player-access.ts must write this column via createAdminClient() (src/lib/supabase/admin.ts), not the anon-key authenticated client, or those actions will 42501.';

-- Trigger function is invoked only by the trigger machinery; no EXECUTE grant
-- is needed by any role (PostgreSQL bypasses privilege checks when firing a
-- trigger). REVOKE FROM PUBLIC for hygiene, matching this repo's "never
-- leave PUBLIC/anon with EXECUTE" default posture.
REVOKE ALL ON FUNCTION public.baseball_players_guard_recruiting_activated() FROM PUBLIC;

CREATE OR REPLACE TRIGGER baseball_players_guard_recruiting_activated_trg
BEFORE UPDATE OF recruiting_activated ON public.baseball_players
FOR EACH ROW
EXECUTE FUNCTION public.baseball_players_guard_recruiting_activated();

-- END — baseball_players recruiting_activated guard. ADDITIVE. NOT applied to any DB by this file.
