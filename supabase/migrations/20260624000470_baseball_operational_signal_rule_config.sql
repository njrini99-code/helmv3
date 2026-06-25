-- =============================================================================
-- BaseballHelm — Operational Signal Rule Engine: data-driven config column
-- =============================================================================
-- Packet: signal-inbox DEEPENING.
--
-- The operational rule engine (src/lib/baseball/operational-rule-engine.ts +
-- src/app/baseball/actions/operational-signals.ts) emits source_kind:'system'
-- signals for the deterministic operations/roster/practice/stats/recruiting
-- conditions V5 System 1 enumerates. Two of its rules are CONFIGURABLE per the
-- spec's "Signal rules should be data-driven later" requirement:
--
--   * document_missing — fires only against a program's REQUIRED-document
--     checklist (never a fabricated guess). The checklist lives here.
--   * ai_output_stale — already reads the existing
--     baseball_program_settings.ai_stale_after_days column (no change needed).
--
-- This migration adds ONLY the required-document checklist column. Everything
-- else the rule engine needs already exists (events+acks, tasks, documents,
-- travel, team_members, players, games, postgame_reviews, practices+blocks,
-- import runs, coach_insights). The rule engine + action degrade gracefully when
-- this column is absent (the document_missing rule simply produces nothing), so
-- this migration is purely additive and safe to apply at any time.
--
-- GUARANTEES (CLAUDE.md hard rules):
--   * ADDITIVE ONLY: ADD COLUMN IF NOT EXISTS. No DROP, no destructive update,
--     no rename. No RLS change (inherits baseball_program_settings policies).
--   * No GRANT to anon. NOT applied to any database (shared prod DB); the action
--     layer reads it through the established LooseClient cast under RLS.
-- =============================================================================

-- Required-document checklist — the categories a program EXPECTS to have on
-- file. The document_missing rule fires one 'info' signal per category in this
-- list that has no matching baseball_documents row. Default empty so a program
-- that has not configured a checklist gets ZERO false "missing document" alerts
-- (honesty floor: never fabricate a requirement the program never set).
ALTER TABLE public.baseball_program_settings
  ADD COLUMN IF NOT EXISTS required_document_categories text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.baseball_program_settings.required_document_categories IS
  'Document categories the program expects on file; drives the operational rule '
  'engine document_missing signal. Empty = no checklist configured (no alerts).';
