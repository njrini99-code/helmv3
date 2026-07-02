# W3: Server Data Layer — Sentry/Vercel clients, session + resolve RPCs, triage merge

**Goal:** Build the fail-soft, server-only read layer Helm Bridge panels consume: `sentry-api.ts`, `vercel-api.ts`, the `get_active_sessions()`/`resolve_admin_event()` RPCs, and the merged triage-queue fetcher.

**Depends-on:** W1 (gate + `is_super_admin()`), W2 (`fingerprint`/`source` columns + regenerated types).

**PR-scope:** ONE PR. No UI — everything here is exercised by tests and (from W5 on) by panels.

**Safety rails in force:** `import 'server-only'` on every module holding a token; `get_admin_*_rollup` RPCs called ONLY with the user-scoped client; new RPCs SECURITY DEFINER + internally gated on `is_super_admin()` + anon EXECUTE revoked + ACL assertions; 60s caching so page loads never fan out to Sentry.

---

### Task 1 — Migration: `get_active_sessions()` + `resolve_admin_event()`

**Files**
- Create: `supabase/migrations/20260701130000_bridge_rpcs_sessions_resolve.sql`

**Interfaces**
- Produces (SQL):
  ```sql
  FUNCTION public.get_active_sessions() RETURNS jsonb;        -- SECURITY DEFINER, is_super_admin()-gated
  FUNCTION public.resolve_admin_event(p_event_ids uuid[]) RETURNS integer; -- SECURITY DEFINER, is_super_admin()-gated
  ```
  Both are called with the admin's USER-SCOPED client (auth.uid() must resolve — same discipline as the rollup RPCs; they Forbid under service_role by design).

**Steps**

- [ ] 1. Red state via Supabase MCP `execute_sql`:
  ```sql
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND proname IN ('get_active_sessions','resolve_admin_event');
  ```
  Expected: 0 rows.

- [ ] 2. Create `supabase/migrations/20260701130000_bridge_rpcs_sessions_resolve.sql`:
  ```sql
  -- W3: Helm Bridge RPCs.
  -- get_active_sessions: auth schema is not PostgREST-exposed; the sanctioned
  -- pattern (same as get_admin_errors_rollup) is a SECURITY DEFINER function
  -- in public with an internal admin gate on auth.uid().
  CREATE OR REPLACE FUNCTION public.get_active_sessions() RETURNS jsonb
      LANGUAGE plpgsql STABLE SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $$
  DECLARE
    v_result jsonb;
  BEGIN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'updated_at' DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT jsonb_build_object(
        'session_id',   s.id,
        'user_id',      s.user_id,
        'email',        u.email,
        'created_at',   s.created_at,
        'updated_at',   s.updated_at,
        'last_sign_in_at', u.last_sign_in_at
      ) AS row_data
      FROM auth.sessions s
      JOIN auth.users u ON u.id = s.user_id
      ORDER BY s.updated_at DESC
      LIMIT 500
    ) rows;

    RETURN v_result;
  END;
  $$;

  -- resolve_admin_event: the ONE writable admin mutation exposed via RPC.
  -- Marks events resolved by the invoking super admin; append-only otherwise.
  CREATE OR REPLACE FUNCTION public.resolve_admin_event(p_event_ids uuid[]) RETURNS integer
      LANGUAGE plpgsql VOLATILE SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $$
  DECLARE
    v_count integer;
  BEGIN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;

    UPDATE public.admin_events
    SET resolved = true,
        resolved_at = now(),
        resolved_by = auth.uid()
    WHERE id = ANY(p_event_ids)
      AND resolved = false;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END;
  $$;

  -- ── Safety rails ──────────────────────────────────────────────────────────
  REVOKE ALL ON FUNCTION public.get_active_sessions() FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.resolve_admin_event(uuid[]) FROM PUBLIC, anon, authenticated;
  -- authenticated EXECUTE required: they are invoked with Nick's user-scoped
  -- JWT (internal is_super_admin() gate does the real filtering). anon: NOTHING.
  GRANT EXECUTE ON FUNCTION public.get_active_sessions() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.resolve_admin_event(uuid[]) TO authenticated;

  DO $$
  DECLARE
    v_sessions oid; v_resolve oid;
  BEGIN
    SELECT p.oid INTO v_sessions FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_active_sessions';
    SELECT p.oid INTO v_resolve FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='resolve_admin_event';

    IF has_function_privilege('anon', v_sessions, 'EXECUTE')
       OR has_function_privilege('anon', v_resolve, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL check failed: bridge RPC executable by anon';
    END IF;
    IF NOT has_function_privilege('authenticated', v_sessions, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_resolve, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL check failed: bridge RPC missing authenticated EXECUTE';
    END IF;
  END $$;
  ```

