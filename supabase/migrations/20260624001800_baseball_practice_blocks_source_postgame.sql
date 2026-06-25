-- =============================================================================
-- 20260624001800_baseball_practice_blocks_source_postgame.sql
--
-- Close the Postgame -> Recommended-practice-focus loop.
--
-- The Postgame Action Review surfaces "Recommended practice focus" candidates
-- whose subtitle promises "edit and publish before assigning" — but before this
-- migration there was NO path from a postgame candidate into the practice
-- planner. The signals path already materializes a practice block
-- (baseball_practice_blocks.source_signal_id, migration 0230); the postgame
-- path needs the symmetric provenance column so a block converted from a
-- POSTGAME REVIEW ITEM (not a signal, not an insight) round-trips back to the
-- originating item.
--
-- ADDITIVE ONLY. ALTER ... ADD COLUMN IF NOT EXISTS + a lookup index. Nullable
-- (a hand-built or signal/insight-born block has no postgame item). NOT applied
-- to any DB by an agent — this is a .sql file only.
-- =============================================================================

-- baseball_practice_blocks already carries source_reason + source_insight_id
-- (migration 0200) and source_signal_id (migration 0230). Add
-- source_postgame_item_id so a block converted from a POSTGAME REVIEW ITEM
-- round-trips to the originating item too. ON DELETE SET NULL: deleting the
-- review item (or its parent review) must never cascade-destroy a real, possibly
-- already-scheduled practice block.
ALTER TABLE public.baseball_practice_blocks
  ADD COLUMN IF NOT EXISTS source_postgame_item_id uuid
    REFERENCES public.baseball_postgame_review_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS baseball_practice_blocks_source_postgame_item_idx
  ON public.baseball_practice_blocks (source_postgame_item_id);

-- =============================================================================
-- END — ADDITIVE. NOT applied to any DB.
-- =============================================================================
