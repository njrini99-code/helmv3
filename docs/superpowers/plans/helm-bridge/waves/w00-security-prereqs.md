# W0: P0 Security Prereqs

**Goal:** Close the pre-existing privilege-escalation vector in `handle_new_user()`, downgrade the stale test-admin row, and replace the weak `error-monitoring.ts` logger — all BEFORE any `/admin` code ships.

**Depends-on:** nothing (first wave).

**PR-scope:** THREE separate tiny PRs (Task 1 = PR `w0a`, Task 2 = prod data change, no PR, Task 3 = PR `w0b`). Each independently mergeable and revertible.

**Safety rails in force:** additive-only DDL; migrations applied to the SHARED prod DB via Supabase MCP `apply_migration`; applied state verified via `information_schema`/`pg_proc` (NOT `schema_migrations`); every migration ends with REVOKE + ACL assertion.

---

### Task 1 — Fix `handle_new_user()` role cast (PR `w0a`)

**Files**
- Create: `supabase/migrations/20260701100000_fix_handle_new_user_role_cast.sql`
- Reference (read-only): `supabase/migrations/20260527000000_prod_public_baseline.sql:3790-3824` (current trigger body)

**Interfaces**
- Consumes: `auth.users` INSERT trigger context, `NEW.raw_user_meta_data->>'role'`.
- Produces: `public.handle_new_user()` (replaced in place, same signature `RETURNS trigger`) that can only mint `player` or `coach`.

**Why (reconciled):** `prod_public_baseline.sql:3802-3805` casts `raw_user_meta_data->>'role'` straight into `user_role`, and `'admin'` is a valid enum value — a raw call to the public Supabase signup endpoint with `user_metadata: {"role":"admin"}` self-mints an admin row. The app's own signup only offers player/coach, so restricting the cast is behavior-preserving for legitimate users.

**Steps**

- [ ] 1. Write the failing verification. Run against prod via Supabase MCP `execute_sql`:
  ```sql
  SELECT prosrc LIKE '%WHEN ''coach'' THEN%' AS is_fixed
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';
  ```
  Expected output NOW: `is_fixed = false` (the unpatched COALESCE cast is live). This is the red state.

- [ ] 2. Create `supabase/migrations/20260701100000_fix_handle_new_user_role_cast.sql`:
  ```sql
  -- W0 P0: handle_new_user() previously cast raw_user_meta_data->>'role'
  -- directly into user_role. 'admin' is a valid enum value, so a raw signup
  -- API call with user_metadata {"role":"admin"} could self-mint an admin
  -- row. Restrict the cast to the two self-service roles; everything else
  -- (including 'admin', junk, NULL) falls back to 'player'.
  CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $$
  DECLARE
    user_role_value user_role;
    user_email TEXT;
  BEGIN
    user_email := NEW.email;

    user_role_value := CASE NEW.raw_user_meta_data->>'role'
      WHEN 'coach'  THEN 'coach'::user_role
      WHEN 'player' THEN 'player'::user_role
      ELSE 'player'::user_role
    END;

    INSERT INTO public.users (
      id,
      email,
      role,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      user_email,
      user_role_value,
      NOW(),
      NOW()
    );

    RETURN NEW;
  END;
  $$;

  -- Safety rail: no direct EXECUTE for anon/authenticated (trigger fires as
  -- supabase_auth_admin; nobody else should be able to call it).
  REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;

  -- ACL assertion — migration FAILS if the revoke did not stick.
  DO $$
  DECLARE
    v_oid oid;
  BEGIN
    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';

    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL check failed: handle_new_user executable by anon/authenticated';
    END IF;
  END $$;
  ```

- [ ] 3. Apply via Supabase MCP `apply_migration` (name `fix_handle_new_user_role_cast`).

