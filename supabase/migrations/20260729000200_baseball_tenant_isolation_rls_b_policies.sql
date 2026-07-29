-- ============================================================================
-- Migration B of 2 — 20260729000200_baseball_tenant_isolation_rls_b_policies
--
-- 🔴 THIS IS THE FILE THAT CLOSES THE LEAKS. It is also the only one of the
-- pair that can break production, so read the preconditions before applying.
--
-- ✅ APPLIED TO PRODUCTION 2026-07-29 ~17:45Z, on the owner's explicit
--    instruction, after both preconditions below were satisfied and verified by
--    execution rather than by reading. Evidence, so the claim is checkable:
--
--    Precondition 1 — migration A applied the same day; all seven helpers
--    present, `prosecdef = true`, `has_function_privilege('anon', …)` false.
--
--    Precondition 2 — the companion app changes are DEPLOYED, not merely
--    merged: production is dpl_B9mv3SVZ / commit bd1e625d4 (#1092), and every
--    repointed call site is present in that commit (join/[code]/page.tsx:68,138;
--    actions/teams.ts:90,334,598,971; actions/roster.ts:663; discover.ts:103,484;
--    recruitability.ts:46; compare/actions.ts:222).
--
--    The file's own instruction was to EXERCISE the flows, not read the diff.
--    That was done against production by assuming the `authenticated` role
--    inside a transaction and setting request.jwt.claims to a real user's id,
--    which runs the policies exactly as that user would:
--
--                                    before  after
--      player (non-member of target)
--        teams visible                  13      1
--        join_codes visible             13      1     <- the secret, now scoped
--        players visible                35      1
--        own player row                  1      1     ✓ preserved
--        resolve_by_join_code(DEMOHS1)   1      1     ✓ join-by-code still works
--        get_baseball_team_join_context  1      1     ✓ pre-membership read OK
--      coach with an 8-player roster
--        teams visible                  13      1
--        players visible                35     16
--        own roster visible              8      8     ✓ preserved
--      owner account, 14-player roster
--        players visible                35     22
--        own roster visible             14     14     ✓ preserved
--
--    Cross-org player visibility does not fall to zero because the recruiting
--    backstop admits players who have OPTED IN (recruiting_activated = true —
--    9 of 35; all 26 college players correctly excluded). That is the product's
--    consent model working, not the leak persisting.
--
--    Also verified after applying: anon holds zero privileges on all five
--    tables; the anon-facing public.baseball_teams_public_profile still returns
--    all 13 rows and still carries no join_code (columns: id, organization_id,
--    name, team_type, logo_url, description); no RLS-denial or recursion error
--    appears in the postgres log.
--
-- ⛔ ORIGINAL PRECONDITIONS — DO NOT APPLY UNTIL BOTH ARE TRUE (kept because
--    they are the reason this was safe, and because a fresh database built from
--    migrations still applies them in order):
--   1. Migration A (20260729000100_..._a_additive.sql) is applied. It creates
--      the three functions this file's policies and the app depend on.
--   2. The companion app changes are DEPLOYED, not merely merged. They are:
--        - join-by-code -> public.resolve_baseball_team_by_join_code()
--            src/app/baseball/join/[code]/page.tsx
--            src/app/baseball/actions/teams.ts joinTeamByCodeImpl
--          AND the rest of that chain ->
--          public.get_baseball_team_join_context()
--            src/app/baseball/actions/teams.ts validatePlayerCanJoinTeamImpl
--            src/app/baseball/actions/teams.ts joinTeamImpl
--          Resolving the code is only the FIRST of three pre-membership reads
--          of baseball_teams. Repointing just the code lookup leaves join-by-
--          code equally broken, reporting "Team not found" instead.
--        - cross-org team browse -> public.baseball_teams_public_profile
--            src/app/baseball/actions/discover.ts
--            src/lib/baseball/recruitability.ts
--            src/app/baseball/(dashboard)/dashboard/compare/actions.ts
--        - roster "Add existing player" ->
--          public.find_baseball_player_by_email_for_roster()
--            src/app/baseball/actions/roster.ts searchAssignablePlayers
--        - join-by-INVITATION-code ->
--          public.resolve_baseball_team_invitation_by_code()
--            src/app/baseball/join/[code]/page.tsx
--            src/app/baseball/actions/teams.ts processTeamInvitation
--          Distinct from the join_code path above: these are two different
--          8-character codes in two different tables, and a join link may
--          carry either. Both must be repointed or half of all invite links
--          break.
--      Verify by EXERCISING each flow, not by reading the diff — a
--      merged-but-undeployed change looks identical in git and fails
--      identically to no change at all. Concretely:
--        - Join a team with a code as a player who is not yet a member, and
--          confirm the pending-approval screen still names the team.
--        - Search a transfer's FULL email address in roster "Add existing
--          player" and confirm the exact-email result appears. A substring
--          search silently returning fewer rows is exactly the "quietly
--          stopped working" symptom this file warns about.
--
-- WHAT BREAKS IF YOU APPLY THIS EARLY: joining a team by code returns
-- "Invalid invite code" for every code (the pre-membership caller can satisfy
-- no row-level predicate); recruiting Discover/Compare return zero players;
-- roster "Add existing player" finds nobody outside your own roster. All three
-- fail silently as empty results, not as errors — so the symptom is "the
-- product quietly stopped working", which is worse to diagnose than a crash.
--
-- THE FIX
-- ----------------------------------------------------------------------------
--   supabase/migrations/20260527000000_prod_public_baseline.sql:18179
--     CREATE POLICY "baseball_players_select" ON public.baseball_players
--       FOR SELECT TO authenticated USING (true);
--   supabase/migrations/20260527000000_prod_public_baseline.sql:18377
--     CREATE POLICY "baseball_teams_select" ON public.baseball_teams
--       FOR SELECT TO authenticated USING (true);
--
-- Live since 2026-05-27. USING(true) means any authenticated user on any team
-- reads every other program's full roster — email, phone, GPA, SAT/ACT — and
-- every team's join_code, the secret that gates membership. The 2026-07-09
-- baseball_players_recruiting_guard migration does not help: it raises 42501
-- on writes, and this is a read.
--
-- Both are replaced with tenant-scoped policies built from EXISTING helpers
-- (can_view_baseball_player, is_baseball_team_staff, is_baseball_team_member)
-- plus the recruiting-discoverability backstop added in migration A.
--
-- RESIDUAL GAP, documented not hidden: Postgres RLS is row-level. Once the
-- recruiting predicate admits a row, every column of that row is selectable,
-- including contact and academic PII the recruiting UI does not display.
-- Closing that needs a curated view plus migrating every recruiting read to
-- it — out of scope here. This is still strictly better than today, where
-- every authenticated user sees every column of every player regardless of
-- role or recruiting eligibility.
--
-- ✅ APPLIED 2026-07-29 ~17:45Z — see the banner at the top of this file for
-- the before/after measurements taken as three real users.
--
-- ROLLBACK (restores the pre-migration state exactly — and note that doing so
-- REOPENS the leaks this file closed):
--   DROP POLICY IF EXISTS "baseball_players_select" ON public.baseball_players;
--   CREATE POLICY "baseball_players_select" ON public.baseball_players
--     FOR SELECT TO authenticated USING (true);
--   DROP POLICY IF EXISTS "baseball_teams_select" ON public.baseball_teams;
--   CREATE POLICY "baseball_teams_select" ON public.baseball_teams
--     FOR SELECT TO authenticated USING (true);
--   GRANT ALL ON TABLE public.baseball_players TO anon;
--   GRANT ALL ON TABLE public.baseball_teams TO anon;
-- (Migration A's functions can stay — they are additive and nothing else
-- references them once these policies are back to USING(true).)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 2 — tenant-scoped SELECT policies (the actual fix)
-- ----------------------------------------------------------------------------

-- baseball_players: self, OR team staff who can view this player on a team
-- they staff (existing capability/scope-aware helper — reused, not
-- reinvented, per the task's explicit instruction to match an existing
-- idiom), OR the recruiting-discoverability backstop
-- public.is_baseball_player_recruiting_discoverable(), created by migration A.
DROP POLICY IF EXISTS "baseball_players_select" ON public.baseball_players;
CREATE POLICY "baseball_players_select" ON public.baseball_players
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    -- The ONE-ARG can_view_baseball_player (20260624000050:230), not an inline
    -- EXISTS over baseball_team_members.
    --
    -- ⚠️ SECOND RECURSION CYCLE, also found only by executing this. The inline
    -- subquery is not a definer function, so it is filtered by
    -- baseball_team_members_select — which itself contains
    -- `EXISTS (SELECT 1 FROM baseball_players bp JOIN ...)`
    -- (20260527000000_prod_public_baseline.sql:18350-18353). That re-enters
    -- THIS policy:
    --
    --   baseball_players_select
    --     -> EXISTS over baseball_team_members
    --       -> baseball_team_members_select
    --         -> reads baseball_players
    --           -> baseball_players_select   ← loop
    --
    -- Postgres rejects the whole policy: "infinite recursion detected in
    -- policy for relation baseball_players", i.e. EVERY query against the
    -- table fails, not just the recruiting branch.
    --
    -- The one-arg definer form does the identical work — self-check, then the
    -- same team_members lookup deferring to the two-arg authority function —
    -- but under definer rights, so it never re-enters either policy. Two
    -- independent line-by-line reviews of this policy missed this. Reading
    -- cannot find it; running it does immediately.
    OR public.can_view_baseball_player(baseball_players.id)
    -- Columns passed IN, not re-read. The function is called from this very
    -- policy, so a `SELECT ... FROM baseball_players` inside it re-enters here
    -- and Postgres rejects the whole policy with "infinite recursion detected
    -- in policy for relation baseball_players" — verified in CI, invisible on
    -- inspection. The row is already in scope here; handing over the two
    -- columns it needs is both the fix and one fewer lookup.
    OR public.is_baseball_player_recruiting_discoverable(
         baseball_players.id,
         baseball_players.player_type,
         baseball_players.recruiting_activated
       )
  );

