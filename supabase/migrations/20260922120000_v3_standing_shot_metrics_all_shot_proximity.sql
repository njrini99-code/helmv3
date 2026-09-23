-- Package 7B / addendum A2 (2026-09-22): move approach-proximity-by-band
-- standings from ON-GREEN-only proximity to ALL-SHOT proximity, so the row's
-- player_value shares a basis with golf_pga_standards.pga_value (sourced as
-- Tour "Proximity to Hole" figures, which count every approach shot in the
-- band, misses included — see supabase/migrations/20260610040300_*.sql).
--
-- PR #1938 (repair deferrals N5 + A2) withholds the Tour marker on these three
-- rows for exactly this reason: standing.pga_omitted_reason = 'basis_mismatch'
-- because player_value was on-green-only while pga_value is all-shot. This
-- migration removes the mismatch at the source instead of only flagging it on
-- read. src/lib/coachhelm/v3/standing/tour-basis.ts (landed by #1938) is
-- updated in the companion app-code change to draw the marker only when
-- basis = 'all_shot'.
--
-- Lay-up split (addendum A2 §5.3 / companion plan §6.5): a deliberate lay-up
-- finishing well short of the green is not a "miss" in the Tour sense, and
-- folding it into an all-shot average would reintroduce a different basis
-- mismatch (Tour approach shots from 175+ yd are not laid up; ~46% of this
-- program's 175+ yd "approaches" are par-5 second shots, per
-- approach-miss.ts's parSplit() 2026-08-18 measurement: par-5 second shots
-- convert at 15.8% vs 27.9% for par-4 approaches, because laying up to a
-- wedge number is often the right play). A shot is not tagged with recorded
-- intent anywhere in golf_shots, so this uses the same derived heuristic
-- already established in approach-miss.ts: a 175-plus-yard approach on a par
-- 5 that does NOT finish on the green is treated as a likely lay-up and
-- excluded from the Tour-comparable population. It is never charged as a
-- "miss" and never silently folded back in — its count is reported in the
-- new layup_excluded_n column so a caller can see what was set aside. This
-- is a derived split, not a claim about the golfer's actual intent (addendum
-- §8.3: "Do not auto-infer ... from score patterns" applies here too — a
-- par-5 second shot that finds the green is counted normally either way).
--
-- Read-only production sizing (2026-09-22, Helm-Production):
--   50-125 band:  55 players clear attempts>=10 & rounds>=3 (of ~57 with any
--                 eligible shot); mean of player averages 28.4 ft;
--                 0 shots tagged likely-layup (expected: not par-5-175+).
--   125-175 band: 56 players clear the floor; mean 46.7 ft; 0 layup-tagged.
--   175-plus band: 53 players clear the floor; mean 72.2 ft; 2,018 approach
--                 shots (of the band's ~5,243) tagged likely-layup and
--                 excluded from the average.
-- All three player-average means sit above their seeded Tour value (18 / 30 /
-- 45 ft) as expected, confirming the conversion did not invert the metric.
--
-- Floors: addendum A2 §5.2 treats fewer than 10 eligible shots or fewer than
-- 3 distinct rounds as too thin for a trend/comparison claim. This replaces
-- the previous MIN_GREENS=3 floor for the Tour-comparable population (kept
-- separately, unchanged, for the preserved on_green_proximity_feet column).
--
-- Backward compatibility: player_value's semantics change for these three
-- metric_ids going forward (on-green-only -> all-shot), which is why this
-- migration adds `basis` so every consumer can tell which population a row
-- reflects rather than silently reinterpreting an unversioned number
-- (op note in the task: "add new columns ... or version the basis field").
-- The prior on-green-only figure is NOT dropped: it is kept in the new
-- on_green_proximity_feet column, computed the same way as before (AVG over
-- on-green shots, requiring >= MIN_GREENS=3 of them) but now ALSO gated
-- behind the same, stricter all-shot floor as player_value itself
-- (MIN_ATTEMPTS=10, MIN_ROUNDS=3) — a player who cleared the old
-- MIN_GREENS-only floor but not the new one gets neither number written.
-- db-migration-reviewer (2026-09-22) confirmed 24 such player-band rows in
-- production today (10 in 50-125, 6 in 125-175, 8 in 175+); this function
-- stops writing them and they age out via the existing
-- prune_stale_player_standing job — an owner-visible effect of this
-- migration, not a bug (see the PR description). No current reader consumes
-- this column: v3/composite/rules/short-approach-proximity-gap.ts reads its
-- own independently-computed evidence.detail.proximity_when_hit_feet, not
-- this table (a corrected claim — an earlier draft of this comment wrongly
-- named it as this column's consumer). on_green_proximity_feet exists so the
-- pre-migration number is not silently lost for any future or ad-hoc reader.
-- `basis` is nullable and left NULL by every other writer of this table
-- (refresh_player_standing, refresh_player_standing_round_metrics); the
-- render-side rule in tour-basis.ts is scoped to only these three
-- metric_ids, so an unrelated metric's NULL basis is not itself grounds to
-- withhold its Tour marker.
--
-- Known follow-up NOT done here (out of scope for a schema migration):
-- counterfactual/lookup-tables.ts's stroke_impact_per_unit for these three
-- metric ids (0.05 / 0.03 / 0.02 strokes per foot) was calibrated against the
-- old on-green-only distribution. An all-shot distribution has a wider range
-- and a different feet-to-strokes relationship (some of the movement is
-- really a green-hit-rate effect, not a proximity effect). Recalibrating
-- that coefficient needs its own measurement, not an invented number in a
-- migration comment; standing/metric-config.ts's default_scale bounds ARE
-- updated in the companion app-code change using the percentiles measured
-- above so the StandingBar doesn't clip.

-- ============================================================================
-- 1) golf_player_standing: additive columns, backward compatible.
-- ============================================================================

ALTER TABLE public.golf_player_standing
  ADD COLUMN IF NOT EXISTS basis text,
  ADD COLUMN IF NOT EXISTS on_green_proximity_feet numeric,
  ADD COLUMN IF NOT EXISTS layup_excluded_n bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'golf_player_standing_basis_check'
       AND conrelid = 'public.golf_player_standing'::regclass
  ) THEN
    ALTER TABLE public.golf_player_standing
      ADD CONSTRAINT golf_player_standing_basis_check
      CHECK (basis IS NULL OR basis IN ('on_green', 'all_shot'));
  END IF;
