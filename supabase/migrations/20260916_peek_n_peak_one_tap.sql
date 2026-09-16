-- ===========================================================================
-- One-Tap Live Round — durable anchor store (Peek'n Peak Upper pilot)
--
-- Master design §71 (privacy minimization), §75 (sync outbox), §76 (schema),
-- §77 (round integration). BRANCH-ONLY: this file is committed for review and
-- has NOT been applied to any remote project.
--
-- WHAT THIS IS
--   One tap = one anchor = "the ball is here now". Shots are DERIVED between
--   consecutive live anchors; the anchor itself is immutable evidence. This
--   subsystem is evidence collection, not a second round ledger (§77): score
--   still lives in golf_rounds / golf_holes / golf_shots, and the adapter that
--   feeds them is Task 14.
--
-- PRIVACY CONTRACT (§71) — the reason these columns and no others
--   The durable record keeps the RESOLVED position, its covariance, and a
--   SUMMARY of the estimator's evidence. The raw GNSS sample window is never
--   uploaded and has no column here. There is deliberately no `raw_samples`,
--   no per-fix array, no speed/heading trace and no continuous breadcrumb: a
--   golfer's phone produces a walking track, and this table must never become
--   one. The client mirrors that contract in shot-anchor.ts, which has no raw
--   window on the durable type at all (raw fixes reach only an opt-in,
--   in-memory calibration sink).
--
-- IDEMPOTENCY (§75)
--   `id` is the client-generated anchor id and the ONLY idempotency key. Every
--   retry re-sends the whole row and upserts on (id), so any number of
--   attempts converge on exactly one row with the same final state.
--
-- TOMBSTONES
--   Undo does not delete. It sets `deleted_at` and re-queues the row, so a
--   synchronized history is never renumbered. There is therefore NO delete
--   policy on any table here, and DELETE is revoked from `authenticated`
--   explicitly so that a later permissive policy cannot quietly re-enable a
--   hard delete.
--
-- LIFECYCLE
--   These tables carry NO completed-round lifecycle guard. golf_holes /
--   golf_shots raise 55000 for a write against a completed round; anchors must
--   not, or an offline flush that lands after the player submits the round
--   would be rejected forever and the outbox would lose marks. Anchors are
--   evidence about where the ball was, not score history that can be edited
--   after the fact — the score guard stays where the score is.
--
-- AUTHORIZATION (§76 "do not create a second auth domain")
--   Read follows the round exactly, via `public.can_read_golf_round`, which
--   reproduces the union of golf_rounds' SELECT policies: the player, a coach
--   who staffs the round's team, an ACTIVE TEAMMATE on that team, and admin.
--   ^ the teammate branch is inherited on purpose, but note what it means for
--   THIS table: anchors are metre-accurate positions, so a teammate can see
--   where another player's ball was on every hole. That is the same audience
--   that already sees the round, and widening it here would be the "second
--   auth domain" §76 forbids. Narrowing it to owner + staffing coach is a
--   one-line change inside can_read_golf_round if the owner wants it.
--   Write is strictly narrower: owner only, via `public.owns_golf_round`.
--
-- ROLLBACK:
--   drop table if exists public.golf_penalty_events;
--   drop table if exists public.golf_shot_anchors;
--   drop table if exists public.golf_round_course_bindings;
--   drop function if exists public.can_read_golf_round(uuid);
--   drop function if exists public.owns_golf_round(uuid);
--   (Additive only — nothing outside these three tables and two helpers is
--   touched, so the drops fully revert it.)
--
-- VERIFY: select 1 from pg_tables where schemaname='public' and tablename='golf_shot_anchors' and rowsecurity;
-- VERIFY: select 1 from pg_tables where schemaname='public' and tablename='golf_penalty_events' and rowsecurity;
-- VERIFY: select 1 from pg_tables where schemaname='public' and tablename='golf_round_course_bindings' and rowsecurity;
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_read_golf_round' and p.prosecdef;
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='owns_golf_round' and p.prosecdef;
-- VERIFY: select 1 where not exists (select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('golf_shot_anchors','golf_penalty_events','golf_round_course_bindings') and p.polcmd='d');
-- ===========================================================================

-- --- RLS helpers ------------------------------------------------------------
-- Correlated on the caller's round_id, exactly like
-- can_read_golf_shot_detail / owns_golf_shot (20260728030000): the predicate
-- costs one index lookup per row instead of an RLS-filtered scan of
-- golf_rounds. SECURITY DEFINER only to avoid re-entering the golf_rounds
-- policy stack — the readability union is reproduced explicitly inside.

create or replace function public.can_read_golf_round(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.golf_rounds gr
    join public.golf_players gp on gp.id = gr.player_id
    where gr.id = p_round_id
      -- Branch order matters: the plain column comparison is first so the
      -- overwhelmingly common self-read never pays for the helper functions,
      -- each of which is a query of its own.
      and (
        gp.user_id = (select auth.uid())
        or (gr.team_id is not null and public.is_golf_team_coach(gr.team_id))
        or (gr.team_id is not null and public.is_golf_team_player(gr.team_id))
        or public.is_admin()
      )
  );
$$;

comment on function public.can_read_golf_round(uuid) is
  'RLS read helper for the One-Tap evidence tables (golf_shot_anchors, '
  'golf_penalty_events, golf_round_course_bindings). Reproduces the union of '
  'golf_rounds'' SELECT policies — player, staffing coach, active teammate, '
  'admin — correlated on round_id. Anchors are metre-accurate ball positions, '
  'so the teammate branch is the widest audience here; it is inherited from '
  'the round on purpose (§76: do not create a second auth domain).';

create or replace function public.owns_golf_round(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.golf_rounds gr
    join public.golf_players gp on gp.id = gr.player_id
    where gr.id = p_round_id
      and gp.user_id = (select auth.uid())
  );
$$;

comment on function public.owns_golf_round(uuid) is
  'RLS write helper for the One-Tap evidence tables. True only for the player '
  'whose round it is. Deliberately NOT the read helper: a coach may read a '
  'player''s anchors but must never write them, and folding the two would '
  'hand every staffing coach write access to another player''s evidence.';

-- `anon` has to be revoked EXPLICITLY. Supabase ships an ALTER DEFAULT
-- PRIVILEGES entry granting EXECUTE on every new function in `public` directly
-- to anon, authenticated and service_role, so `revoke ... from public` does
-- nothing for it — the grant is a direct grant, not one held via PUBLIC.
revoke all on function public.can_read_golf_round(uuid) from public, anon;
revoke all on function public.owns_golf_round(uuid) from public, anon;
grant execute on function public.can_read_golf_round(uuid) to authenticated;
grant execute on function public.owns_golf_round(uuid) to authenticated;

-- --- golf_round_course_bindings --------------------------------------------
-- §73: which course a round's anchors belong to, and the exact geometry the
-- client classified against. One row per round. Written before the first
-- anchor so a re-read can tell which package a stored lie posterior was
-- computed from.

create table if not exists public.golf_round_course_bindings (
  round_id uuid primary key references public.golf_rounds(id) on delete cascade,
  course_id text not null,
  site_id text not null,
  geometry_version text not null,
  terrain_version text,
  one_tap_mode boolean not null default false,
  schema_version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.golf_round_course_bindings is
  'One-Tap §73 round-course binding: the course, site and geometry/terrain '
  'package version a round''s anchors were captured and classified against. '
  'No location data of any kind lives here.';
comment on column public.golf_round_course_bindings.course_id is
  'Product course id, e.g. peek-n-peak-upper. Text, not a golf_courses FK: the '
  'One-Tap pilot is keyed by course PACKAGE identity, not by the user-editable '
  'course library row.';
comment on column public.golf_round_course_bindings.site_id is
  'Package site id, e.g. osm-way-136097904. Course identity is the gate that '
  'keeps the Lower Course from ever activating by proximity.';
comment on column public.golf_round_course_bindings.geometry_version is
  'Content hash of the approved course geometry package the lie posteriors '
  'were computed against. Required: a posterior without it is not replayable.';
comment on column public.golf_round_course_bindings.one_tap_mode is
  'True when the round was played in One-Tap Live mode. False/absent means the '
  'standard shot tracker owns the round.';

-- --- golf_shot_anchors ------------------------------------------------------

create table if not exists public.golf_shot_anchors (
  -- Client-generated, time-prefixed, lexically sortable (newAnchorId). This is
  -- the idempotency key for the outbox: `on conflict (id) do update`.
  id text primary key,
  round_id uuid not null references public.golf_rounds(id) on delete cascade,

  course_id text not null,
  site_id text not null,

  hole_key text not null,
  hole_id smallint not null check (hole_id between 1 and 36),
  sequence integer not null check (sequence >= 0),

  tap_at timestamptz not null,
  -- Nullable on purpose. §76 sketched this NOT NULL, but a PROVISIONAL anchor
  -- (the hollow mark drawn the instant the button is pressed, before the
  -- estimator's window closes) has no finalized time yet, and a provisional
  -- anchor that cannot be persisted is a mark that can be lost to a force-kill
  -- in the two seconds that matter most.
  finalized_at timestamptz,
  provisional boolean not null default false,

  -- Resolved WGS84 position. Altitude is nullable: most fixes carry none.
  lon double precision not null,
  lat double precision not null,
  alt_m double precision,

  -- Resolved local ENU, the frame every distance is computed in.
  e_m double precision not null,
  n_m double precision not null,
  u_m double precision not null default 0,

  -- 2x2 horizontal covariance in ENU. Stored as four scalars rather than an
  -- array so a bad write is a type error, not a silently mis-shaped matrix.
  cov_ee double precision not null,
  cov_en double precision not null,
  cov_ne double precision not null,
  cov_nn double precision not null,

  sigma_m double precision not null check (sigma_m >= 0),
  reported_accuracy_median_m double precision not null check (reported_accuracy_median_m >= 0),
  calibrated_uncertainty_m double precision not null check (calibrated_uncertainty_m >= 0),

  capture_motion text not null
    check (capture_motion in ('stationary', 'settling', 'moving', 'unknown')),

  lie_posterior jsonb not null default '[]'::jsonb,
  primary_lie text not null,
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),

  terrain_elevation_m double precision,
  terrain_slope_degrees double precision,
  terrain_aspect_degrees double precision,

  geometry_version text not null,
  terrain_version text,

  terminal boolean not null default false,
  terminal_method text
    check (terminal_method in ('CUP_MARK', 'PIN_KNOWN', 'NEXT_TEE_INFERRED')),

  estimator_summary jsonb,
  classification jsonb,

  schema_version smallint not null default 2,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.golf_shot_anchors is
  'One-Tap Live Round shot anchors (master design §72/§76). One tap = one '
  'anchor = "the ball is here now"; shots are DERIVED between consecutive live '
  'anchors and are not stored here. '
  'PRIVACY (§71): NO RAW GNSS SAMPLES ARE STORED. The durable record holds the '
  'resolved position, its covariance and a summary of the estimator''s '
  'evidence — never the per-fix sample window, never a continuous track. Do '
  'not add a raw-sample, breadcrumb or heading-trace column to this table. '
  'Rows are immutable evidence: Undo sets deleted_at, it does not delete, and '
  'no DELETE policy exists.';

comment on column public.golf_shot_anchors.id is
  'Client-generated anchor id and the sync outbox''s only idempotency key '
  '(§75). Retries upsert on this column, so N attempts produce exactly one row.';
comment on column public.golf_shot_anchors.hole_key is
  'Course-package hole key (e.g. peek-n-peak-upper-07). The package, not the '
  'golf_holes row, is what the geometry was classified against.';
comment on column public.golf_shot_anchors.hole_id is
  'Hole ordinal 1-18 (up to 36 for a double round). Named to match the client '
  'ShotAnchor.holeId; §76 called it hole_ordinal.';
comment on column public.golf_shot_anchors.finalized_at is
  'When the estimator''s capture window closed. NULL while the anchor is still '
  'provisional — provisional marks persist so a force-kill cannot lose them.';
comment on column public.golf_shot_anchors.cov_ee is
  '2x2 ENU horizontal covariance, element [0][0], in m^2. With cov_en/cov_ne/'
  'cov_nn this is the whole uncertainty the UI and the distance sigma use.';
comment on column public.golf_shot_anchors.sigma_m is
  'Largest-axis 1-sigma horizontal uncertainty, metres. The number the UI '
  'shows as +/- and the one that suppresses a short-putt readout.';
comment on column public.golf_shot_anchors.reported_accuracy_median_m is
  'Median UNCALIBRATED radius the device reported across the window (§72). '
  'Kept apart from calibrated_uncertainty_m so a field calibration can be '
  'recomputed later without re-deriving it from a raw window we do not keep.';
comment on column public.golf_shot_anchors.calibrated_uncertainty_m is
  'kAcc * reported radius: the calibrated device term (§35).';
comment on column public.golf_shot_anchors.capture_motion is
  'Whether the phone was stationary / settling / moving while the window was '
  'captured. A SUMMARY of motion, never the motion trace itself.';
comment on column public.golf_shot_anchors.lie_posterior is
  'Canonical-partition posterior as [{featureId, lieClass, p}]. The evidence '
  'behind primary_lie; the UI chooses words from it, never snaps to a feature.';
comment on column public.golf_shot_anchors.estimator_summary is
  'PRIVACY-MINIMIZED estimator evidence (§71/§72): sample COUNT, rejected '
  'residual count, scatter major/minor axes, kAcc and its calibration state, '
  'poor-accuracy flag, motion evidence, basis. It is the summary that replaces '
  'the raw sample window — it must never be widened to carry the window back.';
comment on column public.golf_shot_anchors.terminal is
  'True when this mark is the ball in the cup. terminal_method records how '
  'that was established; NEXT_TEE_INFERRED never invents a cup position.';
comment on column public.golf_shot_anchors.deleted_at is
  'Tombstone. Undo sets it and re-queues the row; nothing is renumbered and '
  'the record is retained. There is no hard-delete path for a client.';

-- Read path: every anchor of a round, in play order. Partial on the live rows
-- because the renderer and the shot derivation only ever ask for those.
create index if not exists golf_shot_anchors_round_hole_idx
  on public.golf_shot_anchors (round_id, hole_key, sequence)
  where deleted_at is null;
create index if not exists golf_shot_anchors_round_idx
  on public.golf_shot_anchors (round_id, sequence);

-- --- golf_penalty_events ----------------------------------------------------
-- §58: penalty strokes are separate events, never fake spatial segments. The
-- drop is the next ordinary mark, so the shot record never branches.

create table if not exists public.golf_penalty_events (
  id text primary key,
  round_id uuid not null references public.golf_rounds(id) on delete cascade,

  course_id text not null,
  site_id text not null,

  hole_key text not null,
  hole_id smallint not null check (hole_id between 1 and 36),

  -- The client's own clock at the moment the penalty was recorded. Distinct
  -- from created_at, which is when the SERVER first accepted the row: an
  -- offline round can be hours apart, and the ordering that matters (which
  -- mark the penalty follows) is the client's.
  occurred_at timestamptz not null,

  strokes smallint not null check (strokes in (1, 2)),
  kind text not null
    check (kind in ('penalty_area', 'lost_ball', 'out_of_bounds', 'unplayable', 'other')),

  -- Deliberately NOT a foreign key to golf_shot_anchors. The outbox flushes
  -- anchors before penalties, but a batch can be partially accepted, and a
  -- penalty whose anchor has not landed yet must stay retryable rather than
  -- fail 23503 forever. A dangling id here is a resolvable sync state; an
  -- unsyncable penalty is a lost stroke.
  related_anchor_id text,

  schema_version smallint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.golf_penalty_events is
  'One-Tap penalty strokes (master design §58). A penalty is a SCORE fact tied '
  'to the mark it follows, never a fabricated shot segment: hole score = '
  'derived shots + penalty strokes. Carries no position data at all — the '
  'phone is with the golfer, not the ball, so a penalty never asserts where '
  'the ball went in. Tombstoned like anchors; no DELETE policy.';
comment on column public.golf_penalty_events.related_anchor_id is
  'The mark this penalty follows (the ball''s last known position), or NULL '
  'before any mark on the hole. Soft reference by design — see the column''s '
  'no-foreign-key note in this migration.';
comment on column public.golf_penalty_events.occurred_at is
  'Client clock when the penalty was recorded. Ordering against anchors uses '
  'this, not created_at, so an offline round resolves correctly on arrival.';

create index if not exists golf_penalty_events_round_hole_idx
  on public.golf_penalty_events (round_id, hole_key, occurred_at)
  where deleted_at is null;

-- --- updated_at -------------------------------------------------------------

drop trigger if exists golf_shot_anchors_set_updated_at on public.golf_shot_anchors;
create trigger golf_shot_anchors_set_updated_at
  before update on public.golf_shot_anchors
  for each row execute function public.update_updated_at_column();

drop trigger if exists golf_penalty_events_set_updated_at on public.golf_penalty_events;
create trigger golf_penalty_events_set_updated_at
  before update on public.golf_penalty_events
  for each row execute function public.update_updated_at_column();

drop trigger if exists golf_round_course_bindings_set_updated_at on public.golf_round_course_bindings;
create trigger golf_round_course_bindings_set_updated_at
  before update on public.golf_round_course_bindings
  for each row execute function public.update_updated_at_column();

-- --- RLS --------------------------------------------------------------------
-- SELECT follows the round. INSERT/UPDATE are owner-only and strictly narrower.
-- There is no DELETE policy anywhere below: deletes are tombstones. PostgREST
-- upserts run INSERT ... ON CONFLICT DO UPDATE, so a retry needs the UPDATE
-- policy's USING *and* WITH CHECK as well as the INSERT policy's WITH CHECK —
-- all three are present, which is what makes the second sync of the same
-- anchor succeed instead of silently failing after the first.

alter table public.golf_shot_anchors enable row level security;
alter table public.golf_penalty_events enable row level security;
alter table public.golf_round_course_bindings enable row level security;

drop policy if exists "golf_shot_anchors_select" on public.golf_shot_anchors;
create policy "golf_shot_anchors_select" on public.golf_shot_anchors
  for select to authenticated
  using (public.can_read_golf_round(round_id));

drop policy if exists "golf_shot_anchors_insert" on public.golf_shot_anchors;
create policy "golf_shot_anchors_insert" on public.golf_shot_anchors
  for insert to authenticated
  with check (public.owns_golf_round(round_id));

drop policy if exists "golf_shot_anchors_update" on public.golf_shot_anchors;
create policy "golf_shot_anchors_update" on public.golf_shot_anchors
  for update to authenticated
  using (public.owns_golf_round(round_id))
  with check (public.owns_golf_round(round_id));

drop policy if exists "golf_penalty_events_select" on public.golf_penalty_events;
create policy "golf_penalty_events_select" on public.golf_penalty_events
  for select to authenticated
  using (public.can_read_golf_round(round_id));

drop policy if exists "golf_penalty_events_insert" on public.golf_penalty_events;
create policy "golf_penalty_events_insert" on public.golf_penalty_events
  for insert to authenticated
  with check (public.owns_golf_round(round_id));

drop policy if exists "golf_penalty_events_update" on public.golf_penalty_events;
create policy "golf_penalty_events_update" on public.golf_penalty_events
  for update to authenticated
  using (public.owns_golf_round(round_id))
  with check (public.owns_golf_round(round_id));

drop policy if exists "golf_round_course_bindings_select" on public.golf_round_course_bindings;
create policy "golf_round_course_bindings_select" on public.golf_round_course_bindings
  for select to authenticated
  using (public.can_read_golf_round(round_id));

drop policy if exists "golf_round_course_bindings_insert" on public.golf_round_course_bindings;
create policy "golf_round_course_bindings_insert" on public.golf_round_course_bindings
  for insert to authenticated
  with check (public.owns_golf_round(round_id));

drop policy if exists "golf_round_course_bindings_update" on public.golf_round_course_bindings;
create policy "golf_round_course_bindings_update" on public.golf_round_course_bindings
  for update to authenticated
  using (public.owns_golf_round(round_id))
  with check (public.owns_golf_round(round_id));

-- --- grants -----------------------------------------------------------------
-- Supabase's ALTER DEFAULT PRIVILEGES hands anon/authenticated/service_role
-- every privilege on a new public table, so the tombstone contract has to be
-- enforced by an explicit REVOKE rather than by omitting a GRANT. Revoking
-- DELETE from authenticated means a future permissive delete policy still
-- cannot hard-delete evidence: the privilege is simply not there.

revoke all on public.golf_shot_anchors from anon;
revoke all on public.golf_penalty_events from anon;
revoke all on public.golf_round_course_bindings from anon;

revoke delete on public.golf_shot_anchors from authenticated;
revoke delete on public.golf_penalty_events from authenticated;
revoke delete on public.golf_round_course_bindings from authenticated;

grant select, insert, update on public.golf_shot_anchors to authenticated;
grant select, insert, update on public.golf_penalty_events to authenticated;
grant select, insert, update on public.golf_round_course_bindings to authenticated;
