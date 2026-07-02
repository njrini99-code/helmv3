# W1: Auth Foundation — allowlist, `requireSuperAdmin()`, middleware, `/admin` shell

**Goal:** Stand up the three-layer Nick-only gate (middleware → shared `requireSuperAdmin()` → `is_super_admin()` RLS) and the gated, native-hidden `/admin` route group with a placeholder page.

**Depends-on:** W0 (trigger fix merged; single admin row confirmed; Nick's `auth.users.id` recorded).

**PR-scope:** ONE PR. Per DECISIONS #44/#45 the `/admin` route + middleware matcher + native-UA exclusion + `AdminNativeGuard` MUST ship together — splitting them risks Apple reviewers seeing `/admin` or real admin sessions 404ing on iOS.

---

### Task 1 — Migration: `admin_allowlist` + `is_super_admin()`

**Files**
- Create: `supabase/migrations/20260701110000_admin_allowlist_is_super_admin.sql`

**Interfaces**
- Produces (SQL):
  ```sql
  TABLE public.admin_allowlist (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  FUNCTION public.is_super_admin() RETURNS boolean; -- SECURITY DEFINER, STABLE
  ```

**Steps**

- [ ] 1. Fetch Nick's canonical id (red state — table must not exist yet). Via Supabase MCP `execute_sql`:
  ```sql
  SELECT id, email FROM auth.users WHERE email = 'admin@helmsportslabs.com';
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_allowlist'
  ) AS already_exists;
  ```
  Expected: one auth row (record `<NICK_UUID>` — must match the W0 Task 2 recorded id); `already_exists = false`.

- [ ] 2. Create the migration file (replace `<NICK_UUID>` with the real UUID before applying):
  ```sql
  -- W1: single-super-admin allowlist + is_super_admin() gate.
  -- Deliberately a table (not a hardcoded UUID in SQL) so rotation is a data
  -- change, not a migration. RLS ENABLE + FORCE with ZERO anon/authenticated
  -- policies — reads happen only via the SECURITY DEFINER function; writes are
  -- service_role-only.
  CREATE TABLE IF NOT EXISTS public.admin_allowlist (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.admin_allowlist FORCE ROW LEVEL SECURITY;

  CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.admin_allowlist WHERE user_id = auth.uid()
    );
  $$;

  COMMENT ON FUNCTION public.is_super_admin() IS
    'Helm Bridge gate: true iff auth.uid() is in admin_allowlist. SECURITY DEFINER so RLS policies and internally-gated RPCs can consult the (RLS-locked) allowlist. auth.uid() is NULL under service_role, so this returns false for service-role callers by design.';

  -- Seed: Nick only (id confirmed via auth.users in step 1).
  INSERT INTO public.admin_allowlist (user_id, email, note)
  VALUES ('<NICK_UUID>', 'admin@helmsportslabs.com', 'Helm Bridge super admin — seeded W1')
  ON CONFLICT (user_id) DO NOTHING;

  -- ── Safety rails ──────────────────────────────────────────────────────────
  REVOKE ALL ON TABLE public.admin_allowlist FROM anon, authenticated;
  REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon, authenticated;
  -- authenticated needs EXECUTE so future RLS policies / internally-gated RPCs
  -- invoked with the admin's user-scoped JWT can call it. anon gets NOTHING.
  GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

  -- ACL assertions — migration fails loudly on grant drift.
  DO $$
  DECLARE
    v_fn oid;
  BEGIN
    IF has_table_privilege('anon', 'public.admin_allowlist', 'SELECT')
       OR has_table_privilege('authenticated', 'public.admin_allowlist', 'SELECT')
       OR has_table_privilege('anon', 'public.admin_allowlist', 'INSERT')
       OR has_table_privilege('authenticated', 'public.admin_allowlist', 'INSERT') THEN
      RAISE EXCEPTION 'ACL check failed: admin_allowlist readable/writable by anon or authenticated';
    END IF;

    SELECT p.oid INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_super_admin';

    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL check failed: is_super_admin executable by anon';
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL check failed: is_super_admin NOT executable by authenticated (RLS policies need it)';
    END IF;

    IF (SELECT count(*) FROM public.admin_allowlist) <> 1 THEN
      RAISE EXCEPTION 'Seed check failed: admin_allowlist must contain exactly 1 row';
    END IF;
  END $$;
  ```

- [ ] 3. Apply via Supabase MCP `apply_migration` (name `admin_allowlist_is_super_admin`), then verify applied state via `information_schema` (NOT `schema_migrations` — unreliable in this project):
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='admin_allowlist' ORDER BY ordinal_position;
  SELECT relrowsecurity, relforcerowsecurity, relacl FROM pg_class WHERE relname='admin_allowlist';
  SELECT proacl FROM pg_proc WHERE proname='is_super_admin';
  ```
  Expected: 4 columns; `relrowsecurity=t, relforcerowsecurity=t`; `relacl` without anon/authenticated entries; `proacl` shows authenticated EXECUTE only.

- [ ] 4. While connected, record the current `admin_events` posture for W2 (read-only — findings go in the PR description):
  ```sql
  SELECT polname, polcmd, polroles::regrole[] FROM pg_policy WHERE polrelid = 'public.admin_events'::regclass;
  SELECT relacl FROM pg_class WHERE relname = 'admin_events';
  ```
  Expected finding per reground: RLS policies are service_role-INSERT/admin-SELECT-UPDATE, but the TABLE carries `GRANT ALL TO anon, authenticated` — W2 revokes it.

- [ ] 5. Commit the migration file: `feat(admin): admin_allowlist table + is_super_admin() gate (W1 migration)`

---

### Task 2 — Edge-safe pure helpers (`super-admin-shared.ts`)

**Files**
- Create: `src/lib/admin/super-admin-shared.ts`
- Create: `src/lib/admin/__tests__/super-admin-shared.test.ts`

**Interfaces**
- Produces (imported by middleware AND server code — must stay edge-safe: no `server-only`, no supabase imports):
  ```typescript
  export function parseSuperAdminUserIds(raw: string | undefined | null): ReadonlySet<string>;
  export function isAdminPath(pathname: string): boolean;
  export type AdminGateDecision = 'not-admin-path' | 'block-native' | 'redirect-login' | 'redirect-dashboard' | 'pass';
  export function evaluateAdminGate(input: {
    pathname: string;
    isNative: boolean;
    userId: string | null;
    allowlistRaw: string | undefined;
  }): AdminGateDecision;
  ```

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/__tests__/super-admin-shared.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import {
    parseSuperAdminUserIds,
    isAdminPath,
    evaluateAdminGate,
  } from '@/lib/admin/super-admin-shared';

  const NICK = '11111111-1111-1111-1111-111111111111';

  describe('parseSuperAdminUserIds', () => {
    it('parses a comma list, trimming whitespace and empties', () => {
      expect([...parseSuperAdminUserIds(` ${NICK} , , abc `)]).toEqual([NICK, 'abc']);
    });
    it('returns an empty set for undefined/null/empty', () => {
      expect(parseSuperAdminUserIds(undefined).size).toBe(0);
      expect(parseSuperAdminUserIds(null).size).toBe(0);
      expect(parseSuperAdminUserIds('').size).toBe(0);
    });
  });

  describe('isAdminPath', () => {
    it('matches /admin and /admin/*', () => {
      expect(isAdminPath('/admin')).toBe(true);
      expect(isAdminPath('/admin/errors')).toBe(true);
    });
    it('does NOT match lookalikes', () => {
      expect(isAdminPath('/administrator')).toBe(false);
      expect(isAdminPath('/golf/admin')).toBe(false);
      expect(isAdminPath('/')).toBe(false);
    });
  });

  describe('evaluateAdminGate', () => {
    const base = { pathname: '/admin/errors', isNative: false, userId: NICK, allowlistRaw: NICK };
    it('passes the allowlisted admin', () => {
      expect(evaluateAdminGate(base)).toBe('pass');
    });
    it('ignores non-admin paths', () => {
      expect(evaluateAdminGate({ ...base, pathname: '/golf/dashboard' })).toBe('not-admin-path');
    });
    it('blocks native user agents BEFORE any auth logic', () => {
      expect(evaluateAdminGate({ ...base, isNative: true, userId: null })).toBe('block-native');
    });
    it('redirects unauthenticated to login', () => {
      expect(evaluateAdminGate({ ...base, userId: null })).toBe('redirect-login');
    });
    it('redirects authenticated non-admins to dashboard', () => {
      expect(evaluateAdminGate({ ...base, userId: 'someone-else' })).toBe('redirect-dashboard');
    });
    it('fails CLOSED when the allowlist env is unset', () => {
      expect(evaluateAdminGate({ ...base, allowlistRaw: undefined })).toBe('redirect-dashboard');
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/super-admin-shared.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/admin/super-admin-shared'`.

- [ ] 3. Implement `src/lib/admin/super-admin-shared.ts`:
  ```typescript
  /**
   * Helm Bridge — edge-safe super-admin helpers.
   *
   * Imported by BOTH src/lib/supabase/middleware.ts (edge runtime) and the
   * node server helper. MUST stay pure: no 'server-only', no supabase, no
   * node built-ins. The allowlist env var SUPER_ADMIN_USER_IDS is server-only
   * (never NEXT_PUBLIC_) and read by callers, not here.
   */

  export function parseSuperAdminUserIds(
    raw: string | undefined | null,
  ): ReadonlySet<string> {
    if (!raw) return new Set();
    return new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  export function isAdminPath(pathname: string): boolean {
    return pathname === '/admin' || pathname.startsWith('/admin/');
  }

  export type AdminGateDecision =
    | 'not-admin-path'
    | 'block-native'
    | 'redirect-login'
    | 'redirect-dashboard'
    | 'pass';

  /**
   * Pure decision core for the middleware layer. Order matters:
   * native block (App Store 4.2.2/3.1.1) → auth → allowlist. Fails CLOSED
   * (redirect-dashboard) when the allowlist env is missing.
   */
  export function evaluateAdminGate(input: {
    pathname: string;
    isNative: boolean;
    userId: string | null;
    allowlistRaw: string | undefined;
  }): AdminGateDecision {
    if (!isAdminPath(input.pathname)) return 'not-admin-path';
    if (input.isNative) return 'block-native';
    if (!input.userId) return 'redirect-login';
    const allow = parseSuperAdminUserIds(input.allowlistRaw);
    if (!allow.has(input.userId)) return 'redirect-dashboard';
    return 'pass';
  }
  ```

- [ ] 4. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/super-admin-shared.test.ts
  ```
  Expected: 10 tests pass.

- [ ] 5. Commit: `feat(admin): edge-safe super-admin gate helpers (W1)`

---

### Task 3 — Server helper `requireSuperAdmin()` / `checkSuperAdminAccess()`

**Files**
- Create: `src/lib/admin/require-super-admin.ts`
- Create: `src/lib/admin/__tests__/require-super-admin.test.ts`

**Interfaces**
- Consumes: `createClient()` from `@/lib/supabase/server`; `parseSuperAdminUserIds` from Task 2; `process.env.SUPER_ADMIN_USER_IDS`.
- Produces (THE shared gate — every wave imports these exact names):
  ```typescript
  export interface SuperAdminContext { userId: string; email: string; }
  export type SuperAdminProbe =
    | { allowed: true; context: SuperAdminContext }
    | { allowed: false; reason: 'unauthenticated' | 'forbidden' };
  export async function checkSuperAdminAccess(): Promise<SuperAdminProbe>; // non-throwing
  export async function requireSuperAdmin(): Promise<SuperAdminContext>;   // throws 'Unauthorized' | 'Forbidden'
  ```

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/__tests__/require-super-admin.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

  const mocks = vi.hoisted(() => ({
    getUser: vi.fn(),
  }));

  vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({
      auth: { getUser: mocks.getUser },
    })),
  }));

  import { requireSuperAdmin, checkSuperAdminAccess } from '@/lib/admin/require-super-admin';

  const NICK = '11111111-1111-1111-1111-111111111111';

  describe('requireSuperAdmin / checkSuperAdminAccess', () => {
    beforeEach(() => {
      vi.stubEnv('SUPER_ADMIN_USER_IDS', NICK);
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      mocks.getUser.mockReset();
    });

    it('returns context for the allowlisted admin', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: NICK, email: 'admin@helmsportslabs.com' } } });
      await expect(requireSuperAdmin()).resolves.toEqual({
        userId: NICK,
        email: 'admin@helmsportslabs.com',
      });
    });

    it('throws Unauthorized when no session', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: null } });
      await expect(requireSuperAdmin()).rejects.toThrow('Unauthorized');
    });

    it('throws Forbidden for an authenticated non-admin', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: 'intruder', email: 'x@y.z' } } });
      await expect(requireSuperAdmin()).rejects.toThrow('Forbidden');
    });

    it('fails CLOSED when the env allowlist is unset', async () => {
      vi.stubEnv('SUPER_ADMIN_USER_IDS', '');
      mocks.getUser.mockResolvedValue({ data: { user: { id: NICK, email: 'admin@helmsportslabs.com' } } });
      await expect(requireSuperAdmin()).rejects.toThrow('Forbidden');
    });

    it('probe variant never throws (the checkAdminAccess polling-flood lesson)', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: 'intruder', email: 'x@y.z' } } });
      await expect(checkSuperAdminAccess()).resolves.toEqual({ allowed: false, reason: 'forbidden' });
      mocks.getUser.mockResolvedValue({ data: { user: null } });
      await expect(checkSuperAdminAccess()).resolves.toEqual({ allowed: false, reason: 'unauthenticated' });
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/require-super-admin.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/require-super-admin.ts`:
  ```typescript
  import 'server-only';
  import { createClient } from '@/lib/supabase/server';
  import { parseSuperAdminUserIds } from '@/lib/admin/super-admin-shared';

  /**
   * Helm Bridge Layer 2 — THE shared server gate.
   *
   * requireSuperAdmin() must be the FIRST LINE of:
   *   - src/app/admin/layout.tsx
   *   - every page.tsx under src/app/admin
   *   - every export in src/app/admin/actions/*
   *   - every /api/admin-center route handler
   * Only after it resolves may code touch createAdminClient() or the
   * SENTRY_READ_TOKEN / VERCEL_API_TOKEN modules.
   *
   * checkSuperAdminAccess() is the NON-THROWING probe for polling clients —
   * preserves the checkAdminAccess() pattern (admin-data.ts:95-120) that ended
   * the 576-errors/day flood: a downgraded session stops polling cleanly
   * instead of 500ing every 5 minutes.
   */

  export interface SuperAdminContext {
    userId: string;
    email: string;
  }

  export type SuperAdminProbe =
    | { allowed: true; context: SuperAdminContext }
    | { allowed: false; reason: 'unauthenticated' | 'forbidden' };

  export async function checkSuperAdminAccess(): Promise<SuperAdminProbe> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { allowed: false, reason: 'unauthenticated' };

    const allow = parseSuperAdminUserIds(process.env.SUPER_ADMIN_USER_IDS);
    if (!allow.has(user.id)) return { allowed: false, reason: 'forbidden' };

    return { allowed: true, context: { userId: user.id, email: user.email ?? '' } };
  }

  export async function requireSuperAdmin(): Promise<SuperAdminContext> {
    const probe = await checkSuperAdminAccess();
    if (!probe.allowed) {
      throw new Error(probe.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden');
    }
    return probe.context;
  }
  ```

- [ ] 4. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/require-super-admin.test.ts
  ```
  Expected: 5 tests pass.

- [ ] 5. Commit: `feat(admin): shared requireSuperAdmin server gate (W1)`

---

### Task 4 — Middleware `/admin` matcher (Layer 1) + native exclusion

**Files**
- Modify: `src/lib/supabase/middleware.ts` (the `updateSession` function; user fetched at line 347-349)
- Modify: `src/proxy.ts` (add `/admin` to `APP_ROUTE_PREFIXES`, line 9-18)

**Interfaces**
- Consumes: `evaluateAdminGate`, `isAdminPath` from `@/lib/admin/super-admin-shared`; existing `isNativeUserAgent` in `middleware.ts:69-72`.
- Produces: `/admin/*` requests are gated in middleware before any page renders.

**Steps**

- [ ] 1. Red state: the decision core is already tested (Task 2). Prove middleware has no admin logic:
  ```bash
  grep -n "admin" src/lib/supabase/middleware.ts src/proxy.ts
  ```
  Expected: no `/admin` path handling (only unrelated matches, if any).

- [ ] 2. In `src/proxy.ts`, add `'/admin'` to `APP_ROUTE_PREFIXES` (after `'/baseball'`) so the generic native marketing redirect no longer *accidentally* covers `/admin` — the explicit block below owns it:
  ```typescript
  const APP_ROUTE_PREFIXES = [
    '/golf',
    '/baseball',
    '/admin',
    '/api',
    '/auth',
    '/support',
    '/privacy',
    '/terms',
    '/dev',
  ];
  ```

- [ ] 3. In `src/lib/supabase/middleware.ts`: mirror the same `'/admin'` addition to its local `APP_ROUTE_PREFIXES` (line 58-67), add the import, and insert the gate immediately after the `getUser()` call (after line 350, before the dashboard-route logic):
  ```typescript
  import { evaluateAdminGate } from '@/lib/admin/super-admin-shared';
  ```
  ```typescript
  // ── Helm Bridge Layer 1: /admin gate ──────────────────────────────────────
  // Explicit native block (App Store 4.2.2/3.1.1) + Nick-only allowlist.
  // This is the cheap first filter — NEVER the sole gate (Next middleware has
  // had bypass CVEs). Layer 2 is requireSuperAdmin() in every server entry
  // point; Layer 3 is deny-by-default RLS via is_super_admin().
  const adminGate = evaluateAdminGate({
    pathname,
    isNative: isNativeUserAgent(request),
    userId: user?.id ?? null,
    allowlistRaw: process.env.SUPER_ADMIN_USER_IDS,
  });
  if (adminGate === 'block-native' || adminGate === 'redirect-dashboard') {
    return NextResponse.redirect(new URL('/golf/dashboard', request.url));
  }
  if (adminGate === 'redirect-login') {
    const url = request.nextUrl.clone();
    url.pathname = '/golf/login';
    url.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(url);
  }
  // 'pass' and 'not-admin-path' fall through to the existing logic.
  ```

- [ ] 4. Gates:
  ```bash
  npm run typecheck && npm run test:run
  ```
  Expected: green (the existing `nav-capability-gating.test.ts` middleware contract must still pass — the gate was inserted after `getUser()`, before baseball routing, touching nothing else).

- [ ] 5. Commit: `feat(admin): middleware /admin allowlist gate + native-UA exclusion (W1)`

---

### Task 5 — `/admin` route group: gated layout + placeholder page + gate-coverage contract test

**Files**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx` (placeholder — replaced in W5)
- Create: `src/app/admin/_motion-provider.tsx`
- Create: `src/app/admin/__tests__/admin-gate-coverage.test.ts`

**Interfaces**
- Consumes: `requireSuperAdmin` (Task 3), `AdminNativeGuard` from `@/components/golf/AdminNativeGuard` (existing, `src/components/golf/AdminNativeGuard.tsx`), `LazyMotion`/`domAnimation` from `framer-motion`.
- Produces: the `/admin` shell every later wave mounts pages into.

**Steps**

- [ ] 1. Write the failing gate-coverage contract test `src/app/admin/__tests__/admin-gate-coverage.test.ts` — this is the CI enforcement for risk #2 (one missed gate = full data leak):
  ```typescript
  /**
   * CONTRACT: every server entry point under src/app/admin must call
   * requireSuperAdmin() or checkSuperAdminAccess() before doing anything.
   * A page/action file that never mentions the gate fails this test — the
   * cheap, always-on version of "enforced in review".
   */
  import { describe, it, expect } from 'vitest';
  import { readFileSync, readdirSync, statSync } from 'node:fs';
  import { join } from 'node:path';

  const ADMIN_ROOT = join(process.cwd(), 'src/app/admin');

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        return entry === '__tests__' ? [] : walk(full);
      }
      return [full];
    });
  }

  describe('admin gate coverage', () => {
    it('every page.tsx, layout.tsx and actions/*.ts under src/app/admin calls the gate', () => {
      const files = walk(ADMIN_ROOT).filter(
        (f) =>
          f.endsWith('/page.tsx') ||
          f.endsWith('/layout.tsx') ||
          (f.includes('/actions/') && f.endsWith('.ts')),
      );
      expect(files.length).toBeGreaterThan(0);
      const missing = files.filter((f) => {
        const src = readFileSync(f, 'utf8');
        return !src.includes('requireSuperAdmin') && !src.includes('checkSuperAdminAccess');
      });
      expect(missing).toEqual([]);
    });
  });
  ```

- [ ] 2. Run to confirm failure (the directory doesn't exist yet):
  ```bash
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  ```
  Expected: FAIL — `ENOENT ... src/app/admin`.

- [ ] 3. Create `src/app/admin/_motion-provider.tsx` (same pattern as `src/app/golf/admin/_motion-provider.tsx` — the documented LazyMotion gotcha):
  ```tsx
  'use client';

  import { LazyMotion, domAnimation } from 'framer-motion';
  import type { ReactNode } from 'react';

  /**
   * LazyMotion(domAnimation) at the /admin route root. Without it every
   * `<m.*>` renders as static DOM and animated numbers freeze at 0 — this
   * bit the golf-admin Tracer KPI tiles before (see golf/admin/layout.tsx).
   */
  export function AdminMotionProvider({ children }: { children: ReactNode }) {
    return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
  }
  ```

- [ ] 4. Create `src/app/admin/layout.tsx`:
  ```tsx
  import { redirect } from 'next/navigation';
  import { checkSuperAdminAccess } from '@/lib/admin/require-super-admin';
  import { AdminNativeGuard } from '@/components/golf/AdminNativeGuard';
  import { AdminMotionProvider } from './_motion-provider';

  export const dynamic = 'force-dynamic';

  export default async function AdminLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    // Layer 2 — first line, before ANY data access. Layout uses the
    // non-throwing probe so denial is a clean redirect, not a 500.
    const probe = await checkSuperAdminAccess();
    if (!probe.allowed) {
      redirect(probe.reason === 'unauthenticated' ? '/golf/login' : '/golf/dashboard');
    }

    // AdminNativeGuard hides /admin from the iOS Capacitor shell (App Store
    // 4.2.2/3.1.1) — belt to the middleware's braces.
    return (
      <AdminMotionProvider>
        <AdminNativeGuard />
        {children}
      </AdminMotionProvider>
    );
  }
  ```

- [ ] 5. Create the placeholder `src/app/admin/page.tsx`:
  ```tsx
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';

  export const dynamic = 'force-dynamic';

  export default async function AdminOverviewPage() {
    const admin = await requireSuperAdmin();

    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-xs uppercase tracking-widest text-warm-500">Helm Bridge</p>
        <h1 className="mt-2 text-3xl font-semibold text-warm-900">Command center online</h1>
        <p className="mt-4 text-sm text-warm-500">
          Signed in as {admin.email}. Panels arrive in W5.
        </p>
      </main>
    );
  }
  ```

- [ ] 6. Run to confirm pass, then all gates:
  ```bash
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```
  Expected: contract test green; full gates green.

- [ ] 7. Manual smoke (against local dev with `SUPER_ADMIN_USER_IDS` set in `.env.local`): `npm run dev`, then (a) `/admin` logged out → `/golf/login?returnTo=/admin`; (b) `/admin` as a non-admin user → `/golf/dashboard`; (c) `/admin` as Nick → placeholder renders; (d) `curl -A "HelmSportsLabsApp" -I http://localhost:3000/admin` → 307 to `/golf/dashboard`.