- [ ] 3. Apply via Supabase MCP `apply_migration` (name `bridge_rpcs_sessions_resolve`); verify applied state + gate behavior:
  ```sql
  SELECT proname, proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND proname IN ('get_active_sessions','resolve_admin_event');
  -- service_role/SQL-editor call has auth.uid() = NULL → must raise Forbidden:
  SELECT public.get_active_sessions();
  ```
  Expected: 2 rows with authenticated-only ACLs; the SELECT raises `Forbidden` (42501) — that IS the pass condition.

- [ ] 4. Regenerate types: `npm run db:types` and commit the diff.

- [ ] 5. Commit: `feat(admin): get_active_sessions + resolve_admin_event RPCs (W3 migration)`

---

### Task 2 — Shared fetch-result type + `sentry-api.ts`

**Files**
- Create: `src/lib/admin/fetch-result.ts`
- Create: `src/lib/admin/sentry-api.ts`
- Create: `src/lib/admin/__tests__/sentry-api.test.ts`

**Interfaces**
- Produces (`fetch-result.ts` — plain types, importable anywhere):
  ```typescript
  export type AdminFetchStatus = 'ok' | 'unconfigured' | 'error';
  export interface AdminFetchResult<T> {
    status: AdminFetchStatus;
    data: T | null;
    fetchedAt: string | null; // ISO — feeds the freshness chips / watch-the-watcher
    error?: string;
  }
  ```
- Produces (`sentry-api.ts` — `import 'server-only'`):
  ```typescript
  export interface SentryIssue {
    id: string; shortId: string; title: string; culprit: string | null;
    level: string; status: string; substatus: string | null;
    count: number; userCount: number;
    firstSeen: string; lastSeen: string; permalink: string;
    stats24h: Array<[number, number]>;
  }
  export interface SentryStatsPoint { timestamp: number; accepted: number; total: number; }
  export interface SentryReleaseHealth { crashFreeSessions: number | null; crashFreeUsers: number | null; }
  export async function fetchSentryIssues(opts?: { query?: string; limit?: number }): Promise<AdminFetchResult<SentryIssue[]>>;
  export async function fetchSentryHourlyStats(): Promise<AdminFetchResult<SentryStatsPoint[]>>;
  export async function fetchSentryReleaseHealth(): Promise<AdminFetchResult<SentryReleaseHealth>>;
  ```
- Consumes: `SENTRY_READ_TOKEN` (NEW — never the CI `SENTRY_AUTH_TOKEN`), `SENTRY_ORG`, `SENTRY_PROJECT` env.

**Steps**

- [ ] 1. Create `src/lib/admin/fetch-result.ts` with exactly the interface above plus:
  ```typescript
  export function unconfigured<T>(what: string): AdminFetchResult<T> {
    return { status: 'unconfigured', data: null, fetchedAt: null, error: `${what} not configured` };
  }
  export function failed<T>(error: string): AdminFetchResult<T> {
    return { status: 'error', data: null, fetchedAt: null, error };
  }
  export function ok<T>(data: T): AdminFetchResult<T> {
    return { status: 'ok', data, fetchedAt: new Date().toISOString() };
  }
  ```

