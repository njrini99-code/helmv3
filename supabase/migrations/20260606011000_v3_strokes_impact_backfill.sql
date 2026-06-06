-- v3 strokes_impact backfill (audit EC-1 / H2) — REQUIRES DEPLOY + HUMAN APPLY.
--
-- Why: `generator-base.ts:203-224` stamps evidence.strokes_impact from the
-- live counterfactual, but the deployed cron still runs pre-fix code, so 89 of
-- 194 v3 insights carry a POSITIVE counterfactual yet strokes_impact = 0 → they
-- rank 0 and the highest-leverage real leaks are buried while a stale v2 phantom
-- (handled by 20260606020000_v3_expire_stale_v2_scoring.sql) sits on top.
--
-- This is a ONE-TIME data backfill, NOT a source fix. Once the branch is
-- deployed the cron writes strokes_impact correctly on every regen; this only
-- heals the rows that already shipped with 0. It will NOT self-heal — apply it
-- by hand AFTER the deploy that ships generator-base.ts:203-224.
--
-- Scope (mirrors the read path's v3 filter and the engine's own rule):
--   • engine_version = 'v3' (modern rows only — never touch v2)
--   • NOT dismissed (the read path hides dismissed rows; don't rewrite them)
--   • current strokes_impact = 0 (only fill the gaps; never clobber the 1 row
--     already stamped, nor any future correctly-stamped row)
--   • a LIVE counterfactual: counterfactual.suppressed IS NOT true AND
--     counterfactual.strokes_saved_per_round > 0 (the audit's "suppressed=false"
--     non-fabricated source value)
--
-- Idempotent: re-running is a no-op (the strokes_impact = 0 predicate stops
-- re-matching once filled). jsonb_set writes a numeric scalar so downstream
-- (evidence->>'strokes_impact')::numeric reads cleanly.

UPDATE "public"."golf_coach_insights" AS i
SET evidence = jsonb_set(
      i.evidence,
      '{strokes_impact}',
      to_jsonb((i.evidence #>> '{counterfactual,strokes_saved_per_round}')::numeric),
      true
    )
WHERE i.engine_version = 'v3'
  AND i.dismissed IS NOT TRUE
  AND i.evidence IS NOT NULL
  AND (i.evidence ->> 'strokes_impact')::numeric = 0
  AND (i.evidence #> '{counterfactual}') IS NOT NULL
  AND (i.evidence #>> '{counterfactual,suppressed}') IS DISTINCT FROM 'true'
  AND (i.evidence #>> '{counterfactual,strokes_saved_per_round}') ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND (i.evidence #>> '{counterfactual,strokes_saved_per_round}')::numeric > 0;
