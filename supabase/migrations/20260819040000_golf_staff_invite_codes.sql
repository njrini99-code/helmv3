-- Golf staff invitations: a SHORT TYPED CODE that carries the role.
--
-- WHY
-- ---
-- The owner wants the assistant-coach path to look like the player path: click
-- Sign Up, type a code. The unsafe version of that is "type the TEAM join code,
-- then pick Assistant Coach from a dropdown" — the join code is deliberately
-- handed to every athlete on the roster, so a player could self-select a staff
-- role. That exact feature was built and reverted on 2026-08-05 (266d02d91).
--
-- The safe shape keeps the UX and moves the authority: the code IS the grant.
-- A head coach mints it, it belongs to a namespace players never see, and it
-- carries {team, org, role} so there is no role for the joiner to pick.
--
-- This table is deliberately a LOOKUP, not a second source of truth. `token` is
-- the same HMAC-signed payload `signStaffInvite` already produces; redemption
-- still runs through verifyStaffInvite() and still burns the nonce in
-- golf_staff_invite_redemptions. So a tampered row here cannot forge a grant —
-- the signature is checked after the lookup, and the role is read from the
-- signed payload, never from these columns (which exist for display and audit).
--
-- VERIFIED: SELECT count(*) FROM public.golf_staff_invite_codes;  -- 0 on a fresh apply
-- ROLLBACK: purely additive (one table + one policy). Reverting means removing
--           it by hand in the dashboard where the row count is visible first.

CREATE TABLE IF NOT EXISTS public.golf_staff_invite_codes (
  -- 8 chars from the same unambiguous alphabet as golf_teams.join_code, so it
  -- reads aloud over the phone. Stored uppercase; lookups uppercase first.
  code text PRIMARY KEY,
  -- The signed invite. Source of truth for the role at redemption time.
  token text NOT NULL,
  team_id uuid NOT NULL REFERENCES public.golf_teams (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  -- Display/audit only — authorization reads the role out of `token`.
  role text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by_coach_id uuid REFERENCES public.golf_coaches (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS golf_staff_invite_codes_team_idx
  ON public.golf_staff_invite_codes (team_id, created_at DESC);

ALTER TABLE public.golf_staff_invite_codes ENABLE ROW LEVEL SECURITY;

-- The head coach who can mint an invite can see the codes for their team.
-- Nobody else: a player who could read this table could read a live staff code,
-- which is the whole vulnerability this design exists to avoid.
CREATE POLICY golf_staff_invite_codes_select
  ON public.golf_staff_invite_codes
  FOR SELECT
  TO authenticated
  USING (public.is_golf_team_head_coach(team_id));

-- No INSERT/UPDATE/DELETE policy: writes are service-role only, from
-- createStaffInvite (which is itself head-coach gated). With RLS on and no
-- permissive policy, every other write is denied.
REVOKE ALL ON public.golf_staff_invite_codes FROM anon;
GRANT SELECT ON public.golf_staff_invite_codes TO authenticated;

COMMENT ON TABLE public.golf_staff_invite_codes IS
  'Short human-typable alias for a signed golf staff invite. Lookup only — the role is authorized from the signed token, never from this row. Players must never be able to read it.';
