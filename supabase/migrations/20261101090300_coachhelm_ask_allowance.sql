-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- HM4 (Ask lane, AK10b). Written 4 Nov 2026 in the wiring pass from 02-PLAN
--   §13.2 and §16, which named this file but
-- never wrote it. Name kept as planned (20261101090300).
--
-- What: a player's hidden weekly Ask allowance and the once-a-week Request
--   more.
-- ask_usage_weekly    one row per player per week (week_start is the Monday
--   in the team zone). cost_micros is what
-- the player's turns cost (estimateCachedCostUsd, the same estimate
--   recordTurnCost uses).
-- cap_micros NULL means the server default (PLAYER_ASK_WEEKLY_CAP_USD in
--   server config); staff set
-- it to raise one player's week ("Allowance raised by staff", 05 CP-E).
-- ask_credit_requests one Request more per player per week (unique). The 8
--   second Undo is held on this row, not on
-- golf_coachhelm_action_runs, because that ledger is coach-only (coach_id NOT
--   NULL, policy
-- coachhelm_action_runs_coach_only) and a player has no coach id. release_at
--   = press + 8s; Undo
-- deletes the row while release_at > now(), so Undo leaves no row;
--   released_at marks the release;
-- sent_at is set only when an email actually went
--   (HELM_CUSTOMER_EMAIL_ENABLED on).
-- Changed from the plan: no bucket view. The cap lives in server config,
--   which a view cannot read, and the client only
-- ever gets the bucket word (plenty, low, out) from the server. So no client
--   role reads either table.
-- RLS: enabled. One RESTRICTIVE deny policy per command for anon and
--   authenticated (the repo's no-client-access shape,
-- 20261028140200), and every privilege revoked from both. Only the service
--   role (the stream route's onFinish and the
-- request_ask_credits server action, after they check the session player)
--   reads or writes.
-- Additive and idempotent.
-- Until applied: player Ask stays off whatever coachhelm_player_ask_v1 says
--   (02 §16: no cap, no ship).
--
-- ROLLBACK: drop table if exists public.ask_credit_requests;
-- ROLLBACK: drop table if exists public.ask_usage_weekly;
--
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE
-- VERIFY: relnamespace = 'public'::regnamespace AND relname =
-- VERIFY: 'ask_usage_weekly' AND relrowsecurity);
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE
-- VERIFY: relnamespace = 'public'::regnamespace AND relname =
-- VERIFY: 'ask_credit_requests' AND relrowsecurity);
-- VERIFY: SELECT 1 WHERE (SELECT count(*) FROM pg_catalog.pg_policies WHERE
-- VERIFY: schemaname = 'public' AND tablename IN ('ask_usage_weekly',
-- VERIFY: 'ask_credit_requests') AND permissive = 'RESTRICTIVE') = 8;
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated',
-- VERIFY: 'public.ask_usage_weekly', 'SELECT') AND NOT
-- VERIFY: has_table_privilege('anon', 'public.ask_usage_weekly', 'SELECT');
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated',
-- VERIFY: 'public.ask_credit_requests', 'SELECT') AND NOT
-- VERIFY: has_table_privilege('anon', 'public.ask_credit_requests', 'SELECT');
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE
-- VERIFY: conname = 'ask_credit_requests_one_per_week');

-- squawk-ignore transaction-nesting
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.ask_usage_weekly (
    player_id uuid NOT NULL REFERENCES public.golf_players (
        id
    ) ON DELETE CASCADE,
    team_id uuid NOT NULL REFERENCES public.golf_teams (id) ON DELETE CASCADE,
    week_start date NOT NULL,
    cost_micros bigint NOT NULL DEFAULT 0,
    cap_micros bigint NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ask_usage_weekly_pkey PRIMARY KEY (player_id, week_start),
    CONSTRAINT ask_usage_weekly_cost_nonneg CHECK (cost_micros >= 0),
    CONSTRAINT ask_usage_weekly_cap_nonneg CHECK (
        cap_micros IS NULL OR cap_micros >= 0
    ),
    CONSTRAINT ask_usage_weekly_week_is_monday CHECK (
        extract(ISODOW FROM week_start) = 1
    )
);