END $$;

COMMENT ON COLUMN public.golf_player_standing.basis IS
  'Nullable. Set to ''all_shot'' by refresh_player_standing_shot_metrics for '
  'approach_proximity_* rows (Package 7B, 2026-09-22): player_value there is '
  'averaged over every eligible approach in the band, misses included, same '
  'basis as pga_value. NULL for every other writer (refresh_player_standing, '
  'refresh_player_standing_round_metrics) and for pre-migration rows not yet '
  'refreshed. Render layers must scope any basis-gated rule to the specific '
  'metric_ids that carry a real ''on_green'' vs ''all_shot'' distinction '
  '(the three approach_proximity_* ids) — a NULL basis on an unrelated '
  'metric is not itself a reason to withhold that metric''s Tour marker.';

COMMENT ON COLUMN public.golf_player_standing.on_green_proximity_feet IS
  'Nullable. approach_proximity_* only: the pre-Package-7B ON-GREEN-only '
  'proximity (feet), kept for any future/ad-hoc reader now that player_value '
  'moved to the all-shot basis -- no current reader consumes this column '
  '(short-approach-proximity-gap.ts reads its own independently-computed '
  'evidence.detail.proximity_when_hit_feet, not this table). NULL unless the '
  'row also clears the all-shot MIN_ATTEMPTS=10/MIN_ROUNDS=3 floor (a '
  'stricter gate than the on-green-only MIN_GREENS=3 floor alone) AND has '
  '>= MIN_GREENS=3 on-green shots itself within that population.';

