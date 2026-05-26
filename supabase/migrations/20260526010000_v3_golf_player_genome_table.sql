-- W33-pt1 — golf_player_genome table + RLS.
--
-- One purpose: per-player 80-dim vector store. vector is a jsonb
-- object keyed by dimension id (e.g. "miss_left_bias") → value (number,
-- string, or null per dimension type). rounds_basis tracks how many
-- completed rounds fed the latest compute so the UI can show progress.
--
-- One row per player, upserted nightly by the orchestrator. RLS: the
-- player can read their own row + their team coaches can read it.
--
-- VERIFIED 2026-05-26 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_player_genome')::text;
--   -> null (safe to create)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_player_genome;

CREATE TABLE IF NOT EXISTS public.golf_player_genome (
  player_id     uuid        PRIMARY KEY REFERENCES public.golf_players(id) ON DELETE CASCADE,
  vector        jsonb       NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  rounds_basis  int         NOT NULL CHECK (rounds_basis >= 0)
);

COMMENT ON TABLE public.golf_player_genome IS
  'v3 W33 per-player 80-dim genome vector. jsonb keyed by dimension_id. Computed nightly. rounds_basis lets the UI show "8 of 10 dims unlocked" progress states.';

-- Coach reads use a team membership join; we filter by player_id but
-- need fast lookups across many players too (for /compare).
CREATE INDEX IF NOT EXISTS golf_player_genome_computed_idx
  ON public.golf_player_genome(computed_at DESC);

ALTER TABLE public.golf_player_genome ENABLE ROW LEVEL SECURITY;

-- Player can read their own row.
DROP POLICY IF EXISTS genome_player_read ON public.golf_player_genome;
CREATE POLICY genome_player_read
  ON public.golf_player_genome
  FOR SELECT
  TO authenticated
  USING (player_id = public.current_player_id());

-- Team coaches can read all genomes for their team's active players.
DROP POLICY IF EXISTS genome_coach_read ON public.golf_player_genome;
CREATE POLICY genome_coach_read
  ON public.golf_player_genome
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members tm
      WHERE tm.player_id = golf_player_genome.player_id
        AND tm.status = 'active'
        AND public.is_team_coach(tm.team_id)
    )
  );