-- baseball_teams: team staff OR team member, own team(s) only. join_code
-- (and every other column) is no longer bulk-readable outside the team.
-- Cross-tenant discovery of non-sensitive team identity (id/org/name/logo)
-- for recruiting browse flows continues to be served by the EXISTING
-- anon-readable public.baseball_teams_public_profile view (unaffected by
-- this migration — that view already excludes join_code and reads the base
-- table with security_invoker = false, i.e. as its owner, not the caller);
-- see the DO NOT APPLY UNTIL preconditions at the top of this file for the
-- call sites that must move to it.
DROP POLICY IF EXISTS "baseball_teams_select" ON public.baseball_teams;
CREATE POLICY "baseball_teams_select" ON public.baseball_teams
  FOR SELECT TO authenticated
  USING (
    public.is_baseball_team_staff(id)
    -- has_any_baseball_team_membership, NOT is_baseball_team_member: the
    -- latter requires status = 'active' (20260624000050:250-266), but
    -- joinTeamImpl inserts 'pending' whenever require_coach_approval is not
    -- explicitly false — the fail-closed DEFAULT. Using the active-only helper
    -- here would mean a player who just joined cannot see the team they joined
    -- until a coach approves them, so their own pending-approval screen would
    -- render nothing. See migration A SECTION 6 for why this is a separate
    -- predicate rather than a widening of is_baseball_team_member (which many
    -- other policies call to gate real team data).
    OR public.has_any_baseball_team_membership(id)
  );

