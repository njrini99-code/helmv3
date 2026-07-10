-- #bb-settings schema-drift reconcile: baseball_settings_audit_log.
--
-- Same class of bug as 20260702095900_baseball_651_column_reconcile and
-- 20260703050000_baseball_651_settings_os_reconcile: 20260624000090's
-- 20260624000090's create-if-not-exists for baseball_settings_audit_log no-op'd
-- because a table with this name already existed in prod under an OLDER
-- schema — (id, team_id, changed_by, setting_key, old_value, new_value,
-- created_at) — so the intended settings-OS column set never landed here
-- either, even though 20260703050000 assumed (incorrectly) that this table
-- "did NOT pre-exist" and needed nothing.
--
-- Confirmed against LIVE information_schema.columns 2026-07-10 (feature-sweep
-- triage, bb-settings packet): the app's writeAudit()/getSettingsAuditLog()
-- (src/app/baseball/actions/program-settings.ts, and the duplicate writer in
-- team-season-settings.ts) target actor_user_id/actor_coach_id/event_type/
-- summary/before_value/after_value — none of which exist on the live table —
-- so every settings-mutation audit insert 400s silently (fire-and-forget,
-- no {error} check historically). `select count(*) from
-- baseball_settings_audit_log` = 0 rows in prod despite many real settings
-- changes having been made. Independently corroborated by generated
-- src/lib/types/database.ts (Row/Insert/Update match the drifted schema
-- exactly) and by 20260710004200_fk_covering_indexes_batch2 indexing the
-- real column `changed_by`.
--
-- Additive-only per repo convention for the shared golf+baseball prod DB:
-- add the app-expected columns alongside the existing drifted ones (changed_by/
-- setting_key/old_value/new_value are left untouched — no backfill, no drop,
-- table is empty). event_type/summary are added NULLABLE (not NOT NULL as
-- 20260624000090 originally declared) so this ALTER can never fail against a
-- drifted non-empty table, mirroring 20260703050000's provider_key/
-- display_name treatment; every writer already supplies both unconditionally.
-- Existence-guarded throughout so the CI shadow-DB replay — where
-- 20260624000090's CREATE TABLE runs against a fresh DB and creates the
-- correct schema on the first try — sees every ADD COLUMN / ADD CONSTRAINT
-- as a no-op.

ALTER TABLE public.baseball_settings_audit_log
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS actor_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS before_value jsonb,
  ADD COLUMN IF NOT EXISTS after_value jsonb;

-- Legacy drift column: relax so the new writer (which never sets
-- setting_key) cannot fail a NOT NULL it no longer supplies — without this,
-- the missing-column 400 just becomes a 23502 not-null violation on every
-- settings-audit insert once the column-name mismatch above is fixed.
-- Guarded: setting_key does not exist on a fresh (correctly-created) table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'baseball_settings_audit_log'
      AND column_name = 'setting_key' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.baseball_settings_audit_log ALTER COLUMN setting_key DROP NOT NULL;
  END IF;
END $$;

-- CHECK on event_type mirrors 20260624000090's original intent. NULL values
-- (any pre-existing drifted rows, or a future insert that omits it) satisfy
-- an IN() check, so this can never fail against existing data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_settings_audit_log_event_type_check'
  ) THEN
    ALTER TABLE public.baseball_settings_audit_log
      ADD CONSTRAINT baseball_settings_audit_log_event_type_check
      CHECK (event_type IN (
        'program_type_changed', 'role_changed', 'capability_changed',
        'visibility_changed', 'public_profile_changed', 'guardian_access_changed',
        'scout_access_changed', 'ai_settings_changed', 'import_source_changed',
        'integration_changed', 'notification_settings_changed',
        'data_retention_changed', 'demo_mode_changed', 'data_exported',
        'settings_changed'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS baseball_settings_audit_log_event_type_idx
  ON public.baseball_settings_audit_log (team_id, event_type);

-- Rollback (additive-only convention — do not DROP COLUMN on the shared prod
-- DB; table is empty today, but prefer a follow-up migration dropping just
-- the CHECK constraint above if ever needed).

-- ---------------------------------------------------------------------------
-- RLS scope reconcile (verify-round finding): the write policies on this
-- table are still the OLD `is_baseball_primary_coach(team_id)` gate —
-- 20260624000090's intended capability-scoped rewrite never landed here
-- (same silent no-op as the column drift above; confirmed live via
-- pg_policy + the absence of that migration's indexes). But writeAudit()'s
-- callers (updateProgramSettings/changeProgramType/…) are gated on the
-- BROADER `can_manage_settings` capability, which can be granted to a
-- non-primary coach — whose audit inserts would then 403 via RLS and the
-- Audit Log would silently miss their changes. Align the INSERT policy's
-- scope with the mutations it audits. Guarded on the capability helper
-- existing (it ships in 20260701002000; present in both prod and a fresh
-- replay by this point in the chain).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_settings_audit_log') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'has_baseball_staff_capability'
     ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "baseball_settings_audit_log_insert" ON public.baseball_settings_audit_log';
    EXECUTE $p$CREATE POLICY "baseball_settings_audit_log_insert" ON public.baseball_settings_audit_log
      FOR INSERT TO authenticated
      WITH CHECK (
        public.has_baseball_staff_capability(team_id, 'can_manage_settings')
        AND actor_user_id = auth.uid()
      )$p$;
  END IF;
END $$;
