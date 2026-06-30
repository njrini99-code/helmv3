-- #418: college players cannot have recruiting_activated=true

UPDATE public.baseball_players
SET recruiting_activated = false
WHERE player_type = 'college'
  AND recruiting_activated = true;

ALTER TABLE public.baseball_players
  DROP CONSTRAINT IF EXISTS baseball_players_college_recruiting_check;

ALTER TABLE public.baseball_players
  ADD CONSTRAINT baseball_players_college_recruiting_check
  CHECK (NOT (player_type = 'college' AND recruiting_activated = true));
