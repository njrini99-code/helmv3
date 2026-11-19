-- The three countable-round helpers, on their own, so Clubhouse's season
-- Standing (20261024151000) can be applied without the rest of the OD-01
-- chain. AWAITING OWNER APPLY. Do not apply without the owner's go-ahead.
--
-- WHY. 20261024151000_golf_player_standing_season.sql calls
-- golf_round_is_countable and golf_round_is_score_countable, and its DO
-- block refuses to run without them. Today only OD-01
-- (20260924120000_golf_countable_round_stats_cache.sql) creates them, and
-- OD-01 also rewrites the stats cache and Fairway's Standing refreshes, which
-- moves every cached number. So the season file has waited on that whole
-- chain. Meanwhile 20261024150000 (the dirty-team queue) is applied: the
-- five-minute dirty pass (/api/cron/v3/standing-refresh-dirty) finds dirty
-- teams on every tick and calls refresh_player_standing_season, which does
-- not exist (PGRST202, about 288 a day in the API logs), and Clubhouse
-- Standing shows lifetime "All time" figures instead of this season's.
--
-- WHAT. CREATE OR REPLACE of golf_round_canonical_total,
-- golf_round_is_countable and golf_round_is_score_countable with bodies,
-- owners, comments and grants copied exactly from 20260924120000 (a unit
-- test keeps the two files identical). All three are pure IMMUTABLE SQL
-- functions with no table access and no caller yet: nothing that exists
-- today changes behaviour. When OD-01 is applied later its CREATE OR REPLACE
-- of these three is a no-op.
--
-- ORDER. Apply this file, then 20261024151000 (whose guard now passes), then
-- run the season refresh as 20261024151000's AFTER APPLY says. The OD-01
-- chain stays held and is independent of this file.
--
-- ROLLBACK: Only while 20261024151000 is not applied (its function calls
-- ROLLBACK: these; drop that first):
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_round_is_score_countable(
-- ROLLBACK:   text, integer, integer, integer, integer, integer, numeric);
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_round_is_countable(
-- ROLLBACK:   text, integer, integer, integer, integer, integer, numeric);
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_round_canonical_total(
-- ROLLBACK:   integer, integer, integer);
--
-- VERIFY: select 1
-- VERIFY:  where public.golf_round_canonical_total(70, 36, 35) = 71
-- VERIFY:    and public.golf_round_canonical_total(70, null, 35) = 70;
-- VERIFY: select 1
-- VERIFY:  where public.golf_round_is_countable(
-- VERIFY:          'completed', 18, 72, 36, 36, 30, 0)
-- VERIFY:    and not public.golf_round_is_countable(
-- VERIFY:          'in_progress', 18, 72, 36, 36, 30, 0);
-- VERIFY: select 1
-- VERIFY:  where public.golf_round_is_score_countable(
-- VERIFY:          'completed', 18, 72, null, null, 30, 0)
-- VERIFY:    and not public.golf_round_is_countable(
-- VERIFY:          'completed', 18, 72, null, null, 30, 0);
-- VERIFY: select 1
-- VERIFY:  where has_function_privilege('authenticated',
-- VERIFY:          'public.golf_round_is_countable(text, integer, integer, integer, integer, integer, numeric)', -- noqa: LT05
-- VERIFY:          'execute')
-- VERIFY:    and not has_function_privilege('anon',
-- VERIFY:          'public.golf_round_is_countable(text, integer, integer, integer, integer, integer, numeric)', -- noqa: LT05
-- VERIFY:          'execute');
-- VERIFY: select 1
-- VERIFY:  where not has_function_privilege('anon',
-- VERIFY:          'public.golf_round_is_score_countable(text, integer, integer, integer, integer, integer, numeric)', -- noqa: LT05
-- VERIFY:          'execute')
-- VERIFY:    and not has_function_privilege('anon',
-- VERIFY:          'public.golf_round_canonical_total(integer, integer, integer)', 'execute'); -- noqa: LT05

-- ---- copied from 20260924120000_golf_countable_round_stats_cache.sql
-- ---- (keep identical) ----

