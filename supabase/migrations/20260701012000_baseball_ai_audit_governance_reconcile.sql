-- Reconcile baseball_ai_audit to the governance shape the engine writes/reads.
--
-- LIVE-VERIFIED drift (2026-07-01): the live public.baseball_ai_audit is an
-- orphan LLM-*telemetry* table (model_id, prompt_hash, cost_usd, token counts,
-- latency_ms, …) with 0 rows and no telemetry writer in the codebase. But the
-- app writes a *governance* audit shape (BaseballAiAuditInsert / engine-run.ts:
-- generator, model, provider, disposition, visibility, guardrails, …) and reads
-- it in ai-governance.ts (order by generated_at, update disposition/withheld_
-- reason/reviewed_by, filter by disposition). All 20 governance columns are
-- MISSING live, so every engine audit upsert 42703's — the governance-audit
-- ledger has never recorded a row. Origin: 20260624000450_baseball_ai_audit_log
-- ("NOT applied to any DB") never ran because the telemetry table pre-existed.
--
-- Additionally, the dedupe arbiter is a PARTIAL unique index
-- (team_id, output_kind, dedupe_key) WHERE dedupe_key IS NOT NULL — supabase-js's
-- bare .onConflict('team_id,output_kind,dedupe_key') can't infer a partial index,
-- so even with columns present the upsert would 42P10.
--
-- Fix (additive/idempotent; table empty so no data risk; NEVER anon):
--   1. ADD the 20 governance columns (ADD COLUMN IF NOT EXISTS) — exactly the
--      ADD-COLUMN block of the unapplied 20260624000450. Pre-existing telemetry
--      columns are untouched; the two shapes coexist on one physical table.
--   2. Replace the partial arbiter with a NON-partial unique index so the bare
--      onConflict can infer it (can't ALTER a partial index → drop+recreate;
--      NULL dedupe_key rows stay distinct, same effective behavior as the old
--      partial for real keys).

ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS generator          text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS output_table       text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS output_id          uuid;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS model              text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS provider           text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS prompt_version     text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS source_refs        jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS confidence         numeric;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS visibility         text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS desired_visibility text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS disposition        text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS withheld_reason    text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS guardrail_redacted boolean NOT NULL DEFAULT false;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS guardrail_medical  boolean NOT NULL DEFAULT false;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS guardrail_academic boolean NOT NULL DEFAULT false;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS generated_at       timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS created_by         uuid;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS reviewed_by        uuid;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS reviewed_at        timestamptz;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

DROP INDEX IF EXISTS public.baseball_ai_audit_dedupe_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS baseball_ai_audit_dedupe_uidx
  ON public.baseball_ai_audit (team_id, output_kind, dedupe_key);
