-- OD-03 (GolfHelm UI/UX audit, 2026-09-24): a hide flag for QA / demo data.
-- AWAITING OWNER APPLY. Do not apply without the owner's go-ahead (owner
-- decision OD-03: "add the migration file, owner approves apply; deletion SQL
-- stays a proposal"). Registered as HOLD in supabase/migrations/HELD.md.
--
-- Why. Production carries QA rounds, a duplicate demo team and test
-- qualifiers (audit NUM-40 / NUM-41 / DASH-11) that surface in real players'
-- lists and in team figures. Deleting them is irreversible and was not
-- approved; flagging them lets reads leave them out.
--
-- What. Additive only: one NOT NULL boolean, default false, on four golf
-- tables, plus a partial index on the rows that ARE flagged (the rare side).
-- Every existing row reads false, so nothing changes until rows are flagged
-- AND the read paths filter on it (a follow-up change; see the audit's
-- query-site list). No RLS change: the column is covered by each table's
-- existing row policies, and no policy reads it.
--
-- ROLLBACK: drop the four columns (no data depends on them):
-- ROLLBACK:   ALTER TABLE public.golf_rounds DROP COLUMN is_test;
-- ROLLBACK:   ALTER TABLE public.golf_teams DROP COLUMN is_test;
-- ROLLBACK:   ALTER TABLE public.golf_players DROP COLUMN is_test;
-- ROLLBACK:   ALTER TABLE public.golf_qualifiers DROP COLUMN is_test;
-- VERIFY: select 1 from information_schema.columns
-- VERIFY:  where table_schema = 'public' and column_name = 'is_test'
-- VERIFY:    and table_name in ('golf_rounds', 'golf_teams',
-- VERIFY:                       'golf_players', 'golf_qualifiers')
-- VERIFY: having count(*) = 4;

ALTER TABLE public.golf_rounds
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.golf_teams
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.golf_players
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.golf_qualifiers
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.golf_rounds.is_test IS
'QA/demo row: hidden from player, team and CoachHelm reads (OD-03).';
COMMENT ON COLUMN public.golf_teams.is_test IS
'QA/demo row: hidden from player, team and CoachHelm reads (OD-03).';
COMMENT ON COLUMN public.golf_players.is_test IS
'QA/demo row: hidden from player, team and CoachHelm reads (OD-03).';
COMMENT ON COLUMN public.golf_qualifiers.is_test IS
'QA/demo row: hidden from player, team and CoachHelm reads (OD-03).';

-- The indexes are plain, not CONCURRENTLY: the apply path runs this file in
-- one transaction, where CONCURRENTLY is refused, and each ADD COLUMN above
-- already holds ACCESS EXCLUSIVE on its table until commit.

-- In-transaction build; ADD COLUMN above already locks golf_rounds.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_rounds_is_test
ON public.golf_rounds (id) WHERE is_test;

-- In-transaction build; ADD COLUMN above already locks golf_teams.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_teams_is_test
ON public.golf_teams (id) WHERE is_test;

-- In-transaction build; ADD COLUMN above already locks golf_players.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_players_is_test
ON public.golf_players (id) WHERE is_test;

-- In-transaction build; ADD COLUMN above already locks golf_qualifiers.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_qualifiers_is_test
ON public.golf_qualifiers (id) WHERE is_test;
