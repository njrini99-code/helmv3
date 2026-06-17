-- ============================================================================
-- Invert the engagement model: REPLIES are the only "hot" signal; clicks → 0.
-- ============================================================================
-- The old crm_coach_engagement weighted clicks 3x opens and flagged a coach
-- 'hot' on click_score > 0.5. On .edu, Mimecast/Proofpoint/Safe-Links auto-click
-- every link within milliseconds, so a single gateway BOT click marked a coach
-- "hot" and floated noise to the top. (Research-confirmed; the sending path was
-- already moved off this view to fit-based scoring in coach-priority.mjs — this
-- migration fixes the display/temperature so the CRM badges are honest too.)
--
-- New model:
--   * clicks contribute ZERO to score and temperature (kept as a column for display only)
--   * a human REPLY (crm_replies, 90d) is the promotion signal → 'hot'
--   * opens (decayed, >1) → 'warm'; otherwise 'cold'
--
-- NOTE: matviews can't be CREATE OR REPLACE'd — must DROP + CREATE. Recreates the
-- two original indexes (unique pk on coach_id, score DESC). Apply at the DB
-- checkpoint and verify the engagement badges still load + REFRESH succeeds.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS crm_coach_engagement;

CREATE MATERIALIZED VIEW crm_coach_engagement AS
WITH windowed AS (
  SELECT cl.coach_id,
         ee.event_type,
         ee.occurred_at,
         exp((-EXTRACT(epoch FROM (now() - ee.occurred_at))) / (14::numeric * 86400.0)) AS decay
  FROM email_events ee
  JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
  WHERE ee.occurred_at > now() - '90 days'::interval
),
agg AS (
  SELECT windowed.coach_id,
         COALESCE(sum(windowed.decay) FILTER (WHERE windowed.event_type = 'email.opened'), 0::numeric) AS open_score,
         count(*) FILTER (WHERE windowed.event_type = 'email.opened') AS opens_90d,
         count(*) FILTER (WHERE windowed.event_type = 'email.clicked') AS clicks_90d,
         max(windowed.occurred_at) AS last_event_at
  FROM windowed
  GROUP BY windowed.coach_id
),
replies AS (
  SELECT coach_id, count(*) AS replied_90d, max(received_at) AS last_reply_at
  FROM crm_replies
  WHERE coach_id IS NOT NULL AND received_at > now() - '90 days'::interval
  GROUP BY coach_id
)
SELECT c.id AS coach_id,
       COALESCE(a.opens_90d, 0::bigint)   AS opens_90d,
       COALESCE(a.clicks_90d, 0::bigint)  AS clicks_90d,   -- display only; NOT scored
       COALESCE(r.replied_90d, 0::bigint) AS replied_90d,
       GREATEST(a.last_event_at, r.last_reply_at) AS last_event_at,
       -- score: opens (decayed) + a big reply boost; clicks contribute nothing
       (LEAST(100::numeric, GREATEST(0::numeric,
          round(COALESCE(a.open_score, 0::numeric) * 10::numeric)
          + (CASE WHEN COALESCE(r.replied_90d, 0) > 0 THEN 50 ELSE 0 END)
       )))::integer AS score,
       CASE
         WHEN COALESCE(r.replied_90d, 0) > 0 THEN 'hot'::text   -- a human replied — the only true hot signal
         WHEN COALESCE(a.open_score, 0::numeric) > 1::numeric THEN 'warm'::text
         ELSE 'cold'::text
       END AS temperature
FROM crm_coaches c
LEFT JOIN agg a ON a.coach_id = c.id
LEFT JOIN replies r ON r.coach_id = c.id
WHERE c.is_archived = false;

CREATE UNIQUE INDEX idx_crm_coach_engagement_pk ON crm_coach_engagement USING btree (coach_id);
CREATE INDEX idx_crm_coach_engagement_score ON crm_coach_engagement USING btree (score DESC);

-- Preserve the ORIGINAL access model EXACTLY: the matview is read only through
-- the service-role admin client (see src/app/golf/actions/crm-engagement.ts —
-- admin role is enforced in code, the view is queried with createAdminClient).
-- The pre-migration ACL was {postgres, service_role} only — NO authenticated
-- grant. Granting `authenticated` would expose "who we're emailing" + their
-- engagement temperature to every logged-in user via PostgREST, so we do NOT.
GRANT SELECT ON crm_coach_engagement TO service_role;

-- IMPORTANT: a fresh CREATE MATERIALIZED VIEW in the `public` schema re-triggers
-- Supabase's ALTER DEFAULT PRIVILEGES, which auto-grants ALL to anon +
-- authenticated. Strip that back off so the ACL stays {postgres, service_role}
-- only — otherwise the prospect list leaks to any (even unauthenticated)
-- PostgREST caller. (Applied on prod as migration crm_engagement_revoke_default_grants.)
REVOKE ALL ON crm_coach_engagement FROM anon;
REVOKE ALL ON crm_coach_engagement FROM authenticated;
