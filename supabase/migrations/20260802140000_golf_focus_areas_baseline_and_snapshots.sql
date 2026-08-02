-- ============================================================================
-- Focus areas: give them the state model goals already have.
--
-- Issues #1240 (no baseline) and #1241 (no trend history).
--
-- `golf_player_focus_areas` stored a single scalar `current_value`, which the
-- auto-tracker OVERWRITES in place. Two consequences, both user-visible:
--
--   #1240 the value captured at creation was the only baseline that ever
--         existed, and it was destroyed on the first tracker pass — so the
--         progress bar could not be "distance travelled from where you
--         started" and instead fell back to `current / target`. A brand-new
--         61 -> 66 fairways area rendered "92% there" before the player had
--         swung a club, and finishing the whole objective moved it 8 points.
--
--   #1241 with no history there was nothing to trend, so every card's Trend
--         cell read "—" forever, even after the value demonstrably moved.
--
-- `golf_goals` already solves both with `baseline_value` + `snapshots`; this
-- brings focus areas onto the same shape so the two surfaces can finally share
-- one progress formula.
--
-- Additive and nullable — no existing read or write path changes meaning.
-- ============================================================================

ALTER TABLE public.golf_player_focus_areas
  ADD COLUMN IF NOT EXISTS baseline_value numeric,
  ADD COLUMN IF NOT EXISTS snapshots jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.golf_player_focus_areas.baseline_value IS
  'The measured value when tracking STARTED (stamped alongside started_at, i.e. at player acceptance for a coach-prescribed area). Immutable: the progress driver writes current_value only and must never touch this. NULL means the starting point is unknown — the UI then renders Now/Target with NO percentage rather than guessing. See issue #1240.';

COMMENT ON COLUMN public.golf_player_focus_areas.snapshots IS
  'Append-only [{date, value}] history written by the progress driver, deduped per UTC day. Mirrors golf_goals.snapshots so the card can draw a real trend instead of a permanent em dash. See issue #1241.';

-- ---------------------------------------------------------------------------
-- Backfill the baseline where — and ONLY where — we can prove what it was.
--
-- An area the tracker has never touched still holds its creation value in
-- current_value (updated_at is within a hair of created_at; these are written
-- in the same statement, so compare with a tolerance rather than for equality).
-- For anything the tracker HAS moved, the original value is genuinely gone:
-- leave baseline_value NULL and let the UI degrade honestly. Guessing here
-- would reintroduce exactly the fabricated-progress problem #1240 is about.
-- ---------------------------------------------------------------------------
UPDATE public.golf_player_focus_areas
SET baseline_value = current_value
WHERE baseline_value IS NULL
  AND current_value IS NOT NULL
  AND updated_at - created_at < interval '1 second';

-- Seed the history with that same known-good starting point, so a backfilled
-- area has one real anchor to trend from rather than starting empty.
UPDATE public.golf_player_focus_areas
SET snapshots = jsonb_build_array(
      jsonb_build_object(
        'date', to_char((started_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD'),
        'value', baseline_value
      )
    )
WHERE baseline_value IS NOT NULL
  AND started_at IS NOT NULL
  AND snapshots = '[]'::jsonb;