- [ ] 2. Write the failing test `src/lib/admin/__tests__/sentry-api.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  import { fetchSentryIssues } from '@/lib/admin/sentry-api';

  function issuePayload(id: string) {
    return {
      id, shortId: `HELM-${id}`, title: `Issue ${id}`, culprit: 'route',
      level: 'error', status: 'unresolved', substatus: 'ongoing',
      count: '12', userCount: 3,
      firstSeen: '2026-07-01T00:00:00Z', lastSeen: '2026-07-01T01:00:00Z',
      permalink: `https://helm-xs.sentry.io/issues/${id}/`,
      stats: { '24h': [[1751328000, 2], [1751331600, 4]] },
    };
  }

  describe('fetchSentryIssues', () => {
    beforeEach(() => {
      vi.stubEnv('SENTRY_READ_TOKEN', 'tok');
      vi.stubEnv('SENTRY_ORG', 'helm-xs');
      vi.stubEnv('SENTRY_PROJECT', 'javascript-nextjs');
      fetchMock.mockReset();
    });
    afterEach(() => vi.unstubAllEnvs());

    it('returns unconfigured (NOT an error) when SENTRY_READ_TOKEN is absent', async () => {
      vi.stubEnv('SENTRY_READ_TOKEN', '');
      const res = await fetchSentryIssues();
      expect(res.status).toBe('unconfigured');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps issues and coerces string counts to numbers', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify([issuePayload('1')]), {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
      const res = await fetchSentryIssues();
      expect(res.status).toBe('ok');
      expect(res.data![0]).toMatchObject({ id: '1', count: 12, userCount: 3 });
      expect(res.data![0]!.stats24h).toEqual([[1751328000, 2], [1751331600, 4]]);
      const url = String(fetchMock.mock.calls[0]![0]);
      expect(url).toContain('/organizations/helm-xs/issues/');
      expect(url).toContain('query=is%3Aunresolved');
    });

    it('follows the Link cursor at most 3 pages', async () => {
      const linked = (results: string) => new Response(JSON.stringify([issuePayload(results)]), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          link: '<https://sentry.io/api/0/next>; rel="next"; results="true"; cursor="0:100:0"',
        },
      });
      fetchMock.mockResolvedValue(linked('n'));
      const res = await fetchSentryIssues();
      expect(res.status).toBe('ok');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('fails soft on 429 without throwing', async () => {
      fetchMock.mockResolvedValue(new Response('slow down', { status: 429, headers: { 'retry-after': '60' } }));
      const res = await fetchSentryIssues();
      expect(res.status).toBe('error');
      expect(res.error).toContain('429');
    });

    it('fails soft on network errors', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));
      const res = await fetchSentryIssues();
      expect(res.status).toBe('error');
    });
  });
  ```

- [ ] 3. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/sentry-api.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 4. Implement `src/lib/admin/sentry-api.ts`:
  ```typescript
  import 'server-only';
  import {
    type AdminFetchResult,
    unconfigured,
    failed,
    ok,
  } from '@/lib/admin/fetch-result';

  /**
   * Helm Bridge — server-only Sentry REST client (READ side; SDK ingest is a
   * separate, complete system). Uses SENTRY_READ_TOKEN — a NEW token with
   * org:read + project:read + event:read. NEVER reuse the CI SENTRY_AUTH_TOKEN
   * (org token for sourcemaps; scopes immutable, typically lacks event:read).
   *
   * Fail-soft contract: this module NEVER throws. Missing token →
   * 'unconfigured' (panels render a neutral not-configured state); any HTTP /
   * network failure → 'error' (panels render amber STALE with last-known-good).
   * 60s Next revalidate so N page loads = 1 Sentry call per minute.
   */

  const API = 'https://sentry.io/api/0';
  const REVALIDATE_SECONDS = 60;
  const MAX_PAGES = 3;

  function config(): { token: string; org: string; project: string } | null {
    const token = process.env.SENTRY_READ_TOKEN;
    const org = process.env.SENTRY_ORG;
    const project = process.env.SENTRY_PROJECT;
    if (!token || !org || !project) return null;
    return { token, org, project };
  }

  export interface SentryIssue {
    id: string;
    shortId: string;
    title: string;
    culprit: string | null;
    level: string;
    status: string;
    substatus: string | null;
    count: number;
    userCount: number;
    firstSeen: string;
    lastSeen: string;
    permalink: string;
    /** [epochSeconds, count] pairs from the issue's baked-in 24h stats. */
    stats24h: Array<[number, number]>;
  }

  interface RawIssue {
    id: string; shortId: string; title: string; culprit?: string | null;
    level: string; status: string; substatus?: string | null;
    count: string | number; userCount: number;
    firstSeen: string; lastSeen: string; permalink: string;
    stats?: { '24h'?: Array<[number, number]> };
  }

  function mapIssue(raw: RawIssue): SentryIssue {
    return {
      id: raw.id,
      shortId: raw.shortId,
      title: raw.title,
      culprit: raw.culprit ?? null,
      level: raw.level,
      status: raw.status,
      substatus: raw.substatus ?? null,
      count: Number(raw.count) || 0,
      userCount: raw.userCount ?? 0,
      firstSeen: raw.firstSeen,
      lastSeen: raw.lastSeen,
      permalink: raw.permalink,
      stats24h: raw.stats?.['24h'] ?? [],
    };
  }

  function nextCursor(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    // Sentry Link header: <url>; rel="next"; results="true"; cursor="0:100:0"
    const next = linkHeader
      .split(',')
      .find((part) => part.includes('rel="next"') && part.includes('results="true"'));
    const m = next?.match(/cursor="([^"]+)"/);
    return m?.[1] ?? null;
  }

  async function sentryGet(path: string, params: URLSearchParams, token: string): Promise<Response> {
    return fetch(`${API}${path}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: REVALIDATE_SECONDS },
    });
  }

  export async function fetchSentryIssues(opts?: {
    query?: string;
    limit?: number;
  }): Promise<AdminFetchResult<SentryIssue[]>> {
    const cfg = config();
    if (!cfg) return unconfigured('Sentry read API');

    const query = opts?.query ?? 'is:unresolved';
    const limit = String(opts?.limit ?? 50);
    const issues: SentryIssue[] = [];
    let cursor: string | null = null;

    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({
          query,
          limit,
          sort: 'freq',
          statsPeriod: '24h',
          project: '-1',
        });
        if (cursor) params.set('cursor', cursor);

        const res = await sentryGet(`/organizations/${cfg.org}/issues/`, params, cfg.token);
        if (!res.ok) {
          const retryAfter = res.headers.get('retry-after');
          return failed(
            `Sentry issues fetch failed: ${res.status}${retryAfter ? ` (retry-after ${retryAfter}s)` : ''}`,
          );
        }
        const rows = (await res.json()) as RawIssue[];
        issues.push(...rows.map(mapIssue));

        cursor = nextCursor(res.headers.get('link'));
        if (!cursor) break;
      }
      return ok(issues);
    } catch (err) {
      return failed(`Sentry issues fetch threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  export interface SentryStatsPoint {
    timestamp: number;
    accepted: number;
    total: number;
  }

  export async function fetchSentryHourlyStats(): Promise<AdminFetchResult<SentryStatsPoint[]>> {
    const cfg = config();
    if (!cfg) return unconfigured('Sentry read API');
    try {
      const params = new URLSearchParams({
        field: 'sum(quantity)',
        groupBy: 'outcome',
        interval: '1h',
        statsPeriod: '24h',
        category: 'error',
      });
      const res = await sentryGet(`/organizations/${cfg.org}/stats_v2/`, params, cfg.token);
      if (!res.ok) return failed(`Sentry stats fetch failed: ${res.status}`);
      const body = (await res.json()) as {
        intervals: string[];
        groups: Array<{ by: { outcome: string }; series: { 'sum(quantity)': number[] } }>;
      };
      const accepted = body.groups.find((g) => g.by.outcome === 'accepted')?.series['sum(quantity)'] ?? [];
      const points: SentryStatsPoint[] = body.intervals.map((iso, i) => {
        const total = body.groups.reduce((sum, g) => sum + (g.series['sum(quantity)'][i] ?? 0), 0);
        return { timestamp: Date.parse(iso), accepted: accepted[i] ?? 0, total };
      });
      return ok(points);
    } catch (err) {
      return failed(`Sentry stats fetch threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  export interface SentryReleaseHealth {
    crashFreeSessions: number | null;
    crashFreeUsers: number | null;
  }

  /** CONDITIONAL widget (OQ3): renders 'not configured' until session
   *  tracking is confirmed sending sessions for helm-xs. */
  export async function fetchSentryReleaseHealth(): Promise<AdminFetchResult<SentryReleaseHealth>> {
    const cfg = config();
    if (!cfg) return unconfigured('Sentry read API');
    try {
      const params = new URLSearchParams({
        field: 'crash_free_rate(session)',
        statsPeriod: '24h',
        project: '-1',
      });
      params.append('field', 'crash_free_rate(user)');
      const res = await sentryGet(`/organizations/${cfg.org}/sessions/`, params, cfg.token);
      if (!res.ok) return failed(`Sentry sessions fetch failed: ${res.status}`);
      const body = (await res.json()) as {
        groups: Array<{ totals: Record<string, number | null> }>;
      };
      const totals = body.groups[0]?.totals ?? {};
      return ok({
        crashFreeSessions: totals['crash_free_rate(session)'] ?? null,
        crashFreeUsers: totals['crash_free_rate(user)'] ?? null,
      });
    } catch (err) {
      return failed(`Sentry sessions fetch threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  ```

- [ ] 5. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/sentry-api.test.ts
  ```
  Expected: 5 tests pass.

- [ ] 6. Commit: `feat(admin): server-only fail-soft Sentry read client (W3)`

---

### Task 3 — `vercel-api.ts`

**Files**
- Create: `src/lib/admin/vercel-api.ts`
- Create: `src/lib/admin/__tests__/vercel-api.test.ts`

**Interfaces**
- Produces:
  ```typescript
  export type VercelDeployState = 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED' | 'QUEUED' | 'INITIALIZING';
  export interface VercelDeployment {
    uid: string; state: VercelDeployState; createdAt: number; ready: number | null;
    target: string | null; url: string;
    commitSha: string | null; commitMessage: string | null; commitRef: string | null; commitAuthor: string | null;
  }
  export async function fetchVercelDeployments(limit?: number): Promise<AdminFetchResult<VercelDeployment[]>>;
  ```
- Consumes: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (same trio `admin-data.ts:1563-1568` already reads; fails soft to `unconfigured` exactly as `fetchVercelAnalytics` fails soft to null).

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/__tests__/vercel-api.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  import { fetchVercelDeployments } from '@/lib/admin/vercel-api';

  describe('fetchVercelDeployments', () => {
    beforeEach(() => {
      vi.stubEnv('VERCEL_API_TOKEN', 'tok');
      vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
      vi.stubEnv('VERCEL_TEAM_ID', 'team_1');
      fetchMock.mockReset();
    });
    afterEach(() => vi.unstubAllEnvs());

    it('returns unconfigured when the token trio is absent', async () => {
      vi.stubEnv('VERCEL_API_TOKEN', '');
      const res = await fetchVercelDeployments();
      expect(res.status).toBe('unconfigured');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps deployments and always sends teamId (empty-results footgun)', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({
        deployments: [{
          uid: 'dpl_1', state: 'READY', createdAt: 1751328000000, ready: 1751328100000,
          target: 'production', url: 'helmv3-abc.vercel.app',
          meta: {
            githubCommitSha: 'abc123', githubCommitMessage: 'feat: x',
            githubCommitRef: 'main', githubCommitAuthorName: 'nick',
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
      const res = await fetchVercelDeployments(5);
      expect(res.status).toBe('ok');
      expect(res.data![0]).toMatchObject({
        uid: 'dpl_1', state: 'READY', commitSha: 'abc123', commitRef: 'main', target: 'production',
      });
      const url = String(fetchMock.mock.calls[0]![0]);
      expect(url).toContain('teamId=team_1');
      expect(url).toContain('limit=5');
    });

    it('fails soft on non-200', async () => {
      fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
      const res = await fetchVercelDeployments();
      expect(res.status).toBe('error');
      expect(res.error).toContain('403');
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/vercel-api.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/vercel-api.ts`:
  ```typescript
  import 'server-only';
  import {
    type AdminFetchResult,
    unconfigured,
    failed,
    ok,
  } from '@/lib/admin/fetch-result';

  /**
   * Helm Bridge — server-only Vercel deployments client. Reuses the exact
   * token trio admin-data.ts:1563 already consumes for web analytics; fails
   * soft to 'unconfigured' (never throws) when absent. 1-day Vercel runtime
   * log retention means Vercel is ONLY "what deployed when" — the durable
   * error store is Sentry + admin_events.
   */

  const REVALIDATE_SECONDS = 60;

  export type VercelDeployState =
    | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED' | 'QUEUED' | 'INITIALIZING';

  export interface VercelDeployment {
    uid: string;
    state: VercelDeployState;
    createdAt: number;
    ready: number | null;
    target: string | null;
    url: string;
    commitSha: string | null;
    commitMessage: string | null;
    commitRef: string | null;
    commitAuthor: string | null;
  }

  interface RawDeployment {
    uid: string; state: VercelDeployState; createdAt: number; ready?: number | null;
    target?: string | null; url: string;
    meta?: {
      githubCommitSha?: string; githubCommitMessage?: string;
      githubCommitRef?: string; githubCommitAuthorName?: string;
    };
  }

  export async function fetchVercelDeployments(
    limit = 20,
  ): Promise<AdminFetchResult<VercelDeployment[]>> {
    const token = process.env.VERCEL_API_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    if (!token || !projectId) return unconfigured('Vercel API');

    try {
      const params = new URLSearchParams({ projectId, limit: String(limit) });
      const teamId = process.env.VERCEL_TEAM_ID;
      if (teamId) params.set('teamId', teamId);

      const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: REVALIDATE_SECONDS },
      });
      if (!res.ok) return failed(`Vercel deployments fetch failed: ${res.status}`);

      const body = (await res.json()) as { deployments?: RawDeployment[] };
      const deployments = (body.deployments ?? []).map((d): VercelDeployment => ({
        uid: d.uid,
        state: d.state,
        createdAt: d.createdAt,
        ready: d.ready ?? null,
        target: d.target ?? null,
        url: d.url,
        commitSha: d.meta?.githubCommitSha ?? null,
        commitMessage: d.meta?.githubCommitMessage ?? null,
        commitRef: d.meta?.githubCommitRef ?? null,
        commitAuthor: d.meta?.githubCommitAuthorName ?? null,
      }));
      return ok(deployments);
    } catch (err) {
      return failed(`Vercel deployments fetch threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  ```

- [ ] 4. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/vercel-api.test.ts
  ```
  Expected: 3 tests pass.

- [ ] 5. Commit: `feat(admin): server-only fail-soft Vercel deployments client (W3)`

---

### Task 4 — Triage merge (`data/triage.ts`) + resolve server action

**Files**
- Create: `src/lib/admin/data/triage.ts`
- Create: `src/lib/admin/data/__tests__/triage.test.ts`
- Create: `src/app/admin/actions/triage.ts`

**Interfaces**
- Produces (the ONE queue shape every wave renders):
  ```typescript
  export type TriageSeverity = 'critical' | 'error' | 'warning' | 'info';
  export interface TriageItem {
    key: string;                       // `sentry:${id}` | `app:${fingerprint}`
    origin: 'sentry' | 'app';
    title: string;
    severity: TriageSeverity;
    sport: 'golf' | 'baseball' | 'shared' | null;
    occurrences: number;
    affectedUsers: number;
    firstSeen: string;
    lastSeen: string;
    permalink: string | null;          // sentry rows only
    eventIds: string[];                // app rows only — feeds resolve_admin_event
    substatus: string | null;          // sentry: 'regressed' | 'escalating' | ...
  }
  export function mergeTriage(input: {
    sentryIssues: SentryIssue[];
    appEvents: AppTriageEventRow[];
  }): TriageItem[];                    // pure — sorted by affectedUsers desc, then lastSeen desc
  export interface AppTriageEventRow {
    id: string; title: string; message: string | null;
    severity: TriageSeverity; sport: string | null; fingerprint: string | null;
    user_id: string | null; url: string | null; created_at: string;
  }
  export async function fetchTriageQueue(): Promise<{
    items: TriageItem[];
    sentry: AdminFetchResult<SentryIssue[]>;
  }>;
  ```
- Produces (server action):
  ```typescript
  // src/app/admin/actions/triage.ts ('use server')
  export async function resolveTriageEvents(eventIds: string[]): Promise<{ resolvedCount: number }>;
  ```
- Consumes: `fetchSentryIssues` (Task 2), `createAdminClient` (gated reads), `groupIncidents` from `@/lib/admin/incident-grouping`, `requireSuperAdmin`, user-scoped `createClient` for the RPC (service_role would Forbid — 509-storm lesson).

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/data/__tests__/triage.test.ts` for the PURE merge:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { mergeTriage, type AppTriageEventRow } from '@/lib/admin/data/triage';
  import type { SentryIssue } from '@/lib/admin/sentry-api';

  const sentryIssue = (over: Partial<SentryIssue>): SentryIssue => ({
    id: 's1', shortId: 'HELM-1', title: 'TypeError in rounds', culprit: null,
    level: 'error', status: 'unresolved', substatus: 'ongoing',
    count: 40, userCount: 7, firstSeen: '2026-06-30T00:00:00Z',
    lastSeen: '2026-07-01T02:00:00Z', permalink: 'https://sentry.io/x', stats24h: [],
    ...over,
  });

  const appEvent = (over: Partial<AppTriageEventRow>): AppTriageEventRow => ({
    id: 'e1', title: 'savePartialRound failed', message: 'insert failed',
    severity: 'error', sport: 'golf', fingerprint: 'fp-1',
    user_id: 'u1', url: '/api/golf/rounds', created_at: '2026-07-01T01:00:00Z',
    ...over,
  });

  describe('mergeTriage', () => {
    it('groups app events by fingerprint and counts distinct users', () => {
      const items = mergeTriage({
        sentryIssues: [],
        appEvents: [
          appEvent({ id: 'e1', user_id: 'u1' }),
          appEvent({ id: 'e2', user_id: 'u2' }),
          appEvent({ id: 'e3', user_id: 'u2' }),
        ],
      });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        key: 'app:fp-1', origin: 'app', occurrences: 3, affectedUsers: 2,
        eventIds: ['e1', 'e2', 'e3'], sport: 'golf',
      });
    });

    it('ranks by affected users first, recency second — never raw volume', () => {
      const items = mergeTriage({
        sentryIssues: [sentryIssue({ id: 'noisy', count: 9999, userCount: 1 })],
        appEvents: [
          appEvent({ id: 'e1', user_id: 'u1' }),
          appEvent({ id: 'e2', user_id: 'u2' }),
        ],
      });
      expect(items[0]!.key).toBe('app:fp-1');   // 2 users beats 9999 events / 1 user
      expect(items[1]!.key).toBe('sentry:noisy');
    });

    it('carries sentry substatus + permalink through', () => {
      const items = mergeTriage({
        sentryIssues: [sentryIssue({ substatus: 'regressed' })],
        appEvents: [],
      });
      expect(items[0]).toMatchObject({
        origin: 'sentry', substatus: 'regressed', permalink: 'https://sentry.io/x', eventIds: [],
      });
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/triage.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/data/triage.ts`:
  ```typescript
  import 'server-only';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { fetchSentryIssues, type SentryIssue } from '@/lib/admin/sentry-api';
  import type { AdminFetchResult } from '@/lib/admin/fetch-result';

  export type TriageSeverity = 'critical' | 'error' | 'warning' | 'info';

  export interface AppTriageEventRow {
    id: string;
    title: string;
    message: string | null;
    severity: TriageSeverity;
    sport: string | null;
    fingerprint: string | null;
    user_id: string | null;
    url: string | null;
    created_at: string;
  }

  export interface TriageItem {
    key: string;
    origin: 'sentry' | 'app';
    title: string;
    severity: TriageSeverity;
    sport: 'golf' | 'baseball' | 'shared' | null;
    occurrences: number;
    affectedUsers: number;
    firstSeen: string;
    lastSeen: string;
    permalink: string | null;
    eventIds: string[];
    substatus: string | null;
  }

  const SENTRY_LEVEL_TO_SEVERITY: Record<string, TriageSeverity> = {
    fatal: 'critical',
    error: 'error',
    warning: 'warning',
    info: 'info',
    debug: 'info',
  };

  function normalizeSport(raw: string | null): TriageItem['sport'] {
    return raw === 'golf' || raw === 'baseball' || raw === 'shared' ? raw : null;
  }

  /** Pure merge — unit-tested; the async fetcher below just feeds it. */
  export function mergeTriage(input: {
    sentryIssues: SentryIssue[];
    appEvents: AppTriageEventRow[];
  }): TriageItem[] {
    const items: TriageItem[] = input.sentryIssues.map((issue) => ({
      key: `sentry:${issue.id}`,
      origin: 'sentry' as const,
      title: issue.title,
      severity: SENTRY_LEVEL_TO_SEVERITY[issue.level] ?? 'error',
      sport: null,
      occurrences: issue.count,
      affectedUsers: issue.userCount,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      permalink: issue.permalink,
      eventIds: [],
      substatus: issue.substatus,
    }));

    const buckets = new Map<string, { rows: AppTriageEventRow[]; users: Set<string> }>();
    for (const row of input.appEvents) {
      const fp = row.fingerprint ?? `row:${row.id}`;
      const bucket = buckets.get(fp) ?? { rows: [], users: new Set<string>() };
      bucket.rows.push(row);
      if (row.user_id) bucket.users.add(row.user_id);
      buckets.set(fp, bucket);
    }

    for (const [fp, bucket] of buckets) {
      const sorted = [...bucket.rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const worst = sorted.reduce<TriageSeverity>((acc, r) => {
        const rank: Record<TriageSeverity, number> = { critical: 0, error: 1, warning: 2, info: 3 };
        return rank[r.severity] < rank[acc] ? r.severity : acc;
      }, 'info');
      items.push({
        key: `app:${fp}`,
        origin: 'app',
        title: last.title,
        severity: worst,
        sport: normalizeSport(last.sport),
        occurrences: bucket.rows.length,
        affectedUsers: bucket.users.size,
        firstSeen: first.created_at,
        lastSeen: last.created_at,
        permalink: null,
        eventIds: sorted.map((r) => r.id),
        substatus: null,
      });
    }

    // Rank by distinct affected users, then recency — NEVER raw volume
    // (one retry-looping job must not bury a low-volume auth bug).
    return items.sort((a, b) => {
      if (b.affectedUsers !== a.affectedUsers) return b.affectedUsers - a.affectedUsers;
      return b.lastSeen.localeCompare(a.lastSeen);
    });
  }

  /**
   * Server fetcher. CALLER must have passed requireSuperAdmin() first —
   * this reads admin_events with the service-role client.
   */
  export async function fetchTriageQueue(): Promise<{
    items: TriageItem[];
    sentry: AdminFetchResult<SentryIssue[]>;
  }> {
    const admin = createAdminClient();
    const [sentry, appRes] = await Promise.all([
      fetchSentryIssues(),
      admin
        .from('admin_events')
        .select('id, title, message, severity, sport, fingerprint, user_id, url, created_at')
        .eq('event_type', 'error')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    const appEvents = (appRes.data ?? []) as unknown as AppTriageEventRow[];
    return {
      items: mergeTriage({ sentryIssues: sentry.data ?? [], appEvents }),
      sentry,
    };
  }
  ```

- [ ] 4. Create `src/app/admin/actions/triage.ts`:
  ```typescript
  'use server';

  import { revalidatePath } from 'next/cache';
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { createClient } from '@/lib/supabase/server';

  /**
   * Resolve a group of admin_events via the internally-gated RPC.
   * MUST use the user-scoped client: resolve_admin_event() checks
   * is_super_admin() via auth.uid(), which is NULL under service_role
   * (the documented 509-storm failure mode).
   */
  export async function resolveTriageEvents(
    eventIds: string[],
  ): Promise<{ resolvedCount: number }> {
    await requireSuperAdmin();
    if (eventIds.length === 0) return { resolvedCount: 0 };

    const supabase = await createClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: 'resolve_admin_event',
      args: { p_event_ids: string[] },
    ) => Promise<{ data: number | null; error: { message: string } | null }>;

    const { data, error } = await rpc('resolve_admin_event', { p_event_ids: eventIds });
    if (error) throw new Error(`resolve_admin_event failed: ${error.message}`);

    revalidatePath('/admin');
    revalidatePath('/admin/errors');
    return { resolvedCount: data ?? 0 };
  }
  ```

- [ ] 5. Run to confirm pass + gates (the W1 gate-coverage contract test now also covers `actions/triage.ts` — it must find `requireSuperAdmin`):
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/triage.test.ts
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck && npm run test:run
  ```
  Expected: all green.

- [ ] 6. Commit: `feat(admin): triage merge data layer + resolve action (W3)`

---

## Acceptance Criteria

- [ ] Both RPCs live on prod; anon EXECUTE revoked; calling either without a super-admin JWT raises `Forbidden` (42501) — verified by the migration's own SELECT.
- [ ] `sentry-api.ts` / `vercel-api.ts` carry `import 'server-only'` (importing either from a client component is a BUILD error — verify by temporary import + `npm run build`, then remove).
- [ ] All 11 W3 unit tests pass; full suite green.
- [ ] Missing tokens produce `status:'unconfigured'`; HTTP failures produce `status:'error'`; neither ever throws.
- [ ] Triage ranking is affected-users-first (test-pinned).

## Rollback

- Code: `git revert` — no UI consumes this yet, so reverting is invisible.
- DB: `DROP FUNCTION public.get_active_sessions(); DROP FUNCTION public.resolve_admin_event(uuid[]);` — additive objects with no table changes.