- [ ] 4. Re-run the step-1 verification SQL. Expected output NOW: `is_fixed = true`. Also assert the guard behaves, via `execute_sql`:
  ```sql
  SELECT
    (CASE 'admin'  WHEN 'coach' THEN 'coach'::user_role WHEN 'player' THEN 'player'::user_role ELSE 'player'::user_role END)::text AS admin_becomes,
    (CASE 'coach'  WHEN 'coach' THEN 'coach'::user_role WHEN 'player' THEN 'player'::user_role ELSE 'player'::user_role END)::text AS coach_stays,
    (CASE NULL     WHEN 'coach' THEN 'coach'::user_role WHEN 'player' THEN 'player'::user_role ELSE 'player'::user_role END)::text AS null_becomes;
  ```
  Expected: `admin_becomes=player, coach_stays=coach, null_becomes=player`.

- [ ] 5. Verify `users_update_own` cannot self-update `role` (DECISIONS risk note). Via `execute_sql`:
  ```sql
  SELECT policyname, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'UPDATE';
  ```
  Decision table: if every UPDATE policy's `with_check` prevents `role` changes (or a column-guard trigger exists), record the output in the PR description and stop. If a policy allows a user to change their own `role`, ALSO add the following to the SAME migration file (before applying) and re-apply:
  ```sql
  -- Guard: a user may never change their own role. auth.uid() is NULL under
  -- service_role, so admin/service updates are unaffected.
  CREATE OR REPLACE FUNCTION public.guard_users_role_self_change() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $$
  BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() = OLD.id THEN
      RAISE EXCEPTION 'role cannot be self-modified';
    END IF;
    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_guard_users_role_self_change ON public.users;
  CREATE TRIGGER trg_guard_users_role_self_change
    BEFORE UPDATE OF role ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.guard_users_role_self_change();

  REVOKE ALL ON FUNCTION public.guard_users_role_self_change() FROM anon, authenticated;
  ```

- [ ] 6. Commit: `fix(security): restrict handle_new_user role cast to player|coach (P0)`

---

### Task 2 — Downgrade the stale test-admin row (prod data change, owner-approved OQ1)

**Files** — none (data change executed via Supabase MCP `execute_sql`; paste all three result sets into the W0 PR description for the audit trail).

**Interfaces**
- Consumes: `public.users` (`role` column).
- Produces: exactly ONE `role='admin'` row remaining (`admin@helmsportslabs.com`).

**Steps**

- [ ] 1. BEFORE snapshot (expected: exactly 2 rows — `admin@helmsportslabs.com` and `admin-ui-1779052548996@golfhelm.local`):
  ```sql
  SELECT id, email, role, created_at FROM public.users WHERE role = 'admin' ORDER BY created_at;
  ```
  If the result differs from the expected 2 rows, STOP and escalate to the owner — the discovery data is stale.

- [ ] 2. Downgrade (owner pre-approved in DECISIONS OQ1):
  ```sql
  UPDATE public.users
  SET role = 'player', updated_at = now()
  WHERE email = 'admin-ui-1779052548996@golfhelm.local' AND role = 'admin';
  ```
  Expected: `UPDATE 1`.

- [ ] 3. AFTER snapshot:
  ```sql
  SELECT id, email, role FROM public.users WHERE role = 'admin';
  ```
  Expected: exactly 1 row, `admin@helmsportslabs.com`. Record its `id` — it seeds `admin_allowlist` and `SUPER_ADMIN_USER_IDS` in W1.

---

### Task 3 — Replace the weak `error-monitoring.ts` logger (PR `w0b`)

**Files**
- Modify: `src/app/golf/actions/golf.ts` (import at line 27; call sites at lines 1587, 1724, 4593, 4697, 4726, 4756, 4807, 4926, 6050, 6262)
- Delete: `src/lib/error-monitoring.ts`

**Interfaces**
- Consumes: `logServerException(error: Error | unknown, context: RoundErrorContext, severity?: 'warning'|'error'|'critical'): Promise<void>` from `@/lib/server-error-logger` (exact existing signature — `src/lib/server-error-logger.ts:247-256`).
- Produces: nothing new — the 10 call sites now dual-write Sentry + `error_logs` + `admin_events` with an awaited path.

