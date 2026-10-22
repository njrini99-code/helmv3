-- ROLLBACK CAPTURE for
-- supabase/migrations/20261017101500_golf_announcement_acks_select_team_scope.sql
--
-- Forward change (held, not applied): golf_acks_select_coaches on
-- public.golf_announcement_acknowledgements goes from "the caller has any
-- golf_coaches row" to "the caller is staffed on the announcement's team".
--
-- Prior definition, captured VERBATIM from the live production catalog
-- (pg_policies, read-only, 2026-10-21):
--   cmd:   SELECT
--   roles: {authenticated}
--   qual:  (announcement_id IN ( SELECT golf_announcements.id
--            FROM golf_announcements
--           WHERE (golf_announcements.team_id IN ( SELECT golf_announcements.team_id
--                    FROM golf_coaches
--                   WHERE (golf_coaches.user_id = ( SELECT auth.uid() AS uid))))))
--
-- Metadata: forward change carried by the PR that adds this file (record its
-- merge SHA in the production rollout ledger); capture date 2026-10-21;
-- approval record: Production rollout ledger row on apply; Sentry watch window:
-- 24 hours on announcement-detail errors.
--
-- What rolling back costs: it restores the hole. Any account holding a
-- golf_coaches row, in any program, can again read every announcement's
-- acknowledgements (who acknowledged what, with names) for announcements it
-- can see. Roll back only if a coach staffed on a team loses the
-- acknowledgement list in the app, and fix forward the same day.

-- REVERT (apply as one reviewed file; never `supabase db push`):
begin;

drop policy if exists golf_acks_select_coaches
on public.golf_announcement_acknowledgements;
create policy golf_acks_select_coaches
on public.golf_announcement_acknowledgements
for select to authenticated
using (
    announcement_id in (
        select golf_announcements.id
        from public.golf_announcements
        where golf_announcements.team_id in (
            select golf_announcements.team_id
            from public.golf_coaches
            where golf_coaches.user_id = (select auth.uid())
        )
    )
);

commit;

-- VERIFY the revert landed (expect one row):
-- select 1 from pg_policies where schemaname = 'public' and policyname = 'golf_acks_select_coaches' and position('golf_coaches' in qual) > 0;
