-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner
-- (supabase/migrations/HELD.md).
-- Apply: npm run db:apply -- <this file>
--
-- Clubhouse P-10 "In class until 11:50" (class awareness). Build plan:
-- clubhouse-handoff/build-plans/P-10-class-awareness.md, section 8, with the
-- 2026-10-25 review fixes (Must 3, 5; Should 1, 9; S-6, S-7, S-8, S-14).
--
-- Adds three tables, one helper, one column and a realtime entry:
--   golf_team_terms            coach-confirmed term dates and the class time
-- zone
--   golf_player_class_settings a player's sharing and push-hold choices (kept
-- out of
--                              users.notification_preferences, whose whitelist
--                              trigger from 20261017100000 drops unknown keys)
--   golf_player_shares_class_status(team, player)  definer helper; the only way
-- a
--                              coach-side policy learns the sharing switch
--   golf_class_exceptions      "no class today", team breaks, exam blocks
--   golf_player_classes.status_enabled  per-class switch, default true
--   golf_class_exceptions in the supabase_realtime publication
--
-- Tables locked while this runs: golf_player_classes (ADD COLUMN, a
-- metadata-only
-- change on PG 11+ but it still takes ACCESS EXCLUSIVE for an instant; the
-- lock_timeout below makes it give up instead of queueing behind a long read).
-- Every other object is new. No index is added to golf_events: main's
-- idx_golf_events_team_start (team_id, start_time) serves the class-occurrence
-- scan.
--
-- Nothing reads these until the app ships; the app treats a missing table or
-- function (PGRST202 / 42P01) as "no class status", so either order is safe.
-- Risk: LOW. New tables, one additive column with a default.
-- pgTAP: supabase/tests/rls/golf_class_awareness.sql
--
-- ROLLBACK:
-- supabase/rollbacks/20261025070000_golf_class_awareness_tables.rollback.sql
-- ROLLBACK: order: 070200 and 070100 first (they read these tables), then this
-- file; 070300 is independent.
-- VERIFY: select 1 where to_regclass('public.golf_team_terms') is not null and
-- VERIFY: to_regclass('public.golf_class_exceptions') is not null and
-- VERIFY: to_regclass('public.golf_player_class_settings') is not null and
-- VERIFY: exists (select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'golf_player_classes' and column_name =
-- VERIFY: 'status_enabled') and (select relrowsecurity from pg_class where oid
-- VERIFY: = 'public.golf_team_terms'::regclass) and (select relrowsecurity from
-- VERIFY: pg_class where oid = 'public.golf_class_exceptions'::regclass) and
-- VERIFY: (select relrowsecurity from pg_class where oid =
-- VERIFY: 'public.golf_player_class_settings'::regclass);
-- VERIFY: select 1 where not has_table_privilege('authenticated',
-- VERIFY: 'public.golf_team_terms', 'truncate') and not
-- VERIFY: has_table_privilege('authenticated', 'public.golf_class_exceptions',
-- VERIFY: 'truncate') and not has_table_privilege('authenticated',
-- VERIFY: 'public.golf_player_class_settings', 'truncate') and not
-- VERIFY: has_table_privilege('anon', 'public.golf_team_terms', 'select') and
-- VERIFY: not has_table_privilege('anon', 'public.golf_class_exceptions',
-- VERIFY: 'select') and not has_table_privilege('anon',
-- VERIFY: 'public.golf_player_class_settings', 'select');
-- VERIFY: select 1 where has_function_privilege('authenticated',
-- VERIFY: 'public.golf_player_shares_class_status(uuid, uuid)', 'execute') and
-- VERIFY: not has_function_privilege('anon',
-- VERIFY: 'public.golf_player_shares_class_status(uuid, uuid)', 'execute');
-- VERIFY: select 1 where exists (select 1 from pg_publication_tables where
-- VERIFY: pubname = 'supabase_realtime' and schemaname = 'public' and tablename
-- VERIFY: = 'golf_class_exceptions');

