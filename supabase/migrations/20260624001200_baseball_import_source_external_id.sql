-- ============================================================================
-- 20260624001200_baseball_import_source_external_id.sql
--
-- duplicate_resolution_v2.md: "The same file can be imported twice. Import runs
-- must DETECT EXISTING SOURCE ROWS and SHOW create/update/skip decisions before
-- commit."
--
-- The duplicate verdict keys a source row by a STABLE identity — "external event
-- id + player + grain", not merely session_date + stat_type. For that identity to
-- survive across re-imports, the external id the row carried must be STAMPED on
-- the committed stat row, so a later import of the same file resolves the same row
-- to the same record even if the player match or the date drifts. Before this,
-- the external id lived only in baseball_player_external_ids (a player-level map),
-- never on the stat row, so two distinct same-date lines for one player (e.g. two
-- GameChanger games on 2026-04-12) could not be told apart at commit.
--
-- NOTES
--   * ADDITIVE ONLY (ADD COLUMN IF NOT EXISTS). Safe on a live DB shared with
--     GolfHelm. No data backfill, no destructive change.
--   * NOT APPLIED by this agent (migrations are authored as .sql; the live apply
--     is run separately). The action writes this column via the LooseClient,
--     matching the existing source_match_tier / source_trust_level pattern.
--   * NULL = a row whose source carried no external id (the common box-score
--     case); the verdict falls back to the player + grain natural key.
-- ============================================================================

ALTER TABLE public.baseball_player_stats
  ADD COLUMN IF NOT EXISTS source_external_id text;

COMMENT ON COLUMN public.baseball_player_stats.source_external_id IS
  'The external source row/event id this imported stat line was committed from (duplicate_resolution_v2.md stable identity = external id + player + grain). NULL when the source carried no id. Used to resolve the same line across re-imports of the same file.';

-- Re-import duplicate detection looks rows up by (team, stat_type, session_date)
-- and then by external id; index the external id per team so the verdict pass is
-- cheap even on large stat tables.
CREATE INDEX IF NOT EXISTS idx_baseball_player_stats_source_external_id
  ON public.baseball_player_stats (team_id, source_external_id)
  WHERE source_external_id IS NOT NULL;
