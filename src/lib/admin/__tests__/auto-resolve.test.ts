import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import type { VercelDeployment } from '@/lib/admin/vercel-api';

interface MockRow {
  fingerprint: string | null;
  created_at: string;
}

const mocks = vi.hoisted(() => ({
  rows: [] as MockRow[],
  updates: [] as Array<{ fingerprints: string[]; patch: Record<string, unknown> }>,
  deployResult: { status: 'unconfigured', data: null, fetchedAt: null, error: 'Vercel API not configured' } as AdminFetchResult<VercelDeployment[]>,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'admin_events') throw new Error(`unexpected table ${table}`);
      const selectChain = {
        select: () => selectChain,
        eq: () => selectChain,
        not: () => selectChain,
        order: () => selectChain,
        // fetchAllRows calls .range(from, to) as the terminal call — a single
        // page is enough since these tests stay well under 1000 rows.
        range: (from: number, to: number) =>
          Promise.resolve({ data: mocks.rows.slice(from, to + 1), error: null }),
      };
      return {
        select: selectChain.select,
        update: (patch: Record<string, unknown>) => {
          let cutoffIso: string | null = null;
          const updateChain = {
            eq: () => updateChain,
            lt: (_col: string, value: string) => {
              cutoffIso = value;
              return updateChain;
            },
            in: (_col: string, values: string[]) => {
              mocks.updates.push({ fingerprints: values, patch });
              const count = mocks.rows.filter(
                (r) =>
                  r.fingerprint &&
                  values.includes(r.fingerprint) &&
                  (cutoffIso === null || r.created_at < cutoffIso),
              ).length;
              return Promise.resolve({ data: null, error: null, count });
            },
          };
          return updateChain;
        },
      };
    },
  }),
}));

vi.mock('@/lib/admin/vercel-api', () => ({
  fetchVercelDeployments: vi.fn(async () => mocks.deployResult),
}));

const deployment = (over: Partial<VercelDeployment>): VercelDeployment => ({
  uid: 'dpl_1',
  state: 'READY',
  createdAt: 0,
  ready: null,
  target: 'production',
  url: 'helmv3-abc.vercel.app',
  commitSha: 'abc123',
  commitMessage: 'fix: quiet the noisy path',
  commitRef: 'main',
  commitAuthor: 'nick',
  ...over,
});

const NOW = Date.parse('2026-07-16T12:00:00.000Z');

// Every test dynamically re-imports the module under `vi.resetModules()` so
// its module-scope deploy-at cache (auto-resolve.ts's DEPLOY_AT_CACHE_TTL_MS
// window) never bleeds state across test cases.
async function loadAutoResolve() {
  const mod = await import('@/lib/admin/auto-resolve');
  return mod.autoResolveFixedIncidents;
}

describe('autoResolveFixedIncidents', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rows = [];
    mocks.updates = [];
    mocks.deployResult = { status: 'unconfigured', data: null, fetchedAt: null, error: 'Vercel API not configured' };
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Rule B: resolves a fingerprint quiet for 14+ days when deploy data is unavailable (fail-soft)', async () => {
    mocks.rows = [
      { fingerprint: 'fp-old', created_at: new Date(NOW - 20 * 86400_000).toISOString() },
      { fingerprint: 'fp-recent', created_at: new Date(NOW - 5 * 86400_000).toISOString() },
    ];

    const autoResolveFixedIncidents = await loadAutoResolve();
    const result = await autoResolveFixedIncidents();

    expect(result.resolvedRelease).toBe(0);
    expect(result.resolvedQuiet).toBe(1);
    expect(result.fingerprints).toBe(1);
    expect(result.releaseSkippedReason).toBe('Vercel API not configured');
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]!.fingerprints).toEqual(['fp-old']);
  });

  it('Rule A: resolves a fingerprint quiet since a >=24h-old production deploy, spares one active after it', async () => {
    const deployAt = NOW - 48 * 3600_000; // 48h old — clears the 24h grace window
    mocks.deployResult = {
      status: 'ok',
      data: [deployment({ uid: 'dpl_prod', ready: deployAt, createdAt: deployAt - 60_000 })],
      fetchedAt: new Date(NOW).toISOString(),
    };
    mocks.rows = [
      // last fired before the deploy — the deploy fixed it.
      { fingerprint: 'fp-fixed', created_at: new Date(deployAt - 10 * 3600_000).toISOString() },
      // last fired after the deploy — still broken, must NOT resolve.
      { fingerprint: 'fp-still-broken', created_at: new Date(deployAt + 3600_000).toISOString() },
    ];

    const autoResolveFixedIncidents = await loadAutoResolve();
    const result = await autoResolveFixedIncidents();

    expect(result.resolvedRelease).toBe(1);
    expect(result.resolvedQuiet).toBe(0);
    expect(result.deploySha).toBe('abc123');
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]!.fingerprints).toEqual(['fp-fixed']);
  });

  it('skips Rule A when the newest production deploy is under 24h old, but Rule B still runs', async () => {
    const deployAt = NOW - 2 * 3600_000; // 2h old — inside the grace window
    mocks.deployResult = {
      status: 'ok',
      data: [deployment({ uid: 'dpl_fresh', ready: deployAt, createdAt: deployAt })],
      fetchedAt: new Date(NOW).toISOString(),
    };
    mocks.rows = [
      // would clear the release rule's cutoff, but the deploy isn't 24h old yet.
      { fingerprint: 'fp-pre-deploy', created_at: new Date(deployAt - 3600_000).toISOString() },
      // independently 14d-quiet — Rule B must still catch this one.
      { fingerprint: 'fp-14d-quiet', created_at: new Date(NOW - 20 * 86400_000).toISOString() },
    ];

    const autoResolveFixedIncidents = await loadAutoResolve();
    const result = await autoResolveFixedIncidents();

    expect(result.resolvedRelease).toBe(0);
    expect(result.releaseSkippedReason).toBe('newest production deploy is under 24h old');
    expect(result.resolvedQuiet).toBe(1);
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]!.fingerprints).toEqual(['fp-14d-quiet']);
  });

  it('never resolves a fingerprint with a recent event under either rule (regression-safe)', async () => {
    const deployAt = NOW - 48 * 3600_000;
    mocks.deployResult = {
      status: 'ok',
      data: [deployment({ uid: 'dpl_prod', ready: deployAt, createdAt: deployAt })],
      fetchedAt: new Date(NOW).toISOString(),
    };
    mocks.rows = [{ fingerprint: 'fp-active', created_at: new Date(NOW - 3600_000).toISOString() }];

    const autoResolveFixedIncidents = await loadAutoResolve();
    const result = await autoResolveFixedIncidents();

    expect(result.resolvedRelease).toBe(0);
    expect(result.resolvedQuiet).toBe(0);
    expect(result.fingerprints).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });
});
