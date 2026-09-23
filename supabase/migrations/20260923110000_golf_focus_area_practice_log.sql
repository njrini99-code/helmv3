-- A8 slice 2 (addendum "collect only useful context and complete the
-- coaching action", folded into Pkg 9): persist actual practice completion
-- and coach-authored review criteria against a focus area, through
-- proper concurrency-safe and idempotent write paths.
--
-- Two additions, deliberately different shapes for different reasons:
--
-- (criteria) golf_player_focus_areas.criteria jsonb — small (capped at ~10
-- entries, enforced in the action layer, not here), coach-authored, and read
-- alongside the rest of the focus area row, so a jsonb column matches the
-- existing progress_notes convention on this same table. Locked schema:
-- `{ entries: [{ id, label, source: 'coach'|'engine', created_at, met,
-- met_at }] }`. A read-modify-write on this column MUST compare
-- updated_at (or an equivalent version marker) before writing — a plain
-- select-then-update silently drops one of two concurrent appends (e.g. a
-- player's practiced_at bump racing a coach's new criterion) with no
-- constraint to catch it. See the action layer for the compare-and-swap.
--
-- (sessions) golf_focus_area_practice_sessions — a NEW append-only table,
-- NOT a jsonb array, because:
--   1. the log is unbounded (jsonb has no natural cap the way criteria does);
--   2. a unique key makes a double-submitted log entry (network retry,
--      double-tap) a real no-op via ON CONFLICT, without ever reading the
--      prior array back to scan it for a duplicate;
--   3. two concurrent appends (player logs a session while a coach also
--      logs one) are two independent INSERTs, not two racing read-modify-
--      writes of the same jsonb blob where the second writer's UPDATE can
--      silently discard the first writer's append.
--
-- Both are purely additive: nullable/no-default (criteria) or a brand new
-- table (sessions), no backfill, and neither ships live yet — see the
-- coachhelm_focus_area_practice_log flag (config/feature-flags.yml) gating
-- every read AND write of either surface until the owner applies this
-- migration in each environment.
--
-- ROLLBACK: additive only.
--   ALTER TABLE public.golf_player_focus_areas DROP COLUMN criteria;
--   DROP TABLE public.golf_focus_area_practice_sessions;
--
-- VERIFY: select 1 from information_schema.columns where table_schema = 'public' and table_name = 'golf_player_focus_areas' and column_name = 'criteria'; -- noqa: LT05
-- VERIFY: select 1 from information_schema.tables where table_schema = 'public' and table_name = 'golf_focus_area_practice_sessions'; -- noqa: LT05
-- VERIFY: select 1 where (select relrowsecurity from pg_class where oid = 'public.golf_focus_area_practice_sessions'::regclass); -- noqa: LT05
-- VERIFY: select 1 from pg_constraint where conname = 'golf_focus_area_practice_sessions_focus_area_id_client_reque_key'; -- noqa: LT05
-- VERIFY: select 1 where not has_table_privilege('anon', 'public.golf_focus_area_practice_sessions', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_focus_area_practice_sessions', 'UPDATE'); -- noqa: LT05
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_focus_area_practice_sessions', 'DELETE'); -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_focus_area_practice_sessions'; -- noqa: LT05

-- golf_player_focus_areas is a live, high-traffic table; cap how long each
-- of these DDL statements will wait for its lock rather than risk queuing
-- behind a long-running transaction indefinitely.
SET lock_timeout = '5s';

ALTER TABLE public.golf_player_focus_areas
ADD COLUMN IF NOT EXISTS criteria jsonb;

COMMENT ON COLUMN public.golf_player_focus_areas.criteria
IS 'A8 slice 2: coach-authored (or engine-suggested) definitions of "done" for this focus area. Locked schema: {"entries": [{id, label, source: coach|engine, created_at, met, met_at}]}. Capped at ~10 entries, enforced in the action layer. NULL = no criteria set yet, or the write flag was off. Read-modify-write must compare a version marker (e.g. updated_at) before writing -- see the action layer''s compare-and-swap.'; -- noqa: LT05

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.golf_focus_area_practice_sessions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    focus_area_id uuid NOT NULL,
    player_id uuid NOT NULL,
    logged_by_user_id uuid NOT NULL,
    logged_by_role text NOT NULL,
    drill_id text,
    reps integer,
    note text,
    practiced_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_request_id uuid NOT NULL,
    CONSTRAINT golf_focus_area_practice_sessions_logged_by_role_check
    CHECK ((logged_by_role = any(ARRAY['player'::text, 'coach'::text]))),
    CONSTRAINT golf_focus_area_practice_sessions_reps_check
    CHECK ((reps IS NULL OR reps >= 0))
);

ALTER TABLE public.golf_focus_area_practice_sessions OWNER TO "postgres";

ALTER TABLE ONLY public.golf_focus_area_practice_sessions
ADD CONSTRAINT golf_focus_area_practice_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.golf_focus_area_practice_sessions
ADD CONSTRAINT golf_focus_area_practice_sessions_focus_area_id_client_reque_key
UNIQUE (focus_area_id, client_request_id);

-- ON DELETE CASCADE (not the NO ACTION default) deliberately: deleteFocusArea
-- (src/app/golf/actions/development.ts) does a hard DELETE on
-- golf_player_focus_areas, not a soft/status change. Under the default
-- NO ACTION, that delete would start failing with a foreign-key violation
-- the moment any practice session exists for the focus area being deleted.
ALTER TABLE ONLY public.golf_focus_area_practice_sessions
ADD CONSTRAINT golf_focus_area_practice_sessions_focus_area_id_fkey
FOREIGN KEY (focus_area_id) REFERENCES public.golf_player_focus_areas (
    id
) ON DELETE CASCADE;

-- Same convention as golf_player_focus_areas_player_id_fkey: deleting the
-- player's own row cascades away everything scoped to them.
ALTER TABLE ONLY public.golf_focus_area_practice_sessions
ADD CONSTRAINT golf_focus_area_practice_sessions_player_id_fkey
FOREIGN KEY (player_id) REFERENCES public.golf_players (
    id
) ON DELETE CASCADE;

-- No FK to auth.users for logged_by_user_id, matching this repo's existing
-- convention (no table here foreign-keys into the auth schema) -- validated
-- against auth.uid() by the RLS policies below and by the action layer,
-- never trusted from client input.

COMMENT ON TABLE public.golf_focus_area_practice_sessions IS
'A8 slice 2: append-only log of actual practice completions against a golf_player_focus_areas row. One row per logged session (player or coach), never updated or deleted by application code -- see the REVOKE below, which grants authenticated INSERT and SELECT only. client_request_id + the UNIQUE(focus_area_id, client_request_id) constraint make a double-submitted log entry (network retry, double-tap) a real no-op via ON CONFLICT DO NOTHING, without ever reading the table back to scan for a duplicate. Gated behind config/feature-flags.yml''s coachhelm_focus_area_practice_log flag (default off) until this migration is applied in production.'; -- noqa: LT05

-- The natural read pattern is "this focus area''s sessions, in time order" --
-- the leading column overlaps with the UNIQUE constraint''s own implicit
-- index (which leads with focus_area_id too), but that index is keyed on
-- (focus_area_id, client_request_id) and is useless for an ORDER BY
-- practiced_at scan, so this composite index is not redundant with it.
CREATE INDEX IF NOT EXISTS golf_focus_area_practice_sessions_focus_area_practiced_idx -- noqa: LT05
ON public.golf_focus_area_practice_sessions (
    focus_area_id, practiced_at
);

CREATE INDEX IF NOT EXISTS golf_focus_area_practice_sessions_practiced_at_idx
ON public.golf_focus_area_practice_sessions (practiced_at);

ALTER TABLE public.golf_focus_area_practice_sessions ENABLE ROW LEVEL SECURITY;

-- Visibility mirrors golf_player_focus_areas exactly by re-running the
-- caller's OWN golf_player_focus_areas RLS inside the EXISTS subquery (same
-- trick as golf_round_recap_provenance's read policy), rather than
-- re-deriving the player-self / coach-via-team rules here a second time.
-- Any principal who can SELECT the referenced golf_player_focus_areas row
-- (owning player via golf_players.user_id, or a coach via
-- is_golf_team_coach on the player's active team) can read its practice
-- sessions.
CREATE POLICY practice_sessions_select_via_focus_area
ON public.golf_focus_area_practice_sessions FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.golf_player_focus_areas AS fa
        WHERE fa.id = golf_focus_area_practice_sessions.focus_area_id
    )
);

