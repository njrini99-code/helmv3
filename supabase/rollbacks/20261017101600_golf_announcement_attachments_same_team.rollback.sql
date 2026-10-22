-- ROLLBACK CAPTURE for
-- supabase/migrations/20261017101600_golf_announcement_attachments_same_team.sql
--
-- Forward change (held, not applied): golf_ann_tasks_insert_coaches on
-- public.golf_announcement_tasks additionally requires the attached task to
-- belong to the announcement's team.
--
-- Prior definition, captured VERBATIM from the live production catalog
-- (pg_policies, read-only, 2026-10-21; this is what 20261017101000 left):
--   cmd:        INSERT
--   roles:      {authenticated}
--   with_check: (EXISTS ( SELECT 1
--                 FROM golf_announcements a
--                WHERE ((a.id = golf_announcement_tasks.announcement_id)
--                  AND is_golf_team_coach(a.team_id))))
--
-- Metadata: forward change carried by the PR that adds this file (record its
-- merge SHA in the production rollout ledger); capture date 2026-10-21;
-- approval record: Production rollout ledger row on apply; Sentry watch window:
-- 24 hours on announcement-create errors.
--
-- What rolling back costs: a coach staffed on one team can again link another
-- team's task to their announcement. Roll back only if announcement creation
-- with a task starts failing, and fix forward the same day.

-- REVERT (apply as one reviewed file; never `supabase db push`):
begin;

drop policy if exists golf_ann_tasks_insert_coaches
on public.golf_announcement_tasks;
create policy golf_ann_tasks_insert_coaches
on public.golf_announcement_tasks
for insert to authenticated
with check (
    exists (
        select 1
        from public.golf_announcements a
        where
            a.id = golf_announcement_tasks.announcement_id
            and public.is_golf_team_coach(a.team_id)
    )
);

commit;

-- VERIFY the revert landed (expect one row):
-- select 1 from pg_policies where schemaname = 'public' and policyname = 'golf_ann_tasks_insert_coaches' and position('golf_tasks' in with_check) = 0;
