-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md). Apply: npm run db:apply --
-- supabase/migrations/20261017001000_golf_player_hub_rpcs_staff_gate.sql
--
-- Security review 2026-10-16, item S3. The two player-hub SECURITY DEFINER
-- functions return a team's announcements (with per-player targeting) and
-- events (with a player's RSVP). Their gate admitted:
--
--   1. ANY golf_coaches row in the team's organization
--        (golf_coaches JOIN golf_teams ON organization_id)
--      not the coaches staffed on the team. That includes an assistant who has
--      no staff row (never approved), and, with the organization_id write hole
--      the parent is closing separately (S1), anyone who sets their coach row's
--      organization to the victim's.
--   2. The player id from the CALLER (p_player_id), checked only for the
--      player branch; the coach branch took any p_player_id at all.
--
-- Now:
--   * A coach must be staffed on the team (is_golf_team_coach(p_team_id), the
--     helper every golf team policy uses), and the player they ask about must
--     be an active member of that team.
--   * Anyone else gets their OWN hub: the player is derived from auth.uid()
--     (an active member of p_team_id), whatever p_player_id says. A caller who
--     is neither is refused 42501, as before.
--   * EXECUTE is revoked from PUBLIC and anon. CREATE OR REPLACE keeps the
--     baseline's `GRANT ALL ... TO anon`; anon was refused by the body (no
--     auth.uid()), and is now refused by the grant as well.
--
-- Signatures and return shapes are unchanged, so every caller keeps working:
-- getPlayerHubSummaryData (src/app/golf/actions/player-hub-data.ts) and
-- getPlayerHubAnnouncements (src/app/golf/actions/player-notifications.ts),
-- reached from the Fairway dashboard, Team Hub and Clubhouse's hub
-- (src/clubhouse/data/hub.ts). All of them pass the signed-in player's own id
-- today; none uses the coach branch.
--
-- The return-building SQL below is the baseline's
-- (20260527000000_prod_public_baseline.sql), with p_player_id replaced by the
-- resolved v_player_id. pgTAP: supabase/tests/rls/golf_player_hub_rpcs_staff_gate.sql.
--
-- ROLLBACK: re-run the two CREATE OR REPLACE FUNCTION blocks from
-- 20260527000000_prod_public_baseline.sql (get_player_hub_announcements,
-- get_player_hub_events), whose gate is the organization join above, and
-- GRANT EXECUTE on both to anon to restore the previous ACL.
--
-- VERIFY: select 1 from pg_proc where oid = 'public.get_player_hub_announcements(uuid, uuid)'::regprocedure and prosecdef and position('is_golf_team_coach' in prosrc) > 0 and position('organization_id' in prosrc) = 0;
-- VERIFY: select 1 from pg_proc where oid = 'public.get_player_hub_events(uuid, uuid, timestamp with time zone)'::regprocedure and prosecdef and position('is_golf_team_coach' in prosrc) > 0 and position('organization_id' in prosrc) = 0;
-- VERIFY: select 1 where not has_function_privilege('anon', 'public.get_player_hub_announcements(uuid, uuid)', 'EXECUTE') and not has_function_privilege('anon', 'public.get_player_hub_events(uuid, uuid, timestamp with time zone)', 'EXECUTE');
-- VERIFY: select 1 where has_function_privilege('authenticated', 'public.get_player_hub_announcements(uuid, uuid)', 'EXECUTE') and has_function_privilege('authenticated', 'public.get_player_hub_events(uuid, uuid, timestamp with time zone)', 'EXECUTE');

-- The migration tool runs this file in one transaction.

