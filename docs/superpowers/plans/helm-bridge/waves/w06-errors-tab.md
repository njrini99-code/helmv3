# W6: Errors Tab + RLS-Denial Capture + `withAdminObserved`

**Goal:** Full error drill-down (`/admin/errors`) — Sentry table, errors-over-time with deploy markers, in-app incident feed with URL-persisted filters, per-fingerprint detail — plus two of the four net-new capture classes: `rls_denial` and `server_action_failed`.

**Depends-on:** W2 (columns + writer), W3 (sentry-api, triage), W4 (panel pattern), W5 (resolve action in use).

**PR-scope:** ONE PR.

---

### Task 1 — `rls_denial` capture helper (+ additive `ServerTraceSource` extension)

**Files**
- Modify: `src/lib/server-error-logger.ts` (union extension only)
- Create: `src/lib/admin/rls-denial.ts`
- Create: `src/lib/admin/__tests__/rls-denial.test.ts`

**Interfaces**
- Modify (additive union — the W2 DB CHECK already lists these values):
  ```typescript
  export type ServerTraceSource =
    | 'server_action' | 'route_handler' | 'server_component' | 'background_job' | 'request_hook'
    | 'rls_denial' | 'auth' | 'cron' | 'integrity';
  ```
- Produces:
  ```typescript
  export function isRlsDenial(error: { code?: string | null; message?: string | null } | null | undefined): boolean;
  export function maybeCaptureRlsDenial(
    error: { code?: string | null; message?: string | null } | null | undefined,
    ctx: { table: string; verb: 'select' | 'insert' | 'update' | 'delete' | 'rpc'; action: string; userId?: string | null; sport?: 'golf' | 'baseball' | 'shared' },
  ): void; // FIRE-AND-FORGET — never throws, never awaited by callers
  ```

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/__tests__/rls-denial.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  const mocks = vi.hoisted(() => ({
    logServerEvent: vi.fn(async () => {}),
  }));
  vi.mock('@/lib/server-error-logger', () => ({
    logServerEvent: mocks.logServerEvent,
  }));

  import { isRlsDenial, maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';

  describe('isRlsDenial', () => {
    it('detects 42501', () => {
      expect(isRlsDenial({ code: '42501', message: 'permission denied' })).toBe(true);
    });
    it('detects row-level security message text (PostgREST shapes vary)', () => {
      expect(isRlsDenial({ code: null, message: 'new row violates row-level security policy for table "golf_rounds"' })).toBe(true);
    });
    it('ignores ordinary errors and nulls', () => {
      expect(isRlsDenial({ code: '23505', message: 'duplicate key' })).toBe(false);
      expect(isRlsDenial(null)).toBe(false);
    });
  });

  describe('maybeCaptureRlsDenial', () => {
    beforeEach(() => mocks.logServerEvent.mockClear());

    it('emits a warning event with source=rls_denial for a denial', () => {
      maybeCaptureRlsDenial(
        { code: '42501', message: 'permission denied for table golf_rounds' },
        { table: 'golf_rounds', verb: 'update', action: 'saveRound', userId: 'u1', sport: 'golf' },
      );
      expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
      const [message, ctx, severity] = mocks.logServerEvent.mock.calls[0]!;
      expect(message).toContain('RLS denial');
      expect(ctx).toMatchObject({ source: 'rls_denial', sport: 'golf', errorCode: '42501', action: 'saveRound' });
      expect(severity).toBe('warning');
    });
    it('does nothing for non-denials', () => {
      maybeCaptureRlsDenial({ code: '23505', message: 'dup' }, { table: 't', verb: 'insert', action: 'x' });
      expect(mocks.logServerEvent).not.toHaveBeenCalled();
    });
    it('never throws even if the logger rejects', () => {
      mocks.logServerEvent.mockRejectedValueOnce(new Error('logger down'));
      expect(() =>
        maybeCaptureRlsDenial({ code: '42501', message: 'denied' }, { table: 't', verb: 'select', action: 'x' }),
      ).not.toThrow();
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/rls-denial.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Extend the union in `src/lib/server-error-logger.ts` (replace lines 8-13):
  ```typescript
  export type ServerTraceSource =
    | 'server_action'
    | 'route_handler'
    | 'server_component'
    | 'background_job'
    | 'request_hook'
    | 'rls_denial'
    | 'auth'
    | 'cron'
    | 'integrity';
  ```

- [ ] 4. Implement `src/lib/admin/rls-denial.ts`:
  ```typescript
  import { logServerEvent } from '@/lib/server-error-logger';

  /**
   * Helm Bridge capture class #1 — RLS denials. Spikes here have historically
   * meant missing grants or unapplied migrations (upsert UPDATE-grant,
   * matview re-grant incidents). Centralized 42501/PostgREST detection;
   * FIRE-AND-FORGET by contract — a denial capture must never fail or slow a
   * live user request.
   */

  export function isRlsDenial(
    error: { code?: string | null; message?: string | null } | null | undefined,
  ): boolean {
    if (!error) return false;
    if (error.code === '42501') return true;
    return /row-level security/i.test(error.message ?? '');
  }

  export function maybeCaptureRlsDenial(
    error: { code?: string | null; message?: string | null } | null | undefined,
    ctx: {
      table: string;
      verb: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
      action: string;
      userId?: string | null;
      sport?: 'golf' | 'baseball' | 'shared';
    },
  ): void {
    if (!isRlsDenial(error)) return;
    try {
      void logServerEvent(
        `RLS denial: ${ctx.verb} on ${ctx.table}`,
        {
          action: ctx.action,
          source: 'rls_denial',
          errorCode: error?.code ?? '42501',
          userId: ctx.userId ?? null,
          sport: ctx.sport,
          metadata: { table: ctx.table, verb: ctx.verb, message: error?.message ?? null },
          skipSentry: true, // operational telemetry — admin feed, not a Sentry issue
        },
        'warning',
      ).catch(() => {});
    } catch {
      // Never break the caller.
    }
  }
  ```

- [ ] 5. Run to confirm pass, plus the W2 writer tests (union extension must not break them):
  ```bash
  npm run test:run -- src/lib/admin/__tests__/rls-denial.test.ts src/lib/__tests__/server-error-logger-bridge.test.ts
  npm run typecheck
  ```
  Expected: 6 + 3 tests pass.

- [ ] 6. Commit: `feat(admin): centralized RLS-denial capture (W6)`

---

### Task 2 — `withAdminObserved` server-action wrapper + one exemplar retrofit

**Files**
- Create: `src/lib/admin/observed-action.ts`
- Create: `src/lib/admin/__tests__/observed-action.test.ts`
- Modify: `src/app/golf/actions/golf.ts` (wrap `savePartialRound` — the exemplar; the wider retrofit is an incremental backlog, NOT this PR)

**Interfaces**
- Produces:
  ```typescript
  export function isNextControlFlowError(err: unknown): boolean;
  export function withAdminObserved<Args extends unknown[], R>(
    name: string,
    opts: { sport?: 'golf' | 'baseball' | 'shared'; featureArea?: string },
    fn: (...args: Args) => Promise<R>,
  ): (...args: Args) => Promise<R>;
  ```
  Behavior: on throw → skip `NEXT_REDIRECT`/`NEXT_NOT_FOUND` control flow; otherwise fire-and-forget `logServerException` (which already dual-writes Sentry + `error_logs` + `admin_events` — we deliberately do NOT also call `Sentry.withServerActionInstrumentation`, which would double-capture the same exception); ALWAYS rethrow the original error unchanged.

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/__tests__/observed-action.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  const mocks = vi.hoisted(() => ({
    logServerException: vi.fn(async () => {}),
  }));
  vi.mock('@/lib/server-error-logger', () => ({
    logServerException: mocks.logServerException,
  }));

  import { withAdminObserved, isNextControlFlowError } from '@/lib/admin/observed-action';

  describe('isNextControlFlowError', () => {
    it('recognizes NEXT_REDIRECT and NEXT_NOT_FOUND digests', () => {
      expect(isNextControlFlowError({ digest: 'NEXT_REDIRECT;push;/golf;307' })).toBe(true);
      expect(isNextControlFlowError({ digest: 'NEXT_NOT_FOUND' })).toBe(true);
      expect(isNextControlFlowError(new Error('boom'))).toBe(false);
    });
  });

  describe('withAdminObserved', () => {
    beforeEach(() => mocks.logServerException.mockClear());

    it('passes through the return value untouched', async () => {
      const wrapped = withAdminObserved('demo', { sport: 'golf' }, async (n: number) => n * 2);
      await expect(wrapped(21)).resolves.toBe(42);
      expect(mocks.logServerException).not.toHaveBeenCalled();
    });

    it('logs then RETHROWS real failures', async () => {
      const boom = new Error('db down');
      const wrapped = withAdminObserved('demo', { sport: 'golf' }, async () => { throw boom; });
      await expect(wrapped()).rejects.toBe(boom);
      expect(mocks.logServerException).toHaveBeenCalledTimes(1);
      const [err, ctx] = mocks.logServerException.mock.calls[0]!;
      expect(err).toBe(boom);
      expect(ctx).toMatchObject({ action: 'demo', source: 'server_action', sport: 'golf' });
    });

    it('lets Next control-flow throws pass WITHOUT logging (classic noise source)', async () => {
      const redirect = Object.assign(new Error('redirect'), { digest: 'NEXT_REDIRECT;replace;/x;307' });
      const wrapped = withAdminObserved('demo', {}, async () => { throw redirect; });
      await expect(wrapped()).rejects.toBe(redirect);
      expect(mocks.logServerException).not.toHaveBeenCalled();
    });

    it('a rejecting logger cannot mask the original error', async () => {
      mocks.logServerException.mockRejectedValueOnce(new Error('logger down'));
      const boom = new Error('real failure');
      const wrapped = withAdminObserved('demo', {}, async () => { throw boom; });
      await expect(wrapped()).rejects.toBe(boom);
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/observed-action.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/observed-action.ts`:
  ```typescript
  import { logServerException } from '@/lib/server-error-logger';

  /**
   * Helm Bridge capture class #2 — failed server actions. Generalizes the
   * with-baseball-action / with-lifting-action idea for cross-sport use.
   * Contract: NEVER changes the wrapped function's behavior — same resolve,
   * same reject; logging is fire-and-forget and self-swallowing.
   */

  export function isNextControlFlowError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest !== 'string') return false;
    return digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND';
  }

  export function withAdminObserved<Args extends unknown[], R>(
    name: string,
    opts: { sport?: 'golf' | 'baseball' | 'shared'; featureArea?: string },
    fn: (...args: Args) => Promise<R>,
  ): (...args: Args) => Promise<R> {
    return async (...args: Args): Promise<R> => {
      try {
        return await fn(...args);
      } catch (err) {
        if (!isNextControlFlowError(err)) {
          try {
            void logServerException(err, {
              action: name,
              source: 'server_action',
              featureArea: opts.featureArea ?? null,
              sport: opts.sport,
              handled: false,
            }).catch(() => {});
          } catch {
            // Logging must never mask the real failure.
          }
        }
        throw err;
      }
    };
  }
  ```

- [ ] 4. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/observed-action.test.ts
  ```
  Expected: 5 tests pass.

- [ ] 5. Exemplar retrofit — `savePartialRound` in `src/app/golf/actions/golf.ts` (the mutation-heaviest golf path, already touched in W0). Pattern: rename the existing exported implementation and export the wrapped version under the original name so no caller changes:
  ```typescript
  import { withAdminObserved } from '@/lib/admin/observed-action';

  // Existing implementation renamed (same body, unexported):
  async function savePartialRoundImpl(/* existing params EXACTLY as-is */) {
    // ...existing body unchanged...
  }

  /** Observed wrapper — logging never alters behavior (see observed-action tests). */
  export const savePartialRound = withAdminObserved(
    'savePartialRound',
    { sport: 'golf', featureArea: 'rounds' },
    savePartialRoundImpl,
  );
  ```
  CAUTION: `golf.ts` is a `'use server'` file — Next requires exported server actions to be async functions. If `next build` rejects the const-export form (the known `'use server' const-export` gotcha), use the delegation form instead:
  ```typescript
  export async function savePartialRound(...args: Parameters<typeof savePartialRoundImpl>) {
    return withAdminObserved('savePartialRound', { sport: 'golf', featureArea: 'rounds' }, savePartialRoundImpl)(...args);
  }
  ```
  Record which form was needed in the PR description. Retrofit backlog (FOLLOW-UP PRs, not this wave): `submitGolfRoundComprehensive`, baseball `lineups.ts` saves, `lifting.ts` check-ins.

- [ ] 6. Gates:
  ```bash
  npm run typecheck && npm run lint && npm run test:run && npm run build
  ```
  Expected: all green (build verifies the server-action export form).

- [ ] 7. Commit: `feat(admin): withAdminObserved wrapper + savePartialRound exemplar (W6)`

---

### Task 3 — Errors tab data layer + page + fingerprint detail

**Files**
- Create: `src/lib/admin/data/errors.ts`
- Create: `src/lib/admin/data/__tests__/errors.test.ts`
- Create: `src/app/admin/errors/page.tsx`
- Create: `src/app/admin/errors/[fingerprint]/page.tsx`
- Create: `src/app/admin/_components/ErrorsOverTime.tsx`

**Interfaces**
- Produces:
  ```typescript
  export interface ErrorsTabFilters { sport?: 'golf' | 'baseball' | 'shared'; severity?: TriageSeverity; source?: string; windowHours: number; }
  export function parseErrorsFilters(searchParams: Record<string, string | string[] | undefined>): ErrorsTabFilters;
  export async function fetchErrorsTab(filters: ErrorsTabFilters): Promise<{
    sentry: AdminFetchResult<SentryIssue[]>;
    hourly: AdminFetchResult<SentryStatsPoint[]>;
    deployMarkers: number[];                      // epoch ms of prod deploys in window
    incidents: TriageItem[];                      // app-only, filter-applied
    rlsDenials24h: number;
  }>;
  export async function fetchFingerprintDetail(fingerprint: string): Promise<{
    events: Array<{ id: string; title: string; message: string | null; severity: string; created_at: string; user_email: string | null; user_id: string | null; team_id: string | null; url: string | null; stack_trace: string | null; }>;
  }>;
  ```
- Consumes: `fetchSentryIssues`, `fetchSentryHourlyStats`, `fetchVercelDeployments`, `mergeTriage`, `createAdminClient`.

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/data/__tests__/errors.test.ts` (pure filter parsing):
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { parseErrorsFilters } from '@/lib/admin/data/errors';

  describe('parseErrorsFilters', () => {
    it('defaults to a 24h window with no filters', () => {
      expect(parseErrorsFilters({})).toEqual({ windowHours: 24 });
    });
    it('parses valid sport/severity/source/window from the URL', () => {
      expect(
        parseErrorsFilters({ sport: 'golf', severity: 'critical', source: 'rls_denial', window: '168' }),
      ).toEqual({ sport: 'golf', severity: 'critical', source: 'rls_denial', windowHours: 168 });
    });
    it('drops invalid values instead of trusting the URL', () => {
      expect(parseErrorsFilters({ sport: 'chess', severity: 'meh', window: '-5' })).toEqual({ windowHours: 24 });
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/errors.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/data/errors.ts`:
  ```typescript
  import 'server-only';
  import { createAdminClient } from '@/lib/supabase/admin';
  import {
    fetchSentryIssues,
    fetchSentryHourlyStats,
    type SentryIssue,
    type SentryStatsPoint,
  } from '@/lib/admin/sentry-api';
  import { fetchVercelDeployments } from '@/lib/admin/vercel-api';
  import type { AdminFetchResult } from '@/lib/admin/fetch-result';
  import {
    mergeTriage,
    type TriageItem,
    type TriageSeverity,
    type AppTriageEventRow,
  } from '@/lib/admin/data/triage';

  export interface ErrorsTabFilters {
    sport?: 'golf' | 'baseball' | 'shared';
    severity?: TriageSeverity;
    source?: string;
    windowHours: number;
  }

  const SPORTS = new Set(['golf', 'baseball', 'shared']);
  const SEVERITIES = new Set(['critical', 'error', 'warning', 'info']);
  const SOURCES = new Set([
    'server_action', 'route_handler', 'server_component', 'background_job', 'request_hook',
    'rls_denial', 'auth', 'cron', 'integrity', 'client', 'system',
  ]);

  function first(v: string | string[] | undefined): string | undefined {
    return Array.isArray(v) ? v[0] : v;
  }

  /** URL-persisted filter chips — deep-linkable drill-downs. Invalid URL
   *  values are DROPPED, never trusted. */
  export function parseErrorsFilters(
    searchParams: Record<string, string | string[] | undefined>,
  ): ErrorsTabFilters {
    const filters: ErrorsTabFilters = { windowHours: 24 };
    const sport = first(searchParams.sport);
    if (sport && SPORTS.has(sport)) filters.sport = sport as ErrorsTabFilters['sport'];
    const severity = first(searchParams.severity);
    if (severity && SEVERITIES.has(severity)) filters.severity = severity as TriageSeverity;
    const source = first(searchParams.source);
    if (source && SOURCES.has(source)) filters.source = source;
    const window = Number(first(searchParams.window));
    if (Number.isFinite(window) && window > 0 && window <= 720) filters.windowHours = window;
    return filters;
  }

  export async function fetchErrorsTab(filters: ErrorsTabFilters): Promise<{
    sentry: AdminFetchResult<SentryIssue[]>;
    hourly: AdminFetchResult<SentryStatsPoint[]>;
    deployMarkers: number[];
    incidents: TriageItem[];
    rlsDenials24h: number;
  }> {
    const admin = createAdminClient();
    const since = new Date(Date.now() - filters.windowHours * 3600_000).toISOString();
    const ago24h = new Date(Date.now() - 24 * 3600_000).toISOString();

    let query = admin
      .from('admin_events')
      .select('id, title, message, severity, sport, fingerprint, user_id, url, created_at')
      .eq('event_type', 'error')
      .eq('resolved', false)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);
    if (filters.sport) query = query.eq('sport', filters.sport);
    if (filters.severity) query = query.eq('severity', filters.severity);
    if (filters.source) query = query.eq('source', filters.source);

    const [sentry, hourly, deploys, appRes, rlsRes] = await Promise.all([
      fetchSentryIssues({ limit: 50 }),
      fetchSentryHourlyStats(),
      fetchVercelDeployments(20),
      query,
      admin.from('admin_events').select('id', { count: 'exact', head: true })
        .eq('source', 'rls_denial').gte('created_at', ago24h),
    ]);

    const windowStart = Date.now() - filters.windowHours * 3600_000;
    const deployMarkers = (deploys.data ?? [])
      .filter((d) => d.target === 'production' && d.createdAt >= windowStart)
      .map((d) => d.createdAt);

    const appEvents = (appRes.data ?? []) as unknown as AppTriageEventRow[];
    return {
      sentry,
      hourly,
      deployMarkers,
      incidents: mergeTriage({ sentryIssues: [], appEvents }),
      rlsDenials24h: rlsRes.count ?? 0,
    };
  }

  export async function fetchFingerprintDetail(fingerprint: string) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('admin_events')
      .select('id, title, message, severity, created_at, user_email, user_id, team_id, url, stack_trace')
      .eq('fingerprint', fingerprint)
      .order('created_at', { ascending: false })
      .limit(100);
    return { events: data ?? [] };
  }
  ```

- [ ] 4. Create `src/app/admin/_components/ErrorsOverTime.tsx` (dependency-light CSS bars — deterministic, no recharts payload for one panel; deploy markers as labeled ticks):
  ```tsx
  import type { SentryStatsPoint } from '@/lib/admin/sentry-api';

  export function ErrorsOverTime({
    points,
    deployMarkers,
  }: {
    points: SentryStatsPoint[];
    deployMarkers: number[];
  }) {
    if (points.length === 0) return null;
    const max = Math.max(1, ...points.map((p) => p.total));
    const start = points[0]!.timestamp;
    const end = points[points.length - 1]!.timestamp || start + 1;
    const span = Math.max(1, end - start);

    return (
      <figure aria-label="Errors per hour with deploy markers" className="relative">
        <div className="flex h-24 items-end gap-[2px]">
          {points.map((p) => (
            <div
              key={p.timestamp}
              title={`${new Date(p.timestamp).toLocaleTimeString()}: ${p.total} errors`}
              className="flex-1 rounded-t bg-fw-danger/60"
              style={{ height: `${Math.max(2, Math.round((p.total / max) * 100))}%` }}
            />
          ))}
        </div>
        {deployMarkers.map((t) => (
          <span
            key={t}
            title={`deploy ${new Date(t).toLocaleTimeString()}`}
            className="absolute top-0 h-full w-px bg-warm-900/50"
            style={{ left: `${((t - start) / span) * 100}%` }}
          />
        ))}
        <figcaption className="mt-1 font-fw-mono text-[10px] tabular-nums text-warm-500">
          {new Date(start).toLocaleTimeString()} — {new Date(end).toLocaleTimeString()} · ticks = prod deploys
        </figcaption>
      </figure>
    );
  }
  ```

- [ ] 5. Create `src/app/admin/errors/page.tsx`:
  ```tsx
  import Link from 'next/link';
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { parseErrorsFilters, fetchErrorsTab } from '@/lib/admin/data/errors';
  import { TriageQueue } from '../_components/TriageQueue';
  import { ErrorsOverTime } from '../_components/ErrorsOverTime';
  import { PanelBoundary } from '../_components/PanelBoundary';
  import { PanelAllClear, PanelNoData, PanelStale } from '../_components/PanelStates';
  import { AutoRefresh } from '../_components/AutoRefresh';

  export const dynamic = 'force-dynamic';

  const CHIP_SETS: Array<{ param: 'sport' | 'severity' | 'source' | 'window'; values: string[] }> = [
    { param: 'sport', values: ['golf', 'baseball', 'shared'] },
    { param: 'severity', values: ['critical', 'error', 'warning'] },
    { param: 'source', values: ['server_action', 'rls_denial', 'auth', 'cron', 'client'] },
    { param: 'window', values: ['24', '168'] },
  ];

  function chipHref(current: URLSearchParams, param: string, value: string): string {
    const next = new URLSearchParams(current);
    if (next.get(param) === value) next.delete(param);
    else next.set(param, value);
    const qs = next.toString();
    return qs ? `/admin/errors?${qs}` : '/admin/errors';
  }

  export default async function ErrorsPage({
    searchParams,
  }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    await requireSuperAdmin();
    const params = await searchParams;
    const filters = parseErrorsFilters(params);
    const current = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
    );

    async function Body() {
      const tab = await fetchErrorsTab(filters);
      return (
        <div className="space-y-6">
          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
              Errors over time · RLS denials 24h:{' '}
              <Link href="/admin/errors?source=rls_denial" className="font-fw-mono text-fw-danger">
                {tab.rlsDenials24h}
              </Link>
            </h2>
            {tab.hourly.status === 'ok' && tab.hourly.data ? (
              <ErrorsOverTime points={tab.hourly.data} deployMarkers={tab.deployMarkers} />
            ) : tab.hourly.status === 'unconfigured' ? (
              <PanelNoData label="Hourly series not configured" description="Provision SENTRY_READ_TOKEN to light this chart up." />
            ) : (
              <PanelStale label="Hourly series" error={tab.hourly.error} />
            )}
          </section>

          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Sentry unresolved</h2>
            {tab.sentry.status === 'ok' && tab.sentry.data ? (
              tab.sentry.data.length === 0 ? (
                <PanelAllClear label="No unresolved Sentry issues" checkedAt={tab.sentry.fetchedAt ?? new Date().toISOString()} />
              ) : (
                <ul className="divide-y divide-warm-200/60">
                  {tab.sentry.data.map((issue) => (
                    <li key={issue.id} className="flex items-center gap-3 py-2">
                      <span className="w-20 font-fw-mono text-xs text-warm-500">{issue.shortId}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-warm-900">{issue.title}</span>
                      <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                        {issue.userCount} users · {issue.count} events
                      </span>
                      <a href={issue.permalink} target="_blank" rel="noreferrer" className="text-xs text-accent-700 underline">
                        open
                      </a>
                    </li>
                  ))}
                </ul>
              )
            ) : tab.sentry.status === 'unconfigured' ? (
              <PanelNoData label="Sentry pull not configured" description="Provision SENTRY_READ_TOKEN (org:read, project:read, event:read)." />
            ) : (
              <PanelStale label="Sentry issues" error={tab.sentry.error} />
            )}
          </section>

          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">In-app incidents</h2>
            <TriageQueue items={tab.incidents} />
            <p className="mt-2 text-xs text-warm-500">
              Row detail: <span className="font-fw-mono">/admin/errors/&lt;fingerprint&gt;</span> (click-through from each app row key)
            </p>
          </section>
        </div>
      );
    }

    return (
      <main className="space-y-4 p-6">
        <AutoRefresh />
        <div className="flex flex-wrap gap-2">
          {CHIP_SETS.flatMap(({ param, values }) =>
            values.map((v) => (
              <Link
                key={`${param}:${v}`}
                href={chipHref(current, param, v)}
                className={
                  current.get(param) === v
                    ? 'rounded-full bg-warm-900 px-3 py-1 text-xs text-white'
                    : 'rounded-full border border-warm-300 px-3 py-1 text-xs text-warm-700 hover:bg-warm-100'
                }
              >
                {param}: {v}
              </Link>
            )),
          )}
        </div>
        <PanelBoundary title="Errors">
          <Body />
        </PanelBoundary>
      </main>
    );
  }
  ```

- [ ] 6. Create `src/app/admin/errors/[fingerprint]/page.tsx`:
  ```tsx
  import Link from 'next/link';
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { fetchFingerprintDetail } from '@/lib/admin/data/errors';

  export const dynamic = 'force-dynamic';

  export default async function FingerprintDetailPage({
    params,
  }: {
    params: Promise<{ fingerprint: string }>;
  }) {
    await requireSuperAdmin();
    const { fingerprint } = await params;
    const { events } = await fetchFingerprintDetail(fingerprint);

    return (
      <main className="space-y-4 p-6">
        <Link href="/admin/errors" className="text-xs text-warm-500 underline">← Errors</Link>
        <h1 className="font-fw-mono text-lg text-warm-900">fingerprint {fingerprint}</h1>
        <p className="text-sm text-warm-600">{events.length} events · affected users link to Users & Teams</p>
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="rounded-2xl border border-warm-200 bg-white/70 p-4">
              <p className="text-sm font-medium text-warm-900">{e.title}</p>
              <p className="font-fw-mono text-xs tabular-nums text-warm-500">
                {e.severity} · {new Date(e.created_at).toLocaleString()} · {e.url ?? 'no url'}
              </p>
              {e.user_id ? (
                <Link href={`/admin/users/${e.user_id}`} className="text-xs text-accent-700 underline">
                  {e.user_email ?? e.user_id}
                </Link>
              ) : null}
              {e.stack_trace ? (
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-warm-100 p-2 text-[11px] leading-tight">{e.stack_trace}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      </main>
    );
  }
  ```
  Then wire the app-row click-through: in `TriageQueue.tsx`, wrap app-row titles in `<Link href={`/admin/errors/${item.key.slice(4)}`}>` (the `app:` prefix stripped) — a 3-line diff.

- [ ] 7. Run to confirm pass + gates:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/errors.test.ts
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```
  Expected: all green (both new pages carry `requireSuperAdmin`).

- [ ] 8. Commit: `feat(admin): errors tab — sentry table, deploy-marked series, incident feed, fingerprint detail (W6)`

---

## Acceptance Criteria

- [ ] Filter chips round-trip through the URL (deep-linkable: `/admin/errors?sport=golf&severity=critical&window=168`); invalid params are dropped.
- [ ] RLS-denial counter renders and links to `?source=rls_denial`; forcing a denial in dev (query a FORCE-RLS table with the anon client) produces a row with `source='rls_denial'` and `skipSentry` behavior (no new Sentry issue).
- [ ] `withAdminObserved` proven behavior-neutral by tests (same resolve/reject, control-flow throws unlogged); `savePartialRound` still saves rounds in dev (manual smoke: enter 3 holes, background the tab, verify the partial saved).
- [ ] Errors-over-time renders hourly bars with deploy tick marks when both tokens exist; distinct not-configured/stale states otherwise.
- [ ] Fingerprint detail lists events with stack traces and user links.
- [ ] All gates green; 14 new tests pass.

## Rollback

`git revert` — the `savePartialRound` wrapper unwinds with the revert (the impl body was renamed, not modified). No DB changes in this wave.