SET lock_timeout = '3s';

-- 1. Terms -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.golf_team_terms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.golf_teams (id) ON DELETE CASCADE,
    label text NOT NULL,
    classes_start date NOT NULL,
    classes_end date NOT NULL,
    exams_end date NOT NULL,
    time_zone text NOT NULL,
    confirmed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
begin
  if not exists (select 1 from pg_constraint where conname = 'golf_team_terms_label_len') then
    alter table public.golf_team_terms
      add constraint golf_team_terms_label_len check (char_length(btrim(label)) between 1 and 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_team_terms_span') then
    alter table public.golf_team_terms
      add constraint golf_team_terms_span
      check (classes_end >= classes_start + 27 and classes_end <= classes_start + 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_team_terms_exams') then
    alter table public.golf_team_terms
      add constraint golf_team_terms_exams
      check (exams_end >= classes_end and exams_end <= classes_end + 21);
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_golf_team_terms_team_start
ON public.golf_team_terms (team_id, classes_start);

-- Validate the zone, refuse overlaps, stamp updated_at and confirmed_by.
-- The advisory lock closes the two-coaches race (Should 1): btree_gist is not
-- installed, so an exclusion constraint is not available, and without the lock
-- two concurrent inserts could each pass the overlap check before either
-- commits.
CREATE OR REPLACE FUNCTION public.golf_team_terms_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.time_zone) then
    raise exception 'unknown time zone %', new.time_zone using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('golf_team_terms:' || new.team_id::text));
  if exists (
    select 1 from public.golf_team_terms t
    where t.team_id = new.team_id
      and t.id <> new.id
      and daterange(t.classes_start, t.exams_end, '[]') && daterange(new.classes_start, new.exams_end, '[]')
  ) then
    raise exception 'term overlaps another term for this team' using errcode = '23P01';
  end if;
  new.label := btrim(new.label);
  new.updated_at := now();
  new.confirmed_at := now();
  new.confirmed_by := coalesce(auth.uid(), new.confirmed_by);
  return new;
end $$;

REVOKE ALL ON FUNCTION public.golf_team_terms_guard() FROM public,
anon,
authenticated;

DROP TRIGGER IF EXISTS golf_team_terms_guard ON public.golf_team_terms;
CREATE TRIGGER golf_team_terms_guard
BEFORE INSERT OR UPDATE ON public.golf_team_terms
FOR EACH ROW EXECUTE FUNCTION public.golf_team_terms_guard();

ALTER TABLE public.golf_team_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_team_terms_select ON public.golf_team_terms;
CREATE POLICY golf_team_terms_select ON public.golf_team_terms
FOR SELECT TO authenticated
USING (
    public.is_golf_team_coach(team_id)
    OR public.user_is_golf_team_member(team_id)
);

