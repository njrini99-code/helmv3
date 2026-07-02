# W5: Overview Tab

**Goal:** Ship the Level-1 "is anything on fire?" screen: status banner, 6-tile KPI strip, unified triage queue with inline resolve, regressed callout, deploy rail, and the watch-the-watcher staleness widget — hard-capped at ~10 tiles, every number a deep link.

**Depends-on:** W3 (data layer), W4 (chrome + panel pattern).

**PR-scope:** ONE PR — `src/lib/admin/data/overview.ts` + `/admin` page + `_components` for the queue.

**Load discipline (risk #6):** per-panel server components, each fetch cached ≤60s; the page issues ~6 bounded queries + 1 cached Sentry call + 1 cached Vercel call — never the old ~95-query blob. Client polling is 30s, visibility-paused, via `router.refresh()`.

---

### Task 1 — Overview data layer + banner/staleness pure logic

**Files**
- Create: `src/lib/admin/data/overview.ts`
- Create: `src/lib/admin/data/__tests__/overview.test.ts`

**Interfaces**
- Produces:
  ```typescript
  export interface OverviewKpis {
    sentryUnresolved: number | null;        // null = unconfigured (starved tile)
    eventErrors24h: number;
    authFailures24h: number;
    activeUsersToday: number;
    activityToday: { golf: number; baseball: number; lifting: number };
    lastDeploy: { state: string; ageMinutes: number } | null;
  }
  export interface WatcherSignal { label: string; lastSeenAt: string | null; staleAfterHours: number; }
  export function computeBannerState(input: {
    criticalCount: number; attentionCount: number; anyFeedStale: boolean;
  }): { state: 'nominal' | 'attention' | 'critical' | 'stale'; attentionCount: number };
  export function isSignalStale(signal: WatcherSignal, now: Date): boolean;
  export async function fetchOverviewSnapshot(): Promise<{
    kpis: OverviewKpis;
    banner: { state: 'nominal' | 'attention' | 'critical' | 'stale'; attentionCount: number; checkedAt: string };
    watcher: Array<WatcherSignal & { stale: boolean }>;
  }>;
  ```
- Consumes: `fetchSentryIssues`, `fetchVercelDeployments`, `createAdminClient` (head:true counts), `fetchTriageQueue` (W3).

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/data/__tests__/overview.test.ts` (pure logic only — the async fetcher is exercised by the page):
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { computeBannerState, isSignalStale } from '@/lib/admin/data/overview';

  describe('computeBannerState', () => {
    it('critical wins over everything', () => {
      expect(computeBannerState({ criticalCount: 2, attentionCount: 5, anyFeedStale: true }))
        .toEqual({ state: 'critical', attentionCount: 7 });
    });
    it('attention when non-critical items exist', () => {
      expect(computeBannerState({ criticalCount: 0, attentionCount: 3, anyFeedStale: false }))
        .toEqual({ state: 'attention', attentionCount: 3 });
    });
    it('stale beats nominal — a silent dashboard is not a healthy one', () => {
      expect(computeBannerState({ criticalCount: 0, attentionCount: 0, anyFeedStale: true }))
        .toEqual({ state: 'stale', attentionCount: 0 });
    });
    it('nominal only when zero items AND feeds fresh', () => {
      expect(computeBannerState({ criticalCount: 0, attentionCount: 0, anyFeedStale: false }))
        .toEqual({ state: 'nominal', attentionCount: 0 });
    });
  });

  describe('isSignalStale', () => {
    const now = new Date('2026-07-01T12:00:00Z');
    it('flags a signal past its window (no login rows in 24h = logging broke)', () => {
      expect(isSignalStale({ label: 'login events', lastSeenAt: '2026-06-30T10:00:00Z', staleAfterHours: 24 }, now)).toBe(true);
    });
    it('passes a fresh signal', () => {
      expect(isSignalStale({ label: 'login events', lastSeenAt: '2026-07-01T09:00:00Z', staleAfterHours: 24 }, now)).toBe(false);
    });
    it('treats never-seen as stale', () => {
      expect(isSignalStale({ label: 'cron outcomes', lastSeenAt: null, staleAfterHours: 26 }, now)).toBe(true);
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/overview.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/data/overview.ts`:
  ```typescript
  import 'server-only';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { fetchSentryIssues } from '@/lib/admin/sentry-api';
  import { fetchVercelDeployments } from '@/lib/admin/vercel-api';

  export interface OverviewKpis {
    sentryUnresolved: number | null;
    eventErrors24h: number;
    authFailures24h: number;
    activeUsersToday: number;
    activityToday: { golf: number; baseball: number; lifting: number };
    lastDeploy: { state: string; ageMinutes: number } | null;
  }

  export interface WatcherSignal {
    label: string;
    lastSeenAt: string | null;
    staleAfterHours: number;
  }

  export function computeBannerState(input: {
    criticalCount: number;
    attentionCount: number;
    anyFeedStale: boolean;
  }): { state: 'nominal' | 'attention' | 'critical' | 'stale'; attentionCount: number } {
    const total = input.criticalCount + input.attentionCount;
    if (input.criticalCount > 0) return { state: 'critical', attentionCount: total };
    if (total > 0) return { state: 'attention', attentionCount: total };
    if (input.anyFeedStale) return { state: 'stale', attentionCount: 0 };
    return { state: 'nominal', attentionCount: 0 };
  }

  export function isSignalStale(signal: WatcherSignal, now: Date): boolean {
    if (!signal.lastSeenAt) return true;
    const ageMs = now.getTime() - new Date(signal.lastSeenAt).getTime();
    return ageMs > signal.staleAfterHours * 60 * 60 * 1000;
  }

  function isoHoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 3600_000).toISOString();
  }
  function isoStartOfToday(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  /** CALLER must have passed requireSuperAdmin() (service-role reads). */
  export async function fetchOverviewSnapshot() {
    const admin = createAdminClient();
    const ago24h = isoHoursAgo(24);
    const today = isoStartOfToday();

    const [
      sentry,
      deploys,
      errors24h,
      criticals24h,
      security24h,
      activeToday,
      golfToday,
      baseballToday,
      liftsToday,
      lastLogin,
      lastError,
      lastCron,
    ] = await Promise.all([
      fetchSentryIssues({ limit: 1 }),
      fetchVercelDeployments(5),
      admin.from('admin_events').select('id', { count: 'exact', head: true })
        .eq('event_type', 'error').gte('created_at', ago24h),
      admin.from('admin_events').select('id', { count: 'exact', head: true })
        .eq('event_type', 'error').eq('severity', 'critical').eq('resolved', false),
      admin.from('admin_events').select('id', { count: 'exact', head: true })
        .eq('event_type', 'security').gte('created_at', ago24h),
      admin.from('users').select('id', { count: 'exact', head: true })
        .gte('last_seen', today),
      admin.from('golf_rounds').select('id', { count: 'exact', head: true })
        .gte('created_at', today),
      admin.from('baseball_games').select('id', { count: 'exact', head: true })
        .gte('created_at', today),
      admin.from('helm_lifting_sessions').select('id', { count: 'exact', head: true })
        .gte('created_at', today),
      admin.from('admin_events').select('created_at')
        .eq('event_type', 'login').order('created_at', { ascending: false }).limit(1),
      admin.from('admin_events').select('created_at')
        .eq('event_type', 'error').order('created_at', { ascending: false }).limit(1),
      admin.from('background_job_logs').select('started_at')
        .order('started_at', { ascending: false }).limit(1),
    ]);

    const lastDeployRow = deploys.data?.[0] ?? null;
    const kpis: OverviewKpis = {
      sentryUnresolved: sentry.status === 'ok' ? (sentry.data?.length ?? 0) : null,
      eventErrors24h: errors24h.count ?? 0,
      authFailures24h: security24h.count ?? 0,
      activeUsersToday: activeToday.count ?? 0,
      activityToday: {
        golf: golfToday.count ?? 0,
        baseball: baseballToday.count ?? 0,
        lifting: liftsToday.count ?? 0,
      },
      lastDeploy: lastDeployRow
        ? {
            state: lastDeployRow.state,
            ageMinutes: Math.round((Date.now() - lastDeployRow.createdAt) / 60000),
          }
        : null,
    };

    const now = new Date();
    const watcherBase: WatcherSignal[] = [
      // Sign-ins definitely happen daily — 24h of silence means LOGGING broke.
      { label: 'Login events', lastSeenAt: lastLogin.data?.[0]?.created_at ?? null, staleAfterHours: 24 },
      { label: 'Error pipeline', lastSeenAt: lastError.data?.[0]?.created_at ?? null, staleAfterHours: 48 },
      // Crons run at least daily once W11 lands; until then this reads
      // "stale" honestly — background_job_logs has zero writers today.
      { label: 'Cron outcomes', lastSeenAt: lastCron.data?.[0]?.started_at ?? null, staleAfterHours: 26 },
    ];
    const watcher = watcherBase.map((s) => ({ ...s, stale: isSignalStale(s, now) }));

    const attentionFromDeploy = kpis.lastDeploy?.state === 'ERROR' ? 1 : 0;
    const banner = {
      ...computeBannerState({
        criticalCount: criticals24h.count ?? 0,
        attentionCount: attentionFromDeploy,
        anyFeedStale: sentry.status === 'error' || watcher.some((w) => w.stale),
      }),
      checkedAt: now.toISOString(),
    };

    return { kpis, banner, watcher };
  }
  ```

- [ ] 4. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/overview.test.ts
  npm run typecheck
  ```
  Expected: 7 tests pass.

- [ ] 5. Commit: `feat(admin): overview snapshot data layer + banner/staleness logic (W5)`

---

### Task 2 — `TriageQueue` client component (inline resolve + polling)

**Files**
- Create: `src/app/admin/_components/TriageQueue.tsx`
- Create: `src/app/admin/_components/__tests__/triage-queue.test.tsx`

**Interfaces**
- Consumes: `TriageItem` (W3), `resolveTriageEvents` server action (W3), `SportBadge` (W4), `StatusPill` (Fairway).
- Produces:
  ```tsx
  export function TriageQueue(props: {
    items: TriageItem[];
    onResolve?: (eventIds: string[]) => Promise<{ resolvedCount: number }>; // test seam; defaults to the server action
  }): JSX.Element;
  ```

**Steps**

- [ ] 1. Write the failing test `src/app/admin/_components/__tests__/triage-queue.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from 'vitest';
  import { render, screen, fireEvent, waitFor } from '@testing-library/react';
  import { TriageQueue } from '@/app/admin/_components/TriageQueue';
  import type { TriageItem } from '@/lib/admin/data/triage';

  vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  }));

  const appItem: TriageItem = {
    key: 'app:fp-1', origin: 'app', title: 'savePartialRound failed', severity: 'error',
    sport: 'golf', occurrences: 3, affectedUsers: 2,
    firstSeen: '2026-07-01T00:00:00Z', lastSeen: '2026-07-01T02:00:00Z',
    permalink: null, eventIds: ['e1', 'e2', 'e3'], substatus: null,
  };
  const sentryItem: TriageItem = {
    key: 'sentry:s1', origin: 'sentry', title: 'TypeError in rounds', severity: 'error',
    sport: null, occurrences: 40, affectedUsers: 7,
    firstSeen: '2026-06-30T00:00:00Z', lastSeen: '2026-07-01T01:00:00Z',
    permalink: 'https://sentry.io/x', eventIds: [], substatus: 'regressed',
  };

  describe('TriageQueue', () => {
    it('renders one aggregated row per incident with user + occurrence counts', () => {
      render(<TriageQueue items={[appItem, sentryItem]} onResolve={vi.fn()} />);
      expect(screen.getByText('savePartialRound failed')).toBeInTheDocument();
      expect(screen.getByText(/2 users/)).toBeInTheDocument();
      expect(screen.getByText(/3 events/)).toBeInTheDocument();
    });
    it('app rows expose Resolve; sentry rows expose the permalink instead', () => {
      const onResolve = vi.fn(async () => ({ resolvedCount: 3 }));
      render(<TriageQueue items={[appItem, sentryItem]} onResolve={onResolve} />);
      fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
      expect(onResolve).toHaveBeenCalledWith(['e1', 'e2', 'e3']);
      const link = screen.getByRole('link', { name: /open in sentry/i });
      expect(link).toHaveAttribute('href', 'https://sentry.io/x');
    });
    it('renders the celebratory all-clear when empty', () => {
      render(<TriageQueue items={[]} onResolve={vi.fn()} />);
      expect(screen.getByText(/nothing in the queue/i)).toBeInTheDocument();
    });
    it('resolved rows leave the list optimistically', async () => {
      const onResolve = vi.fn(async () => ({ resolvedCount: 3 }));
      render(<TriageQueue items={[appItem]} onResolve={onResolve} />);
      fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
      await waitFor(() =>
        expect(screen.queryByText('savePartialRound failed')).not.toBeInTheDocument(),
      );
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/app/admin/_components/__tests__/triage-queue.test.tsx
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/app/admin/_components/TriageQueue.tsx`:
  ```tsx
  'use client';

  import { useState, useTransition } from 'react';
  import { useRouter } from 'next/navigation';
  import { ExternalLink, CheckCheck } from 'lucide-react';
  import { StatusPill } from '@/components/fairway';
  import type { TriageItem, TriageSeverity } from '@/lib/admin/data/triage';
  import { resolveTriageEvents } from '@/app/admin/actions/triage';
  import { SportBadge } from './SportBadge';
  import { PanelAllClear } from './PanelStates';

  const SEVERITY_TONE: Record<TriageSeverity, 'danger' | 'warning' | 'neutral' | 'info'> = {
    critical: 'danger',
    error: 'danger',
    warning: 'warning',
    info: 'neutral',
  };

  export function TriageQueue({
    items,
    onResolve = resolveTriageEvents,
  }: {
    items: TriageItem[];
    onResolve?: (eventIds: string[]) => Promise<{ resolvedCount: number }>;
  }) {
    const router = useRouter();
    const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set());
    const [, startTransition] = useTransition();

    const visible = items.filter((i) => !hiddenKeys.has(i.key));

    if (visible.length === 0) {
      return (
        <PanelAllClear
          label="Nothing in the queue — no unresolved incidents"
          checkedAt={new Date().toISOString()}
        />
      );
    }

    function resolve(item: TriageItem) {
      // Optimistic: hide now; refresh reconciles. Resolution is idempotent
      // (resolve_admin_event only touches resolved=false rows).
      setHiddenKeys((prev) => new Set([...prev, item.key]));
      startTransition(() => {
        void onResolve(item.eventIds).then(() => router.refresh());
      });
    }

    return (
      <ul className="divide-y divide-warm-200/60">
        {visible.map((item) => (
          <li key={item.key} className="flex items-center gap-3 py-3">
            <StatusPill tone={SEVERITY_TONE[item.severity]} dot size="sm">
              {item.severity}
            </StatusPill>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-warm-900">{item.title}</p>
              <p className="font-fw-mono text-xs tabular-nums text-warm-500">
                {item.affectedUsers} users · {item.occurrences} events · last{' '}
                {new Date(item.lastSeen).toLocaleTimeString()}
                {item.substatus === 'regressed' ? ' · REGRESSED' : ''}
              </p>
            </div>
            <SportBadge sport={item.sport} />
            <span className="rounded bg-warm-100 px-1.5 py-0.5 text-[10px] uppercase text-warm-600">
              {item.origin === 'sentry' ? 'Sentry' : 'App'}
            </span>
            {item.origin === 'app' ? (
              <button
                type="button"
                onClick={() => resolve(item)}
                className="inline-flex items-center gap-1 rounded-lg border border-warm-300 px-2.5 py-1 text-xs font-medium text-warm-700 hover:bg-warm-100"
              >
                <CheckCheck size={13} aria-hidden /> Resolve
              </button>
            ) : (
              <a
                href={item.permalink ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-warm-300 px-2.5 py-1 text-xs font-medium text-warm-700 hover:bg-warm-100"
              >
                <ExternalLink size={13} aria-hidden /> Open in Sentry
              </a>
            )}
          </li>
        ))}
      </ul>
    );
  }
  ```

- [ ] 4. Run to confirm pass:
  ```bash
  npm run test:run -- src/app/admin/_components/__tests__/triage-queue.test.tsx
  ```
  Expected: 4 tests pass.

- [ ] 5. Commit: `feat(admin): triage queue with inline resolve + optimistic hide (W5)`

---

### Task 3 — Compose the Overview page + 30s visibility-aware polling

**Files**
- Modify: `src/app/admin/page.tsx` (replace the W1 placeholder)
- Create: `src/app/admin/_components/AutoRefresh.tsx`

**Interfaces**
- Consumes everything above. Produces the `/admin` page.

**Steps**

- [ ] 1. Create `src/app/admin/_components/AutoRefresh.tsx`:
  ```tsx
  'use client';

  import { useEffect } from 'react';
  import { useRouter } from 'next/navigation';

  /** 30s polling via router.refresh(), paused while the tab is hidden —
   *  polling (NOT websockets) is the locked freshness model, and hidden tabs
   *  must not load the shared prod DB (the 576-errors/day lesson). */
  export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
    const router = useRouter();
    useEffect(() => {
      const tick = () => {
        if (document.visibilityState === 'visible') router.refresh();
      };
      const id = setInterval(tick, intervalMs);
      return () => clearInterval(id);
    }, [router, intervalMs]);
    return null;
  }
  ```

- [ ] 2. Replace `src/app/admin/page.tsx`:
  ```tsx
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { fetchOverviewSnapshot } from '@/lib/admin/data/overview';
  import { fetchTriageQueue } from '@/lib/admin/data/triage';
  import { fetchVercelDeployments } from '@/lib/admin/vercel-api';
  import { AdminStatusBanner } from './_components/AdminStatusBanner';
  import { KpiTile } from './_components/KpiTile';
  import { TriageQueue } from './_components/TriageQueue';
  import { AutoRefresh } from './_components/AutoRefresh';
  import { PanelBoundary } from './_components/PanelBoundary';
  import { PanelAllClear, PanelNoData, PanelStale } from './_components/PanelStates';
  import { SkeletonStat, SkeletonList } from '@/components/fairway';

  export const dynamic = 'force-dynamic';

  async function BannerAndKpis() {
    const { kpis, banner, watcher } = await fetchOverviewSnapshot();
    return (
      <>
        <AdminStatusBanner
          state={banner.state}
          attentionCount={banner.attentionCount}
          checkedAt={banner.checkedAt}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiTile label="Sentry unresolved" value={kpis.sentryUnresolved} href="/admin/errors" tone={kpis.sentryUnresolved ? 'danger' : 'neutral'} goodDirection="down" />
          <KpiTile label="Errors 24h" value={kpis.eventErrors24h} href="/admin/errors" goodDirection="down" />
          <KpiTile label="Auth failures 24h" value={kpis.authFailures24h} href="/admin/auth" goodDirection="down" />
          <KpiTile label="Active users today" value={kpis.activeUsersToday} href="/admin/users" />
          <KpiTile
            label="Activity today"
            value={kpis.activityToday.golf + kpis.activityToday.baseball + kpis.activityToday.lifting}
            href="/admin/golf"
          />
          <KpiTile
            label="Last deploy (min ago)"
            value={kpis.lastDeploy?.ageMinutes ?? null}
            href="/admin/deploys"
            tone={kpis.lastDeploy?.state === 'ERROR' ? 'danger' : 'neutral'}
            goodDirection="down"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {watcher.map((w) => (
            <span
              key={w.label}
              className={
                w.stale
                  ? 'rounded-full bg-fw-warning-bg px-2.5 py-1 text-xs text-warm-800'
                  : 'rounded-full bg-fw-success-bg px-2.5 py-1 text-xs text-accent-700'
              }
            >
              {w.label}: {w.stale ? 'STALE' : 'flowing'}
            </span>
          ))}
        </div>
      </>
    );
  }

  async function TriagePanel() {
    const { items, sentry } = await fetchTriageQueue();
    const regressed = items.filter((i) => i.substatus === 'regressed');
    return (
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="xl:col-span-2 rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
            Triage queue
          </h2>
          {sentry.status === 'error' ? (
            <div className="mt-2"><PanelStale label="Sentry feed" error={sentry.error} /></div>
          ) : null}
          {sentry.status === 'unconfigured' ? (
            <p className="mt-2 text-xs text-warm-500">
              Sentry live pull not configured (SENTRY_READ_TOKEN) — showing in-app incidents only.
            </p>
          ) : null}
          <TriageQueue items={items.slice(0, 25)} />
        </section>
        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
            Regressed — a fix failed
          </h2>
          {regressed.length === 0 ? (
            <PanelAllClear label="No regressed issues" checkedAt={new Date().toISOString()} />
          ) : (
            <TriageQueue items={regressed} />
          )}
        </section>
      </div>
    );
  }

  async function DeployRail() {
    const deploys = await fetchVercelDeployments(5);
    if (deploys.status === 'unconfigured') {
      return <PanelNoData label="Deploy rail not configured" description="Set VERCEL_API_TOKEN / VERCEL_PROJECT_ID / VERCEL_TEAM_ID to light this up." />;
    }
    if (deploys.status === 'error' || !deploys.data) {
      return <PanelStale label="Deploys" error={deploys.error} />;
    }
    return (
      <ul className="flex flex-wrap gap-3">
        {deploys.data.map((d) => (
          <li key={d.uid} className="rounded-xl border border-warm-200 bg-white/70 px-3 py-2">
            <p className="font-fw-mono text-xs tabular-nums text-warm-900">
              {d.commitSha?.slice(0, 7) ?? d.uid.slice(0, 7)} · {d.state}
            </p>
            <p className="max-w-[220px] truncate text-xs text-warm-500">{d.commitMessage ?? d.url}</p>
          </li>
        ))}
      </ul>
    );
  }

  export default async function AdminOverviewPage() {
    await requireSuperAdmin();

    return (
      <main className="space-y-6 p-6">
        <AutoRefresh />
        <PanelBoundary title="Status" skeleton={<SkeletonStat />}>
          <BannerAndKpis />
        </PanelBoundary>
        <PanelBoundary title="Triage" skeleton={<SkeletonList />}>
          <TriagePanel />
        </PanelBoundary>
        <PanelBoundary title="Deploys" skeleton={<SkeletonStat />}>
          <DeployRail />
        </PanelBoundary>
      </main>
    );
  }
  ```
  (Check `SkeletonList` props in `src/components/fairway/feedback` before use; pass `rows={5}` if required.)

- [ ] 3. Gates + contract:
  ```bash
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```
  Expected: green — the page keeps `requireSuperAdmin()` first-line.

- [ ] 4. Manual smoke as Nick on dev: banner renders (likely `stale` until W11 wires crons — that HONESTY is correct, not a bug); KPI tiles deep-link; Sentry tile shows starved state until `SENTRY_READ_TOKEN` provisioned; resolve on an app incident hides the row and survives refresh.

- [ ] 5. Commit: `feat(admin): overview tab — banner, KPI strip, triage queue, deploy rail (W5)`

---

## Acceptance Criteria

- [ ] `/admin` answers "is anything on fire?" without scrolling on a 13" desktop: banner → 6 KPI tiles → queue.
- [ ] Every KPI number deep-links to its tab; unconfigured Sentry/Vercel render starved/not-configured — never fake zeros or fake green.
- [ ] Triage queue ranks affected-users-first; resolve is optimistic, idempotent, and audit-persisted via `resolve_admin_event` (`resolved_by = Nick's uid` — verify one row in DB after a manual resolve).
- [ ] Regressed callout renders its celebratory empty state when clean.
- [ ] Polling: 30s, paused on hidden tabs; navigating away and back does not stack intervals.
- [ ] Watch-the-watcher chips show `Cron outcomes: STALE` until W11 (expected honest state).
- [ ] All gates green; 11 new W5 tests pass.

## Rollback

`git revert` — `/admin` returns to the W4 chrome with the placeholder body. No DB changes in this wave.