COMMENT ON COLUMN public.golf_player_standing.layup_excluded_n IS
  'Nullable. approach_proximity_175_plus_ft only (Package 7B lay-up split): '
  'count of approach shots on this row''s player+band excluded from '
  'player_value as likely deliberate lay-ups (par-5 hole, 175+ yd, did not '
  'finish on the green — a derived heuristic, not recorded intent; see '
  'approach-miss.ts parSplit()). 0 for the two shorter bands on rows this '
  'function writes (it never tags a lay-up outside the 175+ band); NULL for '
  'every other metric_id, since only this function ever sets this column.';

-- ============================================================================
-- 2) refresh_player_standing_shot_metrics — all-shot basis + lay-up split.
-- Same signature/shape as the 2026-06-09 version; CREATE OR REPLACE keeps the
-- existing service_role-only ACL, restated below for defense in depth (the
-- rpc_grant_hardening pgTAP asserts this).
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[])
    RETURNS TABLE("out_metric_id" "text", "out_rows_upserted" bigint)
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
    AS $_$
DECLARE
  -- (metric_id, band_lo_yards, band_hi_yards) — hi is exclusive; last band open-ended.
  v_bands text[][] := ARRAY[
    ['approach_proximity_50_125ft',   '50',  '125'],
    ['approach_proximity_125_175ft',  '125', '175'],
    ['approach_proximity_175_plus_ft','175', '100000']
  ];
  v_n int := array_length(v_bands, 1);
  v_i int;
  v_metric text;
  v_lo numeric;
  v_hi numeric;
  v_rows bigint;
  v_min_attempts constant int := 10;  -- all-shot floor (addendum A2 §5.2): thin trend guard
  v_min_rounds constant int := 3;     -- distinct rounds contributing, same floor
  v_min_greens constant int := 3;     -- legacy on-green floor, preserved for on_green_proximity_feet
  v_min_cohort_n constant int := 8;   -- min population before a cohort baseline is trusted
  v_min_team_n constant int := 3;     -- min team size before a team percentile is trusted
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  v_i := 1;
  WHILE v_i <= v_n LOOP
    v_metric := v_bands[v_i][1];
    v_lo := v_bands[v_i][2]::numeric;
    v_hi := v_bands[v_i][3]::numeric;

    WITH shots AS (
      -- Every eligible approach shot in the band, on-green or not (all-shot
      -- basis). par is carried through for the lay-up tag below; a shot whose
      -- hole/par is unresolvable (LEFT JOIN miss) is never tagged a lay-up.
      SELECT
        p.id AS player_id,
        r.id AS round_id,
        h.par,
        (lower(coalesce(s.result, '')) IN ('green', 'hole', 'gir')
         OR lower(coalesce(s.lie_after, '')) = 'green') AS on_green,
        (CASE WHEN lower(coalesce(s.distance_unit_after, 'feet')) = 'yards'
              THEN s.distance_to_hole_after * 3.0
              ELSE s.distance_to_hole_after END) AS after_ft
      FROM public.golf_players p
      JOIN public.golf_rounds r
        ON r.player_id = p.id AND r.status = 'completed'
      JOIN public.golf_shots s
        ON s.round_id = r.id
       AND s.shot_type = 'approach'
       AND s.distance_to_hole_before IS NOT NULL
       AND s.distance_to_hole_after IS NOT NULL
       AND (CASE WHEN lower(coalesce(s.distance_unit_before, 'yards')) = 'feet'
                 THEN s.distance_to_hole_before / 3.0
                 ELSE s.distance_to_hole_before END) >= v_lo
       AND (CASE WHEN lower(coalesce(s.distance_unit_before, 'yards')) = 'feet'
                 THEN s.distance_to_hole_before / 3.0
                 ELSE s.distance_to_hole_before END) < v_hi
      LEFT JOIN public.golf_holes h ON h.id = s.hole_id
      -- db-migration-reviewer (2026-09-22): an inner JOIN to golf_team_members
      -- here duplicated every shot once per active team a player belongs to
      -- (harmless when only AVG'd; now it also inflates attempts/greens/
      -- layup_excluded_n against the new floors). EXISTS keeps it a per-player
      -- membership check, not a row multiplier.
      WHERE EXISTS (
        SELECT 1 FROM public.golf_team_members tmx
         WHERE tmx.player_id = p.id AND tmx.status = 'active'::team_member_status
      )
    ),
    tagged AS (
      SELECT *,
        -- db-migration-reviewer (2026-09-22): `par = 5` is NULL (not false)
        -- when the hole/par is unresolvable (LEFT JOIN miss), which made the
        -- whole AND-chain NULL and silently dropped the shot from BOTH
        -- `NOT is_likely_layup` and `is_likely_layup` filters below.
        -- IS NOT DISTINCT FROM treats a NULL par as "not 5" instead.
        (v_metric = 'approach_proximity_175_plus_ft' AND par IS NOT DISTINCT FROM 5 AND NOT on_green) AS is_likely_layup
      FROM shots
    ),
    -- One row per active player: all-shot proximity (feet) over the
    -- Tour-comparable population (lay-ups excluded), plus the preserved
    -- on-green-only figure over that same population.
    base AS (
      SELECT
        player_id,
        AVG(after_ft) AS player_value,
        COUNT(*) AS attempts,
        COUNT(DISTINCT round_id) AS rounds,
        AVG(after_ft) FILTER (WHERE on_green) AS on_green_avg,
        COUNT(*) FILTER (WHERE on_green) AS greens
      FROM tagged
      WHERE NOT is_likely_layup
      GROUP BY player_id
      HAVING COUNT(*) >= v_min_attempts AND COUNT(DISTINCT round_id) >= v_min_rounds
    ),
    layups AS (
      SELECT player_id, COUNT(*) AS layup_n
      FROM tagged
      WHERE is_likely_layup
      GROUP BY player_id
    ),
    -- team_values carries the player's team gender (audit P3) so ranked rows
    -- can be matched to their own-gender cohort below.
    team_values AS (
      SELECT b.player_id, tm.team_id, COALESCE(t.gender, 'mens') AS gender, b.player_value
      FROM base b
      JOIN public.golf_team_members tm
        ON tm.player_id = b.player_id AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
      WHERE tm.team_id = ANY (p_team_ids)
    ),
    team_stats AS (
      SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
      FROM team_values GROUP BY team_id
    ),
    ranked AS (
      SELECT tv.player_id, tv.team_id, tv.gender, tv.player_value, ts.team_avg, ts.team_n,
        100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
      FROM team_values tv JOIN team_stats ts ON ts.team_id = tv.team_id
    ),
    -- App-wide POPULATION, carrying the player's team gender (audit P3).
    -- DISTINCT so a player on >1 active team is counted once per (gender, value).
    population_values AS (
      SELECT DISTINCT b.player_id, COALESCE(t.gender, 'mens') AS gender, b.player_value
      FROM base b
      JOIN public.golf_team_members tm
        ON tm.player_id = b.player_id AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
    ),
    -- Gender-scoped cohort aggregates (audit P3): one level_avg / level_n per gender.
    pop_stats AS (
      SELECT gender, AVG(player_value) AS level_avg, COUNT(*) AS level_n
      FROM population_values GROUP BY gender
    ),
    pop_ranked AS (
      SELECT player_id, gender,
        100 * (PERCENT_RANK() OVER (PARTITION BY gender ORDER BY player_value DESC)) AS level_pct
      FROM population_values
    ),
    pga AS (
      SELECT pga_tour_value, pga_p50 FROM public.golf_pga_standards
      WHERE metric_id = v_metric ORDER BY season DESC LIMIT 1
    )
    INSERT INTO public.golf_player_standing AS s (
      player_id, metric_id, player_value, team_avg, team_n, team_pct,
      level_avg, level_n, level_pct, pga_value, pga_delta,
      basis, on_green_proximity_feet, layup_excluded_n, computed_at
    )
    SELECT r.player_id, v_metric, r.player_value, r.team_avg, r.team_n::int,
      CASE WHEN r.team_n >= v_min_team_n THEN r.team_pct ELSE NULL END,
      CASE WHEN ps.level_n >= v_min_cohort_n THEN ps.level_avg ELSE NULL END,
      ps.level_n::int,
      CASE WHEN ps.level_n >= v_min_cohort_n THEN pr.level_pct ELSE NULL END,
      COALESCE(pga.pga_tour_value, pga.pga_p50),
      r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
      'all_shot',
      CASE WHEN b.greens >= v_min_greens THEN b.on_green_avg ELSE NULL END,
      COALESCE(ly.layup_n, 0),
      now()
    FROM ranked r
    JOIN base b ON b.player_id = r.player_id
    JOIN pop_stats ps ON ps.gender = r.gender
    LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
    LEFT JOIN layups ly ON ly.player_id = r.player_id
    CROSS JOIN pga
    WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
    ON CONFLICT (player_id, metric_id) DO UPDATE
    SET player_value = EXCLUDED.player_value, team_avg = EXCLUDED.team_avg, team_n = EXCLUDED.team_n,
        team_pct = EXCLUDED.team_pct, level_avg = EXCLUDED.level_avg, level_n = EXCLUDED.level_n,
        level_pct = EXCLUDED.level_pct, pga_value = EXCLUDED.pga_value, pga_delta = EXCLUDED.pga_delta,
        basis = EXCLUDED.basis, on_green_proximity_feet = EXCLUDED.on_green_proximity_feet,
        layup_excluded_n = EXCLUDED.layup_excluded_n, computed_at = now();

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    out_metric_id := v_metric;
    out_rows_upserted := v_rows;
    RETURN NEXT;

    v_i := v_i + 1;
  END LOOP;
