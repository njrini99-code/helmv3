# W14: Retirement of the Old Non-CRM Admin + Hardening + Final QA

**Goal:** Retire `/golf/admin`'s non-CRM surfaces (the CRM subtree survives intact with its `role='admin'` gate), retire the unguarded `/baseball/admin` page, revoke anon EXECUTE on the admin-relevant SECURITY DEFINER functions, and run the full-system QA pass.

**Depends-on:** W5–W13 ALL MERGED AND VERIFIED IN PROD (this wave deletes the fallback).

**PR-scope:** TWO PRs — `w14a` retirement (code), `w14b` hardening (migration). Keep them separate so a retirement revert never reverts ACLs.

**THE CARDINAL RULE (risk #5):** `/golf/admin` cannot be deleted wholesale — the CRM lives INSIDE it at `src/app/golf/admin/crm/`. Every deletion below is grep-gated. When any grep disagrees with this plan, STOP and keep the file.

---

### Task 1 — Retire `/golf/admin` non-CRM surfaces (PR `w14a`)

**Files**
- Modify: `src/app/golf/admin/page.tsx` → becomes a redirect to `/admin`
- Delete (grep-gated): non-CRM files under `src/app/golf/admin/components/`, `src/app/golf/admin/demo-sessions/`, `src/app/baseball/admin/demo-sessions/` (and the now-empty `src/app/baseball/admin/`)
- Delete (grep-gated): `src/app/golf/actions/admin-people-data.ts`, `src/app/golf/actions/admin-system-data.ts`
- Keep UNTOUCHED: `src/app/golf/admin/layout.tsx` (gates the CRM), `src/app/golf/admin/_motion-provider.tsx`, `src/app/golf/admin/crm/**`, `src/app/golf/admin/error.tsx`, `src/app/golf/admin/loading.tsx`, `src/components/golf/AdminNativeGuard.tsx`
- Modify: `src/app/golf/actions/auth.ts` (admin login redirect, line ~186: `/golf/admin` → `/admin`)

**Steps**

- [ ] 1. Build the deletion manifest — for EVERY candidate file, prove zero importers outside the deletion set:
  ```bash
  # 1a. What does the CRM subtree import from outside crm/?
  grep -rn "from '@/app/golf/admin/components\|from '\.\./components\|from '\.\./\.\./components" src/app/golf/admin/crm/ | sort -u
  # 1b. What imports the old dashboard page's components from OUTSIDE golf/admin?
  grep -rln "golf/admin/components" src/ | grep -v "src/app/golf/admin" | sort -u
  # 1c. Dead action files — who imports them?
  grep -rln "admin-people-data\|admin-system-data" src/ | sort -u
  # 1d. Is admin-bi-data really alive? (reground: metrics.ts MENTIONS it in a comment)
  grep -rln "admin-bi-data" src/ | sort -u
  # 1e. Who imports admin-data.ts (checkAdminAccess etc.) from the CRM side?
  grep -rln "actions/admin-data" src/app/golf/admin/crm/ | sort -u
  ```
  Decision rules: (a) any component imported by `crm/**` is KEPT even if the old dashboard also used it; (b) `admin-people-data.ts`/`admin-system-data.ts` are deleted ONLY if 1c returns nothing outside themselves; (c) `admin-bi-data.ts` is deleted only if 1d shows comment-mentions only (an actual import anywhere = keep); (d) `admin-data.ts` is NEVER deleted this wave (Bridge's `rollup-a/b` modules and possibly CRM depend on it) — only its now-orphaned exports may be pruned in a later cleanup.

- [ ] 2. Replace `src/app/golf/admin/page.tsx` in full:
  ```tsx
  import { redirect } from 'next/navigation';

  /**
   * The golf admin dashboard has been absorbed into Helm Bridge (/admin).
   * The CRM remains at /golf/admin/crm behind this route group's layout gate
   * (users.role='admin') — untouched by design (OQ9).
   */
  export default function LegacyGolfAdminRedirect() {
    redirect('/admin');
  }
  ```

- [ ] 3. Delete per the manifest (typical expected set, subject to step 1): the 40+ dashboard tab components (`OverviewTab.tsx`, `PeopleTab.tsx`, `SystemTab.tsx`, `BusinessIntelligenceTab.tsx`, `GrowthTab.tsx`, tracer tab components already ported, `BaseballOps.tsx` dead code, etc.), `src/app/golf/admin/demo-sessions/`, `src/app/baseball/admin/demo-sessions/` + the empty `src/app/baseball/admin/`, and the grep-cleared dead action files. THE `crm/` SUBTREE AND `layout.tsx` ARE NOT TOUCHED. Note: deleting `PeopleTab.tsx` removes the LAST non-CRM → CRM import (`BulkEmailModal` at line 10) — the coupling dies with the consumer.

- [ ] 4. Update the admin login redirect in `src/app/golf/actions/auth.ts` (~line 186):
  ```typescript
    // Admin users go straight to Helm Bridge
    if (userData?.role === 'admin') {
      return {
        success: true,
        redirectTo: '/admin',
      };
    }
  ```

- [ ] 5. Gates + boundary proof:
  ```bash
  npm run typecheck && npm run lint && npm run test:run && npm run build
  # CRM intact:
  ls src/app/golf/admin/crm/ | head
  grep -rn "BulkEmailModal" src/ | grep -v "src/app/golf/admin/crm" && echo "FAIL: coupling survives" || echo "coupling severed"
  ```
  Expected: build green (the strongest deletion test — any missed importer fails compilation); `coupling severed`.

- [ ] 6. Manual smoke: `/golf/admin` → redirects to `/admin`; `/golf/admin/crm` still renders for Nick (role gate untouched); admin login lands on `/admin`; a coach/player still cannot reach either.

- [ ] 7. Commit: `feat(admin): retire non-CRM golf/baseball admin surfaces — Helm Bridge is the single source (W14a)`

---

### Task 2 — Hardening migration: revoke anon EXECUTE on admin SECURITY DEFINER functions (PR `w14b`)

**Files**
- Create: `supabase/migrations/20260701160000_harden_admin_definer_acls.sql`

**Scope discipline:** the advisor flags 49 anon-executable SECURITY DEFINER functions repo-wide; the FULL sweep is the separately-deferred "165 SECURITY DEFINER grant audit". THIS migration hardens only the bounded, admin-relevant set the Bridge touches — functions whose names begin `get_admin_` plus `is_admin` and `get_admin_platform_stat_averages`. Nothing here is legitimately called anonymously (verify first).

**Steps**

- [ ] 1. Enumerate + verify no anonymous call path exists:
  ```bash
  grep -rn "get_admin_\|is_admin\b" src/ --include="*.ts" --include="*.tsx" -l | sort -u
  ```
  Confirm every hit is (a) a gated server action / data-layer module, or (b) SQL. Any client-component RPC call to these functions = STOP and exclude that function, record why.

- [ ] 2. Red state via `execute_sql` — list currently anon-executable admin functions:
  ```sql
  SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (p.proname LIKE 'get\_admin\_%' ESCAPE '\' OR p.proname IN ('is_admin', 'get_admin_platform_stat_averages'))
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ORDER BY 1;
  ```
  Expected NOW: a non-empty list (the advisor finding). Paste it into the PR description.

- [ ] 3. Create `supabase/migrations/20260701160000_harden_admin_definer_acls.sql`:
  ```sql
  -- W14b: revoke anon EXECUTE on admin-facing SECURITY DEFINER functions.
  -- Bounded to the get_admin_* family + is_admin + platform stat averages;
  -- the full 165-function audit remains a separate deferred effort.
  -- authenticated EXECUTE is PRESERVED (rollup RPCs are invoked with the
  -- admin's user-scoped JWT and gate internally on auth.uid()).
  DO $$
  DECLARE
    fn record;
  BEGIN
    FOR fn IN
      SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND (p.proname LIKE 'get\_admin\_%' ESCAPE '\'
             OR p.proname IN ('is_admin', 'get_admin_platform_stat_averages'))
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', fn.proname, fn.args);
    END LOOP;
  END $$;

  -- Assertion: zero admin functions remain anon-executable.
  DO $$
  DECLARE
    n bigint;
  BEGIN
    SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND (p.proname LIKE 'get\_admin\_%' ESCAPE '\'
           OR p.proname IN ('is_admin', 'get_admin_platform_stat_averages'))
      AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF n > 0 THEN
      RAISE EXCEPTION 'ACL check failed: % admin functions still anon-executable', n;
    END IF;
  END $$;
  ```

- [ ] 4. Apply via `apply_migration` (name `harden_admin_definer_acls`), re-run the step-2 SELECT → expected: 0 rows. Then FULL regression of the gated surfaces (they use authenticated/service_role, so nothing should change): load `/admin`, `/admin/golf`, `/admin/baseball`, `/golf/admin/crm` as Nick; run one round save as the demo player. Also extend the W11 integrity RPC's watchlist mentally: the `anon_grant_drift` check already watches tables; a follow-up may add function-drift (out of v1 scope, note in PR).

- [ ] 5. Run `mcp__supabase__get_advisors` (security) and confirm the `get_admin_*`/`is_admin` anon-executable findings are GONE; paste before/after counts into the PR.

- [ ] 6. Commit: `fix(security): revoke anon EXECUTE on admin SECURITY DEFINER functions (W14b)`

---

### Task 3 — Final QA sweep (no code — the sign-off checklist)

**Steps**

- [ ] 1. Full gates on main after both PRs:
  ```bash
  npm run typecheck && npm run lint && npm run test:run && npm run build
  ```

- [ ] 2. Three-layer gate live-verification (prod):
  - logged out → `/admin` → `/golf/login?returnTo=/admin`
  - coach account → `/admin` → `/golf/dashboard`
  - `curl -A "HelmSportsLabsApp" -I https://helmsportslabs.com/admin` → 307 away
  - Nick → all 8 tabs render
  - SQL: `SELECT public.is_super_admin();` as anon key → error (no EXECUTE); `admin_allowlist` unreadable by authenticated.

- [ ] 3. Pipeline live-verification: trigger a dev error → appears in triage ≤60s; resolve it → `resolved_by` = Nick's uuid; cron board all green post-07:30 UTC; digest email arrived at 10:00 UTC; deploy marker row exists for the current sha; W5 watcher chips ALL "flowing".

- [ ] 4. CRM regression: `/golf/admin/crm` fully functional (pipeline board, templates, replies inbox render; NO send performed); `git log --oneline -- src/app/golf/admin/crm src/lib/crm` shows ZERO commits from this entire project.

- [ ] 5. Flag-only report to owner (do NOT fix): `refresh-engagement` cron comment claims a nonexistent vercel.json schedule; `v_crm_coaches_by_school` is an advisor-ERROR SECURITY DEFINER view. Both CRM-owned.

- [ ] 6. Close out: update `memory/` project notes per repo convention; confirm the owner-provisioning checklist is fully green (every secret set) or record which fail-soft panels remain dark.

---

## Acceptance Criteria

- [ ] `/golf/admin` redirects to `/admin`; `/golf/admin/crm` untouched and fully functional behind `role='admin'`; `/baseball/admin` gone.
- [ ] `BulkEmailModal` has zero importers outside `crm/`; the `crm_coaches` sidebar query died with `page.tsx`.
- [ ] Zero `get_admin_*`/`is_admin` functions anon-executable (advisor-verified before/after).
- [ ] Full build green after deletions (compilation is the deletion proof).
- [ ] All W0–W13 acceptance criteria still hold on prod (spot-check the pipeline list in Task 3.3).
- [ ] Owner sign-off recorded on the PR.

## Rollback

- `w14a`: `git revert` restores the old dashboard exactly (it was deleted, not modified) — safe because Bridge never depended on the deleted files.
- `w14b`: re-grant is a one-line `GRANT EXECUTE ... TO anon` per function — but do NOT do this reflexively; anything that breaks from the revoke was an anonymous call path that should never have existed. Investigate first.