create or replace function public.get_player_hub_announcements(
    p_team_id uuid, p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_player_id uuid;
BEGIN
  -- A coach staffed on the team may read it for one of its active players.
  IF public.is_golf_team_coach(p_team_id)
     AND EXISTS (
       SELECT 1 FROM public.golf_team_members gtm
       WHERE gtm.team_id = p_team_id
         AND gtm.player_id = p_player_id
         AND gtm.status = 'active'
     ) THEN
    v_player_id := p_player_id;
  ELSE
    -- Anyone else reads their own hub: the player is the caller.
    SELECT gp.id INTO v_player_id
    FROM public.golf_players gp
    JOIN public.golf_team_members gtm ON gtm.player_id = gp.id
    WHERE gp.user_id = (SELECT auth.uid())
      AND gtm.team_id = p_team_id
      AND gtm.status = 'active'
    LIMIT 1;
  END IF;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH recent AS (
      SELECT *
      FROM golf_announcements
      WHERE team_id = p_team_id
        AND published_at IS NOT NULL
        AND published_at >= (now() - interval '30 days')
      ORDER BY published_at DESC
      LIMIT 10
    ),
    recipients AS (
      SELECT announcement_id,
             count(*)::int                      AS recipient_count,
             bool_or(player_id = v_player_id)   AS player_in_recipients
      FROM golf_announcement_recipients
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    acks AS (
      SELECT announcement_id,
             count(*)::int                      AS ack_count,
             bool_or(player_id = v_player_id)   AS player_acknowledged
      FROM golf_announcement_acknowledgements
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    docs AS (
      SELECT announcement_id, count(*)::int AS doc_count
      FROM golf_announcement_documents
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    task_counts AS (
      SELECT announcement_id, count(*)::int AS task_count
      FROM golf_announcement_tasks
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    visible AS (
      SELECT r.*,
             COALESCE(rp.recipient_count, 0)       AS recipient_count,
             COALESCE(rp.player_in_recipients, FALSE) AS player_in_recipients,
             COALESCE(ak.ack_count, 0)             AS ack_count,
             COALESCE(ak.player_acknowledged, FALSE) AS player_acknowledged,
             COALESCE(d.doc_count, 0)              AS doc_count,
             COALESCE(t.task_count, 0)             AS task_count
      FROM recent r
      LEFT JOIN recipients  rp ON rp.announcement_id = r.id
      LEFT JOIN acks        ak ON ak.announcement_id = r.id
      LEFT JOIN docs        d  ON d.announcement_id  = r.id
      LEFT JOIN task_counts t  ON t.announcement_id  = r.id
      WHERE COALESCE(rp.recipient_count, 0) = 0
         OR COALESCE(rp.player_in_recipients, FALSE)
      ORDER BY r.published_at DESC
      LIMIT 5
    )
    SELECT COALESCE(
      jsonb_agg(
        to_jsonb(v.*)
          - 'player_in_recipients'
          - 'player_acknowledged'
          - 'ack_count'
          - 'doc_count'
          - 'task_count'
          - 'recipient_count'
        || jsonb_build_object(
          'recipient_count',          v.recipient_count,
          'acknowledged_count',       v.ack_count,
          'total_recipients',         v.recipient_count,
          'task_count',               v.task_count,
          'completed_task_count',     0,
          'document_count',           v.doc_count,
          'has_player_acknowledged',  v.player_acknowledged
        )
        ORDER BY v.published_at DESC
      ),
      '[]'::jsonb
    )
    FROM visible v
  );
END;
$$;

comment on function public.get_player_hub_announcements(uuid, uuid) is
'Returns up to 5 player-visible announcements with ack/docs/tasks counts. A coach staffed on the team (is_golf_team_coach) may ask for one of its active players; anyone else gets their own (the player is derived from auth.uid()). Replaces 5-query waterfall in getPlayerHubAnnouncements.';

create or replace function public.get_player_hub_events(
    p_team_id uuid, p_player_id uuid, p_since timestamp with time zone
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_player_id uuid;
BEGIN
  -- A coach staffed on the team may read it for one of its active players.
  IF public.is_golf_team_coach(p_team_id)
     AND EXISTS (
       SELECT 1 FROM public.golf_team_members gtm
       WHERE gtm.team_id = p_team_id
         AND gtm.player_id = p_player_id
         AND gtm.status = 'active'
     ) THEN
    v_player_id := p_player_id;
  ELSE
    -- Anyone else reads their own hub: the player is the caller.
    SELECT gp.id INTO v_player_id
    FROM public.golf_players gp
    JOIN public.golf_team_members gtm ON gtm.player_id = gp.id
    WHERE gp.user_id = (SELECT auth.uid())
      AND gtm.team_id = p_team_id
      AND gtm.status = 'active'
    LIMIT 1;
  END IF;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH events AS (
      -- is_mandatory is exposed to the client; not a real column on golf_events.
      SELECT id, title, event_type, start_time, end_time, location
      FROM golf_events
      WHERE team_id = p_team_id
        AND start_time >= p_since
      ORDER BY start_time ASC
      LIMIT 20
    ),
    counts AS (
      SELECT event_id,
             count(*) FILTER (WHERE status IN ('accepted','checked_in')) AS going_count,
             count(*) FILTER (WHERE status = 'tentative')                AS maybe_count
      FROM golf_event_attendance
      WHERE event_id IN (SELECT id FROM events)
      GROUP BY event_id
    ),
    my_rsvp AS (
      SELECT event_id, status
      FROM golf_event_attendance
      WHERE player_id = v_player_id
        AND event_id IN (SELECT id FROM events)
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',           e.id,
          'event_id',     e.id,
          'title',        e.title,
          'event_type',   e.event_type,
          'start_time',   e.start_time,
          'end_time',     e.end_time,
          'location',     e.location,
          'is_mandatory', FALSE,
          'rsvp_status',  (SELECT status FROM my_rsvp WHERE event_id = e.id),
          'going_count',  COALESCE(c.going_count, 0)::int,
          'maybe_count',  COALESCE(c.maybe_count, 0)::int
        )
        ORDER BY e.start_time ASC
      ),
      '[]'::jsonb
    )
    FROM events e
    LEFT JOIN counts c ON c.event_id = e.id
  );
END;
$$;

comment on function public.get_player_hub_events(uuid, uuid, timestamp with time zone) is
'Returns upcoming events for a team with player RSVP + going/maybe counts joined. A coach staffed on the team (is_golf_team_coach) may ask for one of its active players; anyone else gets their own (the player is derived from auth.uid()). Replaces 3-round-trip waterfall in hub/page.tsx.';

revoke execute on function public.get_player_hub_announcements(uuid, uuid)
from public, anon;
grant execute on function public.get_player_hub_announcements(uuid, uuid)
to authenticated, service_role;

revoke execute on function public.get_player_hub_events(
    uuid, uuid, timestamp with time zone
) from public, anon;
grant execute on function public.get_player_hub_events(
    uuid, uuid, timestamp with time zone
) to authenticated, service_role;