END;
$_$;

COMMENT ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) IS 'v3 2026-06-05 + tiny-N team_pct guard (EC-2, 2026-06-06) + gender-scoped level cohort (audit P3, 2026-06-09) + ALL-SHOT basis + lay-up split (Package 7B / addendum A2, 2026-09-22). Shot-level approach-proximity-by-band standings (50-125 / 125-175 / 175+ yd) with team + app-wide cohort (SCOPED BY golf_teams.gender, MIN_COHORT_N=8) + PGA. player_value is now averaged over every eligible approach in the band (misses included, basis=''all_shot''), matching golf_pga_standards.pga_value''s basis so the Tour marker is comparable; 175+ yd par-5 approaches missing the green are excluded as likely lay-ups (layup_excluded_n) rather than counted as misses. The pre-migration on-green-only figure is kept in on_green_proximity_feet, now ALSO gated behind the all-shot floor (MIN_ATTEMPTS=10, MIN_ROUNDS=3) on top of its own MIN_GREENS=3 -- no current reader consumes that column. Floor for the all-shot population is MIN_ATTEMPTS=10 + MIN_ROUNDS=3 (addendum A2 §5.2). team_pct is NULLed when team_n<3. Companion to refresh_player_standing; same (metric_id, rows_upserted) shape (aliased out_*).';