DROP POLICY IF EXISTS golf_team_terms_insert_coach ON public.golf_team_terms;
CREATE POLICY golf_team_terms_insert_coach ON public.golf_team_terms
FOR INSERT TO authenticated
WITH CHECK (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_team_terms_update_coach ON public.golf_team_terms;
CREATE POLICY golf_team_terms_update_coach ON public.golf_team_terms
FOR UPDATE TO authenticated
USING (public.is_golf_team_coach(team_id))
WITH CHECK (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_team_terms_delete_coach ON public.golf_team_terms;
CREATE POLICY golf_team_terms_delete_coach ON public.golf_team_terms
FOR DELETE TO authenticated
USING (public.is_golf_team_coach(team_id));

REVOKE ALL ON public.golf_team_terms FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_team_terms TO authenticated;
GRANT ALL ON public.golf_team_terms TO service_role;

-- 2. Player settings ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.golf_player_class_settings (
    player_id uuid PRIMARY KEY REFERENCES public.golf_players (
        id
    ) ON DELETE CASCADE,
    share_status boolean NOT NULL DEFAULT true,
    hold_pushes boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.golf_player_class_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_player_class_settings_own
ON public.golf_player_class_settings;
CREATE POLICY golf_player_class_settings_own
ON public.golf_player_class_settings
FOR ALL TO authenticated
USING (player_id = (SELECT public.get_current_golf_player_id()))
WITH CHECK (player_id = (SELECT public.get_current_golf_player_id()));
-- Coaches never read this table directly; golf_team_class_day exposes only the
-- derived "tracked" and "holds" booleans for their own team's players.

REVOKE ALL ON public.golf_player_class_settings FROM anon, authenticated;
GRANT SELECT,
INSERT,
UPDATE ON public.golf_player_class_settings TO authenticated;
GRANT ALL ON public.golf_player_class_settings TO service_role;

-- The sharing switch as a definer helper, so a coach-side policy can honour it
-- without reading the settings table (Must 5). It answers only for a coach of
-- the
-- team or the player themself; everyone else gets false. Known exception,
-- stated
-- in plan 8.10: a coach calling this through the API learns that one boolean.
CREATE OR REPLACE FUNCTION public.golf_player_shares_class_status(
    p_team_id uuid, p_player_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  select case
    when p_team_id is null or p_player_id is null then false
    -- A coach reads the switch only for a player who is on THEIR team: without the membership test a coach of team A could
    -- pass any other team's player and learn that player's setting.
    -- coalesce: a caller with no player id makes the OR below NULL, and a NULL WHEN would fall through to the data branch.
    when not coalesce(
              (public.is_golf_team_coach(p_team_id)
               and exists (select 1 from public.golf_team_members m
                            where m.team_id = p_team_id and m.player_id = p_player_id and m.status = 'active'))
              or p_player_id = public.get_current_golf_player_id(), false) then false
    else coalesce(
      (select s.share_status from public.golf_player_class_settings s where s.player_id = p_player_id),
      true)
  end
$$;

REVOKE ALL ON FUNCTION public.golf_player_shares_class_status(
    uuid, uuid
) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.golf_player_shares_class_status(
    uuid, uuid
) TO authenticated,
service_role;

-- 3. Exceptions: off days, team breaks, exam blocks ------------------------

CREATE TABLE IF NOT EXISTS public.golf_class_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.golf_teams (id) ON DELETE CASCADE,
    -- null: team-wide
    player_id uuid REFERENCES public.golf_players (id) ON DELETE CASCADE,
    -- null: all classes
    class_id uuid REFERENCES public.golf_player_classes (id) ON DELETE CASCADE,
    kind text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    start_time time,
    end_time time,
    label text,
    created_by uuid DEFAULT auth.uid() REFERENCES auth.users (
        id
    ) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
begin
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_kind') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_kind check (kind in ('off', 'extra'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_range') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_range
      check (ends_on >= starts_on and ends_on <= starts_on + 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_scope') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_scope check (player_id is not null or class_id is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_off_shape') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_off_shape
      check (kind <> 'off' or (start_time is null and end_time is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_extra_shape') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_extra_shape
      check (kind <> 'extra' or (
        player_id is not null and class_id is null
        and ends_on = starts_on
        and start_time is not null and end_time is not null
        and end_time > start_time
        and end_time - start_time <= interval '4 hours'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_class_exceptions_label_len') then
    alter table public.golf_class_exceptions
      add constraint golf_class_exceptions_label_len check (label is null or char_length(label) <= 60);
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_golf_class_exceptions_player_on
ON public.golf_class_exceptions (
    player_id, starts_on
) WHERE player_id IS NOT null;
CREATE INDEX IF NOT EXISTS idx_golf_class_exceptions_team_on
ON public.golf_class_exceptions (team_id, starts_on);
CREATE INDEX IF NOT EXISTS idx_golf_class_exceptions_class
ON public.golf_class_exceptions (class_id) WHERE class_id IS NOT null;

-- class_id must belong to player_id; player must be an active member of
-- team_id.
CREATE OR REPLACE FUNCTION public.golf_class_exceptions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
begin
  if new.class_id is not null and not exists (
    select 1 from public.golf_player_classes c
    where c.id = new.class_id and c.player_id = new.player_id
  ) then
    raise exception 'class does not belong to this player' using errcode = '23514';
  end if;
  if new.player_id is not null and not exists (
    select 1 from public.golf_team_members m
    where m.player_id = new.player_id and m.team_id = new.team_id and m.status = 'active'
  ) then
    raise exception 'player is not an active member of this team' using errcode = '23514';
  end if;
  return new;
end $$;

REVOKE ALL ON FUNCTION public.golf_class_exceptions_guard() FROM public,
anon,
authenticated;

DROP TRIGGER IF EXISTS golf_class_exceptions_guard
ON public.golf_class_exceptions;
CREATE TRIGGER golf_class_exceptions_guard
BEFORE INSERT ON public.golf_class_exceptions
FOR EACH ROW EXECUTE FUNCTION public.golf_class_exceptions_guard();

ALTER TABLE public.golf_class_exceptions ENABLE ROW LEVEL SECURITY;

-- Read: your own rows; team-wide rows of your team; coaches read their team's
-- team-wide rows and the rows of players who share class status (Must 5: the
-- coach branch is gated on the sharing switch through the definer helper).
DROP POLICY IF EXISTS golf_class_exceptions_select
ON public.golf_class_exceptions;
CREATE POLICY golf_class_exceptions_select ON public.golf_class_exceptions
FOR SELECT TO authenticated
USING (
    player_id = (SELECT public.get_current_golf_player_id())
    OR (player_id IS null AND public.user_is_golf_team_member(team_id))
    OR (
        public.is_golf_team_coach(team_id)
        AND (
            player_id IS null
            OR public.golf_player_shares_class_status(team_id, player_id)
        )
    )
);

-- Players add their own rows on a team they belong to.
DROP POLICY IF EXISTS golf_class_exceptions_insert_player
ON public.golf_class_exceptions;
CREATE POLICY golf_class_exceptions_insert_player
ON public.golf_class_exceptions
FOR INSERT TO authenticated
WITH CHECK (
    player_id = (SELECT public.get_current_golf_player_id())
    AND public.user_is_golf_team_member(team_id)
);

-- Coaches add team-wide breaks only (never a row for a single player).
DROP POLICY IF EXISTS golf_class_exceptions_insert_coach
ON public.golf_class_exceptions;
CREATE POLICY golf_class_exceptions_insert_coach ON public.golf_class_exceptions
FOR INSERT TO authenticated
WITH CHECK (player_id IS null AND public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_class_exceptions_delete
ON public.golf_class_exceptions;
CREATE POLICY golf_class_exceptions_delete ON public.golf_class_exceptions
FOR DELETE TO authenticated
USING (
    player_id = (SELECT public.get_current_golf_player_id())
    OR (player_id IS null AND public.is_golf_team_coach(team_id))
);
-- No update policy: rows are replaced, never edited.

REVOKE ALL ON public.golf_class_exceptions FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.golf_class_exceptions TO authenticated;
GRANT ALL ON public.golf_class_exceptions TO service_role;

-- 4. Per-class switch --------------------------------------------------------

ALTER TABLE public.golf_player_classes
ADD COLUMN IF NOT EXISTS status_enabled boolean NOT NULL DEFAULT true;

-- 5. Realtime: coach views learn about "no class today" within seconds -------
-- The publication change has no declarative mirror: supabase/schemas declares
-- no
-- publication (S-6).

DO $$
declare
  t text;
  wanted text[] := ARRAY['golf_class_exceptions'];
begin
  foreach t in array wanted loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
    ) then
      raise notice 'realtime publication: skipping % (no such table in public)', t;
      continue;
    end if;
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      raise notice 'realtime publication: % already published', t;
      continue;
    end if;
    execute format('alter publication supabase_realtime add table public.%I', t);
    raise notice 'realtime publication: added %', t;
  end loop;
end $$;
