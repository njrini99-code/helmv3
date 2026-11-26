-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- HM2 (Ask lane, AK8). Written 4 Nov 2026 in the wiring pass from 02-PLAN §11 and §16, which named this file
-- but never wrote it. Name kept as planned (20261101090100).
--
-- What:
--   1. golf_coachhelm_chat_conversations.tone text NULL, one of straight, detailed, team_talk (NULL reads as straight).
--      The table's policy chat_conversations_coach_only (baseline 20260527000000, FOR ALL, coach_id = current_coach_id())
--      already scopes the update to the owning coach; no policy change.
--   2. golf_coachhelm_coach_facts: standing facts a coach typed ("Practice runs 2h 30m on weekdays"), 1 to 280
--      characters, coach-written only. Nothing the model infers is ever written here (no model tool writes it; the only
--      writer is the server action saveCoachFact, new in AK8).
-- RLS: enabled, one policy per command, all coach_id = current_coach_id() and the team must be one the coach is on
-- (is_golf_team_coach(team_id)). anon revoked; authenticated gets SELECT, INSERT, UPDATE, DELETE (a fact is deleted,
-- not archived: it is the coach's own note and reaches nobody).
-- Additive and idempotent.
-- Until applied: the tone control, the CoachHelm knows list and the settings sheet's two sections are hidden
-- (boot check 42703 on tone, 42P01 on the table); tone is Straight.
--
-- ROLLBACK: drop table if exists public.golf_coachhelm_coach_facts;
-- ROLLBACK: alter table public.golf_coachhelm_chat_conversations drop constraint if exists golf_coachhelm_chat_conversations_tone_check;
-- ROLLBACK: alter table public.golf_coachhelm_chat_conversations drop column if exists tone;
--
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'golf_coachhelm_chat_conversations' AND column_name = 'tone');
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'golf_coachhelm_coach_facts' AND relrowsecurity);
-- VERIFY: SELECT 1 WHERE (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_coachhelm_coach_facts') = 4;
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('anon', 'public.golf_coachhelm_coach_facts', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.golf_coachhelm_coach_facts', 'TRUNCATE');

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.golf_coachhelm_chat_conversations ADD COLUMN IF NOT EXISTS tone text NULL;

DO $hm2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_chat_conversations'::regclass
      AND conname = 'golf_coachhelm_chat_conversations_tone_check'
  ) THEN
    ALTER TABLE public.golf_coachhelm_chat_conversations ADD CONSTRAINT golf_coachhelm_chat_conversations_tone_check
      CHECK (tone IS NULL OR tone IN ('straight', 'detailed', 'team_talk'));
  END IF;
END
$hm2$;

CREATE TABLE IF NOT EXISTS public.golf_coachhelm_coach_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.golf_coaches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_coachhelm_coach_facts_text_length CHECK (char_length(btrim(text)) BETWEEN 1 AND 280)
);

CREATE INDEX IF NOT EXISTS golf_coachhelm_coach_facts_coach_team_idx
  ON public.golf_coachhelm_coach_facts (coach_id, team_id, created_at);

COMMENT ON TABLE public.golf_coachhelm_coach_facts IS
  'HM2: standing facts a coach typed for CoachHelm Ask ("CoachHelm knows"). Coach-written only through saveCoachFact; never written by the model.';

ALTER TABLE public.golf_coachhelm_coach_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_coachhelm_coach_facts_select ON public.golf_coachhelm_coach_facts;
CREATE POLICY golf_coachhelm_coach_facts_select ON public.golf_coachhelm_coach_facts
  FOR SELECT TO authenticated
  USING (coach_id = public.current_coach_id() AND public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_coachhelm_coach_facts_insert ON public.golf_coachhelm_coach_facts;
CREATE POLICY golf_coachhelm_coach_facts_insert ON public.golf_coachhelm_coach_facts
  FOR INSERT TO authenticated
  WITH CHECK (coach_id = public.current_coach_id() AND public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_coachhelm_coach_facts_update ON public.golf_coachhelm_coach_facts;
CREATE POLICY golf_coachhelm_coach_facts_update ON public.golf_coachhelm_coach_facts
  FOR UPDATE TO authenticated
  USING (coach_id = public.current_coach_id() AND public.is_golf_team_coach(team_id))
  WITH CHECK (coach_id = public.current_coach_id() AND public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_coachhelm_coach_facts_delete ON public.golf_coachhelm_coach_facts;
CREATE POLICY golf_coachhelm_coach_facts_delete ON public.golf_coachhelm_coach_facts
  FOR DELETE TO authenticated
  USING (coach_id = public.current_coach_id() AND public.is_golf_team_coach(team_id));

REVOKE ALL ON public.golf_coachhelm_coach_facts FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.golf_coachhelm_coach_facts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_coachhelm_coach_facts TO authenticated;

COMMIT;