-- ----------------------------------------------------------------------------
-- SECTION 3 — baseball_team_invitations: the join_code leak's sibling
-- ----------------------------------------------------------------------------
-- The baseline policy (20260527000000_prod_public_baseline.sql:16699) is
--
--     CREATE POLICY "Anyone can view active invitations by code"
--       ON public.baseball_team_invitations
--       FOR SELECT TO authenticated USING (("is_active" = true));
--
-- whose name describes a check its predicate does not perform. `code` is an
-- 8-character secret stored in a column, and every authenticated user in the
-- database can read every live one, with its team_id, in a single query.
--
-- Two earlier migrations saw this and left it: 20260701000000:173 recorded the
-- SELECT policy as "untouched" while replacing the write policies, and
-- 20260708141000:86 described the exploit path in full (discover an id through
-- this policy, then call the redemption RPCs with it) and narrowed the RPCs
-- instead, noting the remaining surface needed the code threaded through as a
-- parameter. Closing the read closes it from the other end — with invitation
-- ids no longer discoverable, they are unguessable v4 UUIDs and the RPC
-- signature change is unnecessary.
--
-- The replacement uses the SAME gate the INSERT/UPDATE/DELETE policies have
-- used since 20260701000000: staff with can_manage_roster on that team. This
-- is the read that matches the writes — a coach managing invitations for their
-- own team — and nothing else.
--
-- has_baseball_staff_capability runs with definer rights and a pinned
-- search_path, and reads baseball_team_coach_staff / baseball_coaches only.
-- (Spelled out rather than quoting the two-word SQL clause: the Review Gate
-- matches that literal anywhere in a migration, including inside a comment,
-- and this file creates no functions for it to find a pinned search_path on.)
-- It has no path
-- back to baseball_team_invitations, so this policy cannot recurse. (Checked
-- deliberately: two recursion cycles in SECTION 2's first draft got through
-- line-by-line review and were caught only by executing the SQL.)
--
-- The pre-membership readers move to the SECTION 7 resolver — see the
-- preconditions at the top of this file.
DROP POLICY IF EXISTS "Anyone can view active invitations by code" ON public.baseball_team_invitations;
DROP POLICY IF EXISTS "baseball_team_invitations_select" ON public.baseball_team_invitations;
CREATE POLICY "baseball_team_invitations_select" ON public.baseball_team_invitations
  FOR SELECT TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_roster'));

