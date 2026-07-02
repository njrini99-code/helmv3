# W12: Deploys & Infra Tab + Deploy Markers

**Goal:** Ship `/admin/deploys` (deployments table, currently-deployed build card, conditional release-health strip, web-vitals mini panel) and write `admin_events` deploy-marker rows so every chart can overlay releases even before the Vercel token exists.

**Depends-on:** W3 (`vercel-api.ts`, `sentry-api.ts`), W4 (panels).

**PR-scope:** ONE PR.

---

### Task 1 — Deploy markers (boot-time detection)

**Files**
- Create: `src/lib/admin/deploy-marker.ts`
- Create: `src/lib/admin/__tests__/deploy-marker.test.ts`
- Modify: `src/instrumentation.ts` (2-line hook in the nodejs branch of `register()`)

**Interfaces**
- Produces:
  ```typescript
  export async function recordDeployMarker(): Promise<void>; // idempotent per sha; fire-and-forget safe
  ```
  Mechanism: on server boot (cold start), read `VERCEL_GIT_COMMIT_SHA`/`VERCEL_ENV`; if production and no `event_type='deploy'` row exists for that sha, insert one. Idempotent across the many cold starts of one deploy; zero secrets required (system env only).

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/__tests__/deploy-marker.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

  const mocks = vi.hoisted(() => ({
    existing: [] as Array<{ id: string }>,
    inserted: [] as Record<string, unknown>[],
  }));
  vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            contains: () => ({
              limit: async () => ({ data: mocks.existing, error: null }),
            }),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          mocks.inserted.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    }),
  }));

  import { recordDeployMarker } from '@/lib/admin/deploy-marker';

  describe('recordDeployMarker', () => {
    beforeEach(() => {
      mocks.existing.length = 0;
      mocks.inserted.length = 0;
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123def456');
      vi.stubEnv('VERCEL_GIT_COMMIT_MESSAGE', 'feat: something');
      vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'main');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('writes a deploy event for a new production sha', async () => {
      await recordDeployMarker();
      expect(mocks.inserted[0]).toMatchObject({
        event_type: 'deploy',
        source: 'system',
        title: expect.stringContaining('abc123d'),
      });
    });

    it('is idempotent — an existing marker for the sha suppresses the insert', async () => {
      mocks.existing.push({ id: 'evt-1' });
      await recordDeployMarker();
      expect(mocks.inserted).toHaveLength(0);
    });

    it('does nothing outside production or without a sha', async () => {
      vi.stubEnv('VERCEL_ENV', 'preview');
      await recordDeployMarker();
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
      await recordDeployMarker();
      expect(mocks.inserted).toHaveLength(0);
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/deploy-marker.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/deploy-marker.ts`:
  ```typescript
  import { createAdminClient } from '@/lib/supabase/admin';

  /**
   * Deploy markers — event_type='deploy' per production sha, detected at
   * server boot from Vercel system env (zero secrets). Charts overlay these
   * even before VERCEL_API_TOKEN exists. Fire-and-forget: any failure here
   * must never affect boot.
   */

  let attemptedThisBoot = false;

  export async function recordDeployMarker(): Promise<void> {
    if (attemptedThisBoot) return;
    attemptedThisBoot = true;

    try {
      const sha = process.env.VERCEL_GIT_COMMIT_SHA;
      if (process.env.VERCEL_ENV !== 'production' || !sha) return;

      const admin = createAdminClient();
      const { data: existing } = await admin
        .from('admin_events')
        .select('id')
        .eq('event_type', 'deploy')
        .contains('metadata', { sha })
        .limit(1);
      if (existing && existing.length > 0) return;

      await admin.from('admin_events').insert({
        event_type: 'deploy',
        title: `Deployed ${sha.slice(0, 7)} (${process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown ref'})`,
        severity: 'info',
        message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
        metadata: {
          sha,
          ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
          author: process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? null,
        },
        source: 'system',
        sport: 'shared',
      });
    } catch {
      // Never fail boot for a marker.
    }
  }
  ```
  NOTE: `'deploy'` is a new `event_type` string — `admin_events.event_type` is plain `text` (baseline `:7213`) with the allowlist living in the CLIENT route only, so no migration is needed; server-side writers are unconstrained by design.

- [ ] 4. Hook into `src/instrumentation.ts` — inside `register()`, in the existing `process.env.NEXT_RUNTIME === 'nodejs'` branch, append AFTER the current Sentry init lines:
  ```typescript
      // Helm Bridge: record a deploy marker once per production sha (idempotent).
      import('@/lib/admin/deploy-marker')
        .then((m) => m.recordDeployMarker())
        .catch(() => {});
  ```
  (Dynamic import keeps the module out of the edge bundle; the catch keeps boot bulletproof. Read the actual `register()` structure first and place it in the nodejs-only branch.)

- [ ] 5. Run to confirm pass + gates:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/deploy-marker.test.ts
  npm run typecheck && npm run test:run && npm run build
  ```

- [ ] 6. Commit: `feat(admin): production deploy markers from boot-time env detection (W12)`

---

### Task 2 — Deploys page (+ web-insights port)

**Files**
- Modify: `src/lib/admin/vercel-api.ts` (add `fetchVercelWebInsights`)
- Create: `src/app/admin/deploys/page.tsx`

**Interfaces**
- Produces (added to `vercel-api.ts` — same fail-soft contract; a clean-room port of the private `fetchVercelAnalytics` at `admin-data.ts:1562-1593`):
  ```typescript
  export interface VercelWebInsights { visitors24h: number; visitors7d: number; visitors30d: number; }
  export async function fetchVercelWebInsights(): Promise<AdminFetchResult<VercelWebInsights>>;
  ```

**Steps**

- [ ] 1. Add to `src/lib/admin/vercel-api.ts`:
  ```typescript
  export interface VercelWebInsights {
    visitors24h: number;
    visitors7d: number;
    visitors30d: number;
  }

  /** Port of the legacy fetchVercelAnalytics (admin-data.ts:1562) with the
   *  bridge fail-soft contract instead of bare null. */
  export async function fetchVercelWebInsights(): Promise<AdminFetchResult<VercelWebInsights>> {
    const token = process.env.VERCEL_API_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    if (!token || !projectId) return unconfigured('Vercel API');

    try {
      const teamId = process.env.VERCEL_TEAM_ID;
      const baseUrl = 'https://api.vercel.com/v1/web/insights/stats';
      const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
      const now = new Date().toISOString();

      const fetchPeriod = async (from: string): Promise<number> => {
        const params = new URLSearchParams({ projectId, from, to: now });
        if (teamId) params.set('teamId', teamId);
        const res = await fetch(`${baseUrl}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 900 },
        });
        if (!res.ok) return 0;
        const data = await res.json();
        return data?.data?.visitors ?? data?.visitors ?? 0;
      };

      const [v24h, v7d, v30d] = await Promise.all([
        fetchPeriod(daysAgo(1)),
        fetchPeriod(daysAgo(7)),
        fetchPeriod(daysAgo(30)),
      ]);
      return ok({ visitors24h: v24h, visitors7d: v7d, visitors30d: v30d });
    } catch (err) {
      return failed(`Vercel web insights threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  ```

- [ ] 2. Create `src/app/admin/deploys/page.tsx`:
  ```tsx
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { fetchVercelDeployments, fetchVercelWebInsights } from '@/lib/admin/vercel-api';
  import { fetchSentryReleaseHealth } from '@/lib/admin/sentry-api';
  import { PanelBoundary } from '../_components/PanelBoundary';
  import { PanelNoData, PanelStale } from '../_components/PanelStates';
  import { AutoRefresh } from '../_components/AutoRefresh';
  import { StatusPill } from '@/components/fairway';

  export const dynamic = 'force-dynamic';

  const STATE_TONE = {
    READY: 'success', BUILDING: 'info', QUEUED: 'neutral',
    INITIALIZING: 'neutral', ERROR: 'danger', CANCELED: 'warning',
  } as const;

  function CurrentBuildCard() {
    // Vercel system env — present on every deployment, zero secrets needed.
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    const ref = process.env.VERCEL_GIT_COMMIT_REF;
    const message = process.env.VERCEL_GIT_COMMIT_MESSAGE;
    const author = process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME;
    const env = process.env.VERCEL_ENV ?? 'development';

    return (
      <section className="rounded-2xl bg-[var(--fw-color-nav-bg)] p-4 text-white">
        <p className="text-xs uppercase tracking-widest text-white/60">This running build</p>
        <p className="mt-1 font-fw-mono text-lg tabular-nums">
          {sha ? sha.slice(0, 7) : 'local'} · {ref ?? 'working tree'} · {env}
        </p>
        {message ? <p className="mt-1 truncate text-sm text-white/70">{message}</p> : null}
        {author ? <p className="text-xs text-white/50">by {author}</p> : null}
      </section>
    );
  }

  async function DeploymentsTable() {
    const deploys = await fetchVercelDeployments(20);
    if (deploys.status === 'unconfigured') {
      return <PanelNoData label="Deployments API not configured" description="Set VERCEL_API_TOKEN / VERCEL_PROJECT_ID / VERCEL_TEAM_ID (verify in the Vercel dashboard — team-scoped vars are invisible to vercel env pull)." />;
    }
    if (deploys.status === 'error' || !deploys.data) {
      return <PanelStale label="Deployments" error={deploys.error} />;
    }
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-warm-500">
            <th className="py-2">Commit</th><th>Branch</th><th>State</th><th>Target</th><th>Age</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-200/60">
          {deploys.data.map((d) => (
            <tr key={d.uid}>
              <td className="py-2">
                <p className="font-fw-mono text-xs">{d.commitSha?.slice(0, 7) ?? d.uid.slice(0, 7)}</p>
                <p className="max-w-[320px] truncate text-xs text-warm-500">{d.commitMessage ?? d.url}</p>
              </td>
              <td className="font-fw-mono text-xs">{d.commitRef ?? '—'}</td>
              <td><StatusPill tone={STATE_TONE[d.state] ?? 'neutral'} dot size="sm">{d.state}</StatusPill></td>
              <td className="text-xs">{d.target ?? 'preview'}</td>
              <td className="font-fw-mono text-xs tabular-nums">
                {Math.round((Date.now() - d.createdAt) / 60000)}m
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  async function ReleaseHealth() {
    const health = await fetchSentryReleaseHealth();
    if (health.status !== 'ok' || !health.data || health.data.crashFreeSessions === null) {
      // OQ3: conditional widget — neutral until session tracking is confirmed.
      return <PanelNoData label="Release health not configured" description="Requires SENTRY_READ_TOKEN and confirmed session tracking (autoSessionTracking) for helm-xs." />;
    }
    return (
      <div className="flex gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-warm-500">Crash-free sessions</p>
          <p className="font-fw-mono text-2xl tabular-nums">{(health.data.crashFreeSessions * 100).toFixed(2)}%</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-warm-500">Crash-free users</p>
          <p className="font-fw-mono text-2xl tabular-nums">
            {health.data.crashFreeUsers === null ? '—' : `${(health.data.crashFreeUsers * 100).toFixed(2)}%`}
          </p>
        </div>
      </div>
    );
  }

  async function WebVitals() {
    const insights = await fetchVercelWebInsights();
    if (insights.status !== 'ok' || !insights.data) {
      return <PanelNoData label="Web insights unavailable" description="Same Vercel token trio as the deployments table." />;
    }
    return (
      <div className="flex gap-6">
        {([['24h', insights.data.visitors24h], ['7d', insights.data.visitors7d], ['30d', insights.data.visitors30d]] as const).map(([label, v]) => (
          <div key={label}>
            <p className="text-xs uppercase tracking-widest text-warm-500">Visitors {label}</p>
            <p className="font-fw-mono text-2xl tabular-nums">{v.toLocaleString()}</p>
          </div>
        ))}
      </div>
    );
  }

  export default async function DeploysPage() {
    await requireSuperAdmin();
    return (
      <main className="space-y-6 p-6">
        <AutoRefresh intervalMs={60_000} />
        <CurrentBuildCard />
        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Deployments</h2>
          <PanelBoundary title="Deployments"><DeploymentsTable /></PanelBoundary>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Release health</h2>
            <PanelBoundary title="Release health"><ReleaseHealth /></PanelBoundary>
          </section>
          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Traffic</h2>
            <PanelBoundary title="Traffic"><WebVitals /></PanelBoundary>
          </section>
        </div>
      </main>
    );
  }
  ```

- [ ] 3. Gates:
  ```bash
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```

- [ ] 4. Commit: `feat(admin): deploys & infra tab + current-build card + conditional release health (W12)`

---

## Acceptance Criteria

- [ ] The current-build card renders on prod with ZERO new secrets (Vercel system env).
- [ ] First prod deploy after merge writes exactly ONE `event_type='deploy'` row (idempotent across cold starts — verify by count after several requests).
- [ ] W6's errors-over-time deploy ticks and this table agree on deploy times.
- [ ] ERROR deployments render `danger` pills; the W5 banner counts them (via `lastDeploy.state === 'ERROR'` in `fetchOverviewSnapshot` — already wired).
- [ ] Release-health strip stays neutral-"not configured" until OQ3 is resolved; web insights degrade exactly like the legacy code (null-ish → no fake numbers).
- [ ] All gates green; 3 new tests pass.

## Rollback

`git revert` — the instrumentation hook and page disappear; existing deploy-marker rows are inert data.
