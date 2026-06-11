-- Demo Login Report
-- Run in Supabase SQL Editor (or via scripts/run-sql.mjs) to see who has been
-- exploring the shared demo account.
--
-- Each row = one login by a recipient of the demo email blast.
-- The ?ref= query param in each personalised link identifies the coach.
-- Example link:  https://app.golfhelm.com/golf/login?ref=coach_nick_rini
--
-- Usage:
--   SELECT * FROM (paste query below) ORDER BY created_at DESC;
--
-- Quick view — all demo logins, newest first:

SELECT
  created_at                                     AS "Logged At",
  metadata->>'ref'                               AS "Who (ref)",
  metadata->>'ip'                                AS "IP",
  metadata->>'country'                           AS "Country",
  metadata->>'city'                              AS "City",
  metadata->>'userAgent'                         AS "User Agent",
  user_email                                     AS "Email",
  id                                             AS "Event ID"
FROM admin_events
WHERE
  event_type = 'login'
  AND (metadata->>'is_demo')::boolean = true
ORDER BY created_at DESC;

-- -----------------------------------------------------------------------
-- Aggregated: unique coaches who tried the demo (ref present), ranked by
-- most-recent visit:
-- -----------------------------------------------------------------------
-- SELECT
--   metadata->>'ref'           AS who,
--   COUNT(*)                   AS total_logins,
--   MIN(created_at)            AS first_seen,
--   MAX(created_at)            AS last_seen,
--   metadata->>'country'       AS country
-- FROM admin_events
-- WHERE
--   event_type = 'login'
--   AND (metadata->>'is_demo')::boolean = true
--   AND metadata->>'ref' IS NOT NULL
-- GROUP BY metadata->>'ref', metadata->>'country'
-- ORDER BY last_seen DESC;

-- -----------------------------------------------------------------------
-- Anonymous logins (link visited without a ?ref= param):
-- -----------------------------------------------------------------------
-- SELECT created_at, metadata->>'ip', metadata->>'country', metadata->>'city'
-- FROM admin_events
-- WHERE event_type = 'login'
--   AND (metadata->>'is_demo')::boolean = true
--   AND (metadata->>'ref' IS NULL OR metadata->>'ref' = '')
-- ORDER BY created_at DESC;
