-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits Production rollout
-- (supabase/migrations/HELD.md). Apply: npm run db:apply -- <this file>
--
-- Security review 2026-10-16, item S5 (database half), part 2 of 2.
-- Rollback SQL: supabase/rollbacks/, same name with a .rollback.sql suffix.
--
-- golf_announcement_tasks . golf_ann_tasks_insert_coaches (INSERT) is, since
-- 20261017101000 (applied 2026-10-21), "the caller is staffed on the
-- announcement's team". It does not check the TASK. A coach staffed on team A
-- can link team B's task to team A's announcement, which puts team B's task
-- title and due date in front of team A's players through
-- ann_tasks_select_team.
--
-- Now an attached task must belong to the same team as the announcement
-- (golf_tasks.team_id = golf_announcements.team_id), as well as the caller
-- being staffed on that team. The app attaches only tasks it just created for
-- the announcement's team, so no existing flow changes. The DELETE policy is
-- unchanged (it removes a link, not a task).
--
-- Forward-only and idempotent. Risk: LOW; only narrows an INSERT. pgTAP:
-- supabase/tests/rls/golf_announcement_child_policies_team_scope.sql.
--
-- VERIFY:
--   select 1 where exists (select 1 from pg_policies
--   where schemaname = 'public'
--   and policyname = 'golf_ann_tasks_insert_coaches'
--   and position('golf_tasks' in coalesce(with_check, '')) > 0);

-- The migration tool runs this file in one transaction.

drop policy if exists golf_ann_tasks_insert_coaches
on public.golf_announcement_tasks;
create policy golf_ann_tasks_insert_coaches
on public.golf_announcement_tasks
for insert to authenticated
with check (
    exists (
        select 1
        from public.golf_announcements a
        inner join public.golf_tasks t on t.id = golf_announcement_tasks.task_id
        where
            a.id = golf_announcement_tasks.announcement_id
            and t.team_id = a.team_id
            and public.is_golf_team_coach(a.team_id)
    )
);