**Corrected rationale (reground):** `error-monitoring.ts` does NOT drop server calls outright (its else-branch at lines 163-176 does call `Sentry.captureException`), but the send is an unawaited fire-and-forget dynamic import that can be lost when the serverless function returns first, and it never writes `error_logs`/`admin_events`. `logServerException` is awaited and dual-writes. Expect a first-week Sentry volume bump from previously-flaky captures — pre-announced, do not "fix" by reverting.

**Steps**

- [ ] 1. Red state — prove the legacy import exists:
  ```bash
  grep -n "error-monitoring" src/app/golf/actions/golf.ts
  ```
  Expected: `27:import { logCritical, logError } from '@/lib/error-monitoring';`

- [ ] 2. In `src/app/golf/actions/golf.ts` replace line 27:
  ```typescript
  import { logServerException } from '@/lib/server-error-logger';
  ```
  (If `logServerException` is already imported elsewhere in the file, merge into the existing import instead of duplicating.)

- [ ] 3. Rewrite the 10 call sites. The old signatures are `logError(error, undefined, { action })` and `logCritical(error, { action })`. New code, per line:
  - Line 1587: `await logServerException(new Error(rpcError.message), { action: 'submitGolfRoundComprehensive.rpc' });`
  - Line 1724: `await logServerException(new Error(rpcError.message), { action: 'submitGolfRoundComprehensive.rpc.new' });`
  - Line 4593: `await logServerException(new Error(rpcError.message), { action: 'savePartialRound.rpc' });`
  - Line 4697: `await logServerException(new Error(updateError.message), { action: 'savePartialRound.updateExisting' });`
  - Line 4726: `await logServerException(new Error(roundError.message), { action: 'savePartialRound.insertRound' });`
  - Line 4756: `await logServerException(new Error(holesError.message), { action: 'savePartialRound.insertHoles' });`
  - Line 4807: `await logServerException(new Error(shotsError.message), { action: 'savePartialRound.insertShots' });`
  - Line 4926: `await logServerException(err instanceof Error ? err : new Error(String(err)), { action: 'savePartialRound' }, 'critical');`
  - Line 6050: `await logServerException(error instanceof Error ? error : new Error(String(error)), { action: 'deleteShot' });`
  - Line 6262: `await logServerException(error instanceof Error ? error : new Error(String(error)), { action: 'updateShot' });`

  Note: `logServerException` never throws (it swallows both Sentry and DB failures internally — `server-error-logger.ts:216-228`), so awaiting it cannot fail a live round save.

- [ ] 4. Delete `src/lib/error-monitoring.ts`:
  ```bash
  rm src/lib/error-monitoring.ts
  ```

- [ ] 5. Verify no orphaned importers, then gates:
  ```bash
  grep -rn "error-monitoring" src/ && echo "FAIL: importers remain" || echo "clean"
  npm run typecheck
  npm run test:run
  ```
  Expected: `clean`, tsc exits 0, unit suite green.

- [ ] 6. Commit: `fix(observability): migrate golf.ts error calls to logServerException, delete error-monitoring.ts (P0)`

---

## Acceptance Criteria

- [ ] `handle_new_user()` on prod contains the CASE guard (step-1 SQL returns `is_fixed = true`); signup with `role:'admin'` metadata yields a `player` row.
- [ ] `pg_proc` ACLs: `handle_new_user` not executable by anon/authenticated.
- [ ] Exactly one `users.role='admin'` row remains (`admin@helmsportslabs.com`); its UUID is recorded for W1.
- [ ] `src/lib/error-monitoring.ts` no longer exists; zero grep hits for `error-monitoring` under `src/`.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:run` all pass.
- [ ] The `users_update_own` role-self-update verification output is recorded in the PR description (with the guard trigger applied if it was needed).

## Rollback

- Task 1: re-apply the original function body from `prod_public_baseline.sql:3790-3824` via `apply_migration` (the escalation window reopens — only roll back on hard breakage of signups, and re-fix immediately).
- Task 2: `UPDATE public.users SET role='admin' WHERE email='admin-ui-1779052548996@golfhelm.local';` (don't — the row is a test artifact).
- Task 3: `git revert` the PR commit; `error-monitoring.ts` returns intact (it was deleted, not modified).