-- golf_player_focus_areas itself has NO player-self INSERT policy (a player
-- can never insert a focus area directly; only a coach can, or the admin
-- client for self-promote -- see development.ts). This table's INSERT
-- policy is deliberately NOT copied from that: a player logging their OWN
-- practice session must succeed through the ordinary scoped client, so this
-- policy allows INSERT to anyone who can already SEE the parent focus area
-- (player-self OR coach-via-team, via the same EXISTS subquery as SELECT
-- above), while WITH CHECK still pins logged_by_user_id to the caller and
-- player_id to the focus area's own player_id -- neither is ever taken from
-- client-supplied values the RLS layer can't otherwise verify.
CREATE POLICY practice_sessions_insert_via_focus_area
ON public.golf_focus_area_practice_sessions FOR INSERT TO authenticated
WITH CHECK (
    logged_by_user_id = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.golf_player_focus_areas AS fa
        WHERE
            fa.id = golf_focus_area_practice_sessions.focus_area_id
            AND fa.player_id
            = golf_focus_area_practice_sessions.player_id
    )
);

-- No UPDATE/DELETE policy for authenticated -- append-only at the RLS layer
-- too, not just "the action code never calls update/delete". Combined with
-- the REVOKE below (no UPDATE/DELETE grant at all), a compromised or buggy
-- client can neither edit nor remove a logged session.
--
-- database.md: "Never GRANT ... TO anon or TO PUBLIC". `authenticated` is
-- included in this REVOKE too: Supabase's default ACL for a new table in
-- `public` grants authenticated full rights (arwdDxtm) at CREATE TABLE time,
-- before the GRANT below -- omitting authenticated here would leave
-- UPDATE/DELETE silently still granted underneath the narrower-looking
-- GRANT SELECT, INSERT (see #1996's fix commit for the exact same gap on
-- golf_round_recap_provenance).
REVOKE ALL ON TABLE public.golf_focus_area_practice_sessions FROM public,
anon,
authenticated;
GRANT SELECT,
INSERT ON TABLE public.golf_focus_area_practice_sessions TO authenticated;
GRANT ALL ON TABLE public.golf_focus_area_practice_sessions TO service_role;
