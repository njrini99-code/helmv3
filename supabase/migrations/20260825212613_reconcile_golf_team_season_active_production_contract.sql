-- LOCAL-ONLY. Production has this required, true-by-default lifecycle flag and the
-- application reads it from CoachHelm and Helm Bridge/admin paths. The column
-- was not reproducible from the checked-in local migration chain, making local
-- integration testing diverge from the deployed contract.
--
-- This is forward-only and idempotent: it captures the already-observed
-- production contract without changing production in this audit.
ALTER TABLE public.golf_teams
ADD COLUMN IF NOT EXISTS season_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.golf_teams.season_active IS
'Whether CoachHelm seasonal jobs should treat the team as active; '
'defaults true.';
