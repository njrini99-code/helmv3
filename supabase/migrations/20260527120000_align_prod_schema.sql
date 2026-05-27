-- 20260527120000_align_prod_schema.sql
-- Forward-only alignment migration: brings fresh-replay DB to current
-- Helm-Production schema (project qmnssrrolpinvwjjnufo).
-- Source of truth: pg_dump --schema-only of prod on 2026-05-27
--   (artifact: /tmp/helmv3-prod-schema.sql; regenerate locally — not committed).
-- Run log: docs/operations/schema-alignment-2026-05-27.md
--
-- Strategy: IF NOT EXISTS / DO $$ guards everywhere so this migration is
-- safe to apply on top of any partial replay state. No DROP statements
-- on data-bearing tables. Additive only.
--
-- Scope:
--   A. 21 prod-only public tables (pg_dump diff vs supabase/migrations/*.sql).
--   B. Column-level drift bridges for golf_rounds / golf_documents /
--      golf_shots / golf_qualifier_entries.
--
-- Out of scope (deferred — needs DB owner approval before mutation):
--   - golf_events.status enum vs text alignment
--   - baseball_conversations.created_by text -> uuid alignment
--   - golf_player_classes.status restore (if dropped)
--   - storage.* schema (Phase 3.3, separate migration)
--   - The 61 migration-only tables intentionally absent from prod
--
-- Note: 'golf_patterns_v' from the deep-dive's CoachHelm v2 notes is NOT
-- in the prod dump — only 'golf_patterns_v2' (table) exists. The deep-dive
-- reference was a stale name. golf_patterns_v2 is already created by
-- supabase/migrations/031_golf_coachhelm.sql; no action needed here.
--
-- Note: Three of the 21 tables (baseball_coaches, baseball_players,
-- baseball_team_members) reach prod via migration 036_rename_baseball_tables.sql
-- (which renames the unprefixed `coaches`/`players`/`team_members` tables
-- created back in migrations 004/005/etc). The diff against the dump still
-- flagged them as 'prod only' because no migration emits a literal
-- `CREATE TABLE public.baseball_<name>` statement. Our `CREATE TABLE IF NOT
-- EXISTS` is a no-op on a replay that has already executed migration 036 —
-- the table exists with the older column set carried forward from the
-- pre-rename version. Column-level reshaping of those three tables to
-- match the prod dump (e.g., baseball_coaches.email vs email_contact,
-- baseball_coaches.title vs coach_title) is intentionally deferred —
-- column renames on the renamed cluster are runtime-impactful and need
-- DB-owner sign-off.
begin;

-- Defensive timeouts (Squawk require-timeout-settings).
-- Bound DDL latency so the migration cannot block prod indefinitely.
set local lock_timeout = '15s';
set local statement_timeout = '300s';

-- ------------------------------------------------------------------------
-- 0. Prerequisites — extensions and enum types
-- ------------------------------------------------------------------------
-- uuid-ossp is used by extensions.uuid_generate_v4() defaults from the prod dump.
-- On Supabase projects this is pre-provisioned; we re-assert it for safety.
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
-- Enum types referenced by the new tables. Prod has them in public schema.
-- DO blocks make the type creation idempotent (CREATE TYPE has no IF NOT EXISTS).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'admin_event_severity' and typnamespace = 'public'::regnamespace) then
    create type public.admin_event_severity as enum ('info', 'warning', 'error', 'critical');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'baseball_coach_type' and typnamespace = 'public'::regnamespace) then
    create type public.baseball_coach_type as enum ('college', 'juco', 'high_school', 'showcase');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'baseball_player_type' and typnamespace = 'public'::regnamespace) then
    create type public.baseball_player_type as enum ('college', 'juco', 'high_school', 'showcase');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'baseball_pipeline_stage' and typnamespace = 'public'::regnamespace) then
    create type public.baseball_pipeline_stage as enum ('watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'team_member_status' and typnamespace = 'public'::regnamespace) then
    create type public.team_member_status as enum ('pending', 'active', 'inactive', 'removed');
  end if;
end $$;

-- user_role is created by migration 001 as unqualified `user_role`. Prod has
-- it as public.user_role with the same labels. The unqualified bare type
-- created in migration 001 lands in the user's default schema (typically
-- public on Supabase), so on a fresh replay it already exists as
-- public.user_role and the policies below resolve cleanly.

-- ------------------------------------------------------------------------
-- A. New tables (21 public tables present in prod, missing from migrations)
-- ------------------------------------------------------------------------

-- ========================================================================
-- public.admin_analytics_events
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.admin_analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    page_path text,
    feature_name text,
    metadata jsonb DEFAULT '{}'::jsonb,
    session_id text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_analytics_events_event_type_check CHECK ((event_type = ANY (ARRAY['page_view'::text, 'feature_use'::text, 'session_start'::text, 'session_end'::text])))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_analytics_events_pkey' and conrelid = 'public.admin_analytics_events'::regclass
  ) then
    alter table public.admin_analytics_events add constraint admin_analytics_events_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_analytics_events_user_id_fkey' and conrelid = 'public.admin_analytics_events'::regclass
  ) then
    alter table public.admin_analytics_events add constraint admin_analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_admin_analytics_events_created ON public.admin_analytics_events USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.admin_analytics_events USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON public.admin_analytics_events USING btree (event_type);

CREATE INDEX IF NOT EXISTS idx_analytics_events_page_path ON public.admin_analytics_events USING btree (page_path);

CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON public.admin_analytics_events USING btree (session_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON public.admin_analytics_events USING btree (user_id);

alter table public.admin_analytics_events enable row level security;

drop policy if exists "Admins can read all analytics events" on public.admin_analytics_events;
CREATE POLICY "Admins can read all analytics events" ON public.admin_analytics_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

drop policy if exists "Users can insert own analytics events" on public.admin_analytics_events;
CREATE POLICY "Users can insert own analytics events" ON public.admin_analytics_events FOR INSERT WITH CHECK ((auth.uid() = user_id));

-- ========================================================================
-- public.admin_api_perf_log
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.admin_api_perf_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_name text NOT NULL,
    duration_ms integer NOT NULL,
    status text NOT NULL,
    error_message text,
    user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_api_perf_log_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text])))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_api_perf_log_pkey' and conrelid = 'public.admin_api_perf_log'::regclass
  ) then
    alter table public.admin_api_perf_log add constraint admin_api_perf_log_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_api_perf_log_user_id_fkey' and conrelid = 'public.admin_api_perf_log'::regclass
  ) then
    alter table public.admin_api_perf_log add constraint admin_api_perf_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_api_perf_log_action_name ON public.admin_api_perf_log USING btree (action_name);

CREATE INDEX IF NOT EXISTS idx_api_perf_log_created_at ON public.admin_api_perf_log USING btree (created_at DESC);

alter table public.admin_api_perf_log enable row level security;

drop policy if exists "Service role only for api perf log" on public.admin_api_perf_log;
CREATE POLICY "Service role only for api perf log" ON public.admin_api_perf_log USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

-- ========================================================================
-- public.admin_client_errors
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.admin_client_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    error_message text NOT NULL,
    error_stack text,
    page_url text,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_client_errors_pkey' and conrelid = 'public.admin_client_errors'::regclass
  ) then
    alter table public.admin_client_errors add constraint admin_client_errors_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_client_errors_user_id_fkey' and conrelid = 'public.admin_client_errors'::regclass
  ) then
    alter table public.admin_client_errors add constraint admin_client_errors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_client_errors_created_at ON public.admin_client_errors USING btree (created_at DESC);

alter table public.admin_client_errors enable row level security;

drop policy if exists "Admins can read all client errors" on public.admin_client_errors;
CREATE POLICY "Admins can read all client errors" ON public.admin_client_errors FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

drop policy if exists "Users can insert own client errors" on public.admin_client_errors;
CREATE POLICY "Users can insert own client errors" ON public.admin_client_errors FOR INSERT WITH CHECK ((auth.uid() = user_id));

-- ========================================================================
-- public.baseball_camp_registrations
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_camp_registrations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    camp_id uuid NOT NULL,
    player_id uuid NOT NULL,
    status text DEFAULT 'registered'::text,
    payment_status text DEFAULT 'pending'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_camp_registrations_pkey' and conrelid = 'public.baseball_camp_registrations'::regclass
  ) then
    alter table public.baseball_camp_registrations add constraint baseball_camp_registrations_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_camp_registrations_camp_id_player_id_key' and conrelid = 'public.baseball_camp_registrations'::regclass
  ) then
    alter table public.baseball_camp_registrations add constraint baseball_camp_registrations_camp_id_player_id_key UNIQUE (camp_id, player_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_camp_registrations_camp_id_fkey' and conrelid = 'public.baseball_camp_registrations'::regclass
  ) then
    alter table public.baseball_camp_registrations add constraint baseball_camp_registrations_camp_id_fkey FOREIGN KEY (camp_id) REFERENCES public.baseball_camps(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_camp_registrations_player_id_fkey' and conrelid = 'public.baseball_camp_registrations'::regclass
  ) then
    alter table public.baseball_camp_registrations add constraint baseball_camp_registrations_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_camp_regs_camp_id ON public.baseball_camp_registrations USING btree (camp_id);

CREATE INDEX IF NOT EXISTS idx_baseball_camp_regs_player_id ON public.baseball_camp_registrations USING btree (player_id);

alter table public.baseball_camp_registrations enable row level security;

drop policy if exists baseball_camp_regs_insert on public.baseball_camp_registrations;
CREATE POLICY baseball_camp_regs_insert ON public.baseball_camp_registrations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_camp_registrations.player_id) AND (baseball_players.user_id = auth.uid())))));

drop policy if exists baseball_camp_regs_select on public.baseball_camp_registrations;
CREATE POLICY baseball_camp_regs_select ON public.baseball_camp_registrations FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_camp_registrations.player_id) AND (baseball_players.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.baseball_camps bc
     JOIN public.baseball_coaches bco ON ((bco.id = bc.coach_id)))
  WHERE ((bc.id = baseball_camp_registrations.camp_id) AND (bco.user_id = auth.uid()))))));

drop policy if exists baseball_camp_regs_update on public.baseball_camp_registrations;
CREATE POLICY baseball_camp_regs_update ON public.baseball_camp_registrations FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_camp_registrations.player_id) AND (baseball_players.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.baseball_camps bc
     JOIN public.baseball_coaches bco ON ((bco.id = bc.coach_id)))
  WHERE ((bc.id = baseball_camp_registrations.camp_id) AND (bco.user_id = auth.uid()))))));

-- ========================================================================
-- public.baseball_camps
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_camps (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    organization_id uuid,
    name text NOT NULL,
    description text,
    location text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    registration_deadline date,
    capacity integer,
    price_cents integer,
    is_free boolean DEFAULT false,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_camps_pkey' and conrelid = 'public.baseball_camps'::regclass
  ) then
    alter table public.baseball_camps add constraint baseball_camps_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_camps_coach_id_fkey' and conrelid = 'public.baseball_camps'::regclass
  ) then
    alter table public.baseball_camps add constraint baseball_camps_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_camps_organization_id_fkey' and conrelid = 'public.baseball_camps'::regclass
  ) then
    alter table public.baseball_camps add constraint baseball_camps_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_camps_coach_id ON public.baseball_camps USING btree (coach_id);

CREATE INDEX IF NOT EXISTS idx_baseball_camps_org_id ON public.baseball_camps USING btree (organization_id);

alter table public.baseball_camps enable row level security;

drop policy if exists baseball_camps_delete on public.baseball_camps;
CREATE POLICY baseball_camps_delete ON public.baseball_camps FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_camps_insert on public.baseball_camps;
CREATE POLICY baseball_camps_insert ON public.baseball_camps FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_camps_select on public.baseball_camps;
CREATE POLICY baseball_camps_select ON public.baseball_camps FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))) OR (status = 'published'::text)));

drop policy if exists baseball_camps_update on public.baseball_camps;
CREATE POLICY baseball_camps_update ON public.baseball_camps FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_camps.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ========================================================================
-- public.baseball_coaches
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_coaches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid,
    coach_type public.baseball_coach_type NOT NULL,
    full_name text,
    email text,
    phone text,
    avatar_url text,
    title text,
    bio text,
    onboarding_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_coaches_pkey' and conrelid = 'public.baseball_coaches'::regclass
  ) then
    alter table public.baseball_coaches add constraint baseball_coaches_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_coaches_user_id_key' and conrelid = 'public.baseball_coaches'::regclass
  ) then
    alter table public.baseball_coaches add constraint baseball_coaches_user_id_key UNIQUE (user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_coaches_organization_id_fkey' and conrelid = 'public.baseball_coaches'::regclass
  ) then
    alter table public.baseball_coaches add constraint baseball_coaches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_coaches_user_id_fkey' and conrelid = 'public.baseball_coaches'::regclass
  ) then
    alter table public.baseball_coaches add constraint baseball_coaches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_coaches_org_id ON public.baseball_coaches USING btree (organization_id);

CREATE INDEX IF NOT EXISTS idx_baseball_coaches_type ON public.baseball_coaches USING btree (coach_type);

CREATE INDEX IF NOT EXISTS idx_baseball_coaches_user_id ON public.baseball_coaches USING btree (user_id);

alter table public.baseball_coaches enable row level security;

drop policy if exists baseball_coaches_insert_own on public.baseball_coaches;
CREATE POLICY baseball_coaches_insert_own ON public.baseball_coaches FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

drop policy if exists baseball_coaches_select on public.baseball_coaches;
CREATE POLICY baseball_coaches_select ON public.baseball_coaches FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (public.get_my_coach_id() IS NOT NULL)));

drop policy if exists baseball_coaches_select_all on public.baseball_coaches;
CREATE POLICY baseball_coaches_select_all ON public.baseball_coaches FOR SELECT TO authenticated USING (true);

drop policy if exists baseball_coaches_update_own on public.baseball_coaches;
CREATE POLICY baseball_coaches_update_own ON public.baseball_coaches FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

-- ========================================================================
-- public.baseball_developmental_plans
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_developmental_plans (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text,
    start_date date,
    end_date date,
    goals jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_developmental_plans_pkey' and conrelid = 'public.baseball_developmental_plans'::regclass
  ) then
    alter table public.baseball_developmental_plans add constraint baseball_developmental_plans_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_developmental_plans_coach_id_fkey' and conrelid = 'public.baseball_developmental_plans'::regclass
  ) then
    alter table public.baseball_developmental_plans add constraint baseball_developmental_plans_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_developmental_plans_player_id_fkey' and conrelid = 'public.baseball_developmental_plans'::regclass
  ) then
    alter table public.baseball_developmental_plans add constraint baseball_developmental_plans_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_developmental_plans_team_id_fkey' and conrelid = 'public.baseball_developmental_plans'::regclass
  ) then
    alter table public.baseball_developmental_plans add constraint baseball_developmental_plans_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE SET NULL;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_dev_plans_coach_id ON public.baseball_developmental_plans USING btree (coach_id);

CREATE INDEX IF NOT EXISTS idx_baseball_dev_plans_player_id ON public.baseball_developmental_plans USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_baseball_dev_plans_team_id ON public.baseball_developmental_plans USING btree (team_id);

alter table public.baseball_developmental_plans enable row level security;

drop policy if exists baseball_dev_plans_delete_coach on public.baseball_developmental_plans;
CREATE POLICY baseball_dev_plans_delete_coach ON public.baseball_developmental_plans FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_dev_plans_insert_coach on public.baseball_developmental_plans;
CREATE POLICY baseball_dev_plans_insert_coach ON public.baseball_developmental_plans FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_dev_plans_select on public.baseball_developmental_plans;
CREATE POLICY baseball_dev_plans_select ON public.baseball_developmental_plans FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_developmental_plans.player_id) AND (baseball_players.user_id = auth.uid()))))));

drop policy if exists baseball_dev_plans_update_coach on public.baseball_developmental_plans;
CREATE POLICY baseball_dev_plans_update_coach ON public.baseball_developmental_plans FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_developmental_plans.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ========================================================================
-- public.baseball_events
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    created_by uuid,
    title text NOT NULL,
    description text,
    event_type text NOT NULL,
    location text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    all_day boolean DEFAULT false,
    recurring boolean DEFAULT false,
    recurrence_rule text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    max_attendees integer,
    is_mandatory boolean DEFAULT false,
    rsvp_deadline timestamp with time zone,
    cancellation_reason text,
    is_recurring boolean DEFAULT false,
    created_by_id uuid
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_events_pkey' and conrelid = 'public.baseball_events'::regclass
  ) then
    alter table public.baseball_events add constraint baseball_events_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_events_created_by_fkey' and conrelid = 'public.baseball_events'::regclass
  ) then
    alter table public.baseball_events add constraint baseball_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_events_team_id_fkey' and conrelid = 'public.baseball_events'::regclass
  ) then
    alter table public.baseball_events add constraint baseball_events_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_events_created_by ON public.baseball_events USING btree (created_by) WHERE (created_by IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_baseball_events_start ON public.baseball_events USING btree (start_time);

CREATE INDEX IF NOT EXISTS idx_baseball_events_team_id ON public.baseball_events USING btree (team_id);

alter table public.baseball_events enable row level security;

drop policy if exists baseball_events_delete_coach on public.baseball_events;
CREATE POLICY baseball_events_delete_coach ON public.baseball_events FOR DELETE TO authenticated USING (public.is_baseball_team_coach(team_id));

drop policy if exists baseball_events_insert_coach on public.baseball_events;
CREATE POLICY baseball_events_insert_coach ON public.baseball_events FOR INSERT TO authenticated WITH CHECK (public.is_baseball_team_coach(team_id));

drop policy if exists baseball_events_select on public.baseball_events;
CREATE POLICY baseball_events_select ON public.baseball_events FOR SELECT TO authenticated USING ((public.is_baseball_team_coach(team_id) OR public.is_baseball_team_player(team_id)));

drop policy if exists baseball_events_update_coach on public.baseball_events;
CREATE POLICY baseball_events_update_coach ON public.baseball_events FOR UPDATE TO authenticated USING (public.is_baseball_team_coach(team_id));

-- ========================================================================
-- public.baseball_player_comparisons
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_player_comparisons (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    name text,
    player_ids uuid[] NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_player_comparisons_pkey' and conrelid = 'public.baseball_player_comparisons'::regclass
  ) then
    alter table public.baseball_player_comparisons add constraint baseball_player_comparisons_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_player_comparisons_coach_id_fkey' and conrelid = 'public.baseball_player_comparisons'::regclass
  ) then
    alter table public.baseball_player_comparisons add constraint baseball_player_comparisons_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_comparisons_coach_id ON public.baseball_player_comparisons USING btree (coach_id);

alter table public.baseball_player_comparisons enable row level security;

drop policy if exists baseball_comparisons_delete_own on public.baseball_player_comparisons;
CREATE POLICY baseball_comparisons_delete_own ON public.baseball_player_comparisons FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_comparisons_insert_own on public.baseball_player_comparisons;
CREATE POLICY baseball_comparisons_insert_own ON public.baseball_player_comparisons FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_comparisons_select_own on public.baseball_player_comparisons;
CREATE POLICY baseball_comparisons_select_own ON public.baseball_player_comparisons FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_comparisons_update_own on public.baseball_player_comparisons;
CREATE POLICY baseball_comparisons_update_own ON public.baseball_player_comparisons FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_comparisons.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ========================================================================
-- public.baseball_player_engagement_events
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_player_engagement_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    coach_id uuid,
    engagement_type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    engagement_date timestamp with time zone GENERATED ALWAYS AS (created_at) STORED
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_player_engagement_events_pkey' and conrelid = 'public.baseball_player_engagement_events'::regclass
  ) then
    alter table public.baseball_player_engagement_events add constraint baseball_player_engagement_events_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_player_engagement_events_coach_id_fkey' and conrelid = 'public.baseball_player_engagement_events'::regclass
  ) then
    alter table public.baseball_player_engagement_events add constraint baseball_player_engagement_events_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_player_engagement_events_player_id_fkey' and conrelid = 'public.baseball_player_engagement_events'::regclass
  ) then
    alter table public.baseball_player_engagement_events add constraint baseball_player_engagement_events_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_coach_id ON public.baseball_player_engagement_events USING btree (coach_id);

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_coach_type_date ON public.baseball_player_engagement_events USING btree (coach_id, engagement_type, created_at DESC) WHERE (coach_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_created ON public.baseball_player_engagement_events USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_events_coach_type_date ON public.baseball_player_engagement_events USING btree (coach_id, engagement_type, engagement_date DESC);

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_events_date ON public.baseball_player_engagement_events USING btree (engagement_date DESC);

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_events_player_type_date ON public.baseball_player_engagement_events USING btree (player_id, engagement_type, engagement_date DESC);

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_player_id ON public.baseball_player_engagement_events USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_player_type_date ON public.baseball_player_engagement_events USING btree (player_id, engagement_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_type ON public.baseball_player_engagement_events USING btree (engagement_type);

alter table public.baseball_player_engagement_events enable row level security;

drop policy if exists baseball_engagement_insert on public.baseball_player_engagement_events;
CREATE POLICY baseball_engagement_insert ON public.baseball_player_engagement_events FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_engagement_events.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_engagement_select on public.baseball_player_engagement_events;
CREATE POLICY baseball_engagement_select ON public.baseball_player_engagement_events FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_player_engagement_events.player_id) AND (baseball_players.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_player_engagement_events.coach_id) AND (baseball_coaches.user_id = auth.uid()))))));

-- ========================================================================
-- public.baseball_player_settings
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_player_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    profile_visibility text DEFAULT 'public'::text,
    show_academics boolean DEFAULT true,
    show_contact_info boolean DEFAULT false,
    show_dream_schools boolean DEFAULT true,
    email_notifications boolean DEFAULT true,
    push_notifications boolean DEFAULT true,
    notify_profile_views boolean DEFAULT true,
    notify_watchlist_adds boolean DEFAULT true,
    notify_messages boolean DEFAULT true,
    notify_team_activity boolean DEFAULT true,
    timezone text DEFAULT 'America/Chicago'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_player_settings_pkey' and conrelid = 'public.baseball_player_settings'::regclass
  ) then
    alter table public.baseball_player_settings add constraint baseball_player_settings_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_player_settings_player_id_key' and conrelid = 'public.baseball_player_settings'::regclass
  ) then
    alter table public.baseball_player_settings add constraint baseball_player_settings_player_id_key UNIQUE (player_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_player_settings_player_id_fkey' and conrelid = 'public.baseball_player_settings'::regclass
  ) then
    alter table public.baseball_player_settings add constraint baseball_player_settings_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_player_settings_player_id ON public.baseball_player_settings USING btree (player_id);

alter table public.baseball_player_settings enable row level security;

drop policy if exists baseball_player_settings_insert on public.baseball_player_settings;
CREATE POLICY baseball_player_settings_insert ON public.baseball_player_settings FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_player_settings.player_id) AND (baseball_players.user_id = auth.uid())))));

drop policy if exists baseball_player_settings_select on public.baseball_player_settings;
CREATE POLICY baseball_player_settings_select ON public.baseball_player_settings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_player_settings.player_id) AND (baseball_players.user_id = auth.uid())))));

drop policy if exists baseball_player_settings_update on public.baseball_player_settings;
CREATE POLICY baseball_player_settings_update ON public.baseball_player_settings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_player_settings.player_id) AND (baseball_players.user_id = auth.uid())))));

-- ========================================================================
-- public.baseball_players
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_players (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    player_type public.baseball_player_type NOT NULL,
    first_name text,
    last_name text,
    email text,
    phone text,
    avatar_url text,
    city text,
    state text,
    primary_position text,
    secondary_position text,
    grad_year integer,
    bats text,
    throws text,
    height_feet integer,
    height_inches integer,
    weight_lbs integer,
    pitch_velo numeric,
    exit_velo numeric,
    sixty_time numeric,
    pop_time numeric,
    arm_strength numeric,
    gpa numeric,
    sat_score integer,
    act_score integer,
    high_school_name text,
    high_school_city text,
    high_school_state text,
    instagram text,
    twitter text,
    about_me text,
    has_video boolean DEFAULT false,
    recruiting_activated boolean DEFAULT false,
    recruiting_activated_at timestamp with time zone,
    onboarding_completed boolean DEFAULT false,
    profile_completion_percent integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_players_pkey' and conrelid = 'public.baseball_players'::regclass
  ) then
    alter table public.baseball_players add constraint baseball_players_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_players_user_id_key' and conrelid = 'public.baseball_players'::regclass
  ) then
    alter table public.baseball_players add constraint baseball_players_user_id_key UNIQUE (user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_players_user_id_fkey' and conrelid = 'public.baseball_players'::regclass
  ) then
    alter table public.baseball_players add constraint baseball_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_players_grad_year ON public.baseball_players USING btree (grad_year);

CREATE INDEX IF NOT EXISTS idx_baseball_players_position ON public.baseball_players USING btree (primary_position);

CREATE INDEX IF NOT EXISTS idx_baseball_players_recruiting ON public.baseball_players USING btree (recruiting_activated) WHERE (recruiting_activated = true);

CREATE INDEX IF NOT EXISTS idx_baseball_players_state ON public.baseball_players USING btree (state);

CREATE INDEX IF NOT EXISTS idx_baseball_players_type ON public.baseball_players USING btree (player_type);

CREATE INDEX IF NOT EXISTS idx_baseball_players_user_id ON public.baseball_players USING btree (user_id);

alter table public.baseball_players enable row level security;

drop policy if exists baseball_players_insert_own on public.baseball_players;
CREATE POLICY baseball_players_insert_own ON public.baseball_players FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

drop policy if exists baseball_players_select on public.baseball_players;
CREATE POLICY baseball_players_select ON public.baseball_players FOR SELECT TO authenticated USING (true);

drop policy if exists baseball_players_update_own on public.baseball_players;
CREATE POLICY baseball_players_update_own ON public.baseball_players FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

-- ========================================================================
-- public.baseball_recruiting_interests
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_recruiting_interests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    interest_level text,
    notes text,
    status text DEFAULT 'interested'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_recruiting_interests_pkey' and conrelid = 'public.baseball_recruiting_interests'::regclass
  ) then
    alter table public.baseball_recruiting_interests add constraint baseball_recruiting_interests_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_recruiting_interests_player_id_organization_id_key' and conrelid = 'public.baseball_recruiting_interests'::regclass
  ) then
    alter table public.baseball_recruiting_interests add constraint baseball_recruiting_interests_player_id_organization_id_key UNIQUE (player_id, organization_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_recruiting_interests_organization_id_fkey' and conrelid = 'public.baseball_recruiting_interests'::regclass
  ) then
    alter table public.baseball_recruiting_interests add constraint baseball_recruiting_interests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_recruiting_interests_player_id_fkey' and conrelid = 'public.baseball_recruiting_interests'::regclass
  ) then
    alter table public.baseball_recruiting_interests add constraint baseball_recruiting_interests_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_recruiting_interests_org_id ON public.baseball_recruiting_interests USING btree (organization_id);

CREATE INDEX IF NOT EXISTS idx_baseball_recruiting_interests_player_id ON public.baseball_recruiting_interests USING btree (player_id);

alter table public.baseball_recruiting_interests enable row level security;

drop policy if exists baseball_recruiting_interests_delete_own on public.baseball_recruiting_interests;
CREATE POLICY baseball_recruiting_interests_delete_own ON public.baseball_recruiting_interests FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));

drop policy if exists baseball_recruiting_interests_insert_own on public.baseball_recruiting_interests;
CREATE POLICY baseball_recruiting_interests_insert_own ON public.baseball_recruiting_interests FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));

drop policy if exists baseball_recruiting_interests_select_own on public.baseball_recruiting_interests;
CREATE POLICY baseball_recruiting_interests_select_own ON public.baseball_recruiting_interests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));

drop policy if exists baseball_recruiting_interests_update_own on public.baseball_recruiting_interests;
CREATE POLICY baseball_recruiting_interests_update_own ON public.baseball_recruiting_interests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_recruiting_interests.player_id) AND (baseball_players.user_id = auth.uid())))));

-- ========================================================================
-- public.baseball_team_coach_staff
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_team_coach_staff (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    role text DEFAULT 'head_coach'::text,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_team_coach_staff_pkey' and conrelid = 'public.baseball_team_coach_staff'::regclass
  ) then
    alter table public.baseball_team_coach_staff add constraint baseball_team_coach_staff_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_team_coach_staff_team_id_coach_id_key' and conrelid = 'public.baseball_team_coach_staff'::regclass
  ) then
    alter table public.baseball_team_coach_staff add constraint baseball_team_coach_staff_team_id_coach_id_key UNIQUE (team_id, coach_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_team_coach_staff_coach_id_fkey' and conrelid = 'public.baseball_team_coach_staff'::regclass
  ) then
    alter table public.baseball_team_coach_staff add constraint baseball_team_coach_staff_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_team_coach_staff_team_id_fkey' and conrelid = 'public.baseball_team_coach_staff'::regclass
  ) then
    alter table public.baseball_team_coach_staff add constraint baseball_team_coach_staff_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_team_coach_staff_coach_id ON public.baseball_team_coach_staff USING btree (coach_id);

CREATE INDEX IF NOT EXISTS idx_baseball_team_coach_staff_team_id ON public.baseball_team_coach_staff USING btree (team_id);

alter table public.baseball_team_coach_staff enable row level security;

drop policy if exists baseball_team_coach_staff_delete on public.baseball_team_coach_staff;
CREATE POLICY baseball_team_coach_staff_delete ON public.baseball_team_coach_staff FOR DELETE TO authenticated USING (public.is_baseball_primary_coach(team_id));

drop policy if exists baseball_team_coach_staff_insert on public.baseball_team_coach_staff;
CREATE POLICY baseball_team_coach_staff_insert ON public.baseball_team_coach_staff FOR INSERT TO authenticated WITH CHECK (public.is_baseball_primary_coach(team_id));

drop policy if exists baseball_team_coach_staff_select on public.baseball_team_coach_staff;
CREATE POLICY baseball_team_coach_staff_select ON public.baseball_team_coach_staff FOR SELECT TO authenticated USING (true);

drop policy if exists baseball_team_coach_staff_update on public.baseball_team_coach_staff;
CREATE POLICY baseball_team_coach_staff_update ON public.baseball_team_coach_staff FOR UPDATE TO authenticated USING (public.is_baseball_primary_coach(team_id));

-- ========================================================================
-- public.baseball_team_members
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_team_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    player_id uuid NOT NULL,
    status public.team_member_status DEFAULT 'pending'::public.team_member_status,
    jersey_number integer,
    "position" text,
    joined_at timestamp with time zone,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_team_members_pkey' and conrelid = 'public.baseball_team_members'::regclass
  ) then
    alter table public.baseball_team_members add constraint baseball_team_members_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_team_members_team_id_player_id_key' and conrelid = 'public.baseball_team_members'::regclass
  ) then
    alter table public.baseball_team_members add constraint baseball_team_members_team_id_player_id_key UNIQUE (team_id, player_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_team_members_approved_by_fkey' and conrelid = 'public.baseball_team_members'::regclass
  ) then
    alter table public.baseball_team_members add constraint baseball_team_members_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_team_members_player_id_fkey' and conrelid = 'public.baseball_team_members'::regclass
  ) then
    alter table public.baseball_team_members add constraint baseball_team_members_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_team_members_team_id_fkey' and conrelid = 'public.baseball_team_members'::regclass
  ) then
    alter table public.baseball_team_members add constraint baseball_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_team_members_approved_by ON public.baseball_team_members USING btree (approved_by) WHERE (approved_by IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_baseball_team_members_player_id ON public.baseball_team_members USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_baseball_team_members_status ON public.baseball_team_members USING btree (status);

CREATE INDEX IF NOT EXISTS idx_baseball_team_members_team_id ON public.baseball_team_members USING btree (team_id);

alter table public.baseball_team_members enable row level security;

drop policy if exists baseball_team_members_delete_coach on public.baseball_team_members;
CREATE POLICY baseball_team_members_delete_coach ON public.baseball_team_members FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff btcs
     JOIN public.baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_team_members.team_id) AND (bc.user_id = auth.uid())))));

drop policy if exists baseball_team_members_insert on public.baseball_team_members;
CREATE POLICY baseball_team_members_insert ON public.baseball_team_members FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_team_members.player_id) AND (baseball_players.user_id = auth.uid())))));

drop policy if exists baseball_team_members_select on public.baseball_team_members;
CREATE POLICY baseball_team_members_select ON public.baseball_team_members FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff btcs
     JOIN public.baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_team_members.team_id) AND (bc.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.baseball_players bp
     JOIN public.baseball_team_members btm ON ((btm.player_id = bp.id)))
  WHERE ((btm.team_id = baseball_team_members.team_id) AND (bp.user_id = auth.uid()))))));

drop policy if exists baseball_team_members_update_coach on public.baseball_team_members;
CREATE POLICY baseball_team_members_update_coach ON public.baseball_team_members FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff btcs
     JOIN public.baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_team_members.team_id) AND (bc.user_id = auth.uid())))));

-- ========================================================================
-- public.baseball_teams
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_teams (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    name text NOT NULL,
    team_type public.baseball_coach_type NOT NULL,
    join_code text NOT NULL,
    logo_url text,
    primary_color text,
    secondary_color text,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_teams_pkey' and conrelid = 'public.baseball_teams'::regclass
  ) then
    alter table public.baseball_teams add constraint baseball_teams_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_teams_join_code_key' and conrelid = 'public.baseball_teams'::regclass
  ) then
    alter table public.baseball_teams add constraint baseball_teams_join_code_key UNIQUE (join_code);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_teams_created_by_fkey' and conrelid = 'public.baseball_teams'::regclass
  ) then
    alter table public.baseball_teams add constraint baseball_teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_teams_organization_id_fkey' and conrelid = 'public.baseball_teams'::regclass
  ) then
    alter table public.baseball_teams add constraint baseball_teams_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_teams_created_by ON public.baseball_teams USING btree (created_by) WHERE (created_by IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_baseball_teams_join_code ON public.baseball_teams USING btree (join_code);

CREATE INDEX IF NOT EXISTS idx_baseball_teams_org_id ON public.baseball_teams USING btree (organization_id);

CREATE INDEX IF NOT EXISTS idx_baseball_teams_type ON public.baseball_teams USING btree (team_type);

alter table public.baseball_teams enable row level security;

drop policy if exists baseball_teams_delete on public.baseball_teams;
CREATE POLICY baseball_teams_delete ON public.baseball_teams FOR DELETE TO authenticated USING (public.is_baseball_primary_coach(id));

drop policy if exists baseball_teams_insert_coaches on public.baseball_teams;
CREATE POLICY baseball_teams_insert_coaches ON public.baseball_teams FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE (baseball_coaches.user_id = auth.uid()))));

drop policy if exists baseball_teams_select on public.baseball_teams;
CREATE POLICY baseball_teams_select ON public.baseball_teams FOR SELECT TO authenticated USING (true);

drop policy if exists baseball_teams_update on public.baseball_teams;
CREATE POLICY baseball_teams_update ON public.baseball_teams FOR UPDATE TO authenticated USING (public.is_baseball_primary_coach(id)) WITH CHECK (public.is_baseball_primary_coach(id));

drop policy if exists baseball_teams_update_own_coach on public.baseball_teams;
CREATE POLICY baseball_teams_update_own_coach ON public.baseball_teams FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.baseball_team_coach_staff btcs
     JOIN public.baseball_coaches bc ON ((bc.id = btcs.coach_id)))
  WHERE ((btcs.team_id = baseball_teams.id) AND (bc.user_id = auth.uid())))));

-- ========================================================================
-- public.baseball_videos
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_videos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid,
    title text NOT NULL,
    description text,
    video_type text,
    url text,
    thumbnail_url text,
    duration integer,
    view_count integer DEFAULT 0,
    is_primary boolean DEFAULT false,
    is_clip boolean DEFAULT false,
    parent_video_id uuid,
    clip_start_time integer,
    clip_end_time integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_videos_pkey' and conrelid = 'public.baseball_videos'::regclass
  ) then
    alter table public.baseball_videos add constraint baseball_videos_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_videos_parent_video_id_fkey' and conrelid = 'public.baseball_videos'::regclass
  ) then
    alter table public.baseball_videos add constraint baseball_videos_parent_video_id_fkey FOREIGN KEY (parent_video_id) REFERENCES public.baseball_videos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_videos_player_id_fkey' and conrelid = 'public.baseball_videos'::regclass
  ) then
    alter table public.baseball_videos add constraint baseball_videos_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_videos_team_id_fkey' and conrelid = 'public.baseball_videos'::regclass
  ) then
    alter table public.baseball_videos add constraint baseball_videos_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.baseball_teams(id) ON DELETE SET NULL;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_videos_parent_video_id ON public.baseball_videos USING btree (parent_video_id) WHERE (parent_video_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_baseball_videos_player_id ON public.baseball_videos USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_baseball_videos_primary ON public.baseball_videos USING btree (player_id) WHERE (is_primary = true);

CREATE INDEX IF NOT EXISTS idx_baseball_videos_team_id ON public.baseball_videos USING btree (team_id);

alter table public.baseball_videos enable row level security;

drop policy if exists baseball_videos_delete_own on public.baseball_videos;
CREATE POLICY baseball_videos_delete_own ON public.baseball_videos FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))));

drop policy if exists baseball_videos_insert_own on public.baseball_videos;
CREATE POLICY baseball_videos_insert_own ON public.baseball_videos FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))));

drop policy if exists baseball_videos_select on public.baseball_videos;
CREATE POLICY baseball_videos_select ON public.baseball_videos FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))) OR ((team_id IS NOT NULL) AND public.is_baseball_team_coach(team_id)) OR ((team_id IS NOT NULL) AND public.is_baseball_team_player(team_id)) OR (EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.recruiting_activated = true) AND (baseball_players.player_type = ANY (ARRAY['high_school'::public.baseball_player_type, 'showcase'::public.baseball_player_type, 'juco'::public.baseball_player_type])))))));

drop policy if exists baseball_videos_update_own on public.baseball_videos;
CREATE POLICY baseball_videos_update_own ON public.baseball_videos FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_players
  WHERE ((baseball_players.id = baseball_videos.player_id) AND (baseball_players.user_id = auth.uid())))));

-- ========================================================================
-- public.baseball_watchlists
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.baseball_watchlists (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    player_id uuid NOT NULL,
    pipeline_stage public.baseball_pipeline_stage DEFAULT 'watchlist'::public.baseball_pipeline_stage,
    notes text,
    priority integer DEFAULT 0,
    tags text[] DEFAULT '{}'::text[],
    fit_score integer,
    source text,
    last_contact timestamp with time zone,
    added_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_watchlists_pkey' and conrelid = 'public.baseball_watchlists'::regclass
  ) then
    alter table public.baseball_watchlists add constraint baseball_watchlists_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_watchlists_coach_id_player_id_key' and conrelid = 'public.baseball_watchlists'::regclass
  ) then
    alter table public.baseball_watchlists add constraint baseball_watchlists_coach_id_player_id_key UNIQUE (coach_id, player_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_watchlists_coach_id_fkey' and conrelid = 'public.baseball_watchlists'::regclass
  ) then
    alter table public.baseball_watchlists add constraint baseball_watchlists_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.baseball_coaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'baseball_watchlists_player_id_fkey' and conrelid = 'public.baseball_watchlists'::regclass
  ) then
    alter table public.baseball_watchlists add constraint baseball_watchlists_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.baseball_players(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_baseball_watchlists_coach_id ON public.baseball_watchlists USING btree (coach_id);

CREATE INDEX IF NOT EXISTS idx_baseball_watchlists_player_id ON public.baseball_watchlists USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_baseball_watchlists_stage ON public.baseball_watchlists USING btree (pipeline_stage);

alter table public.baseball_watchlists enable row level security;

drop policy if exists baseball_watchlists_delete_own on public.baseball_watchlists;
CREATE POLICY baseball_watchlists_delete_own ON public.baseball_watchlists FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_watchlists_insert_own on public.baseball_watchlists;
CREATE POLICY baseball_watchlists_insert_own ON public.baseball_watchlists FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_watchlists_select_own on public.baseball_watchlists;
CREATE POLICY baseball_watchlists_select_own ON public.baseball_watchlists FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

drop policy if exists baseball_watchlists_update_own on public.baseball_watchlists;
CREATE POLICY baseball_watchlists_update_own ON public.baseball_watchlists FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.baseball_coaches
  WHERE ((baseball_coaches.id = baseball_watchlists.coach_id) AND (baseball_coaches.user_id = auth.uid())))));

-- ========================================================================
-- public.email_events
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_log_id uuid,
    resend_message_id text NOT NULL,
    event_type text NOT NULL,
    recipient_email text,
    occurred_at timestamp with time zone NOT NULL,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_email_events_pkey' and conrelid = 'public.email_events'::regclass
  ) then
    alter table public.email_events add constraint crm_email_events_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_events_dedup' and conrelid = 'public.email_events'::regclass
  ) then
    alter table public.email_events add constraint email_events_dedup UNIQUE (resend_message_id, event_type, occurred_at);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_email_events_contact_log_id_fkey' and conrelid = 'public.email_events'::regclass
  ) then
    alter table public.email_events add constraint crm_email_events_contact_log_id_fkey FOREIGN KEY (contact_log_id) REFERENCES public.crm_contact_log(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_crm_email_events_created_at ON public.email_events USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_email_events_contact ON public.email_events USING btree (contact_log_id);

CREATE INDEX IF NOT EXISTS idx_email_events_msg ON public.email_events USING btree (resend_message_id);

CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at ON public.email_events USING btree (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at_desc ON public.email_events USING btree (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_type ON public.email_events USING btree (event_type);

CREATE INDEX IF NOT EXISTS idx_email_events_type_occurred ON public.email_events USING btree (event_type, occurred_at DESC);

alter table public.email_events enable row level security;

drop policy if exists "Admins can view email events" on public.email_events;
CREATE POLICY "Admins can view email events" ON public.email_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

-- ========================================================================
-- public.golf_player_notification_state
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.golf_player_notification_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid NOT NULL,
    last_announcements_seen_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_travel_seen_at timestamp with time zone DEFAULT now(),
    prefs jsonb DEFAULT '{"goal_missed": {"push": false, "email": false, "in_app": true}, "new_insight": {"push": false, "email": false, "in_app": true}, "goal_achieved": {"push": true, "email": false, "in_app": true}, "weekly_digest": {"push": false, "email": true, "in_app": false}, "coach_commented": {"push": true, "email": false, "in_app": true}, "composite_insight": {"push": true, "email": false, "in_app": true}, "round_review_ready": {"push": true, "email": false, "in_app": true}, "coach_assigned_goal": {"push": true, "email": false, "in_app": true}, "engine_suggested_goal": {"push": false, "email": false, "in_app": true}, "standing_percentile_changed": {"push": false, "email": false, "in_app": false}}'::jsonb NOT NULL,
    quiet_mode boolean DEFAULT false NOT NULL
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'golf_player_notification_state_pkey' and conrelid = 'public.golf_player_notification_state'::regclass
  ) then
    alter table public.golf_player_notification_state add constraint golf_player_notification_state_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'golf_player_notification_state_player_id_key' and conrelid = 'public.golf_player_notification_state'::regclass
  ) then
    alter table public.golf_player_notification_state add constraint golf_player_notification_state_player_id_key UNIQUE (player_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'golf_player_notification_state_player_id_fkey' and conrelid = 'public.golf_player_notification_state'::regclass
  ) then
    alter table public.golf_player_notification_state add constraint golf_player_notification_state_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.golf_players(id) ON DELETE CASCADE;
  end if;
end $$;

alter table public.golf_player_notification_state enable row level security;

drop policy if exists "Players manage own notification state" on public.golf_player_notification_state;
CREATE POLICY "Players manage own notification state" ON public.golf_player_notification_state USING ((player_id IN ( SELECT golf_players.id
   FROM public.golf_players
  WHERE (golf_players.user_id = auth.uid()))));

-- ========================================================================
-- public.golf_team_coach_staff
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.golf_team_coach_staff (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    role text DEFAULT 'head_coach'::text,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'golf_team_coach_staff_pkey' and conrelid = 'public.golf_team_coach_staff'::regclass
  ) then
    alter table public.golf_team_coach_staff add constraint golf_team_coach_staff_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'golf_team_coach_staff_team_id_coach_id_key' and conrelid = 'public.golf_team_coach_staff'::regclass
  ) then
    alter table public.golf_team_coach_staff add constraint golf_team_coach_staff_team_id_coach_id_key UNIQUE (team_id, coach_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'golf_team_coach_staff_coach_id_fkey' and conrelid = 'public.golf_team_coach_staff'::regclass
  ) then
    alter table public.golf_team_coach_staff add constraint golf_team_coach_staff_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.golf_coaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'golf_team_coach_staff_team_id_fkey' and conrelid = 'public.golf_team_coach_staff'::regclass
  ) then
    alter table public.golf_team_coach_staff add constraint golf_team_coach_staff_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_golf_team_coach_staff_coach_id ON public.golf_team_coach_staff USING btree (coach_id);

CREATE INDEX IF NOT EXISTS idx_golf_team_coach_staff_team_id ON public.golf_team_coach_staff USING btree (team_id);

alter table public.golf_team_coach_staff enable row level security;

drop policy if exists golf_team_coach_staff_delete on public.golf_team_coach_staff;
CREATE POLICY golf_team_coach_staff_delete ON public.golf_team_coach_staff FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.golf_coaches
  WHERE ((golf_coaches.id = golf_team_coach_staff.coach_id) AND (golf_coaches.user_id = auth.uid())))));

drop policy if exists golf_team_coach_staff_insert on public.golf_team_coach_staff;
CREATE POLICY golf_team_coach_staff_insert ON public.golf_team_coach_staff FOR INSERT TO authenticated WITH CHECK ((public.is_golf_team_primary_coach(team_id) AND (EXISTS ( SELECT 1
   FROM public.golf_coaches gc
  WHERE ((gc.id = golf_team_coach_staff.coach_id) AND (gc.user_id = auth.uid()))))));

drop policy if exists golf_team_coach_staff_select on public.golf_team_coach_staff;
CREATE POLICY golf_team_coach_staff_select ON public.golf_team_coach_staff FOR SELECT TO authenticated USING ((public.is_golf_team_coach(team_id) OR public.is_golf_team_player(team_id)));

-- ------------------------------------------------------------------------
-- B. Column-level drift bridges
-- ------------------------------------------------------------------------

-- B.1 golf_rounds: prod has `status` text. Some migrations referenced
-- `round_status`. Rename only if the old column exists.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'golf_rounds' and column_name = 'round_status'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'golf_rounds' and column_name = 'status'
  ) then
    alter table public.golf_rounds rename column round_status to status;
  end if;
end $$;

-- B.2 golf_documents: prod has `is_public` boolean. Some migrations used
-- `player_visible`. Rename only if the old column exists.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'golf_documents' and column_name = 'player_visible'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'golf_documents' and column_name = 'is_public'
  ) then
    alter table public.golf_documents rename column player_visible to is_public;
  end if;
end $$;

-- B.3 golf_shots: prod has shot_type (text), round_id (uuid NOT NULL),
-- hole_number (integer NOT NULL). Ensure each column exists.
-- NOT NULL is not enforced here on retroactive ADD COLUMN; data backfill
-- is out of scope for an idempotent alignment migration.
alter table public.golf_shots add column if not exists shot_type text;
alter table public.golf_shots add column if not exists round_id uuid;
alter table public.golf_shots add column if not exists hole_number integer;

-- B.4 golf_qualifier_entries: prod has `score` integer. Ensure present.
alter table public.golf_qualifier_entries add column if not exists score integer;

-- Deferred (need explicit DB owner approval — out of scope here):
--   golf_events.status enum->text alignment
--   baseball_conversations.created_by text->uuid alignment
--   golf_player_classes.status restore (if dropped)

commit;
