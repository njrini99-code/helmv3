-- Error resolution lifecycle: open -> fixed/archived -> (regressed).
--
-- WHY A TABLE AND NOT admin_events.resolved
-- -----------------------------------------
-- `admin_events` already has `resolved` / `resolved_at` / `resolved_by`, but
-- those are per-ROW. Resolving an incident means marking N rows, and the next
-- occurrence of the SAME fault arrives as a new unresolved row -- so the thing
-- an operator actually fixed cannot be recorded as fixed, and comes back
-- indistinguishable from a genuine regression.
--
-- Resolution belongs to the FINGERPRINT (the stable identity produced by
-- `buildIncidentSignature`, stored write-time on `admin_events.fingerprint`),
-- not to individual rows. One row here per fault, carrying what resolves it:
-- the PR, the merge commit, when, and whether a human or the cron decided.
--
-- THE REGRESSION RULE -- why "I never want to see it again" is not quite what
-- you want. An archived fault must come BACK, loudly, if it recurs after its fix
-- shipped. That is a regression, and it is the most valuable thing this table
-- can tell you; suppressing it forever would turn the archive into a way to lose
-- bugs. So resolution is recorded and COMPARED against new occurrences at read
-- time, rather than anything being deleted or permanently hidden.
--
-- Nothing here is destructive: no admin_events row is modified or removed, and
-- archiving is a JOIN at read time. If this table were dropped tomorrow every
-- incident would simply reappear -- the correct failure direction for a feature
-- whose job is hiding things.

