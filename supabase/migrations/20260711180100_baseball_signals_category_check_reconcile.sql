-- #bb-signals schema-drift reconcile: baseball_signals category CHECK.
--
-- Same drift family as 20260711180000 (postgame) and
-- 20260710020000 (settings audit log): baseball_signals pre-existed
-- 20260624000092's create-if-not-exists under an OLDER schema. That
-- migration reconciled the COLUMN set via ADD COLUMN IF NOT EXISTS (and
-- 20260701010000 later fixed dedupe/disposition), but nobody reconciled the
-- old table's category CHECK:
--
--   live:     CHECK (category IN ('performance','health','academics',
--                                 'roster','ops','recruiting'))
--   the code: BaseballSignalCategory (src/lib/types/baseball-signals.ts) —
--             the rule engine (src/lib/baseball/operational-rule-engine.ts)
--             emits 'operations' and 'practice', neither of which the live
--             check allows.
--
-- Confirmed live 2026-07-11 (post-deploy error triage): every
-- runOperationalSignalDetection upsert fails with 23514
-- "new row for relation baseball_signals violates check constraint
-- baseball_signals_category_check" (Postgres logs 17:47–17:48 UTC; surfaced
-- as admin_events fingerprint 89d1eb39, "Could not save operational
-- signals"). The Signal Inbox therefore never populates — same visible
-- symptom the dedupe-constraint fix (20260701010000) closed for a different
-- root cause. `select count(*) from baseball_signals` = 0 rows.
--
-- Replace the check with the full BaseballSignalCategory vocabulary. On a
-- fresh shadow DB, 20260624000092's CREATE declares category with a DEFAULT
-- and NO check, so DROP IF EXISTS no-ops and the ADD simply aligns both
-- worlds on the same named constraint. The old vocabulary's values
-- ('performance','health','ops') are intentionally NOT carried over — no
-- rows exist, and the type union is the single source of truth. Keep this
-- list in sync with BaseballSignalCategory.
ALTER TABLE public.baseball_signals
  DROP CONSTRAINT IF EXISTS baseball_signals_category_check;

ALTER TABLE public.baseball_signals
  ADD CONSTRAINT baseball_signals_category_check
  CHECK (category IN (
    'hitting','pitching','catching','defense','baserunning','strength',
    'readiness','workload','practice','academics','operations','recruiting',
    'import_quality','video_evidence','roster'
  ));
