# W7: Auth & Sign-ins Tab + Full Auth Capture Coverage

**Goal:** Ship `/admin/auth` (sign-in feed, failed-auth/lockout panel, active sessions with revoke, signup→activation funnel) and close capture class #3: baseball/lifting auth logging, middleware failure capture, anonymous client-error logging, and the `AuthApiError` ignore-list narrowing.

**Depends-on:** W2 (writer columns), W3 (`get_active_sessions()`), W4 (panel pattern).

**PR-scope:** ONE PR (one migration + capture wiring + the tab).

**Reground facts this wave builds on:** golf `src/app/golf/actions/auth.ts` ALREADY logs successful logins (line 145), failed logins as security events (line ~109), and signups (line 343) — golf needs only password-reset coverage. `src/app/baseball/actions/auth.ts` and `src/app/lifting/actions/auth.ts` import NO admin-logger helpers (verified by grep) — that is the real gap. `auth.audit_log_entries` is EMPTY (0 rows); app-level capture is the source of truth (OQ5).

---

### Task 1 — Migration: `revoke_user_sessions()` RPC

**Files**
- Create: `supabase/migrations/20260701140000_revoke_user_sessions_rpc.sql`

**Interfaces**
- Produces:
  ```sql
  FUNCTION public.revoke_user_sessions(p_user_id uuid) RETURNS integer; -- SECURITY DEFINER, is_super_admin()-gated
  ```
  (The design sketch named `supabase.auth.admin.signOut(userId)` — that is not the actual supabase-js admin signature; deleting `auth.sessions` rows via an internally-gated RPC is the same effect through our established RPC pattern.)

**Steps**

- [ ] 1. Red state via `execute_sql`: `SELECT proname FROM pg_proc WHERE proname='revoke_user_sessions';` → 0 rows.

- [ ] 2. Create the migration:
  ```sql
  -- W7: sign-out-everywhere for a compromised account. Deleting auth.sessions
  -- rows invalidates refresh tokens; access tokens expire within the hour.
  CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid) RETURNS integer
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $$
  DECLARE
    v_count integer;
  BEGIN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;

    DELETE FROM auth.sessions WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO public.audit_log (user_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), 'admin.revoke_sessions', 'auth.sessions', p_user_id,
            jsonb_build_object('revoked_count', v_count, 'target_user', p_user_id));

    RETURN v_count;
  END;
  $$;

  REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO authenticated;

  DO $$
  DECLARE v_fn oid;
  BEGIN
    SELECT p.oid INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='revoke_user_sessions';
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL check failed: revoke_user_sessions executable by anon';
    END IF;
  END $$;
  ```

- [ ] 3. Apply via `apply_migration` (name `revoke_user_sessions_rpc`); verify: the `SELECT public.revoke_user_sessions('00000000-0000-0000-0000-000000000000');` from the SQL editor raises `Forbidden` (auth.uid() NULL) — that IS the pass. Run `npm run db:types` and commit the diff.

- [ ] 4. Commit: `feat(admin): revoke_user_sessions RPC (W7 migration)`

---

### Task 2 — Capture coverage: middleware, baseball/lifting auth, anonymous log-error, ignore-list narrowing

**Files**
- Create: `src/app/api/internal/log-auth-failure/route.ts`
- Modify: `src/proxy.ts` (catch block, lines 64-79)
- Modify: `src/app/baseball/actions/auth.ts` (+ `src/app/lifting/actions/auth.ts`)
- Modify: `src/app/golf/actions/auth.ts` (password-reset event, around line 390)
- Modify: `src/app/api/log-error/route.ts` (anonymous relax, lines 15-20)
- Modify: `src/instrumentation.ts` (narrow the bare `'AuthApiError'` ignore entry)
- Create: `src/app/api/internal/__tests__/log-auth-failure.test.ts`

