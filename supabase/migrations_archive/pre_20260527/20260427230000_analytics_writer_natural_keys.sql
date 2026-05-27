-- Unique indexes on the natural keys for the two analytics rollup tables
-- so the new writers (src/lib/coachhelm/v2/analytics/) can move from
-- delete-then-insert to upsert. Both are additive — no existing rows to
-- deduplicate (tables were empty until the new writers landed in this
-- same change set).

CREATE UNIQUE INDEX IF NOT EXISTS golf_insight_effectiveness_natural_key
  ON public.golf_insight_effectiveness (team_id, insight_type, period_start, period_end);

CREATE UNIQUE INDEX IF NOT EXISTS golf_prediction_model_performance_natural_key
  ON public.golf_prediction_model_performance (team_id, model_type, period_start, period_end);

COMMENT ON INDEX public.golf_insight_effectiveness_natural_key IS
  'Daily rollup natural key written by src/lib/coachhelm/v2/analytics/effectiveness-writer.ts';
COMMENT ON INDEX public.golf_prediction_model_performance_natural_key IS
  'Rolling 30d snapshot natural key written by src/lib/coachhelm/v2/analytics/prediction-performance-writer.ts';
