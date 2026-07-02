# Helm Bridge — Execution Log

Running record of what was actually applied per wave, plus any deviations from the plan (the plan was authored against a snapshot; live prod verification takes precedence).

## W0 — P0 Security Prereqs

**Status:** DB work complete + verified on prod (2026-07-01). Code change (Task 3) in progress.

### Task 1 — handle_new_user role-cast fix + self-escalation guard
- Migration `20260701100000_fix_handle_new_user_role_cast.sql` applied to prod via Supabase MCP.
- **DEVIATION 1 (bug in plan):** the plan's replacement function body was copied from the stale `prod_public_baseline.sql` and OMITTED the live function's `baseball_players` seed block, `sport`/name vars, and `ON CONFLICT (id) DO NOTHING`. Applying it verbatim would have broken baseball player signup onboarding. Corrected by reading the live `pg_get_functiondef` and preserving the entire body — changing ONLY the role assignment from `COALESCE((meta->>'role')::user_role,'player')` to a `CASE` that maps only `coach|player`, else `player`.
- **DEVIATION 2 (bug in plan):** the plan's guard trigger blocked ALL self role-changes. But golf onboarding (`golf/actions/onboarding.ts:94/304/381`) upserts `users.role` via the USER-SCOPED client, so that guard would break legit player/coach onboarding. Re-scoped the guard to block only self-escalation to a NON-self-service role (`NEW.role NOT IN ('player','coach')`) — closes the admin vector, leaves onboarding working. (Baseball onboarding uses the admin client — unaffected either way.)
- **Added:** `REVOKE ... FROM PUBLIC` (not just anon/authenticated) so the ACL assertion holds — functions default-grant EXECUTE to PUBLIC.
- **Note:** the plan's `is_fixed` check (`prosrc LIKE '%WHEN ''coach'' THEN%'`) is whitespace-brittle; verified instead via `has_case_guard=true`, `still_has_vuln_coalesce=false`, `baseball_seed_preserved=true`, `on_conflict_preserved=true`, `admin_becomes=player`.
- Verified: guard trigger live; anon/authenticated EXECUTE revoked on both functions.

### Task 2 — downgrade stale test-admin (owner-approved OQ1)
- BEFORE: 2 `role='admin'` rows (`admin@helmsportslabs.com` b9673959-1c90-405b-93f7-b468a9f4daa3; `admin-ui-1779052548996@golfhelm.local` 8e894959-68f4-4973-b953-6590ed3a8c0b).
- Downgraded the `admin-ui-...golfhelm.local` row → `player` (UPDATE 1).
- AFTER: exactly 1 admin row — **`admin@helmsportslabs.com` = `b9673959-1c90-405b-93f7-b468a9f4daa3`** (the W1 allowlist seed + `SUPER_ADMIN_USER_IDS` value).

### Task 3 — replace error-monitoring.ts (code, Sonnet)
- In progress.
