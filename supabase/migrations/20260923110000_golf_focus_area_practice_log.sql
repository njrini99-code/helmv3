-- A8 slice 2 (addendum "collect only useful context and complete the
-- coaching action", folded into Pkg 9): persist actual practice completion
-- and coach-authored review criteria against a focus area, through proper
-- concurrency-safe, idempotent write paths and RLS that binds the claimed
-- writer identity to what the database can actually verify.
--
-- Two new, append-only tables, NOT columns on golf_player_focus_areas:
--
-- (criteria) golf_focus_area_criteria — one row per criterion, not a jsonb
-- column on golf_player_focus_areas. A jsonb column was the original design
-- (db review, A8 slice 2 v1) but golf_player_focus_areas_update_player lets
-- a player PATCH any column on their own focus area, including a jsonb
-- criteria blob — "coach-authored, capped at 10" would have been false at
-- the DB layer, enforced only by app code a player's own client never runs.
-- A separate, coach-only-write table makes that a real RLS guarantee. It
-- also avoids taking an ACCESS EXCLUSIVE lock on a live, high-traffic
-- table for a column add. The cap of 10 stays an action-layer check (the
-- table has no natural row-count constraint), acceptable because the
-- INSERT path is coach-only, not player-writable.
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
-- Both tables are purely additive (CREATE TABLE, no ALTER on any existing
-- table) and neither ships live yet — see the
-- coachhelm_focus_area_practice_log flag (config/feature-flags.yml) gating
-- every read AND write of either surface until the owner applies this
-- migration in each environment. "Additive, no lock" is true of the base
-- tables themselves; all four new foreign keys (two per table, into
-- golf_player_focus_areas and golf_players) DO take a SHARE ROW EXCLUSIVE
-- lock on the referenced parent while validating, same as any other
-- FK-carrying table added against a live parent — they're grouped at the
-- end of this migration, after every other DDL for both tables, so that
-- lock window is as short as possible.
--
-- ROLLBACK: additive only.
--   DROP TABLE IF EXISTS public.golf_focus_area_practice_sessions;
--   DROP TABLE IF EXISTS public.golf_focus_area_criteria;
--
-- VERIFY: select 1 from information_schema.tables where table_schema = 'public' and table_name = 'golf_focus_area_practice_sessions'; -- noqa: LT05
-- VERIFY: select 1 from information_schema.tables where table_schema = 'public' and table_name = 'golf_focus_area_criteria'; -- noqa: LT05
-- VERIFY: select 1 where (select relrowsecurity from pg_class where oid = 'public.golf_focus_area_practice_sessions'::regclass); -- noqa: LT05
-- VERIFY: select 1 where (select relrowsecurity from pg_class where oid = 'public.golf_focus_area_criteria'::regclass); -- noqa: LT05
-- VERIFY: select 1 from pg_constraint where conname = 'golf_focus_area_practice_sessions_dedupe_key'; -- noqa: LT05
-- VERIFY: select 1 from pg_constraint where conname = 'golf_focus_area_practice_sessions_note_length_check'; -- noqa: LT05
-- VERIFY: select 1 from pg_constraint where conname = 'golf_focus_area_practice_sessions_drill_id_length_check'; -- noqa: LT05
-- VERIFY: select 1 from pg_indexes where schemaname = 'public' and indexname = 'golf_focus_area_practice_sessions_player_id_idx'; -- noqa: LT05
-- VERIFY: select 1 from pg_indexes where schemaname = 'public' and indexname = 'golf_focus_area_criteria_label_unique_idx'; -- noqa: LT05
-- VERIFY: select 1 from pg_constraint where conname = 'golf_focus_area_criteria_met_consistency_check'; -- noqa: LT05
-- VERIFY: select 1 from pg_indexes where schemaname = 'public' and indexname = 'golf_focus_area_criteria_player_id_idx'; -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_focus_area_practice_sessions' and policyname = 'practice_sessions_select_via_focus_area'; -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_focus_area_practice_sessions' and policyname = 'practice_sessions_insert_via_focus_area'; -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_focus_area_criteria' and policyname = 'criteria_select_via_focus_area'; -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_focus_area_criteria' and policyname = 'criteria_insert_coach'; -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_focus_area_criteria' and policyname = 'criteria_update_coach'; -- noqa: LT05
-- VERIFY: select 1 where not has_table_privilege('anon', 'public.golf_focus_area_practice_sessions', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where has_table_privilege('authenticated', 'public.golf_focus_area_practice_sessions', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where has_table_privilege('authenticated', 'public.golf_focus_area_practice_sessions', 'INSERT'); -- noqa: LT05
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_focus_area_practice_sessions', 'UPDATE'); -- noqa: LT05
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_focus_area_practice_sessions', 'DELETE'); -- noqa: LT05
-- VERIFY: select 1 where not has_table_privilege('anon', 'public.golf_focus_area_criteria', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where has_table_privilege('authenticated', 'public.golf_focus_area_criteria', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where has_table_privilege('authenticated', 'public.golf_focus_area_criteria', 'INSERT'); -- noqa: LT05
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_focus_area_criteria', 'DELETE'); -- noqa: LT05
-- VERIFY: select 1 where has_column_privilege('authenticated', 'public.golf_focus_area_criteria', 'met', 'UPDATE'); -- noqa: LT05
-- VERIFY: select 1 where not has_column_privilege('authenticated', 'public.golf_focus_area_criteria', 'label', 'UPDATE'); -- noqa: LT05

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.golf_focus_area_practice_sessions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    focus_area_id uuid NOT NULL,
    player_id uuid NOT NULL,
    logged_by_user_id uuid NOT NULL,
    logged_by_role text NOT NULL,
    drill_id text,
    -- Bounded by golf_focus_area_practice_sessions_reps_check (0-1000);
    -- never near 32-bit int range.
    -- squawk-ignore prefer-bigint-over-int
    reps integer,
    note text,
    practiced_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_request_id uuid NOT NULL,
    CONSTRAINT golf_focus_area_practice_sessions_logged_by_role_check
    CHECK ((logged_by_role = any(ARRAY['player'::text, 'coach'::text]))),
    CONSTRAINT golf_focus_area_practice_sessions_reps_check
    CHECK ((reps IS NULL OR (reps >= 0 AND reps <= 1000))),
    CONSTRAINT golf_focus_area_practice_sessions_note_length_check
    CHECK ((note IS NULL OR char_length(note) <= 1000)),
    CONSTRAINT golf_focus_area_practice_sessions_drill_id_length_check
    CHECK ((drill_id IS NULL OR char_length(drill_id) <= 100))
);

ALTER TABLE public.golf_focus_area_practice_sessions OWNER TO "postgres";

-- Brand-new, empty table created earlier in this same migration
-- transaction -- no rows and no concurrent traffic exist to be blocked by
-- the ACCESS EXCLUSIVE lock, unlike adding a PK to a live table.
-- squawk-ignore adding-serial-primary-key-field
ALTER TABLE ONLY public.golf_focus_area_practice_sessions
ADD CONSTRAINT golf_focus_area_practice_sessions_pkey PRIMARY KEY (id);

-- Named golf_focus_area_practice_sessions_dedupe_key (not the mechanical
-- _focus_area_id_client_reque_key spelling): the mechanical name is 64
-- bytes, one over Postgres's NAMEDATALEN-1 identifier limit, so it would
-- have been silently truncated and every reference to the FULL name
-- (VERIFY above, the pgTAP suite, ON CONFLICT target) would have quietly
-- mismatched the truncated one actually stored in pg_constraint.
ALTER TABLE ONLY public.golf_focus_area_practice_sessions
ADD CONSTRAINT golf_focus_area_practice_sessions_dedupe_key
UNIQUE (focus_area_id, client_request_id);

-- The two FOREIGN KEY constraints for this table are added at the end of
-- this migration, grouped with the criteria table's two -- see the header
-- and the block near the bottom of this file for why.

-- No FK to auth.users for logged_by_user_id, matching this repo's existing
-- convention (no table here foreign-keys into the auth schema) -- validated
-- against auth.uid() by the RLS policies below and by the action layer,
-- never trusted from client input.

COMMENT ON TABLE public.golf_focus_area_practice_sessions IS
'A8 slice 2: append-only log of actual practice completions against a golf_player_focus_areas row. One row per logged session (player or coach), never updated or deleted by application code -- see the REVOKE below, which grants authenticated INSERT and SELECT only. client_request_id + the UNIQUE(focus_area_id, client_request_id) constraint (golf_focus_area_practice_sessions_dedupe_key) make a double-submitted log entry (network retry, double-tap) a real no-op via ON CONFLICT DO NOTHING, without ever reading the table back to scan for a duplicate. Gated behind config/feature-flags.yml''s coachhelm_focus_area_practice_log flag (default off) until this migration is applied in production.'; -- noqa: LT05

-- The natural read pattern is "this focus area''s sessions, in time order" --
-- the leading column overlaps with the dedupe constraint''s own implicit
-- index (which leads with focus_area_id too), but that index is keyed on
-- (focus_area_id, client_request_id) and is useless for an ORDER BY
-- practiced_at scan, so this composite index is not redundant with it.
CREATE INDEX IF NOT EXISTS golf_focus_area_practice_sessions_focus_area_practiced_idx -- noqa: LT05
ON public.golf_focus_area_practice_sessions (
    focus_area_id, practiced_at
);

CREATE INDEX IF NOT EXISTS golf_focus_area_practice_sessions_practiced_at_idx
ON public.golf_focus_area_practice_sessions (practiced_at);

-- The ON DELETE CASCADE from golf_players (added at the end of this
-- migration) scans this table for every deleted player without an index on
-- player_id -- neither of the two indexes above leads with this column.
CREATE INDEX IF NOT EXISTS golf_focus_area_practice_sessions_player_id_idx
ON public.golf_focus_area_practice_sessions (player_id);

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

-- INSERT binds the CLAIMED logged_by_role to what the database can verify,
-- rather than trusting logged_by_role as a plain enum value the action
-- layer happened to compute correctly. Each branch is copied verbatim from
-- the source-of-truth policy for that identity on golf_player_focus_areas
-- itself (golf_player_focus_areas_insert_coach for the coach branch,
-- golf_player_focus_areas_update_player for the player branch), so this
-- table's access model can never drift from the parent's. The parent focus
-- area's lifecycle is checked ONCE, in the shared top-level EXISTS above
-- (mirrors the action layer's own lifecycle guard), not independently
-- inside each branch -- a session can't be logged against a 'proposed'
-- (not yet accepted) or 'declined' focus area regardless of which role is
-- claiming the write, closing the gap between what the action checks and what a
-- client hitting PostgREST directly could otherwise do.
CREATE POLICY practice_sessions_insert_via_focus_area
ON public.golf_focus_area_practice_sessions FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.golf_player_focus_areas AS fa
        WHERE
            fa.id = golf_focus_area_practice_sessions.focus_area_id
            AND fa.player_id = golf_focus_area_practice_sessions.player_id
            AND fa.status IN ('active', 'in_progress', 'paused')
    )
    AND logged_by_user_id = (SELECT auth.uid())
    AND (
        (
            golf_focus_area_practice_sessions.logged_by_role = 'player'
            AND EXISTS (
                SELECT 1 FROM public.golf_players AS gp
                WHERE
                    gp.id = golf_focus_area_practice_sessions.player_id
                    AND gp.user_id = (SELECT auth.uid())
            )
        )
        OR (
            golf_focus_area_practice_sessions.logged_by_role = 'coach'
            AND EXISTS (
                SELECT 1 FROM public.golf_team_members AS gtm
                WHERE
                    gtm.player_id = golf_focus_area_practice_sessions.player_id
                    AND gtm.status = 'active'::public.team_member_status
                    AND public.is_golf_team_coach(gtm.team_id)
            )
        )
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

-- No second SET LOCAL here: lock_timeout is already set for the rest of
-- this transaction by the one at the top of this migration.

CREATE TABLE IF NOT EXISTS public.golf_focus_area_criteria (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    focus_area_id uuid NOT NULL,
    player_id uuid NOT NULL,
    label text NOT NULL,
    source text NOT NULL,
    met boolean DEFAULT false NOT NULL,
    met_at timestamp with time zone,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golf_focus_area_criteria_source_check
    CHECK ((source = any(ARRAY['coach'::text, 'engine'::text]))),
    CONSTRAINT golf_focus_area_criteria_label_length_check
    CHECK ((char_length(label) >= 1 AND char_length(label) <= 200)),
    CONSTRAINT golf_focus_area_criteria_met_consistency_check
    CHECK ((met = (met_at IS NOT NULL)))
);

ALTER TABLE public.golf_focus_area_criteria OWNER TO "postgres";

-- Brand-new, empty table created earlier in this same migration
-- transaction -- no rows and no concurrent traffic exist to be blocked by
-- the ACCESS EXCLUSIVE lock, unlike adding a PK to a live table.
-- squawk-ignore adding-serial-primary-key-field
ALTER TABLE ONLY public.golf_focus_area_criteria
ADD CONSTRAINT golf_focus_area_criteria_pkey PRIMARY KEY (id);

-- The two FOREIGN KEY constraints for this table are added at the end of
-- this migration, grouped with the sessions table's two -- see the header
-- and the block near the bottom of this file for why.

-- No FK to auth.users for created_by_user_id, matching this repo's existing
-- convention -- validated against auth.uid() by the INSERT policy below and
-- by the action layer, never trusted from client input.

-- lower(label) can't be enforced by a plain UNIQUE constraint (Postgres
-- constraints don't take expressions), so this is a unique INDEX instead --
-- meaning PostgREST's .upsert(onConflict: ...) can't target it directly;
-- the action layer maps the resulting 23505 to a clean "already exists"
-- error instead.
CREATE UNIQUE INDEX IF NOT EXISTS golf_focus_area_criteria_label_unique_idx -- noqa: LT05
ON public.golf_focus_area_criteria (focus_area_id, lower(label));

-- The ON DELETE CASCADE from golf_players (added at the end of this
-- migration) scans this table for every deleted player without this index;
-- the unique index above leads with focus_area_id, not player_id.
CREATE INDEX IF NOT EXISTS golf_focus_area_criteria_player_id_idx
ON public.golf_focus_area_criteria (player_id);

COMMENT ON TABLE public.golf_focus_area_criteria IS
'A8 slice 2: coach-authored (or engine-suggested) "done" definitions for a focus area -- one row per criterion, not a jsonb column on golf_player_focus_areas (see this migration''s header for why). INSERT is coach-only; UPDATE is coach-only and column-restricted to (met, met_at, updated_at) via GRANT, so a coach can mark a criterion met/unmet but never rewrite its label or source. The cap of ~10 per focus area is enforced in the action layer, acceptable because INSERT is coach-gated. Gated behind config/feature-flags.yml''s coachhelm_focus_area_practice_log flag (default off) until this migration is applied in production.'; -- noqa: LT05

ALTER TABLE public.golf_focus_area_criteria ENABLE ROW LEVEL SECURITY;

-- Same "re-run the parent's own RLS" trick as the sessions table above.
CREATE POLICY criteria_select_via_focus_area
ON public.golf_focus_area_criteria FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.golf_player_focus_areas AS fa
        WHERE fa.id = golf_focus_area_criteria.focus_area_id
    )
);

-- Coach-only INSERT, copied verbatim from
-- golf_player_focus_areas_insert_coach's own EXISTS branch. created_by_user_id
-- is pinned to the caller HERE, at INSERT time only -- not repeated on the
-- UPDATE policy below, because WITH CHECK on an UPDATE evaluates the NEW
-- row, and created_by_user_id can never change under the column grants
-- (only met/met_at/updated_at are UPDATE-granted). Pinning it there too
-- would require the ORIGINAL creating coach to be the one marking a
-- criterion met, which would deny a different on-team coach doing normal
-- coaching work for no security benefit.
CREATE POLICY criteria_insert_coach
ON public.golf_focus_area_criteria FOR INSERT TO authenticated
WITH CHECK (
    created_by_user_id = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.golf_player_focus_areas AS fa
        WHERE
            fa.id = golf_focus_area_criteria.focus_area_id
            AND fa.player_id = golf_focus_area_criteria.player_id
            AND fa.status IN ('active', 'in_progress', 'paused')
    )
    AND EXISTS (
        SELECT 1 FROM public.golf_team_members AS gtm
        WHERE
            gtm.player_id = golf_focus_area_criteria.player_id
            AND gtm.status = 'active'::public.team_member_status
            AND public.is_golf_team_coach(gtm.team_id)
    )
);

-- Coach-only UPDATE. Any on-team coach may mark a criterion met/unmet
-- (deliberately not restricted to whichever coach created it -- see the
-- comment on criteria_insert_coach above), but the column grants below
-- mean the ONLY columns PostgREST can actually change here are met,
-- met_at and updated_at; label and source stay immutable after INSERT.
CREATE POLICY criteria_update_coach
ON public.golf_focus_area_criteria FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.golf_player_focus_areas AS fa
        WHERE
            fa.id = golf_focus_area_criteria.focus_area_id
            AND fa.player_id = golf_focus_area_criteria.player_id
            AND fa.status IN ('active', 'in_progress', 'paused')
    )
    AND EXISTS (
        SELECT 1 FROM public.golf_team_members AS gtm
        WHERE
            gtm.player_id = golf_focus_area_criteria.player_id
            AND gtm.status = 'active'::public.team_member_status
            AND public.is_golf_team_coach(gtm.team_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.golf_player_focus_areas AS fa
        WHERE
            fa.id = golf_focus_area_criteria.focus_area_id
            AND fa.player_id = golf_focus_area_criteria.player_id
            AND fa.status IN ('active', 'in_progress', 'paused')
    )
    AND EXISTS (
        SELECT 1 FROM public.golf_team_members AS gtm
        WHERE
            gtm.player_id = golf_focus_area_criteria.player_id
            AND gtm.status = 'active'::public.team_member_status
            AND public.is_golf_team_coach(gtm.team_id)
    )
);

-- No DELETE policy -- criteria are append-only-ish (never removed, only
-- toggled met/unmet); combined with the REVOKE below, DELETE is refused at
-- both layers.
--
-- Column-restricted UPDATE grant, same reasoning as the sessions REVOKE
-- above (`authenticated` gets a full implicit grant at CREATE TABLE time
-- that must be explicitly revoked first): a coach may flip met/met_at
-- (and updated_at, so the row's own version marker stays honest), but
-- never label or source -- has_table_privilege('authenticated', ...,
-- 'UPDATE') correctly reports false here because the grant is
-- column-scoped, not table-scoped; has_column_privilege is the positive
-- check (see this migration's header VERIFY lines).
REVOKE ALL ON TABLE public.golf_focus_area_criteria FROM public,
anon,
authenticated;
GRANT SELECT,
INSERT ON TABLE public.golf_focus_area_criteria TO authenticated;
GRANT UPDATE (met, met_at, updated_at) ON TABLE public.golf_focus_area_criteria -- noqa: LT05
TO authenticated;
GRANT ALL ON TABLE public.golf_focus_area_criteria TO service_role;

-- All four foreign keys, grouped here at the end of the migration: by this
-- point every other DDL for both tables (indexes, RLS, policies, grants) is
-- already in place, so each ADD CONSTRAINT ... FOREIGN KEY -- which takes a
-- SHARE ROW EXCLUSIVE lock on the referenced parent (golf_player_focus_areas
-- or golf_players, both live/high-traffic) while validating -- runs back to
-- back instead of being interleaved with slower, unrelated DDL earlier in
-- the transaction, keeping that lock window as short as possible.

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

ALTER TABLE ONLY public.golf_focus_area_criteria
ADD CONSTRAINT golf_focus_area_criteria_focus_area_id_fkey
FOREIGN KEY (focus_area_id) REFERENCES public.golf_player_focus_areas (
    id
) ON DELETE CASCADE;

ALTER TABLE ONLY public.golf_focus_area_criteria
ADD CONSTRAINT golf_focus_area_criteria_player_id_fkey
FOREIGN KEY (player_id) REFERENCES public.golf_players (
    id
) ON DELETE CASCADE;
