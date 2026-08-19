-- Golf staff invitations: make redemption SINGLE-USE.
--
-- WHY
-- ---
-- `signStaffInvite` mints a bearer token carrying {team, org, role, expiry,
-- nonce}. Until now nothing recorded that a token had been spent, so a link
-- could be redeemed repeatedly for its full 72h life. That is tolerable for a
-- `coach` invite (one squad) and NOT tolerable for an `admin` invite, which
-- writes head_coach on EVERY team in the organization — and `is_golf_team_coach`
-- is existence-only, so each redemption is full roster/PII/message access plus
-- the ability to delete players and rotate the join code.
--
-- A forwarded or leaked admin link was therefore an org-wide, repeatable grant.
-- src/lib/golf/staff-invite.ts already anticipated this: "Making it strictly
-- single-use needs a redemption table; if that becomes necessary, store the
-- nonce (`n`) below and reject a replay." This is that table.
--
-- The nonce is the primary key, so the INSERT itself is the mutual exclusion —
-- a replay loses on the unique constraint rather than on a read-then-write race
-- between two concurrent redemptions.
--
-- VERIFIED: SELECT count(*) FROM public.golf_staff_invite_redemptions;  -- 0 on a fresh apply
-- ROLLBACK: this migration is purely additive (one new table + its policy).
--           Reverting means removing that table by hand in the dashboard, where
--           the row count is visible first — per the additive-only rule, this
--           file does not ship a destructive statement.

CREATE TABLE IF NOT EXISTS public.golf_staff_invite_redemptions (
  -- The `n` claim from the signed payload. Unique per minted invite.
  nonce text PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.golf_teams (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  -- 'coach' | 'admin' as it appeared in the token, kept for audit not for authz.
  role text NOT NULL,
  redeemed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

-- Answering "who joined this program's staff, when, and off which invite" is a
-- support question that gets asked; both columns are selective.
CREATE INDEX IF NOT EXISTS golf_staff_invite_redemptions_team_idx
  ON public.golf_staff_invite_redemptions (team_id, redeemed_at DESC);

ALTER TABLE public.golf_staff_invite_redemptions ENABLE ROW LEVEL SECURITY;

-- Redemption runs through the admin client inside redeemStaffInvite (it must
-- write a coach profile and staff rows for a user who is not yet staff), so no
-- client role needs INSERT here. Reads are scoped to the head coach of the team
-- the invite was minted against — the same person who could mint it.
CREATE POLICY golf_staff_invite_redemptions_select
  ON public.golf_staff_invite_redemptions
  FOR SELECT
  TO authenticated
  USING (public.is_golf_team_head_coach(team_id));

-- No INSERT/UPDATE/DELETE policy: with RLS enabled and no permissive policy for
-- those commands, every non-service-role write is denied. That is deliberate —
-- a client must never be able to pre-insert a nonce (which would burn an invite
-- before its recipient could use it) or un-spend one.
REVOKE ALL ON public.golf_staff_invite_redemptions FROM anon;
GRANT SELECT ON public.golf_staff_invite_redemptions TO authenticated;

COMMENT ON TABLE public.golf_staff_invite_redemptions IS
  'One row per spent golf staff invite, keyed by the signed token''s nonce. The PK is the replay guard; see src/app/golf/actions/teams.ts redeemStaffInviteImpl.';
