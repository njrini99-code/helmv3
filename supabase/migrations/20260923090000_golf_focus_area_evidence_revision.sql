-- A8 slice 1 (addendum "collect only useful context and complete the
-- coaching action", folded into Pkg 9): capture WHICH state of a source
-- insight's evidence justified a coach's approval when a focus area is
-- created from it.
--
-- golf_coach_insights rows are updated IN PLACE on every regeneration run
-- (keyed by a stable `signature`, see supabase/migrations for the insight
-- upsert path and src/lib/coachhelm/v2/insights/upsert.ts), so
-- golf_player_focus_areas.from_insight_id is a live FK whose target's
-- confidence/evidence can silently change underneath an already-approved
-- focus area with nothing recording what was actually approved. This column
-- holds a stable fingerprint (see src/lib/coachhelm/focus-areas/
-- evidence-revision.ts's computeEvidenceRevision) of the insight's evidence
-- state at the moment of approval, so a later read can tell whether the
-- live insight still matches what was approved (A8 slice 3) without ever
-- rewriting this value.
--
-- Purely additive: nullable, no default, no backfill. Existing rows (and
-- every focus area NOT created from an insight, e.g. from a round review or
-- a manual create) stay NULL, which application code must treat as "no
-- revision recorded" rather than "matches" or "mismatches". Write is gated
-- behind config/feature-flags.yml's coachhelm_focus_area_evidence_revision
-- flag (default off) until this migration is applied in production — see
-- that flag's own purpose string. No RLS or grant changes: existing
-- golf_player_focus_areas policies already cover the whole row.

ALTER TABLE "public"."golf_player_focus_areas"
ADD COLUMN IF NOT EXISTS "evidence_revision" text;

-- ROLLBACK: ALTER TABLE public.golf_player_focus_areas DROP COLUMN evidence_revision; -- noqa: LT05

-- VERIFY: select 1 from information_schema.columns where table_schema = 'public' and table_name = 'golf_player_focus_areas' and column_name = 'evidence_revision'; -- noqa: LT05

COMMENT ON COLUMN "public"."golf_player_focus_areas"."evidence_revision"
IS 'A8 slice 1: stable fingerprint (computeEvidenceRevision, src/lib/coachhelm/focus-areas/evidence-revision.ts) of the source insight''s evidence state at focus-area-approval time. NULL = no source insight, or created before this column existed, or the write flag was off. Never rewritten after insert -- slice 3 recomputes the live insight''s fingerprint at READ time and compares against this stored value, it does not update this column.'; -- noqa: LT05