create table if not exists public.admin_error_resolutions (
  -- One current resolution state per fault. History lives in the audit columns.
  fingerprint text primary key,

  resolved_at timestamptz not null default now(),
  -- Null for an automatic resolution: nobody decided, so attributing it to a
  -- person would be a lie in an audit column.
  resolved_by uuid references auth.users(id) on delete set null,

  -- WHO decided. 'auto' means the reliability cron observed the fault stop
  -- recurring after a deploy; 'manual' means an operator asserted it. The
  -- distinction must survive: an auto-archive is a much weaker claim than a
  -- human one, and the UI must not present them identically.
  resolution_source text not null default 'manual'
    check (resolution_source in ('auto', 'manual')),

  -- What fixed it. All nullable: a fault may be resolved with no code change (a
  -- config fix, an upstream outage ending), and recording "resolved, no PR" is
  -- more honest than inventing one.
  pr_number integer check (pr_number is null or pr_number > 0),
  pr_url text,
  -- The merge commit, compared against the deployed production SHA to answer
  -- "has the fix actually shipped" -- a DIFFERENT question from "is it fixed",
  -- kept separable on purpose.
  fixed_in_sha text check (fixed_in_sha is null or fixed_in_sha ~ '^[0-9a-f]{7,40}$'),

  -- The last occurrence the resolver could see. The regression check compares
  -- new events against THIS, not against resolved_at: a fault that fired once
  -- more between the fix landing and the cron running is not a regression.
  last_seen_at_resolution timestamptz,

  note text,

  -- Regression bookkeeping. An archived-then-regressed fault is not the same as
  -- one never fixed, and the Bridge says so.
  reopened_at timestamptz,
  reopened_count integer not null default 0 check (reopened_count >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_error_resolutions is
  'Per-fingerprint resolution state for Helm Bridge incidents: what fixed a fault (PR + merge SHA), who decided (auto cron vs operator), and whether it has regressed since. Read-side archive; never mutates admin_events.';

create index if not exists idx_admin_error_resolutions_resolved_at
  on public.admin_error_resolutions (resolved_at desc);

-- Partial index: the hot query is "which archived faults have come back", which
-- only ever touches rows with a reopened_at.
create index if not exists idx_admin_error_resolutions_reopened
  on public.admin_error_resolutions (reopened_at desc)
  where reopened_at is not null;

-- RLS -----------------------------------------------------------------------
alter table public.admin_error_resolutions enable row level security;

-- Super admins may read their own audit surface directly. The Bridge reads via
-- service_role, but a human in the SQL editor should not be locked out of the
-- table recording their own actions. No policy for anon: a leaked publishable
-- key reads nothing.
drop policy if exists admin_error_resolutions_select_super_admin on public.admin_error_resolutions;
create policy admin_error_resolutions_select_super_admin
  on public.admin_error_resolutions
  for select
  to authenticated
  using (public.is_super_admin());

revoke all on public.admin_error_resolutions from anon;
revoke all on public.admin_error_resolutions from authenticated;
grant select on public.admin_error_resolutions to authenticated;
grant select, insert, update on public.admin_error_resolutions to service_role;

-- Manual write path ---------------------------------------------------------
-- SECURITY DEFINER so the gate is `is_super_admin()` reading auth.uid() -- the
-- same shape `resolve_admin_event` uses. It MUST be called with the USER-SCOPED
-- client: under service_role auth.uid() is NULL and this Forbids, which is the
-- documented 509-storm failure mode in admin-platform.md.
create or replace function public.admin_resolve_error_fingerprint(
  p_fingerprint text,
  p_pr_number integer default null,
  p_pr_url text default null,
  p_fixed_in_sha text default null,
  p_note text default null,
  p_last_seen_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_fingerprint is null or length(trim(p_fingerprint)) = 0 then
    raise exception 'fingerprint is required' using errcode = '22023';
  end if;

  insert into public.admin_error_resolutions as r (
    fingerprint, resolved_at, resolved_by, resolution_source,
    pr_number, pr_url, fixed_in_sha, note, last_seen_at_resolution
  ) values (
    trim(p_fingerprint), now(), auth.uid(), 'manual',
    p_pr_number, p_pr_url,
    nullif(trim(coalesce(p_fixed_in_sha, '')), ''), p_note, p_last_seen_at
  )
  on conflict (fingerprint) do update set
    -- Re-resolving CLEARS the regression flag: the operator asserts this fix
    -- supersedes the last. reopened_count is deliberately KEPT, so "fixed three
    -- times already" stays visible rather than being laundered by a re-resolve.
    resolved_at = now(),
    resolved_by = auth.uid(),
    resolution_source = 'manual',
    pr_number = coalesce(excluded.pr_number, r.pr_number),
    pr_url = coalesce(excluded.pr_url, r.pr_url),
    fixed_in_sha = coalesce(excluded.fixed_in_sha, r.fixed_in_sha),
    note = coalesce(excluded.note, r.note),
    last_seen_at_resolution = coalesce(excluded.last_seen_at_resolution, r.last_seen_at_resolution),
    reopened_at = null,
    updated_at = now();
end;
$$;

revoke execute on function public.admin_resolve_error_fingerprint(text, integer, text, text, text, timestamptz) from public;
revoke execute on function public.admin_resolve_error_fingerprint(text, integer, text, text, text, timestamptz) from anon;
grant execute on function public.admin_resolve_error_fingerprint(text, integer, text, text, text, timestamptz) to authenticated;

-- Un-archive, for an operator who archived the wrong thing. Restoring
-- visibility must never be harder than hiding it.
create or replace function public.admin_unresolve_error_fingerprint(p_fingerprint text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  delete from public.admin_error_resolutions where fingerprint = trim(p_fingerprint);
end;
$$;

revoke execute on function public.admin_unresolve_error_fingerprint(text) from public;
revoke execute on function public.admin_unresolve_error_fingerprint(text) from anon;
grant execute on function public.admin_unresolve_error_fingerprint(text) to authenticated;

-- Automatic write path ------------------------------------------------------
-- service_role only: called by the reliability cron, never by a browser. It
-- NEVER overwrites a manual resolution -- a human's assertion about a fault
-- outranks the cron's inference, and silently replacing one with the other
-- would erase the record of who decided.
create or replace function public.admin_auto_resolve_error_fingerprint(
  p_fingerprint text,
  p_last_seen_at timestamptz,
  p_fixed_in_sha text default null,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source text;
begin
  if p_fingerprint is null or length(trim(p_fingerprint)) = 0 then
    return false;
  end if;

  select resolution_source into v_source
  from public.admin_error_resolutions
  where fingerprint = trim(p_fingerprint);

  -- Never downgrade a human decision to an automatic one.
  if found and v_source = 'manual' then
    return false;
  end if;

  insert into public.admin_error_resolutions as r (
    fingerprint, resolved_at, resolved_by, resolution_source,
    fixed_in_sha, note, last_seen_at_resolution
  ) values (
    trim(p_fingerprint), now(), null, 'auto',
    nullif(trim(coalesce(p_fixed_in_sha, '')), ''), p_note, p_last_seen_at
  )
  on conflict (fingerprint) do update set
    resolved_at = now(),
    resolution_source = 'auto',
    fixed_in_sha = coalesce(excluded.fixed_in_sha, r.fixed_in_sha),
    note = coalesce(excluded.note, r.note),
    last_seen_at_resolution = excluded.last_seen_at_resolution,
    reopened_at = null,
    updated_at = now();

  return true;
end;
$$;

revoke execute on function public.admin_auto_resolve_error_fingerprint(text, timestamptz, text, text) from public;
revoke execute on function public.admin_auto_resolve_error_fingerprint(text, timestamptz, text, text) from anon;
revoke execute on function public.admin_auto_resolve_error_fingerprint(text, timestamptz, text, text) from authenticated;
grant execute on function public.admin_auto_resolve_error_fingerprint(text, timestamptz, text, text) to service_role;

-- Mark an archived fault as regressed. Called by the cron when it observes an
-- occurrence NEWER than `last_seen_at_resolution` -- recorded rather than merely
-- displayed, so "how often does this keep coming back" stays answerable.
create or replace function public.admin_mark_error_regressed(p_fingerprint text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.admin_error_resolutions
  set reopened_at = coalesce(reopened_at, now()),
      -- Increment only on the TRANSITION into regressed, so a fault firing every
      -- three hours counts as one regression, not fifty.
      reopened_count = reopened_count + case when reopened_at is null then 1 else 0 end,
      updated_at = now()
  where fingerprint = trim(p_fingerprint);
end;
$$;

revoke execute on function public.admin_mark_error_regressed(text) from public;
revoke execute on function public.admin_mark_error_regressed(text) from anon;
revoke execute on function public.admin_mark_error_regressed(text) from authenticated;
grant execute on function public.admin_mark_error_regressed(text) to service_role;