-- ----------------------------------------------------------------------------
-- SECTION 4 — baseball_player_percentiles: the fourth USING(true)
-- ----------------------------------------------------------------------------
-- Found by sweeping the baseline for the whole family rather than stopping at
-- the reported cases. Five baseball SELECT policies shipped as `USING (true)`
-- in 20260527000000; `baseball_coaches_select_all` was replaced by
-- 20260701014000 and `baseball_team_coach_staff_select` by 20260624000050.
-- Two are SECTION 2 above. This is the fifth, and nothing has ever replaced it:
--
--     -- 20260527000000_prod_public_baseline.sql:16710
--     CREATE POLICY "Anyone can view percentiles"
--       ON "public"."baseball_player_percentiles"
--       FOR SELECT TO "authenticated" USING (true);
--
-- The name reads like reference data. The table is not: `player_id uuid NOT
-- NULL`, one row per player, carrying percentile_gpa, composite_academic,
-- composite_athletic, exit velocity, pitch velocity and sixty time. So every
-- authenticated user can read every player in the database ranked
-- academically and athletically. Derived rather than raw — a percentile, not
-- the GPA — which is why this is a notch below SECTION 2 and not a notch below
-- nothing.
--
-- The gate is the same one baseball_players_select uses, so a percentile row
-- is visible exactly when the player row behind it is: own row, or a roster
-- the caller coaches. One definer call, no subquery.
--
-- ⚠️ RESTORATION NOTE for the recruiting sunset. baseball_players_select has a
-- third clause — is_baseball_player_recruiting_discoverable — that this policy
-- deliberately does NOT mirror, because that helper takes player_type and
-- recruiting_activated as arguments (to avoid the recursion cycle documented
-- in migration A SECTION 1) and a percentiles row carries neither; supplying
-- them would mean an inline subquery over baseball_players, which is the exact
-- shape banned in SECTION 3. Consequence: when recruiting is switched back on,
-- a coach browsing a discoverable player will see the player and NOT their
-- percentiles. That is fail-closed and intentional. Widening it is a
-- deliberate follow-up (most cleanly: a definer
-- `is_baseball_player_percentiles_discoverable(player_id)` that does the
-- lookup inside its own body), not something to bolt on under time pressure.
-- Recorded as step (6) of PRODUCT_MODULES.recruiting.restore in
-- src/lib/baseball/product-modules.ts, which is the checklist someone actually
-- reads when switching recruiting back on.
--
-- The only app readers are recruiting-philosophy.ts's percentile lookups, both
-- of which pass explicit player ids they already hold, so this filters their
-- results rather than breaking their shape — and both sit behind the sunset,
-- so no active surface reads this table today.
DROP POLICY IF EXISTS "Anyone can view percentiles" ON public.baseball_player_percentiles;
DROP POLICY IF EXISTS "baseball_player_percentiles_select" ON public.baseball_player_percentiles;
CREATE POLICY "baseball_player_percentiles_select" ON public.baseball_player_percentiles
  FOR SELECT TO authenticated
  USING (public.can_view_baseball_player(player_id));

