-- =============================================================================
-- 20260624000082_baseball_staff_display_and_invite_columns.sql
--
-- Wave 1 / packet: staff-room display + invite UX
--
-- Adds roster-display and player-visibility columns to baseball_team_coach_staff
-- so the Staff Room settings read-model can surface bios, contact info, and
-- fine-grained player/group scoping.  Also extends baseball_staff_invitations
-- with the sender identity and personalisation fields required by the invite
-- modal, plus a partial index to accelerate pending-invite lookups.
--
-- GUARDRAILS HONORED:
--   * ADDITIVE ONLY  — ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--     No DROP COLUMN, no DROP TABLE, no destructive UPDATE/DELETE, no data-
--     losing rename.  Safe to run on a live DB.
--   * No GRANT to anon on any object.  Existing RLS on both tables is
--     unchanged; new columns inherit the same row-level policies.
--   * Sport-prefixed names only (baseball_*), matching existing conventions.
--   * Refers only to baseball_coaches and baseball_* tables — no golf_* touch.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Display and scope columns on baseball_team_coach_staff
--    All additive; defaults are non-breaking for existing rows.
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_team_coach_staff
  ADD COLUMN IF NOT EXISTS bio                 text,
  ADD COLUMN IF NOT EXISTS phone               text,
  ADD COLUMN IF NOT EXISTS visible_to_players  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scope_player_ids    uuid[],
  ADD COLUMN IF NOT EXISTS scope_group_ids     uuid[];

COMMENT ON COLUMN public.baseball_team_coach_staff.bio
  IS 'Short staff biography shown to players in the Staff Room directory.  Null = not yet filled in.';

COMMENT ON COLUMN public.baseball_team_coach_staff.phone
  IS 'Direct phone number for the staff member, shown only to players when visible_to_players is true.';

COMMENT ON COLUMN public.baseball_team_coach_staff.visible_to_players
  IS 'When false the staff member is hidden from the player-facing Staff Room directory; they remain visible to other coaches.  Defaults true so existing staff remain visible after migration.';

COMMENT ON COLUMN public.baseball_team_coach_staff.scope_player_ids
  IS 'Optional allowlist of baseball_players.id values this staff member can see/manage.  NULL means no restriction (full roster access per their capability flags).';

COMMENT ON COLUMN public.baseball_team_coach_staff.scope_group_ids
  IS 'Optional allowlist of roster-group or practice-group ids this staff member is scoped to.  NULL means no restriction.  Used in conjunction with scope_player_ids for fine-grained access control.';

-- ---------------------------------------------------------------------------
-- 2. Invitation personalisation columns on baseball_staff_invitations
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_staff_invitations
  ADD COLUMN IF NOT EXISTS invitee_name         text,
  ADD COLUMN IF NOT EXISTS message              text,
  ADD COLUMN IF NOT EXISTS invited_by_coach_id  uuid
    REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.baseball_staff_invitations.invitee_name
  IS 'Display name of the invitee as entered by the sender; used to personalise the invite email and the acceptance page before the invitee creates an account.';

COMMENT ON COLUMN public.baseball_staff_invitations.message
  IS 'Optional personal note from the inviting coach included in the invitation email.  Shown verbatim; sanitised before send.';

COMMENT ON COLUMN public.baseball_staff_invitations.invited_by_coach_id
  IS 'FK to baseball_coaches — the coach who sent the invitation.  SET NULL on coach deletion so historical invite records are preserved without a dangling foreign key.';

-- ---------------------------------------------------------------------------
-- 3. Partial index: fast lookup of pending invitations by email
--    Accelerates the "has this address already been invited?" check in the
--    invite modal and the invitation-acceptance flow.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'baseball_staff_invitations'
       AND indexname  = 'idx_baseball_staff_invitations_pending_email'
  ) THEN
    CREATE INDEX idx_baseball_staff_invitations_pending_email
      ON public.baseball_staff_invitations (lower(email))
     WHERE status = 'pending';
  END IF;
END $$;
