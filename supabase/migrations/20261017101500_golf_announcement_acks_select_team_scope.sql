-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits Production rollout
-- (supabase/migrations/HELD.md). Apply: npm run db:apply -- <this file>
--
-- Security review 2026-10-16, item S5 (database half), part 1 of 2.
-- Rollback SQL: supabase/rollbacks/, same name with a .rollback.sql suffix.
--
-- golf_announcement_acknowledgements . golf_acks_select_coaches (SELECT) reads
--   announcement_id IN (SELECT golf_announcements.id FROM golf_announcements
--     WHERE golf_announcements.team_id IN (SELECT golf_announcements.team_id
--       FROM golf_coaches WHERE golf_coaches.user_id = (SELECT auth.uid())))
-- and the inner `golf_announcements.team_id` is the OUTER row's column, so the
-- test is "the announcement's team equals itself, provided the caller has a
-- coach row anywhere". Any account with a golf_coaches row, in any program,
-- that can see an announcement reads who acknowledged it, with names. This is
-- the same defect 20260930160000 fixed for golf_announcement_documents and
-- 20261017101000 (applied 2026-10-21) fixed for the recipient and task
-- policies; this policy was missed by both. Read live from pg_policies on
-- production 2026-10-21: it is the only one of the six coach policies
-- still unscoped.
--
-- Now: a coach staffed on the announcement's team (is_golf_team_coach). The
-- players' own policies (golf_acks_insert_own, golf_acks_select_own) are
-- unchanged. The app reads that need the whole acknowledgement set
-- (getAnnouncementsWithMeta, getAnnouncementDetail) use the service role after
-- their own staff check, so no app path depends on the old breadth.
--
-- Forward-only and idempotent (drop if exists, then create). Risk: LOW; the
-- policy only narrows to the team's own staffed coaches. pgTAP:
-- supabase/tests/rls/golf_announcement_child_policies_team_scope.sql (covers
-- this file and 20261017101600; CI builds the database from every migration).
--
-- VERIFY:
--   select 1 where (select count(*) from pg_policies
--   where schemaname = 'public' and policyname = 'golf_acks_select_coaches'
--   and position('is_golf_team_coach' in coalesce(qual, '')) > 0
--   and position('golf_coaches' in coalesce(qual, '')) = 0) = 1;

-- The migration tool runs this file in one transaction.

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
