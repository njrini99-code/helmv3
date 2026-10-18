-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md). Apply: npm run db:apply --
-- supabase/migrations/20261017002000_golf_announcement_child_policies_team_scope.sql
--
-- Security review 2026-10-16, item S5 (database half). The same self-reference
-- bug 20260930160000 fixed for golf_announcement_documents on 2026-10-03, in
-- the six coach policies it did not touch:
--
--   golf_announcement_acknowledgements  golf_acks_select_coaches      SELECT
--   golf_announcement_recipients        golf_ann_recipients_select_coaches  SELECT
--   golf_announcement_recipients        golf_ann_recipients_insert_coaches  INSERT
--   golf_announcement_recipients        golf_ann_recipients_delete_coaches  DELETE
--   golf_announcement_tasks             golf_ann_tasks_insert_coaches       INSERT
--   golf_announcement_tasks             golf_ann_tasks_delete_coaches       DELETE
--
-- Each reads
--     announcement_id IN (SELECT golf_announcements.id FROM golf_announcements
--       WHERE golf_announcements.team_id IN (SELECT golf_announcements.team_id
--         FROM golf_coaches WHERE golf_coaches.user_id = auth.uid()))
-- and the inner `golf_announcements.team_id` is the OUTER row's column, so the
-- test is "the announcement's team equals itself, provided the caller has a
-- coach row anywhere". Any account with a golf_coaches row, in any program,
-- could read every team's recipient lists and who acknowledged what, and add or
-- remove recipients and task links on any team's announcement. The review
-- named the four acknowledgement/recipient policies; the two task policies
-- carry the identical predicate and are fixed with them.
--
-- Now, as for documents: a coach staffed on the announcement's team
-- (is_golf_team_coach(a.team_id)); and for a task link (insert), the task must
-- belong to that same team. The players' own policies (golf_acks_insert_own,
-- golf_acks_select_own, golf_ann_recipients_select_own, ann_tasks_select_team)
-- are unchanged. The app's reads that need the whole recipient set
-- (getAnnouncementsWithMeta, getAnnouncementDetail) already use the service
-- role after their own staff check, so no app path depends on the old breadth.
--
-- Forward-only and idempotent (drop if exists, then create). pgTAP:
-- supabase/tests/rls/golf_announcement_child_policies_team_scope.sql.
--
-- ROLLBACK: recreate the six previous definitions (pg_policies, 2026-10-16;
-- supabase/schemas/policies/golf.sql before this change). Each is the predicate
-- quoted above, as USING for select/delete and WITH CHECK for insert:
--   announcement_id IN (SELECT golf_announcements.id FROM golf_announcements
--     WHERE golf_announcements.team_id IN (SELECT golf_announcements.team_id
--     FROM golf_coaches WHERE golf_coaches.user_id = (SELECT auth.uid())))
--
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname = 'public' and policyname in ('golf_acks_select_coaches', 'golf_ann_recipients_select_coaches', 'golf_ann_recipients_insert_coaches', 'golf_ann_recipients_delete_coaches', 'golf_ann_tasks_insert_coaches', 'golf_ann_tasks_delete_coaches') and position('is_golf_team_coach' in coalesce(qual, '') || coalesce(with_check, '')) > 0 and position('golf_coaches' in coalesce(qual, '') || coalesce(with_check, '')) = 0) = 6;

-- The migration tool runs this file in one transaction.

-- golf_announcement_acknowledgements
-- -----------------------------------------------------------------------------

drop policy if exists golf_acks_select_coaches
on public.golf_announcement_acknowledgements;
create policy golf_acks_select_coaches
on public.golf_announcement_acknowledgements
for select to authenticated
using (
    exists (
        select 1
        from public.golf_announcements a
        where
            a.id = golf_announcement_acknowledgements.announcement_id
            and public.is_golf_team_coach(a.team_id)
    )
);

-- golf_announcement_recipients
-- -----------------------------------------------------------------------------

drop policy if exists golf_ann_recipients_select_coaches
on public.golf_announcement_recipients;
create policy golf_ann_recipients_select_coaches
on public.golf_announcement_recipients
for select to authenticated
using (
    exists (
        select 1
        from public.golf_announcements a
        where
            a.id = golf_announcement_recipients.announcement_id
            and public.is_golf_team_coach(a.team_id)
    )
);

drop policy if exists golf_ann_recipients_insert_coaches
on public.golf_announcement_recipients;
create policy golf_ann_recipients_insert_coaches
on public.golf_announcement_recipients
for insert to authenticated
with check (
    exists (
        select 1
        from public.golf_announcements a
        where
            a.id = golf_announcement_recipients.announcement_id
            and public.is_golf_team_coach(a.team_id)
    )
);

drop policy if exists golf_ann_recipients_delete_coaches
on public.golf_announcement_recipients;
create policy golf_ann_recipients_delete_coaches
on public.golf_announcement_recipients
for delete to authenticated
using (
    exists (
        select 1
        from public.golf_announcements a
        where
            a.id = golf_announcement_recipients.announcement_id
            and public.is_golf_team_coach(a.team_id)
    )
);

-- golf_announcement_tasks
-- -----------------------------------------------------------------------------

drop policy if exists golf_ann_tasks_insert_coaches
on public.golf_announcement_tasks;
create policy golf_ann_tasks_insert_coaches
on public.golf_announcement_tasks
for insert to authenticated
with check (
    exists (
        select 1
        from public.golf_announcements a
        join public.golf_tasks t on t.id = golf_announcement_tasks.task_id
        where
            a.id = golf_announcement_tasks.announcement_id
            and t.team_id = a.team_id
            and public.is_golf_team_coach(a.team_id)
    )
);

drop policy if exists golf_ann_tasks_delete_coaches
on public.golf_announcement_tasks;
create policy golf_ann_tasks_delete_coaches
on public.golf_announcement_tasks
for delete to authenticated
using (
    exists (
        select 1
        from public.golf_announcements a
        where
            a.id = golf_announcement_tasks.announcement_id
            and public.is_golf_team_coach(a.team_id)
    )
);
