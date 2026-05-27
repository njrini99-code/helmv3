-- v3 Wave 11 — golf_player_standing table
--
-- Stores per-(player, metric) standing snapshots. Powers every StandingBar
-- render (W13+ adoption waves) and the counterfactual W17. Each row is
-- the answer to "where does this player stand vs their team vs PGA Tour
-- on metric X?"
--
-- The data here is computed by the standing-refresh cron (nightly,
-- shipped alongside this migration). Initial backfill ships in W12 per
-- the backfill rule.
--
-- Schema mirrors master plan Part VII.2. Composite PK (player_id,
-- metric_id) means one row per player-metric pair; the cron upserts on
-- every refresh.
--
-- Cold-start handling (master plan Part VII.3): when team has <5 players
-- with >=5 rounds, team marker is omitted at render time but the row
-- still writes (with team_n = 0 or low count). pga_value is NOT NULL —
-- if no PGA standard exists for the metric (e.g. putt-miss-bias), the
-- cron does not write a row for that metric. Render gracefully degrades.
--
-- VERIFIED 2026-05-24 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT to_regclass('public.golf_player_standing')::text;
--   -> null (safe to create)
--
--   FK targets: golf_players (existing), golf_metrics (created W9-pt2).
--   Dry-run of W9-pt2 + W10 + W11 chain confirms FKs resolve.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_player_standing;
--   (Safe pre-W12 — no FK references target this table.)

CREATE TABLE IF NOT EXISTS public.golf_player_standing (
  player_id    uuid    NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  metric_id    text    NOT NULL REFERENCES public.golf_metrics(metric_id) ON DELETE RESTRICT,

  player_value numeric NOT NULL,

  team_avg     numeric,
  team_n       int     NOT NULL DEFAULT 0,
  team_pct     numeric,

  level_avg    numeric,
  level_n      int     NOT NULL DEFAULT 0,
  level_pct    numeric,

  pga_value    numeric NOT NULL,
  pga_delta    numeric,

  computed_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (player_id, metric_id)
);

COMMENT ON TABLE public.golf_player_standing IS
  'v3 standing snapshots — one row per (player_id, metric_id). Computed nightly by /api/cron/v3/standing-refresh. Powers every StandingBar render plus W17 counterfactuals. pga_value NOT NULL — metric must have a PGA baseline to land here.';

COMMENT ON COLUMN public.golf_player_standing.team_pct IS
  'Player percentile (0-100) within the team for this metric. Computed via SQL PERCENT_RANK() OVER (PARTITION BY team_id ORDER BY player_value [ASC|DESC depending on metric direction]).';

COMMENT ON COLUMN public.golf_player_standing.team_n IS
  'Number of teammates contributing to team_avg / team_pct. When < 5, StandingBar omits the team marker (cold-start rule per master plan Part VII.3). Row still writes for the player vs PGA comparison.';

COMMENT ON COLUMN public.golf_player_standing.pga_delta IS
  'Signed delta: player_value - pga_value. Sign meaning depends on metric.direction in golf_metrics — consumers should join to determine "better" vs "worse". W17 counterfactual reads this to compute strokes-gained-if-closed.';

CREATE INDEX IF NOT EXISTS idx_standing_team_metric
  ON public.golf_player_standing(metric_id, team_pct)
  INCLUDE (player_id);

CREATE INDEX IF NOT EXISTS idx_standing_computed_at
  ON public.golf_player_standing(computed_at DESC);

-- RLS: players read their own; coaches read any player on their team.
ALTER TABLE public.golf_player_standing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_player_standing_player_read ON public.golf_player_standing;
CREATE POLICY golf_player_standing_player_read
  ON public.golf_player_standing
  FOR SELECT
  TO authenticated
  USING (player_id = public.current_player_id());

DROP POLICY IF EXISTS golf_player_standing_coach_read ON public.golf_player_standing;
CREATE POLICY golf_player_standing_coach_read
  ON public.golf_player_standing
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.golf_team_members m
      WHERE m.player_id = golf_player_standing.player_id
        AND public.is_team_coach(m.team_id)
    )
  );

-- No INSERT/UPDATE policies for authenticated — cron uses service_role.