- [ ] 8. Commit: `feat(admin): gated /admin route group + native guard + gate-coverage contract (W1)`

---

## Acceptance Criteria

- [ ] `admin_allowlist` exists on prod with exactly 1 row (Nick); RLS ENABLE+FORCE; no anon/authenticated table privileges (verified via `pg_class.relacl`).
- [ ] `is_super_admin()` exists; EXECUTE = authenticated only (verified via `pg_proc.proacl`).
- [ ] All 15 W1 unit tests pass; full `npm run test:run`, `typecheck`, `lint` green.
- [ ] Middleware redirects: unauth → login (with returnTo), non-admin → dashboard, native UA → dashboard; Nick passes.
- [ ] `/admin` renders the placeholder for Nick only; gate-coverage contract test enforces `requireSuperAdmin` in every current and future `/admin` entry point.
- [ ] Owner has set `SUPER_ADMIN_USER_IDS=<NICK_UUID>` in Vercel (Production + Preview) — without it the gate fails CLOSED (nobody enters, including Nick), which is the correct failure mode.

## Rollback

- Code: `git revert` the W1 PR — `/admin` disappears; middleware returns to pre-gate behavior; no other route touched.
- DB: `admin_allowlist`/`is_super_admin()` are inert without callers; if removal is ever required: `DROP FUNCTION public.is_super_admin(); DROP TABLE public.admin_allowlist;` (additive objects, no dependents until W3).
