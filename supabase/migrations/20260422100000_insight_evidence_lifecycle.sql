-- Insight Quality Phase: evidence-backed insights + lifecycle + dedup + drill library
--
-- Every insight must now carry structured `evidence` (JSONB), a deterministic
-- `signature` for dedup, and a `category` for UI routing. Lifecycle state is
-- progressed by a nightly cron.
--
-- Design contract: docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md

-- 1. New columns on golf_coach_insights ----------------------------------------

ALTER TABLE public.golf_coach_insights
  ADD COLUMN IF NOT EXISTS evidence JSONB,
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT,
  ADD COLUMN IF NOT EXISTS addressed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 2. Lifecycle state check constraint -----------------------------------------

ALTER TABLE public.golf_coach_insights
  DROP CONSTRAINT IF EXISTS golf_coach_insights_lifecycle_state_check;

ALTER TABLE public.golf_coach_insights
  ADD CONSTRAINT golf_coach_insights_lifecycle_state_check
  CHECK (lifecycle_state IS NULL OR lifecycle_state IN (
    'tentative','detected','matured','addressed','resolved','archived'
  ));

-- 3. Dedup + routing indexes --------------------------------------------------
-- Partial index "created_at > now() - 30 days" requires an IMMUTABLE predicate,
-- which now() is not. Emulate via a plain composite index that the upsert
-- helper can filter by with ORDER BY created_at DESC LIMIT N.

CREATE INDEX IF NOT EXISTS idx_insights_signature_recent
  ON public.golf_coach_insights (player_id, signature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_insights_category_lifecycle
  ON public.golf_coach_insights (player_id, category, lifecycle_state);

-- 4. Drill library ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.golf_drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,                 -- matches insight category
  tags TEXT[] NOT NULL DEFAULT '{}',      -- fine-grained match: '6_10ft', 'driver_dispersion', etc.
  description TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner','intermediate','advanced')),
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drills_category ON public.golf_drills (category);
CREATE INDEX IF NOT EXISTS idx_drills_tags ON public.golf_drills USING GIN (tags);

-- 5. Insight <-> drill attachments --------------------------------------------

CREATE TABLE IF NOT EXISTS public.golf_insight_drill_attachments (
  insight_id UUID NOT NULL REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE,
  drill_id UUID NOT NULL REFERENCES public.golf_drills(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (insight_id, drill_id)
);

CREATE INDEX IF NOT EXISTS idx_drill_attachments_insight
  ON public.golf_insight_drill_attachments (insight_id, rank);

-- 6. RLS ----------------------------------------------------------------------
-- Drill library is global reference data: readable by any authenticated user,
-- writable only by service role (seeding + future admin tools).

ALTER TABLE public.golf_drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_insight_drill_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drills_read_all_authenticated ON public.golf_drills;
CREATE POLICY drills_read_all_authenticated ON public.golf_drills
  FOR SELECT TO authenticated
  USING (true);

-- Attachments are readable by anyone who can see the parent insight. The
-- insight table already enforces player/coach/team visibility, so we gate
-- SELECT via EXISTS against it.
DROP POLICY IF EXISTS drill_attachments_read_via_insight ON public.golf_insight_drill_attachments;
CREATE POLICY drill_attachments_read_via_insight ON public.golf_insight_drill_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_coach_insights gci
      WHERE gci.id = golf_insight_drill_attachments.insight_id
    )
  );