CREATE OR REPLACE FUNCTION "public"."golf_round_canonical_total"("p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer) RETURNS integer
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  -- Mirrors deriveRoundTotal (src/lib/golf/round-total.ts): the hole-summed
  -- front + back nine when both exist, else the stored total.
  SELECT CASE
    WHEN p_front_nine IS NOT NULL AND p_back_nine IS NOT NULL THEN p_front_nine + p_back_nine
    ELSE p_total_score
  END;
$$;

ALTER FUNCTION "public"."golf_round_canonical_total"("p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_round_canonical_total"("p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer) IS 'W13 / OD-01 (2026-09-24). Mirrors deriveRoundTotal in src/lib/golf/round-total.ts: front_nine + back_nine when both are set, else total_score.';

CREATE OR REPLACE FUNCTION "public"."golf_round_is_countable"("p_status" "text", "p_holes_played" integer, "p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer, "p_strokes_gained_total" numeric) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  -- Mirrors isCountableRound / roundExclusionReason in
  -- src/lib/golf/round-countable.ts, rule for rule:
  --   not_completed      status <> 'completed'
  --   unsupported_length holes (default 18) not 9 or 18
  --   holes_missing      9 per non-null nine <> holes
  --   implausible_score  canonical total null, or below
  --                      max(ceil(holes * 50 / 18), holes + max(putts, 0))
  --   implausible_sg     SG: Total above +15 (one-sided; a bad real round
  --                      has a large NEGATIVE SG)
  WITH x AS (
    SELECT
      COALESCE(p_holes_played, 18) AS holes,
      (CASE WHEN p_front_nine IS NOT NULL THEN 9 ELSE 0 END)
        + (CASE WHEN p_back_nine IS NOT NULL THEN 9 ELSE 0 END) AS recorded,
      CASE
        WHEN p_front_nine IS NOT NULL AND p_back_nine IS NOT NULL THEN p_front_nine + p_back_nine
        ELSE p_total_score
      END AS total
  )
  SELECT
    p_status IS NOT DISTINCT FROM 'completed'
    AND x.holes IN (9, 18)
    AND x.recorded = x.holes
    AND x.total IS NOT NULL
    AND x.total >= GREATEST(CEIL(x.holes * 50.0 / 18)::integer, x.holes + GREATEST(COALESCE(p_total_putts, 0), 0))
    -- NaN sorts above every number in Postgres; the TS rule ignores a
    -- non-finite SG, so NaN must not exclude the round here either.
    AND NOT COALESCE(p_strokes_gained_total > 15 AND p_strokes_gained_total <> 'NaN'::numeric, false)
  FROM x;
$$;

ALTER FUNCTION "public"."golf_round_is_countable"("p_status" "text", "p_holes_played" integer, "p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer, "p_strokes_gained_total" numeric) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_round_is_countable"("p_status" "text", "p_holes_played" integer, "p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer, "p_strokes_gained_total" numeric) IS 'W13 / OD-01 (2026-09-24). The DB copy of isCountableRound (src/lib/golf/round-countable.ts). Keep the two in step; supabase/tests/rls/golf_round_is_countable.sql pins the shared cases.';

CREATE OR REPLACE FUNCTION "public"."golf_round_is_score_countable"(
    "p_status" "text", "p_holes_played" integer, "p_total_score" integer,
    "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer,
    "p_strokes_gained_total" numeric
) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  -- Q-128. Mirrors isScoreCountable / isTotalOnlyCountable in
  -- src/lib/golf/round-score-countable.ts: a round counts in a SCORE when it
  -- is hole-countable (golf_round_is_countable) OR is an 18-hole round
  -- posted as a total only. For the total-only case the holes check is the
  -- only rule waived; the others stay:
  --   not_completed      status <> 'completed'
  --   unsupported_length holes (default 18) not 18: a nine-hole total has no
  --                      holes to tell it from half of one
  --   total-only shape   no nine recorded, total_score set
  --   implausible_score  total below max(50, 18 + max(putts, 0))
  --   implausible_sg     SG: Total above +15 (one-sided; NaN is ignored)
  -- A test round is excluded by the is_test guard 20260928150000 adds, as
  -- for golf_round_is_countable (neither has an is_test input).
  SELECT
    public.golf_round_is_countable(
      p_status, p_holes_played, p_total_score, p_front_nine, p_back_nine,
      p_total_putts, p_strokes_gained_total
    )
    OR (
      p_status IS NOT DISTINCT FROM 'completed'
      AND p_front_nine IS NULL
      AND p_back_nine IS NULL
      AND p_total_score IS NOT NULL
      AND COALESCE(p_holes_played, 18) = 18
      AND p_total_score >= GREATEST(
        50, 18 + GREATEST(COALESCE(p_total_putts, 0), 0)
      )
      AND NOT COALESCE(
        p_strokes_gained_total > 15
        AND p_strokes_gained_total <> 'NaN'::numeric,
        false
      )
    );
$$;

ALTER FUNCTION "public"."golf_round_is_score_countable"(
    "text", integer, integer, integer, integer, integer, numeric
) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_round_is_score_countable"(
    "text", integer, integer, integer, integer, integer, numeric
) IS
'Q-128 (2026-10-01). The DB copy of isScoreCountable '
'(src/lib/golf/round-score-countable.ts): golf_round_is_countable, '
'or an 18-hole round posted as a total only (completed, plausible '
'total, SG not above +15). Used by the SCORE figures; hole figures '
'keep golf_round_is_countable. Keep the two in step; '
'supabase/tests/rls/golf_round_is_countable.sql pins the shared cases.';


-- Pure helpers: callable by authenticated (as in 20260924120000); no anon/PUBLIC access.
REVOKE ALL ON FUNCTION "public"."golf_round_is_countable"("p_status" "text", "p_holes_played" integer, "p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer, "p_strokes_gained_total" numeric) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."golf_round_is_countable"("p_status" "text", "p_holes_played" integer, "p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer, "p_total_putts" integer, "p_strokes_gained_total" numeric) TO "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."golf_round_canonical_total"("p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."golf_round_canonical_total"("p_total_score" integer, "p_front_nine" integer, "p_back_nine" integer) TO "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."golf_round_is_score_countable"(
    "text", integer, integer, integer, integer, integer, numeric
) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."golf_round_is_score_countable"(
    "text", integer, integer, integer, integer, integer, numeric
) TO "authenticated", "service_role";
