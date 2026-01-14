-- Discovery page performance indexes

CREATE INDEX IF NOT EXISTS idx_players_recruiting_active
  ON public.players(recruiting_activated)
  WHERE recruiting_activated = true;

CREATE INDEX IF NOT EXISTS idx_players_position_grad_year
  ON public.players(primary_position, grad_year);

CREATE INDEX IF NOT EXISTS idx_players_state
  ON public.players(state);

-- Only create velocity index if the column exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'player_metrics' AND column_name = 'throwing_velocity') THEN
    CREATE INDEX IF NOT EXISTS idx_player_metrics_velocity
      ON public.player_metrics(player_id, throwing_velocity)
      WHERE throwing_velocity IS NOT NULL;
  END IF;
END $$;

-- Only create exit velocity index if the column exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'player_metrics' AND column_name = 'exit_velocity') THEN
    CREATE INDEX IF NOT EXISTS idx_player_metrics_exit_velo
      ON public.player_metrics(player_id, exit_velocity)
      WHERE exit_velocity IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_players_discovery_composite
  ON public.players(recruiting_activated, primary_position, grad_year, state)
  WHERE recruiting_activated = true;