REVOKE EXECUTE ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) TO service_role;

-- ============================================================================
-- 3) Post-apply verification (db-migration-reviewer, 2026-09-22): scripts/
-- db/apply.mjs runs every `-- VERIFY:` line below as a standalone SELECT
-- after this file commits and fails the apply step (without rolling back)
-- if any returns zero rows.
-- ============================================================================
-- VERIFY: select 1 from information_schema.columns
-- VERIFY:  where table_schema = 'public' and table_name = 'golf_player_standing'
-- VERIFY:    and column_name = 'basis';
-- VERIFY: select 1 from information_schema.columns
-- VERIFY:  where table_schema = 'public' and table_name = 'golf_player_standing'
-- VERIFY:    and column_name = 'on_green_proximity_feet';
-- VERIFY: select 1 from information_schema.columns
-- VERIFY:  where table_schema = 'public' and table_name = 'golf_player_standing'
-- VERIFY:    and column_name = 'layup_excluded_n';
-- VERIFY: select 1 from pg_constraint
-- VERIFY:  where conname = 'golf_player_standing_basis_check'
-- VERIFY:    and conrelid = 'public.golf_player_standing'::regclass;
-- VERIFY: select 1 from pg_proc
-- VERIFY:  where proname = 'refresh_player_standing_shot_metrics'
-- VERIFY:    and prosrc ilike '%all_shot%';