**Interfaces**
- Produces (internal route — the edge-safe target for middleware capture; `server-error-logger`'s `createAdminClient` is NOT edge-safe, hence fetch-to-node-route):
  ```
  POST /api/internal/log-auth-failure
  body: { message: string; pathname?: string }
  auth: header 'x-internal-log-key' must equal INTERNAL_LOG_KEY env (server-only shared secret)
  → 204 on accept, 401 on bad key, 429 over rate limit
  ```

**Steps**

- [ ] 1. Write the failing test `src/app/api/internal/__tests__/log-auth-failure.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  const mocks = vi.hoisted(() => ({ logServerEvent: vi.fn(async () => {}) }));
  vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: mocks.logServerEvent }));

  import { POST } from '@/app/api/internal/log-auth-failure/route';

  function req(body: unknown, key?: string) {
    return new Request('http://localhost/api/internal/log-auth-failure', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'x-internal-log-key': key } : {}) },
      body: JSON.stringify(body),
    });
  }

  describe('POST /api/internal/log-auth-failure', () => {
    beforeEach(() => {
      vi.stubEnv('INTERNAL_LOG_KEY', 'secret-key');
      mocks.logServerEvent.mockClear();
    });

    it('rejects a missing/wrong key', async () => {
      const res = await POST(req({ message: 'x' }, 'wrong') as never);
      expect(res.status).toBe(401);
      expect(mocks.logServerEvent).not.toHaveBeenCalled();
    });

    it('accepts and logs with source=auth', async () => {
      const res = await POST(req({ message: 'updateSession failed: boom', pathname: '/golf/dashboard' }, 'secret-key') as never);
      expect(res.status).toBe(204);
      const [message, ctx, severity] = mocks.logServerEvent.mock.calls[0]!;
      expect(message).toContain('updateSession failed');
      expect(ctx).toMatchObject({ source: 'auth', route: '/golf/dashboard' });
      expect(severity).toBe('warning');
    });

    it('caps the message size (no 10MB payloads into admin_events)', async () => {
      await POST(req({ message: 'x'.repeat(20000) }, 'secret-key') as never);
      const [message] = mocks.logServerEvent.mock.calls[0]!;
      expect((message as string).length).toBeLessThanOrEqual(2000);
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/app/api/internal/__tests__/log-auth-failure.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/app/api/internal/log-auth-failure/route.ts`:
  ```typescript
  import { NextResponse, type NextRequest } from 'next/server';
  import { logServerEvent } from '@/lib/server-error-logger';

  export const runtime = 'nodejs';
  export const dynamic = 'force-dynamic';

  /**
   * Edge→node capture bridge. proxy.ts (edge) cannot use server-error-logger
   * directly (createAdminClient is not edge-safe), so it fires-and-forgets a
   * POST here. Shared-secret header, tiny payload, best-effort semantics.
   */

  const inMemoryWindow = new Map<string, { count: number; resetAt: number }>();

  function overLimit(ip: string): boolean {
    const now = Date.now();
    const entry = inMemoryWindow.get(ip);
    if (!entry || now > entry.resetAt) {
      inMemoryWindow.set(ip, { count: 1, resetAt: now + 60_000 });
      return false;
    }
    entry.count += 1;
    return entry.count > 30;
  }

  export async function POST(request: NextRequest) {
    const expected = process.env.INTERNAL_LOG_KEY;
    if (!expected || request.headers.get('x-internal-log-key') !== expected) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    if (overLimit(ip)) return NextResponse.json({ ok: false }, { status: 429 });

    let body: { message?: unknown; pathname?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      // tolerate malformed bodies — best-effort telemetry
    }
    const message = String(body.message ?? 'middleware auth failure').slice(0, 2000);
    const pathname = typeof body.pathname === 'string' ? body.pathname.slice(0, 300) : null;

    await logServerEvent(
      message,
      { action: 'middleware.updateSession', source: 'auth', route: pathname, skipSentry: false },
      'warning',
    );
    return new NextResponse(null, { status: 204 });
  }
  ```

- [ ] 4. Wire the middleware catch. In `src/proxy.ts`, inside the existing `catch` (after the `console.warn` at line 77, keeping the refresh-token downgrade branch EXACTLY as-is — that suppression is load-bearing), add for the non-refresh-token branch only:
  ```typescript
      } else {
        console.warn('[Proxy] Session update failed:', message);
        // Helm Bridge capture class #3: session-update failures were
        // console.warn-swallowed and invisible. Fire-and-forget to the node
        // logging route (edge-safe: plain fetch, never awaited-to-throw).
        const key = process.env.INTERNAL_LOG_KEY;
        if (key) {
          fetch(new URL('/api/internal/log-auth-failure', request.url), {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-internal-log-key': key },
            body: JSON.stringify({
              message: `updateSession failed: ${message}`.slice(0, 2000),
              pathname: request.nextUrl.pathname,
            }),
          }).catch(() => {});
        }
      }
  ```

- [ ] 5. Baseball + lifting auth logging. In `src/app/baseball/actions/auth.ts` (and mirrored in `src/app/lifting/actions/auth.ts`), add the import and three call sites matching golf's exact fire-and-forget pattern (`golf/actions/auth.ts:109-151,343`):
  ```typescript
  import { logLogin, logSignup, logSecurityEvent } from '@/lib/admin-logger';
  ```
  - after a successful `signInWithPassword`: `logLogin(data.user.id, normalizedEmail, { sport: 'baseball' }).catch(() => {});`
  - in the sign-in error branch: `logSecurityEvent(`Failed login attempt: ${normalizedEmail}`, 'info', { sport: 'baseball' }).catch(() => {});`
  - after a successful `signUp`: `logSignup(data.user.id, normalizedEmail, role, { sport: 'baseball' }).catch(() => {});`
  (lifting uses `sport: 'shared'` — Lift Lab is cross-sport. Executor: read each file first; place the calls at the exact success/error branches, mirroring golf. The W2 `logLogin` hoists `sport` from metadata into the column.)

- [ ] 6. Golf password-reset event. In `src/app/golf/actions/auth.ts` after the `resetPasswordForEmail` call (line ~390):
  ```typescript
    logSecurityEvent('Password reset requested', 'info', { email: normalizedEmail, sport: 'golf' }).catch(() => {});
  ```

- [ ] 7. Anonymous client errors. In `src/app/api/log-error/route.ts`, replace the 401 branch (lines 15-20) — keep the rate limit and 10KB context cap that already exist:
  ```typescript
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // Was: 401 for unauthenticated users — which blinded us to login/signup
      // flow client errors (they reached Sentry but never error_logs).
      // Anonymous writes are accepted, flagged, and severity-capped.
      const isAnonymous = !user;
  ```
  then where the row is built, add `anonymous: isAnonymous` into the context jsonb, force `severity` to at most `'error'` when `isAnonymous`, and keep `user_id: user?.id ?? null`.

- [ ] 8. Narrow the Sentry ignore. In `src/instrumentation.ts`, find the shared ignore list containing the bare `'AuthApiError'` entry and replace that single entry with message-specific patterns (KEEP the refresh-token suppression — idle tabs flood Sentry without it):
  ```typescript
      // Was: 'AuthApiError' — which suppressed ALL Supabase auth errors.
      // Keep ONLY the routine refresh-token-expiry noise suppressed.
      /AuthApiError: Invalid Refresh Token/,
      /Refresh Token Not Found/,
  ```

- [ ] 9. Run to confirm pass + gates:
  ```bash
  npm run test:run -- src/app/api/internal/__tests__/log-auth-failure.test.ts
  npm run typecheck && npm run lint && npm run test:run && npm run build
  ```
  Expected: 3 new tests pass; existing `change-password.test.ts` / `demo-access.test.ts` still green.

- [ ] 10. Commit: `feat(admin): full auth capture — middleware bridge, baseball/lifting logging, anonymous log-error, narrowed ignore (W7)`

---

### Task 3 — Auth tab: feed, lockouts, sessions with revoke, activation funnel

**Files**
- Create: `src/lib/admin/data/auth.ts`
- Create: `src/lib/admin/data/__tests__/auth.test.ts`
- Create: `src/app/admin/auth/page.tsx`
- Create: `src/app/admin/actions/sessions.ts`
- Create: `src/app/admin/_components/SessionsPanel.tsx`

**Interfaces**
- Produces:
  ```typescript
  // data/auth.ts
  export interface AuthFeedRow { id: string; event_type: string; title: string; severity: string; user_email: string | null; sport: string | null; created_at: string; }
  export interface LockoutRow { email: string; failed_attempts: number; locked_until: string | null; last_attempt: string | null; }
  export interface SessionRow { session_id: string; user_id: string; email: string; created_at: string; updated_at: string; last_sign_in_at: string | null; }
  export function detectFailureBurst(rows: Array<{ created_at: string }>, windowMinutes: number, threshold: number, now: Date): boolean;
  export async function fetchAuthTab(): Promise<{
    feed: AuthFeedRow[];
    lockouts: LockoutRow[];
    burst: boolean;
    funnel: { signups7d: number; activated7d: number; activationRate: number };
  }>;
  export async function fetchActiveSessions(): Promise<SessionRow[]>; // user-scoped RPC
  // actions/sessions.ts ('use server')
  export async function revokeSessionsForUser(userId: string): Promise<{ revokedCount: number }>;
  ```
- Consumes: `computeActivation` from `@/lib/admin/metrics` (existing, ratio in [0,1] — `metrics.ts:36-45`), `get_active_sessions`/`revoke_user_sessions` RPCs (user-scoped client), `login_attempts` table, `logSecurityEvent`.

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/data/__tests__/auth.test.ts` (pure burst detection):
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { detectFailureBurst } from '@/lib/admin/data/auth';

  const now = new Date('2026-07-01T12:00:00Z');
  const at = (minAgo: number) => ({ created_at: new Date(now.getTime() - minAgo * 60000).toISOString() });

  describe('detectFailureBurst', () => {
    it('flags >= threshold failures inside the window', () => {
      expect(detectFailureBurst([at(1), at(5), at(9), at(14)], 15, 4, now)).toBe(true);
    });
    it('ignores failures outside the window', () => {
      expect(detectFailureBurst([at(1), at(20), at(40), at(60)], 15, 4, now)).toBe(false);
    });
    it('quiet feed → no burst', () => {
      expect(detectFailureBurst([], 15, 4, now)).toBe(false);
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/auth.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/data/auth.ts`:
  ```typescript
  import 'server-only';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { createClient } from '@/lib/supabase/server';
  import { computeActivation } from '@/lib/admin/metrics';

  export interface AuthFeedRow {
    id: string; event_type: string; title: string; severity: string;
    user_email: string | null; sport: string | null; created_at: string;
  }
  export interface LockoutRow {
    email: string; failed_attempts: number; locked_until: string | null; last_attempt: string | null;
  }
  export interface SessionRow {
    session_id: string; user_id: string; email: string;
    created_at: string; updated_at: string; last_sign_in_at: string | null;
  }

  /** SQL-free burst heuristic: N failures inside the trailing window. */
  export function detectFailureBurst(
    rows: Array<{ created_at: string }>,
    windowMinutes: number,
    threshold: number,
    now: Date,
  ): boolean {
    const cutoff = now.getTime() - windowMinutes * 60_000;
    const inWindow = rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
    return inWindow.length >= threshold;
  }

  /** CALLER must have passed requireSuperAdmin(). */
  export async function fetchAuthTab() {
    const admin = createAdminClient();
    const ago7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const ago24h = new Date(Date.now() - 86400_000).toISOString();

    const [feedRes, lockoutRes, failures24h, signupsRes, golfActive, baseballActive, liftActive] =
      await Promise.all([
        admin.from('admin_events')
          .select('id, event_type, title, severity, user_email, sport, created_at')
          .in('event_type', ['login', 'signup', 'security'])
          .gte('created_at', ago7d)
          .order('created_at', { ascending: false })
          .limit(200),
        admin.from('login_attempts')
          .select('email, failed_attempts, locked_until, last_attempt')
          .gt('failed_attempts', 0)
          .order('last_attempt', { ascending: false })
          .limit(50),
        admin.from('admin_events')
          .select('created_at')
          .eq('event_type', 'security')
          .gte('created_at', ago24h),
        admin.from('users')
          .select('id, created_at')
          .gte('created_at', ago7d),
        admin.from('golf_rounds').select('player_id').gte('created_at', ago7d).limit(1000),
        admin.from('baseball_games').select('id').gte('created_at', ago7d).limit(1000),
        admin.from('helm_lifting_sessions').select('athlete_id').gte('created_at', ago7d).limit(1000),
      ]);

    const signups7d = signupsRes.data?.length ?? 0;
    // Activation proxy: any first-week activity row in any sport. Exact
    // per-user join lives in the Users tab; the funnel tile is a rate.
    const activity7d =
      (golfActive.data?.length ?? 0) + (baseballActive.data?.length ?? 0) + (liftActive.data?.length ?? 0);
    const activated7d = Math.min(signups7d, activity7d);

    return {
      feed: (feedRes.data ?? []) as AuthFeedRow[],
      lockouts: (lockoutRes.data ?? []) as LockoutRow[],
      burst: detectFailureBurst(failures24h.data ?? [], 15, 4, new Date()),
      funnel: {
        signups7d,
        activated7d,
        activationRate: computeActivation({ signups: signups7d, activated: activated7d }),
      },
    };
  }

  /** USER-SCOPED client — get_active_sessions() gates on auth.uid() via
   *  is_super_admin() and Forbids under service_role (by design). */
  export async function fetchActiveSessions(): Promise<SessionRow[]> {
    const supabase = await createClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: 'get_active_sessions',
    ) => Promise<{ data: SessionRow[] | null; error: { message: string } | null }>;
    const { data, error } = await rpc('get_active_sessions');
    if (error) throw new Error(`get_active_sessions failed: ${error.message}`);
    return data ?? [];
  }
  ```

- [ ] 4. Create `src/app/admin/actions/sessions.ts`:
  ```typescript
  'use server';

  import { revalidatePath } from 'next/cache';
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { createClient } from '@/lib/supabase/server';
  import { logSecurityEvent } from '@/lib/admin-logger';

  export async function revokeSessionsForUser(
    userId: string,
  ): Promise<{ revokedCount: number }> {
    const admin = await requireSuperAdmin();

    const supabase = await createClient(); // user-scoped: RPC gates on auth.uid()
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: 'revoke_user_sessions',
      args: { p_user_id: string },
    ) => Promise<{ data: number | null; error: { message: string } | null }>;

    const { data, error } = await rpc('revoke_user_sessions', { p_user_id: userId });
    if (error) throw new Error(`revoke_user_sessions failed: ${error.message}`);

    // Audit into the event feed too (the RPC already wrote audit_log).
    logSecurityEvent(`Admin revoked all sessions for user ${userId}`, 'warning', {
      targetUserId: userId,
      revokedBy: admin.userId,
    }).catch(() => {});

    revalidatePath('/admin/auth');
    return { revokedCount: data ?? 0 };
  }
  ```

- [ ] 5. Create `src/app/admin/_components/SessionsPanel.tsx` (client — confirm-then-revoke):
  ```tsx
  'use client';

  import { useState, useTransition } from 'react';
  import { useRouter } from 'next/navigation';
  import type { SessionRow } from '@/lib/admin/data/auth';
  import { revokeSessionsForUser } from '@/app/admin/actions/sessions';

  export function SessionsPanel({ sessions }: { sessions: SessionRow[] }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    return (
      <ul className="divide-y divide-warm-200/60">
        {sessions.map((s) => (
          <li key={s.session_id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-warm-900">{s.email}</p>
              <p className="font-fw-mono text-xs tabular-nums text-warm-500">
                started {new Date(s.created_at).toLocaleString()} · refreshed{' '}
                {new Date(s.updated_at).toLocaleString()}
              </p>
            </div>
            {confirming === s.user_id ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await revokeSessionsForUser(s.user_id);
                    setConfirming(null);
                    router.refresh();
                  })
                }
                className="rounded-lg bg-fw-danger px-2.5 py-1 text-xs font-medium text-white"
              >
                Confirm sign-out everywhere
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(s.user_id)}
                className="rounded-lg border border-warm-300 px-2.5 py-1 text-xs text-warm-700 hover:bg-warm-100"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    );
  }
  ```

- [ ] 6. Create `src/app/admin/auth/page.tsx`:
  ```tsx
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { fetchAuthTab, fetchActiveSessions } from '@/lib/admin/data/auth';
  import { PanelBoundary } from '../_components/PanelBoundary';
  import { PanelAllClear } from '../_components/PanelStates';
  import { SessionsPanel } from '../_components/SessionsPanel';
  import { SportBadge, type BridgeSport } from '../_components/SportBadge';
  import { AutoRefresh } from '../_components/AutoRefresh';

  export const dynamic = 'force-dynamic';

  async function AuthBody() {
    const tab = await fetchAuthTab();
    return (
      <div className="space-y-6">
        {tab.burst ? (
          <p className="rounded-xl bg-fw-danger-bg px-4 py-2 text-sm text-fw-danger">
            Failure burst: 4+ failed logins in the last 15 minutes
          </p>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <p className="text-xs uppercase tracking-widest text-warm-500">Signups 7d</p>
            <p className="font-fw-mono text-2xl tabular-nums">{tab.funnel.signups7d}</p>
          </div>
          <div className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <p className="text-xs uppercase tracking-widest text-warm-500">Activated within 7d</p>
            <p className="font-fw-mono text-2xl tabular-nums">{tab.funnel.activated7d}</p>
          </div>
          <div className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <p className="text-xs uppercase tracking-widest text-warm-500">Activation rate</p>
            <p className="font-fw-mono text-2xl tabular-nums">
              {Math.round(tab.funnel.activationRate * 100)}%
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Lockouts & failed attempts</h2>
          {tab.lockouts.length === 0 ? (
            <PanelAllClear label="No accounts with failed attempts" checkedAt={new Date().toISOString()} />
          ) : (
            <ul className="divide-y divide-warm-200/60">
              {tab.lockouts.map((l) => (
                <li key={l.email} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{l.email}</span>
                  <span className="font-fw-mono text-xs tabular-nums">{l.failed_attempts} failed</span>
                  {l.locked_until && new Date(l.locked_until) > new Date() ? (
                    <span className="rounded-full bg-fw-danger-bg px-2 py-0.5 text-xs text-fw-danger">
                      locked until {new Date(l.locked_until).toLocaleTimeString()}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Sign-in & auth feed (7d)</h2>
          <ul className="divide-y divide-warm-200/60">
            {tab.feed.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-16 text-xs uppercase text-warm-500">{row.event_type}</span>
                <span className="min-w-0 flex-1 truncate">{row.title}{row.user_email ? ` — ${row.user_email}` : ''}</span>
                <SportBadge sport={(row.sport as BridgeSport) ?? null} />
                <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  async function Sessions() {
    const sessions = await fetchActiveSessions();
    return (
      <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
          Active sessions ({sessions.length})
        </h2>
        <SessionsPanel sessions={sessions} />
      </section>
    );
  }

  export default async function AuthPage() {
    await requireSuperAdmin();
    return (
      <main className="space-y-6 p-6">
        <AutoRefresh />
        <PanelBoundary title="Auth & sign-ins"><AuthBody /></PanelBoundary>
        <PanelBoundary title="Active sessions"><Sessions /></PanelBoundary>
      </main>
    );
  }
  ```

- [ ] 7. Run to confirm pass + gates:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/auth.test.ts
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```

- [ ] 8. Manual smoke: sign in as a baseball demo user → a `login` row with `sport='baseball'` appears in the feed; revoke a throwaway user's session → `revokedCount ≥ 1`, `audit_log` gains an `admin.revoke_sessions` row, and the user's next request is signed out.

- [ ] 9. Commit: `feat(admin): auth tab — feed, lockouts, sessions+revoke, activation funnel (W7)`

---

## Acceptance Criteria

- [ ] Baseball and lifting logins/signups/failed-attempts now write `admin_events` (source=`auth`, sport tagged) — verified live per sport.
- [ ] Middleware `updateSession` failures reach `admin_events` via the internal route (verify: temporarily throw inside `updateSession` on a dev-only path → row appears; remove the throw).
- [ ] `/api/log-error` accepts unauthenticated posts flagged `anonymous: true`, severity-capped, still rate-limited.
- [ ] Bare `'AuthApiError'` no longer in the ignore list; refresh-token-expiry patterns still suppressed.
- [ ] Sessions panel lists live `auth.sessions`; revoke works and is double-audited (audit_log + admin_events).
- [ ] Owner provisioned `INTERNAL_LOG_KEY` (any 32+ char secret) — without it the middleware bridge silently no-ops (fail-soft, correct).
- [ ] All gates green; 9 new tests pass.

## Rollback

`git revert` the PR (capture wiring and tab disappear together; auth flows revert to their W0 behavior — logins never depended on the logging). DB: `DROP FUNCTION public.revoke_user_sessions(uuid);` if required.
