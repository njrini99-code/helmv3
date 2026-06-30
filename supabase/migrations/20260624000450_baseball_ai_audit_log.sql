-- =============================================================================
-- 20260624000450_baseball_ai_audit_log.sql
--
-- Packet: qa-screens (AI-settings enforcement remediation)
--
-- The v4 §AI Settings AI-AUDIT ROW: every AI generation records a tamper-evident
-- audit entry (generated_at, model/provider, prompt version, source refs,
-- confidence, visibility, disposition, reviewed_by). This is the machine record
-- that proves the AI-governance toggles are LOAD-BEARING — the engine writes one
-- row per generated output describing how the policy resolved it (approved /
-- pending / withheld) and which gate fired, and the AI Settings section + audit
-- log surface it.
--
-- HONESTY / SAFETY
--   * Idempotent / additive only: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
--     EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE.
--   * RLS: staff-only read (an audit log is a staff-governance surface; a player
--     never reads it). INSERT staff-only (the engine runs under the coach's RLS
--     client). UPDATE staff-only and ONLY the review columns are meant to change
--     (the coach approval path) — enforced at the action layer. No DELETE policy
--     (append-only audit; primary-coach-only purge handled by retention, not ad
--     hoc deletes).
--   * REVOKE anon explicitly (public-schema default-grant gotcha).
--   * NOT applied to any DB. .sql only. Types hand-written in
--     src/lib/types/baseball-ai-audit.ts.
-- =============================================================================

-- =============================================================================
-- 1. Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.baseball_ai_audit (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  -- Subject context (any may be null — e.g. a team-wide signal).
  player_id          uuid REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  -- What was generated + where it landed (round-trip to the produced object).
  output_kind        text NOT NULL DEFAULT 'signal'
                       CHECK (output_kind IN ('signal','insight','brief')),
  generator          text,                         -- generator id / engine key
  dedupe_key         text,                         -- engine dedupe key (pairs to signal/insight)
  output_table       text,                         -- 'baseball_signals' | 'baseball_coach_insights'
  output_id          uuid,                         -- id of the emitted row (null when withheld)
  -- v4 AI-audit attributes.
  model              text,                         -- e.g. 'rules-engine-v10' / model id
  provider           text,                         -- e.g. 'baseballhelm-engine' / vendor
  prompt_version     text,                         -- prompt/engine version stamp
  source_refs        jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence         numeric,                      -- normalized [0,1] or null
  -- Governance outcome of THIS generation under the team's AI policy.
  visibility         text NOT NULL DEFAULT 'staff_only'
                       CHECK (visibility IN ('team','player_only','staff_only')),
  desired_visibility text
                       CHECK (desired_visibility IS NULL OR desired_visibility IN ('team','player_only','staff_only')),
  disposition        text NOT NULL DEFAULT 'approved'
                       CHECK (disposition IN ('approved','pending','withheld')),
  withheld_reason    text
                       CHECK (withheld_reason IS NULL OR withheld_reason IN (
                         'ai_disabled','staff_ai_disabled','player_visible_disabled',
                         'below_confidence','missing_source_refs','awaiting_approval')),
  -- Guardrail audit: did a content guardrail redact this output?
  guardrail_redacted boolean NOT NULL DEFAULT false,
  guardrail_medical  boolean NOT NULL DEFAULT false,
  guardrail_academic boolean NOT NULL DEFAULT false,
  -- Review trail (the staff-approval path for player-visible AI).
  reviewed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  -- When the underlying AI output was generated.
  generated_at       timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.baseball_ai_audit ENABLE ROW LEVEL SECURITY;

-- Additive guards (partial pre-existing table).
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS player_id          uuid;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS output_kind        text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS generator          text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS dedupe_key         text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS output_table       text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS output_id          uuid;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS model              text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS provider           text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS prompt_version     text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS source_refs        jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS confidence         numeric;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS visibility         text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS desired_visibility text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS disposition        text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS withheld_reason    text;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS guardrail_redacted boolean DEFAULT false;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS guardrail_medical  boolean DEFAULT false;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS guardrail_academic boolean DEFAULT false;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS reviewed_by        uuid;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS reviewed_at        timestamptz;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS generated_at       timestamptz DEFAULT now();
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS created_by         uuid;
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS created_at         timestamptz DEFAULT now();
ALTER TABLE public.baseball_ai_audit ADD COLUMN IF NOT EXISTS updated_at         timestamptz DEFAULT now();

-- =============================================================================
-- 2. Indexes
-- =============================================================================
-- Recent-first audit feed per team (the AI Settings audit log).
CREATE INDEX IF NOT EXISTS baseball_ai_audit_team_recent_idx
  ON public.baseball_ai_audit (team_id, generated_at DESC);
-- Pending-approval queue (player-visible AI awaiting a coach).
CREATE INDEX IF NOT EXISTS baseball_ai_audit_team_disposition_idx
  ON public.baseball_ai_audit (team_id, disposition, generated_at DESC);
-- Pair an audit row to its emitted output (round-trip from a signal/insight).
CREATE INDEX IF NOT EXISTS baseball_ai_audit_output_idx
  ON public.baseball_ai_audit (output_table, output_id);
-- Re-runs UPSERT the audit row by (team, dedupe_key, kind) so a generation
-- refreshes its own audit entry instead of cloning one each run.
CREATE UNIQUE INDEX IF NOT EXISTS baseball_ai_audit_dedupe_uidx
  ON public.baseball_ai_audit (team_id, output_kind, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- =============================================================================
-- 3. RLS — staff-only governance surface
-- =============================================================================

-- SELECT: staff only. A player never reads the AI audit log.
DROP POLICY IF EXISTS "baseball_ai_audit_select" ON public.baseball_ai_audit;
CREATE POLICY "baseball_ai_audit_select" ON public.baseball_ai_audit
  FOR SELECT TO authenticated
  USING (public.is_baseball_team_staff(team_id));

-- INSERT: staff only (the engine runs under the coach's RLS client).
DROP POLICY IF EXISTS "baseball_ai_audit_insert" ON public.baseball_ai_audit;
CREATE POLICY "baseball_ai_audit_insert" ON public.baseball_ai_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.is_baseball_team_staff(team_id));

-- UPDATE: staff only (the review/approval path stamps reviewed_by/disposition).
DROP POLICY IF EXISTS "baseball_ai_audit_update" ON public.baseball_ai_audit;
CREATE POLICY "baseball_ai_audit_update" ON public.baseball_ai_audit
  FOR UPDATE TO authenticated
  USING (public.is_baseball_team_staff(team_id))
  WITH CHECK (public.is_baseball_team_staff(team_id));

-- DELETE: primary coach only (audit is append-mostly; retention, not ad-hoc).
DROP POLICY IF EXISTS "baseball_ai_audit_delete" ON public.baseball_ai_audit;
CREATE POLICY "baseball_ai_audit_delete" ON public.baseball_ai_audit
  FOR DELETE TO authenticated
  USING (public.is_baseball_primary_coach(team_id));

-- =============================================================================
-- 4. Lock down anon (public-schema default-grant gotcha).
-- =============================================================================
REVOKE ALL ON public.baseball_ai_audit FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baseball_ai_audit TO authenticated;
GRANT ALL ON public.baseball_ai_audit TO service_role;

-- =============================================================================
-- END — baseball AI audit log. ADDITIVE. NOT applied to any DB.
-- =============================================================================
