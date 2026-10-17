-- STATUS: WRITTEN, NOT APPLIED. Written 2026-10-17; the owner applies it after
-- review (supabase/migrations/HELD.md row).
-- Apply: npm run db:apply -- <this file>
-- Risk: LOW-MEDIUM (RLS on two golf tables). Narrows five policies to the
-- access the app already assumes; no caller gains a row. `npm run test:rls`
-- (supabase/tests/rls/golf_announcement_children_team_scoped.sql) before apply.
--
-- WHY (Clubhouse P010 Announcements): the coach policies on the two child
-- tables of golf_announcements compare the announcement's team with itself.
-- Read live 2026-10-17 from pg_policies, each of these has the same predicate:
--
--   announcement_id IN (
--     SELECT golf_announcements.id FROM golf_announcements
--     WHERE golf_announcements.team_id IN (
--       SELECT golf_announcements.team_id      -- the OUTER row's team_id
--       FROM golf_coaches
--       WHERE golf_coaches.user_id = (SELECT auth.uid())))
--
-- The inner SELECT projects the outer golf_announcements.team_id, so the IN is
-- true for every announcement the caller can SELECT whenever the caller has ANY
-- golf_coaches row. The subquery on golf_announcements runs under the caller's
-- own RLS, so a plain coach of another team cannot see the post and is refused
-- today (proved by the pgTAP suite, GROUP 2). The hole is a caller who can see
-- the post without coaching its team: a player on the team who also has a
-- golf_coaches row (coaches another team; the dual coach/player case the
-- announcement reads already allow), or an admin (admin_read_all) with a coach
-- row. That caller can today (pgTAP GROUP 3 fails on the live policies):
--   golf_ann_recipients_insert_coaches  INSERT  address an all-team post to one
--                                       player, hiding it from the rest
--   golf_ann_recipients_delete_coaches  DELETE  strip a post's recipients,
--   which
--                                       turns a post addressed to two players
--                                       into one the whole team can read
--   golf_ann_recipients_select_coaches  SELECT  read the full recipient list
--   golf_ann_tasks_insert_coaches       INSERT  attach tasks to the post
--   golf_ann_tasks_delete_coaches       DELETE  detach them
-- It also leaves the policies' correctness resting on another table's RLS.
-- The SELECT policy on recipients is not in the original P010 note but is the
-- same defect on the same table, so it is fixed here too.
--
-- WHAT CHANGES: each of the five is dropped and re-created, TO authenticated as
-- live, with the predicate style of the parent golf_announcements policies and
-- the other team-scoped golf children (golf_event_attendance):
--   EXISTS (SELECT 1 FROM public.golf_announcements a
--           WHERE a.id = <table>.announcement_id
--             AND public.is_golf_team_coach(a.team_id))
-- is_golf_team_coach(team) is golf_team_coach_staff joined to golf_coaches on
-- auth.uid(), the same test as the parent's "Coaches can manage announcements"
-- policy. auth.uid() is not referenced directly here (the helper reads it).
--
-- WHY THE APP STILL PASSES: src/app/golf/actions/announcements.ts writes these
-- rows with the coach's session client right after inserting the parent
-- golf_announcements row, which already requires the caller to be on that
-- team's golf_team_coach_staff ("Coaches can manage announcements"). So any
-- coach who could create the post passes the new child check. Its reads of
-- recipients and tasks run as that team's coach (getAnnouncementDetail,
-- getAnnouncementsWithMeta) or through the admin client. Deleting a post
-- removes its children by FK cascade, which RLS does not filter.
--
-- NOT CHANGED: golf_ann_recipients_select_own (a player reads their own
-- recipient rows), ann_tasks_select_team (coach or player of the team), every
-- golf_announcements policy, and every grant.
--
-- ROLLBACK: re-create the five live policies with their old predicate (the
-- self-comparing one above), e.g.
--   DROP POLICY IF EXISTS golf_ann_recipients_insert_coaches ON
--   public.golf_announcement_recipients;
--   CREATE POLICY golf_ann_recipients_insert_coaches ON
--   public.golf_announcement_recipients
--     FOR INSERT TO authenticated WITH CHECK (announcement_id IN (
--       SELECT golf_announcements.id FROM public.golf_announcements
--       WHERE golf_announcements.team_id IN (SELECT golf_announcements.team_id
--         FROM public.golf_coaches WHERE golf_coaches.user_id = (SELECT
--         auth.uid()))));
-- and the same for the delete/select (USING) and the two task policies.
--
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- VERIFY: 'public' and tablename in ('golf_announcement_recipients',
-- VERIFY: 'golf_announcement_tasks') and policyname in
-- VERIFY: ('golf_ann_recipients_insert_coaches',
-- VERIFY: 'golf_ann_recipients_delete_coaches',
-- VERIFY: 'golf_ann_recipients_select_coaches','golf_ann_tasks_insert_coaches',
-- VERIFY: 'golf_ann_tasks_delete_coaches') and coalesce(qual, with_check) like
-- VERIFY: '%is_golf_team_coach(a.team_id)%' and coalesce(qual, with_check) not
-- VERIFY: like '%golf_coaches%') = 5;
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- VERIFY: 'public' and tablename = 'golf_announcement_recipients') = 4 and
-- VERIFY: (select count(*) from pg_policies where schemaname = 'public' and
-- VERIFY: tablename = 'golf_announcement_tasks') = 3;

SET LOCAL lock_timeout = '3s';

-- golf_announcement_recipients ------------------------------------------------

DROP POLICY IF EXISTS golf_ann_recipients_insert_coaches
ON public.golf_announcement_recipients;
CREATE POLICY golf_ann_recipients_insert_coaches
ON public.golf_announcement_recipients
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.golf_announcements a
        WHERE
            a.id = golf_announcement_recipients.announcement_id
            AND public.is_golf_team_coach(a.team_id)
    )
);

DROP POLICY IF EXISTS golf_ann_recipients_delete_coaches
ON public.golf_announcement_recipients;
CREATE POLICY golf_ann_recipients_delete_coaches
ON public.golf_announcement_recipients
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.golf_announcements a
        WHERE
            a.id = golf_announcement_recipients.announcement_id
            AND public.is_golf_team_coach(a.team_id)
    )
);

DROP POLICY IF EXISTS golf_ann_recipients_select_coaches
ON public.golf_announcement_recipients;
CREATE POLICY golf_ann_recipients_select_coaches
ON public.golf_announcement_recipients
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.golf_announcements a
        WHERE
            a.id = golf_announcement_recipients.announcement_id
            AND public.is_golf_team_coach(a.team_id)
    )
);

-- golf_announcement_tasks -----------------------------------------------------

DROP POLICY IF EXISTS golf_ann_tasks_insert_coaches
ON public.golf_announcement_tasks;
CREATE POLICY golf_ann_tasks_insert_coaches ON public.golf_announcement_tasks
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.golf_announcements a
        WHERE
            a.id = golf_announcement_tasks.announcement_id
            AND public.is_golf_team_coach(a.team_id)
    )
);

DROP POLICY IF EXISTS golf_ann_tasks_delete_coaches
ON public.golf_announcement_tasks;
CREATE POLICY golf_ann_tasks_delete_coaches ON public.golf_announcement_tasks
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.golf_announcements a
        WHERE
            a.id = golf_announcement_tasks.announcement_id
            AND public.is_golf_team_coach(a.team_id)
    )
);
