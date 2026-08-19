-- Close release_baseball_team_invitation_redemption to authenticated callers.
--
-- WHY
-- ---
-- processTeamInvitation redeems a baseball team invitation and, when the join
-- itself fails, must give the seat back. That release runs through this
-- SECURITY DEFINER RPC. Until 2026-08-19 the call was made on the CALLER's
-- client, so the function had to be EXECUTE-able by `authenticated` — which
-- also meant any authenticated user could call it directly against any
-- invitation id and hand a spent invite back its use, indefinitely.
--
-- The application side moved first: the release now runs on the service-role
-- admin client (f55c74eae, src/app/baseball/actions/teams.ts). Only once THAT
-- was live in production could the grant be narrowed — reversing the order
-- would have broken every failed-join rollback silently, leaking a seat each
-- time. Deployed as 8779c7a3d before this ran.
--
-- WHY THIS FILE EXISTS AT ALL
-- ---------------------------
-- The statements below were applied to production via MCP apply_migration on
-- 2026-08-19, which stamped supabase_migrations.schema_migrations at execution
-- time (20260819180639) with NO corresponding file in the repo. That is drift:
-- prod carried an object no migration created, and a fresh replay would not
-- reproduce it. This file is named for the version already recorded, so the
-- ledger and the filename agree and `supabase db push` will not try to re-run
-- it. It is a record of applied DDL, not a new change.
--
-- Both statements are idempotent, so a shadow/CI replay is a clean no-op.
--
-- VERIFIED (run against production after applying):
--   SELECT r.rolname,
--          has_function_privilege(r.rolname,
--            'public.release_baseball_team_invitation_redemption(uuid)',
--            'EXECUTE')
--   FROM (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname);
--   -- anon=false, authenticated=false, service_role=true
--
-- ROLLBACK: GRANT EXECUTE ... TO authenticated. Do NOT do this without first
--           reverting f55c74eae, or the rollback re-opens the hole it closed.

REVOKE EXECUTE ON FUNCTION
public.release_baseball_team_invitation_redemption(uuid)
FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION
public.release_baseball_team_invitation_redemption(uuid)
TO "service_role";
