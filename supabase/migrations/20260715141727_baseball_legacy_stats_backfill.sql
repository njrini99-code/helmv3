-- =============================================================================
-- #379 — ONE-TIME legacy stats backfill: baseball_player_stats → box-score.
-- Migration: 20260715141727_baseball_legacy_stats_backfill.sql
--
-- STATUS: WRITTEN, NOT APPLIED. This file is committed pending Nick's explicit
-- go-ahead. Do not `apply_migration` this without that sign-off — see
-- docs/baseball/legacy-backfill-runbook.md for the check-first queries, how
-- the orchestrator applies it, and the rollback story.
--
-- WHAT THIS DOES
-- ---------------------------------------------------------------------------
-- #827 (20260715's "#379 Phase 0" reconciliation) fixed *new* seeding/import
-- paths to write BOTH stat layers going forward. It did not do anything for
-- teams whose entire game history already lives ONLY in the legacy flat table
-- (`baseball_player_stats`, stat_type = 'game') from before that fix — those
-- teams still show real numbers on Command Center/Roster/Passport (legacy
-- layer) but an honestly-empty Stats Center (`src/lib/baseball/read-models/
-- stats-center.ts` reads ONLY the box-score/season layer — see its own
-- module docstring). This migration is the one-time catch-up for exactly
-- those teams:
--
--   1. Identifies teams with ZERO existing `baseball_box_score_batting` /
--      `baseball_box_score_pitching` rows (see "ELIGIBILITY" below). Teams
--      that have ANY box-score row already — even one — are left completely
--      alone; their box-score data is maintained live by the adapter
--      precedence in `src/app/baseball/actions/imports.ts`
--      (`applyGameBoxScoreImport`) and `src/app/baseball/actions/games.ts`
--      (`save_baseball_full_box_score`), which this migration does not touch
--      or race with (it never re-derives games for a team that already has
--      box-score rows, full stop).
--   2. For those teams only, groups their `stat_type = 'game'` legacy rows by
--      (team_id, session_date) into ONE shared, synthesized `baseball_games`
--      row per team-date — mirroring the shared-game-schedule fix in
--      scripts/seed-baseball-stats.mjs's `buildBoxScoreRowsForSessions`
--      (#827): a game is a TEAM-level event every attending player's line
--      references, never a private per-player row.
--   3. Copies each attending player's legacy row into one
--      `baseball_box_score_batting` row (always) and one
--      `baseball_box_score_pitching` row (only when `innings_pitched > 0`),
--      computing avg/obp/slg/ops and era/whip/k9/bb9 with the SAME formulas
--      `src/app/baseball/actions/games.ts`'s `computeBattingRates` /
--      `computePitchingRates` use (including innings-pitched OUTS-based
--      conversion — see `src/lib/baseball/innings.ts` — NOT naive decimal
--      division of the X.1/X.2 notation).
--
-- practice / other rows (`stat_type IN ('practice','other')`) are never
-- touched — box scores are a game-only concept (`baseball_games.game_type`
-- CHECK only allows 'game'/'scrimmage'; legacy 'practice' sessions still have
-- no box-score equivalent — same open gap #827's header notes).
--
-- COPY-ONLY: this migration only ever INSERTs into `baseball_games`,
-- `baseball_box_score_batting`, `baseball_box_score_pitching`. It never
-- UPDATEs or DELETEs a single row of `baseball_player_stats` (or anything
-- else) — the legacy table is read-only input here.
--
-- OUT OF SCOPE (deliberate, not an oversight): this migration does NOT call
-- `recalculate_baseball_season_stats()` / touch `baseball_player_season_stats`
-- at all. That table can ALREADY hold a team's season baseline from the
-- unrelated "season_totals" bulk-import path
-- (`src/app/baseball/actions/imports.ts`'s `upsertSeasonTotalsImport`) even
-- for a team with zero box-score rows — and `recalculate_baseball_season_stats`
-- does an `ON CONFLICT ... DO UPDATE` that would silently overwrite (not
-- merge with) that baseline the moment it's called. Since the task scope here
-- is explicitly "copy legacy rows into box-score + synthesize games" (three
-- named tables), clobbering a fourth, unrelated table's pre-existing data as
-- a side effect would violate this migration's own copy-only/additive-only
-- contract. Stats Center's game-log views (batting/pitching splits) read
-- straight off the box-score rows this migration writes and will show real
-- numbers immediately; only the season-row RECONCILE cross-check may flag
-- drift until someone deliberately runs a recalc pass per team — see the
-- runbook's "Optional follow-up" section for that as a separate, opt-in step.
--
-- ELIGIBILITY ("zero box-score data")
-- ---------------------------------------------------------------------------
-- A team qualifies iff it has a `stat_type = 'game'` row in
-- `baseball_player_stats` AND zero rows in BOTH `baseball_box_score_batting`
-- and `baseball_box_score_pitching`. This set is snapshotted ONCE into a
-- session-local TEMP TABLE (dropped at COMMIT, never persisted) before any
-- writes below happen, so a team's eligibility can never be affected by rows
-- THIS migration itself inserts mid-run (no Halloween-problem self-exclusion,
-- no accidental partial-team backfill either).
--
-- Defensive extra: even for an eligible team, a (team, date) pair is skipped
-- if a `baseball_games` row ALREADY exists for that exact team+date (e.g. a
-- scheduled game created via the Games UI with no stats entered yet) — this
-- migration never risks minting a second, duplicate game row alongside one
-- that already exists. Any such date is left for manual/live handling.
--
-- KNOWN LIMITATIONS (documented, not fixed here — one-time script, not a
-- product feature):
--   * Grouping key is (team_id, session_date) only, matching the
--     #827/scripts/seed-baseball-stats.mjs precedent this migration was asked
--     to mirror — a real double-header (two DIFFERENT-opponent games, same
--     team, same date) cannot be told apart and collapses onto one game.
--   * If a player somehow has more than one `stat_type = 'game'` legacy row
--     for the same team+date (duplicate manual entry), only one wins per
--     (game, player) — enforced by `baseball_box_score_batting`/`_pitching`'s
--     own `UNIQUE (game_id, player_id)` constraint, which has no concept of a
--     player appearing twice in "the same game". The winner is the legacy row
--     with the lexicographically-smallest `id`, chosen via `ROW_NUMBER()` so
--     re-running this migration is fully idempotent (same winner every time).
--   * Pitching `hr` (home runs allowed) has no legacy column and is always 0
--     — same true gap as `opponent_score`/`our_score` (legacy never captured
--     these; left NULL, not fabricated).
--
-- IDEMPOTENCY
-- ---------------------------------------------------------------------------
-- Every id below is DETERMINISTIC — a SHA-1 hash of a namespaced key, shaped
-- into RFC4122-v5-style bytes (version nibble forced to 0x5, variant bits
-- forced to 10xx), the exact pattern `scripts/seed-baseball-stats.mjs`'s
-- `detId()` uses (see its header comment + #827). The namespace here is
-- `baseball-legacy-backfill-379` — DELIBERATELY DIFFERENT from the seed
-- script's `baseball-stats-seed` namespace, so these ids can never collide
-- with anything the demo seeder (or anything else) has ever produced, and so
-- a rollback can RECOMPUTE (not merely record) exactly which rows are this
-- migration's. Every INSERT below is `ON CONFLICT (...) DO NOTHING` keyed on
-- that deterministic id (or the table's own natural unique key), so re-running
-- this file is always a no-op the second time.
--
-- No new database function is created. The id derivation is inlined as plain
-- SQL (bytea `get_byte`/`set_byte` + `pgcrypto.digest`) inside CTEs, computed
-- fresh in this transaction and never persisted as a callable object — so
-- there is nothing new here to REVOKE from anon or pin a search_path on. This
-- migration calls no functions at all beyond core Postgres builtins and
-- pgcrypto's `digest()` (already installed — see 20260527000000's
-- `CREATE EXTENSION IF NOT EXISTS pgcrypto`). It deliberately does NOT call
-- `public.recalculate_baseball_season_stats` — see OUT OF SCOPE above.
--
-- Wrapped in an explicit BEGIN/COMMIT (precedented in this repo — see
-- 20260528041553_fix_coachhelm_settings_preferences_and_insight_types.sql) so
-- the two TEMP TABLE snapshots and all three INSERTs commit atomically as one
-- unit regardless of how the migration runner batches statements.
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Step 0 — snapshot eligible ("zero box-score data") teams BEFORE any writes.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._bb_legacy_backfill_379_teams;
CREATE TEMP TABLE _bb_legacy_backfill_379_teams (
  team_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _bb_legacy_backfill_379_teams (team_id)
SELECT DISTINCT ps.team_id
FROM public.baseball_player_stats ps
WHERE ps.stat_type = 'game'
  AND NOT EXISTS (
    SELECT 1 FROM public.baseball_box_score_batting bsb WHERE bsb.team_id = ps.team_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.baseball_box_score_pitching bsp WHERE bsp.team_id = ps.team_id
  );

-- ----------------------------------------------------------------------------
-- Step 1 — one shared team-date game per eligible team, id derived from
-- (team_id, session_date) only (mirrors #827's buildBoxScoreRowsForSessions:
-- "Scoped to TEAM + DATE only (never player_id)").
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._bb_legacy_backfill_379_games;
CREATE TEMP TABLE _bb_legacy_backfill_379_games (
  team_id uuid NOT NULL,
  session_date date NOT NULL,
  opponent_name text,
  game_id uuid NOT NULL,
  PRIMARY KEY (team_id, session_date)
) ON COMMIT DROP;

INSERT INTO _bb_legacy_backfill_379_games (team_id, session_date, opponent_name, game_id)
WITH game_groups AS (
  SELECT
    ps.team_id,
    ps.session_date,
    -- Deterministic, stable pick among possibly-differing session_name values
    -- for the same team+date (alphabetically-smallest non-blank value wins).
    -- Mirrors the live import path's own convention
    -- (`findOrCreateImportGame` in src/app/baseball/actions/imports.ts:
    -- `opponentName: sessionName?.trim() || null`) — session_name IS the
    -- opponent name for real legacy rows, not a "Game vs X" prefix (that
    -- prefix is scripts/seed-baseball-stats.mjs's OWN synthetic-data
    -- convention, not a real-data one).
    MIN(NULLIF(TRIM(ps.session_name), '')) AS opponent_name
  FROM public.baseball_player_stats ps
  JOIN _bb_legacy_backfill_379_teams t ON t.team_id = ps.team_id
  WHERE ps.stat_type = 'game'
  GROUP BY ps.team_id, ps.session_date
  HAVING NOT EXISTS (
    -- Defensive: never mint a second game row for a team+date that already
    -- has one (e.g. a scheduled-but-not-yet-played game from the Games UI).
    SELECT 1 FROM public.baseball_games bg
    WHERE bg.team_id = ps.team_id AND bg.game_date = ps.session_date
  )
),
hashed AS (
  SELECT
    g.team_id, g.session_date, g.opponent_name,
    substring(
      public.digest(
        'baseball-legacy-backfill-379:box-game:' || g.team_id::text || ':' || g.session_date::text,
        'sha1'
      )
      FROM 1 FOR 16
    ) AS raw16
  FROM game_groups g
),
versioned AS (
  SELECT team_id, session_date, opponent_name,
    set_byte(raw16, 6, (get_byte(raw16, 6) & 15) | 80) AS b1  -- version nibble -> 0x5
  FROM hashed
),
varianted AS (
  SELECT team_id, session_date, opponent_name,
    set_byte(
      b1, 8,
      ((((get_byte(b1, 8) >> 4) & 3) | 8) << 4) | (get_byte(b1, 8) & 15)  -- variant bits -> 10xx
    ) AS b2
  FROM versioned
),
hexed AS (
  SELECT team_id, session_date, opponent_name, encode(b2, 'hex') AS hx
  FROM varianted
)
SELECT
  team_id, session_date, opponent_name,
  (
    substring(hx FROM 1 FOR 8) || '-' || substring(hx FROM 9 FOR 4) || '-' ||
    substring(hx FROM 13 FOR 4) || '-' || substring(hx FROM 17 FOR 4) || '-' ||
    substring(hx FROM 21 FOR 12)
  )::uuid AS game_id
FROM hexed;

INSERT INTO public.baseball_games (
  id, team_id, game_date, game_type, opponent_name, status, notes
)
SELECT
  g.game_id,
  g.team_id,
  g.session_date,
  'game',
  g.opponent_name,
  'completed',
  'Backfilled by #379 one-time legacy stats backfill from baseball_player_stats '
    || '(copy-only; legacy rows untouched). Deterministic id — see '
    || 'docs/baseball/legacy-backfill-runbook.md for rollback.'
FROM _bb_legacy_backfill_379_games g
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Step 2 — batting lines. One per (game, player); dedupe via ROW_NUMBER when
-- the legacy table somehow has >1 'game' row for the same player+team+date.
-- ----------------------------------------------------------------------------
WITH candidates AS (
  SELECT ps.*, g.game_id
  FROM public.baseball_player_stats ps
  JOIN _bb_legacy_backfill_379_games g
    ON g.team_id = ps.team_id AND g.session_date = ps.session_date
  WHERE ps.stat_type = 'game'
),
ranked AS (
  SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.game_id, c.player_id ORDER BY c.id) AS rn
  FROM candidates c
),
one_per_player AS (
  SELECT * FROM ranked WHERE rn = 1
),
norm AS (
  SELECT
    o.game_id, o.player_id, o.team_id,
    COALESCE(o.at_bats, 0)::int AS ab,
    COALESCE(o.hits, 0)::int AS h,
    COALESCE(o.doubles, 0)::int AS doubles,
    COALESCE(o.triples, 0)::int AS triples,
    COALESCE(o.home_runs, 0)::int AS hr,
    COALESCE(o.rbis, 0)::int AS rbi,
    COALESCE(o.walks, 0)::int AS bb,
    COALESCE(o.strikeouts, 0)::int AS k,
    COALESCE(o.stolen_bases, 0)::int AS sb,
    COALESCE(o.caught_stealing, 0)::int AS cs,
    COALESCE(o.hit_by_pitch, 0)::int AS hbp,
    COALESCE(o.sacrifice_bunts, 0)::int AS sac,
    COALESCE(o.sacrifice_flies, 0)::int AS sf
  FROM one_per_player o
),
hashed AS (
  SELECT n.*,
    substring(
      public.digest(
        'baseball-legacy-backfill-379:box-bat:' || n.game_id::text || ':' || n.player_id::text,
        'sha1'
      )
      FROM 1 FOR 16
    ) AS raw16
  FROM norm n
),
versioned AS (
  SELECT *, set_byte(raw16, 6, (get_byte(raw16, 6) & 15) | 80) AS b1 FROM hashed
),
varianted AS (
  SELECT *,
    set_byte(b1, 8, ((((get_byte(b1, 8) >> 4) & 3) | 8) << 4) | (get_byte(b1, 8) & 15)) AS b2
  FROM versioned
),
ided AS (
  SELECT *,
    (
      substring(hx FROM 1 FOR 8) || '-' || substring(hx FROM 9 FOR 4) || '-' ||
      substring(hx FROM 13 FOR 4) || '-' || substring(hx FROM 17 FOR 4) || '-' ||
      substring(hx FROM 21 FOR 12)
    )::uuid AS bat_id
  FROM (SELECT *, encode(b2, 'hex') AS hx FROM varianted) e
),
rated AS (
  -- Rate formulas mirror src/app/baseball/actions/games.ts's computeBattingRates()
  -- exactly (same ab==0 short-circuit to NULL, same singles/slg/obp/ops math).
  SELECT
    bat_id, game_id, player_id, team_id, ab, h, doubles, triples, hr, rbi, bb, k, sb, cs, hbp, sac, sf,
    CASE WHEN ab > 0 THEN ROUND(h::numeric / ab, 3) END AS avg,
    CASE WHEN (ab + bb + hbp + sf) > 0
      THEN ROUND((h + bb + hbp)::numeric / (ab + bb + hbp + sf), 3)
    END AS obp,
    CASE WHEN ab > 0
      THEN ROUND(((h - doubles - triples - hr) + 2 * doubles + 3 * triples + 4 * hr)::numeric / ab, 3)
    END AS slg
  FROM ided
),
final AS (
  SELECT r.*, CASE WHEN r.obp IS NOT NULL AND r.slg IS NOT NULL THEN ROUND(r.obp + r.slg, 3) END AS ops
  FROM rated r
)
INSERT INTO public.baseball_box_score_batting (
  id, game_id, player_id, team_id,
  ab, r, h, doubles, triples, hr, rbi, bb, k, sb, cs, hbp, sac, sf, lob, batting_order,
  avg, obp, slg, ops
)
SELECT
  bat_id, game_id, player_id, team_id,
  ab,
  0,     -- r (runs scored): no legacy column — honestly 0, not fabricated
  h, doubles, triples, hr, rbi, bb, k, sb, cs, hbp, sac, sf,
  0,     -- lob: no legacy column (CSV-import-only ephemeral field, never persisted)
  NULL,  -- batting_order: no legacy column
  avg, obp, slg, ops
FROM final
ON CONFLICT (game_id, player_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Step 3 — pitching lines. Only legacy rows that actually recorded innings
-- pitched (session.innings_pitched > 0), same dedupe pattern as batting.
-- ----------------------------------------------------------------------------
WITH candidates AS (
  SELECT ps.*, g.game_id
  FROM public.baseball_player_stats ps
  JOIN _bb_legacy_backfill_379_games g
    ON g.team_id = ps.team_id AND g.session_date = ps.session_date
  WHERE ps.stat_type = 'game'
    AND ps.innings_pitched IS NOT NULL
    AND ps.innings_pitched > 0
),
ranked AS (
  SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.game_id, c.player_id ORDER BY c.id) AS rn
  FROM candidates c
),
one_per_player AS (
  SELECT * FROM ranked WHERE rn = 1
),
norm AS (
  SELECT
    o.game_id, o.player_id, o.team_id,
    o.innings_pitched AS ip,
    COALESCE(o.hits_allowed, 0)::int AS h,
    COALESCE(o.runs_allowed, 0)::int AS r,
    COALESCE(o.earned_runs, 0)::int AS er,
    COALESCE(o.walks_allowed, 0)::int AS bb,
    COALESCE(o.strikeouts_thrown, 0)::int AS k,
    o.pitches_thrown AS pitch_count,
    o.strikes_thrown AS strikes
  FROM one_per_player o
),
hashed AS (
  SELECT n.*,
    substring(
      public.digest(
        'baseball-legacy-backfill-379:box-pit:' || n.game_id::text || ':' || n.player_id::text,
        'sha1'
      )
      FROM 1 FOR 16
    ) AS raw16
  FROM norm n
),
versioned AS (
  SELECT *, set_byte(raw16, 6, (get_byte(raw16, 6) & 15) | 80) AS b1 FROM hashed
),
varianted AS (
  SELECT *,
    set_byte(b1, 8, ((((get_byte(b1, 8) >> 4) & 3) | 8) << 4) | (get_byte(b1, 8) & 15)) AS b2
  FROM versioned
),
ided AS (
  SELECT *,
    (
      substring(hx FROM 1 FOR 8) || '-' || substring(hx FROM 9 FOR 4) || '-' ||
      substring(hx FROM 13 FOR 4) || '-' || substring(hx FROM 17 FOR 4) || '-' ||
      substring(hx FROM 21 FOR 12)
    )::uuid AS pit_id
  FROM (SELECT *, encode(b2, 'hex') AS hx FROM varianted) e
),
outsed AS (
  -- OUTS-based conversion of the X.1/X.2 innings-pitched notation — mirrors
  -- src/lib/baseball/innings.ts's ipToOuts()/ipToInnings() EXACTLY (tenths
  -- digit = outs, not a base-10 fraction). Naive `ip / 1.0` division here
  -- would silently corrupt every rate stat for any partial-inning row.
  SELECT *,
    (trunc(ip)::int * 3 + round((ip - trunc(ip)) * 10)::int) AS outs
  FROM ided
),
rated AS (
  -- era/whip/k9/bb9 formulas mirror computePitchingRates() exactly.
  SELECT
    pit_id, game_id, player_id, team_id, ip, h, r, er, bb, k, pitch_count, strikes, outs,
    CASE WHEN outs > 0 THEN ROUND(9.0 * er / (outs / 3.0), 2) END AS era,
    CASE WHEN outs > 0 THEN ROUND((bb + h)::numeric / (outs / 3.0), 3) END AS whip,
    CASE WHEN outs > 0 THEN ROUND(9.0 * k / (outs / 3.0), 2) END AS k9,
    CASE WHEN outs > 0 THEN ROUND(9.0 * bb / (outs / 3.0), 2) END AS bb9
  FROM outsed
)
INSERT INTO public.baseball_box_score_pitching (
  id, game_id, player_id, team_id, ip, h, r, er, bb, k, hr, pitch_count, strikes, result,
  era, whip, k9, bb9
)
SELECT
  pit_id, game_id, player_id, team_id, ip, h, r, er, bb, k,
  0,     -- hr (home runs allowed): no legacy column — honestly 0, not fabricated
  pitch_count, strikes,
  NULL,  -- result (W/L/S/H/BS/ND): no legacy column, decision unknown
  era, whip, k9, bb9
FROM rated
ON CONFLICT (game_id, player_id) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION — run these by hand (or via mcp__supabase__execute_sql) BEFORE
-- and AFTER applying. None of this runs as part of the migration itself.
-- =============================================================================

-- ---- BEFORE: preview which teams/rows this migration will touch ----
-- SELECT
--   ps.team_id,
--   COUNT(*) FILTER (WHERE ps.stat_type = 'game') AS legacy_game_rows,
--   COUNT(DISTINCT ps.session_date) FILTER (WHERE ps.stat_type = 'game') AS legacy_game_dates
-- FROM public.baseball_player_stats ps
-- WHERE ps.stat_type = 'game'
--   AND NOT EXISTS (SELECT 1 FROM public.baseball_box_score_batting bsb WHERE bsb.team_id = ps.team_id)
--   AND NOT EXISTS (SELECT 1 FROM public.baseball_box_score_pitching bsp WHERE bsp.team_id = ps.team_id)
-- GROUP BY ps.team_id
-- ORDER BY legacy_game_rows DESC;

-- ---- AFTER: row-count parity per team, legacy vs box-score ----
-- Distinct (team, date) game-slots: legacy vs synthesized baseball_games.
-- (Counts should match UNLESS the "skip if a game already exists that date"
-- defensive guard fired for some dates — check baseball_games.notes for the
-- '#379 one-time legacy stats backfill' tag to see which games are ours.)
-- WITH legacy_dates AS (
--   SELECT team_id, COUNT(DISTINCT session_date) AS n
--   FROM public.baseball_player_stats
--   WHERE stat_type = 'game'
--   GROUP BY team_id
-- ),
-- backfilled_games AS (
--   SELECT team_id, COUNT(*) AS n
--   FROM public.baseball_games
--   WHERE notes LIKE 'Backfilled by #379 one-time legacy stats backfill%'
--   GROUP BY team_id
-- )
-- SELECT ld.team_id, ld.n AS legacy_game_dates, COALESCE(bg.n, 0) AS backfilled_games
-- FROM legacy_dates ld
-- LEFT JOIN backfilled_games bg ON bg.team_id = ld.team_id
-- ORDER BY ld.team_id;

-- Per-player batting/pitching row parity for a specific team (swap in a real id):
-- SELECT
--   (SELECT COUNT(*) FROM public.baseball_player_stats
--     WHERE team_id = '00000000-0000-0000-0000-000000000000' AND stat_type = 'game') AS legacy_game_rows,
--   (SELECT COUNT(*) FROM public.baseball_box_score_batting bsb
--     JOIN public.baseball_games g ON g.id = bsb.game_id
--     WHERE bsb.team_id = '00000000-0000-0000-0000-000000000000'
--       AND g.notes LIKE 'Backfilled by #379 one-time legacy stats backfill%') AS backfilled_batting_rows,
--   (SELECT COUNT(*) FROM public.baseball_box_score_pitching bsp
--     JOIN public.baseball_games g ON g.id = bsp.game_id
--     WHERE bsp.team_id = '00000000-0000-0000-0000-000000000000'
--       AND g.notes LIKE 'Backfilled by #379 one-time legacy stats backfill%') AS backfilled_pitching_rows;
-- (backfilled_batting_rows should equal legacy_game_rows unless duplicate
-- team+date+player legacy rows existed — see KNOWN LIMITATIONS above.
-- backfilled_pitching_rows will be <= legacy_game_rows: only rows with
-- innings_pitched > 0 get a pitching line.)
-- =============================================================================