COMMENT ON TABLE public.ask_usage_weekly IS
'HM4: a player''s Ask spend per week (Monday, team zone). Service role only; the client gets plenty, low or out.'; -- noqa: LT05

CREATE TABLE IF NOT EXISTS public.ask_credit_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES public.golf_players (
        id
    ) ON DELETE CASCADE,
    team_id uuid NOT NULL REFERENCES public.golf_teams (id) ON DELETE CASCADE,
    week_start date NOT NULL,
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    release_at timestamptz NOT NULL,
    released_at timestamptz NULL,
    sent_at timestamptz NULL,
    CONSTRAINT ask_credit_requests_one_per_week UNIQUE (player_id, week_start),
    CONSTRAINT ask_credit_requests_note_length CHECK (char_length(note) <= 500),
    CONSTRAINT ask_credit_requests_week_is_monday CHECK (
        extract(ISODOW FROM week_start) = 1
    ),
    CONSTRAINT ask_credit_requests_sent_after_release CHECK (
        sent_at IS NULL OR released_at IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS ask_credit_requests_unreleased_idx
ON public.ask_credit_requests (release_at)
WHERE released_at IS NULL;

COMMENT ON TABLE public.ask_credit_requests IS
'HM4: Request more, once per player per week. Held 8s on the row (release_at); Undo deletes it before release_at. Service role only.'; -- noqa: LT05

ALTER TABLE public.ask_usage_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_credit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ask_usage_weekly_no_client_select
ON public.ask_usage_weekly;
CREATE POLICY ask_usage_weekly_no_client_select ON public.ask_usage_weekly
AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (FALSE);
DROP POLICY IF EXISTS ask_usage_weekly_no_client_insert
ON public.ask_usage_weekly;
CREATE POLICY ask_usage_weekly_no_client_insert ON public.ask_usage_weekly
AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (FALSE);
DROP POLICY IF EXISTS ask_usage_weekly_no_client_update
ON public.ask_usage_weekly;
CREATE POLICY ask_usage_weekly_no_client_update ON public.ask_usage_weekly
AS RESTRICTIVE FOR UPDATE TO anon,
authenticated USING (FALSE) WITH CHECK (FALSE);
DROP POLICY IF EXISTS ask_usage_weekly_no_client_delete
ON public.ask_usage_weekly;
CREATE POLICY ask_usage_weekly_no_client_delete ON public.ask_usage_weekly
AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (FALSE);

DROP POLICY IF EXISTS ask_credit_requests_no_client_select
ON public.ask_credit_requests;
CREATE POLICY ask_credit_requests_no_client_select ON public.ask_credit_requests
AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (FALSE);
DROP POLICY IF EXISTS ask_credit_requests_no_client_insert
ON public.ask_credit_requests;
CREATE POLICY ask_credit_requests_no_client_insert ON public.ask_credit_requests
AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (FALSE);
DROP POLICY IF EXISTS ask_credit_requests_no_client_update
ON public.ask_credit_requests;
CREATE POLICY ask_credit_requests_no_client_update ON public.ask_credit_requests
AS RESTRICTIVE FOR UPDATE TO anon,
authenticated USING (FALSE) WITH CHECK (FALSE);
DROP POLICY IF EXISTS ask_credit_requests_no_client_delete
ON public.ask_credit_requests;
CREATE POLICY ask_credit_requests_no_client_delete ON public.ask_credit_requests
AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (FALSE);

REVOKE ALL ON public.ask_usage_weekly FROM anon, authenticated;
REVOKE ALL ON public.ask_credit_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_usage_weekly TO service_role;
GRANT SELECT,
INSERT,
UPDATE,
DELETE ON public.ask_credit_requests TO service_role;

-- squawk-ignore transaction-nesting
COMMIT;