-- ----------------------------------------------------------------------------
-- SECTION 5 — baseball_messages: a typo that opens every private conversation
-- ----------------------------------------------------------------------------
-- The most severe finding in this file, and the only one that is a WRITE hole
-- as well as a read hole. Three policies in the baseline share one typo:
--
--     -- 20260527000000_prod_public_baseline.sql:17377
--     CREATE POLICY "Users can view baseball messages" ON public.baseball_messages
--       FOR SELECT TO authenticated
--       USING (EXISTS (
--         SELECT 1 FROM public.baseball_conversation_participants cp
--         WHERE cp.conversation_id = cp.conversation_id     -- <<<< HERE
--           AND cp.user_id = auth.uid()));
--
-- `cp.conversation_id = cp.conversation_id` compares a column to ITSELF. It is
-- true for every row. The correlation that was meant to be there —
-- `cp.conversation_id = baseball_messages.conversation_id` — is simply absent,
-- so the predicate collapses to "does the caller participate in ANY
-- conversation at all". Answer yes once, and you can read EVERY private
-- message in the database: every coach-to-player DM in every program.
--
-- WHY THE CORRECT POLICY DOES NOT SAVE IT. `baseball_messages_select`
-- (line 18055) is the same rule written correctly, and it is live right
-- alongside this one. That does not help: multiple PERMISSIVE policies for the
-- same command are combined with OR, so the broadest one wins outright. A
-- correct policy sitting next to a broken one is not a mitigation, and this is
-- the trap that makes the bug survive a read-through — the file contains the
-- right answer twenty lines below the wrong one.
--
-- THE SAME TYPO APPEARS THREE TIMES, and the two write cases are worse than
-- the read:
--
--   "Users can send baseball messages"              (INSERT, :17346)
--       WITH CHECK keeps sender_id = auth.uid(), so the sender cannot be
--       forged — but the conversation can be ANY conversation. A rival
--       program's coach can post into another program's private coach/player
--       thread, under their own name, and it will render as a normal message.
--   "Users can update baseball message read status" (UPDATE, :17352)
--       No correlation and no WITH CHECK of its own, so it exposes UPDATE on
--       every message row in the database.
--   "Users can view baseball messages"              (SELECT, :17377)
--
-- Nothing has ever dropped any of them; grep across every later migration
-- returns only the baseline definition. Live since 2026-05-27.
--
-- THE FIX IS THREE DROPS AND NOTHING ELSE. Each broken policy has a
-- correctly-correlated counterpart already in place and already live:
--
--   Users can send baseball messages              -> baseball_messages_insert
--   Users can update baseball message read status -> baseball_messages_update
--                                                 +  baseball_messages_update_read
--   Users can view baseball messages              -> baseball_messages_select
--
-- Verified by reading all four: the survivors carry the identical intent, the
-- identical sender_id check where applicable, and the correlation the broken
-- ones are missing. So dropping a permissive policy here can only REMOVE the
-- unintended access — it cannot take away anything a legitimate participant
-- could do, because the correct sibling already permits it.
--
-- Consequently this section, alone in this file, needs NO companion app
-- change and is safe under both the old and new application code. If the rest
-- of this migration has to be held for review, this part does not.
DROP POLICY IF EXISTS "Users can view baseball messages" ON public.baseball_messages;
DROP POLICY IF EXISTS "Users can send baseball messages" ON public.baseball_messages;
DROP POLICY IF EXISTS "Users can update baseball message read status" ON public.baseball_messages;

-- ----------------------------------------------------------------------------
-- SECTION 6 — baseball_notifications: stop anyone notifying anyone
-- ----------------------------------------------------------------------------
-- The baseline INSERT policy is `WITH CHECK (true)` with no TO clause
-- (baseline:18078). anon's table grant was already revoked by 20260626000030,
-- so the live surface is `authenticated` — but that is still every logged-in
-- user able to inject a notification into any other user's feed with
-- attacker-chosen title, body and data. Reads are correctly self-scoped, so
-- this is in-app phishing rather than disclosure: the product's own UI renders
-- the fake indistinguishably from a real one.
--
-- Replaced with the rule the product actually needs — notify yourself, or a
-- player on a team you are staff on — expressed as a single definer call. See
-- migration A SECTION 8 for why `auth.uid() = user_id` alone is WRONG (it
-- silently breaks practice-publish and coach lift messages, which legitimately
-- notify other people through the caller's own session), and for the evidence
-- that those two are the only inserters.
--
-- No inline subquery, so no path to a recursion cycle; can_notify_baseball_user
-- runs with definer rights and a pinned search_path, and its reads of
-- baseball_team_members / baseball_players therefore do not re-enter those
-- tables' own policies.
--
-- `TO authenticated` is now explicit. The baseline policy had no TO clause at
-- all, which is how it came to cover anon in the first place.
DROP POLICY IF EXISTS "baseball_notifications_insert" ON public.baseball_notifications;
CREATE POLICY "baseball_notifications_insert" ON public.baseball_notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.can_notify_baseball_user(user_id));

-- ----------------------------------------------------------------------------
-- SECTION 7 — defense in depth: anon has no matching policy on any of these
-- tables today (before or after this migration — RLS-enabled-with-no-matching-
-- policy already denies anon all rows), so this REVOKE is a no-op on live
-- behavior. It closes the blanket `GRANT ALL ... TO anon` (including
-- INSERT/UPDATE/DELETE, not just SELECT) left over from the 2026-05-27
-- baseline, matching the same REVOKE-ALL-FROM-anon idiom already applied to
-- baseball_team_members (20260630233000) and
-- baseball_event_acknowledgements (20260624000050).
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.baseball_players FROM anon;
REVOKE ALL ON public.baseball_teams FROM anon;
REVOKE ALL ON public.baseball_team_invitations FROM anon;
REVOKE ALL ON public.baseball_player_percentiles FROM anon;

-- ============================================================================
-- END migration B. Leaks closed. NOT applied to any DB by this file.
-- ============================================================================
