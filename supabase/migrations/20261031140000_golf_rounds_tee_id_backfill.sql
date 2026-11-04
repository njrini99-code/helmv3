-- Fill golf_rounds.tee_id where the round's own tee name names exactly one published tee on its course.
--
-- Owner approved 2026-10-31 ("tee_id backfill"), with an archive first so no data is lost. Read-only count the same
-- day: on Guilford, Shenandoah (men, women) and UNCW, 133 completed rounds have tee_id NULL while `tees_played`
-- matches exactly one non-draft golf_course_tees row of the round's course_id (none ambiguous). Without the link the
-- round review shows no yardage and "same tees" comparisons (record-marks.ts) miss these rounds.
--
-- Scope, deliberately narrow:
--   * completed, non-test rounds of players active on those four teams; tee_id NULL; course_id set;
--   * a match is `normalized_tee_name = lower(collapsed-whitespace trim(tees_played))` on the same course, non-draft,
--     and it must be the ONLY match; anything else is left alone;
--   * in-progress rounds are left to the app, which now carries the tee on continue (2ae6ce803).
-- Only tee_id changes. Ratings, slope, scores and updated_at are untouched (no trigger fires on tee_id: the stats
-- cache and live-round triggers list their columns, and none is tee_id). Completed rounds are guarded as permanent
-- history (helm_private.guard_golf_round_lifecycle); this write uses that guard's own transaction-local 'atomic'
-- bypass, and the statement after it checks that nothing but tee_id moved.
--
-- ARCHIVE: helm_private.golf_rounds_tee_backfill_20261031 keeps each touched round's id, old and new tee_id and the
-- whole row as it was (jsonb). ROLLBACK: supabase/rollbacks/20261031140000_golf_rounds_tee_id_backfill.rollback.sql
-- sets tee_id back from the archive.
--
-- VERIFY: select 1 from helm_private.golf_rounds_tee_backfill_20261031 having count(*) > 0;
-- VERIFY: select 1 where not exists (select 1 from helm_private.golf_rounds_tee_backfill_20261031 a join golf_rounds r on r.id = a.round_id where r.tee_id is distinct from a.new_tee_id);

CREATE TABLE IF NOT EXISTS helm_private.golf_rounds_tee_backfill_20261031 (
  round_id uuid PRIMARY KEY,
  old_tee_id uuid,
  new_tee_id uuid NOT NULL,
  row_before jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON helm_private.golf_rounds_tee_backfill_20261031 FROM PUBLIC, anon, authenticated;

WITH scope AS (
  SELECT DISTINCT r.id
  FROM golf_rounds r
  JOIN golf_team_members m ON m.player_id = r.player_id AND m.status = 'active'
  WHERE m.team_id IN (
      'b714c30f-5459-4a57-8ccd-8af84fe6861a', 'a852910f-e5a6-4e34-8a72-998e718ff80d',
      'ffd6985f-14b4-4448-895f-d5af20da8d6a', 'f5b4fc75-4581-4843-9b62-7d3bc4686aa5')
    AND r.status = 'completed'
    AND r.is_test = false
    AND r.tee_id IS NULL
    AND r.course_id IS NOT NULL
    AND nullif(trim(r.tees_played), '') IS NOT NULL
),
matched AS (
  SELECT r.id AS round_id, min(t.id::text)::uuid AS tee_id, count(*) AS n
  FROM golf_rounds r
  JOIN scope s ON s.id = r.id
  JOIN golf_course_tees t
    ON t.course_id = r.course_id
   AND t.is_draft = false
   AND t.normalized_tee_name = lower(regexp_replace(trim(r.tees_played), '\s+', ' ', 'g'))
  GROUP BY r.id
)
INSERT INTO helm_private.golf_rounds_tee_backfill_20261031 (round_id, old_tee_id, new_tee_id, row_before)
SELECT r.id, r.tee_id, m.tee_id, to_jsonb(r)
FROM golf_rounds r
JOIN matched m ON m.round_id = r.id AND m.n = 1
ON CONFLICT (round_id) DO NOTHING;

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);

UPDATE golf_rounds r
SET tee_id = a.new_tee_id
FROM helm_private.golf_rounds_tee_backfill_20261031 a
WHERE a.round_id = r.id
  AND r.tee_id IS NULL;

SELECT set_config('helm.golf_lifecycle_write', '', true);

-- Nothing but tee_id may differ from the archived row.
DO $$
DECLARE
  drifted int;
BEGIN
  SELECT count(*) INTO drifted
  FROM helm_private.golf_rounds_tee_backfill_20261031 a
  JOIN golf_rounds r ON r.id = a.round_id
  WHERE (to_jsonb(r) - 'tee_id') IS DISTINCT FROM (a.row_before - 'tee_id');
  IF drifted > 0 THEN
    RAISE EXCEPTION 'tee_id backfill changed % rounds beyond tee_id; rolling back', drifted;
  END IF;
END;
$$;
