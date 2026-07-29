import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import type { VercelDeployment } from '@/lib/admin/vercel-api';

interface MockRow {
  id?: string;
  fingerprint: string | null;
  created_at: string;
}

const mocks = vi.hoisted(() => ({
  rows: [] as MockRow[],
  updates: [] as Array<{ fingerprints: string[]; patch: Record<string, unknown> }>,
  /** Rule C updates, keyed by row id rather than fingerprint. Kept separate so
   *  the Rule A/B assertions above stay exactly as strict as they were. */
  legacyUpdates: [] as Array<{ ids: string[]; patch: Record<string, unknown> }>,
  deployResult: { status: 'unconfigured', data: null, fetchedAt: null, error: 'Vercel API not configured' } as AdminFetchResult<VercelDeployment[]>,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'admin_events') throw new Error(`unexpected table ${table}`);

      // One builder serving two different reads: the Rule A/B snapshot
      // (`.not('fingerprint','is',null)` … `.range()`) and Rule C's legacy
      // sweep (`.is('fingerprint', null)` … `.limit()`). The mock tracks which
      // fingerprint predicate was applied so it can answer each correctly —
      // a mock that ignored the difference would let Rule C "pass" while
      // selecting fingerprinted rows, which is the exact bug being fixed.
      function makeSelectChain() {
        let nullFingerprintOnly = false;
        let cutoffIso: string | null = null;
        const chain = {
          select: () => chain,
          eq: () => chain,
          not: () => chain,
          is: (_col: string, _value: null) => {
            nullFingerprintOnly = true;
            return chain;
          },
          lt: (_col: string, value: string) => {
            cutoffIso = value;
            return chain;
          },
          order: () => chain,
          range: (from: number, to: number) =>
            Promise.resolve({ data: mocks.rows.filter((r) => r.fingerprint !== null).slice(from, to + 1), error: null }),
          limit: (n: number) => {
            const matched = mocks.rows.filter(
              (r) =>
                (nullFingerprintOnly ? r.fingerprint === null : true) &&
                (cutoffIso === null || r.created_at < cutoffIso) &&
                !resolvedIds.has(r.id ?? ''),
            );
            return Promise.resolve({
              data: matched.slice(0, n).map((r) => ({ id: r.id ?? '' })),
              error: null,
            });
          },
        };
        return chain;
      }

      // Rule C re-issues its select each batch and expects already-updated
      // rows to fall out of the next page — model that, or the loop would
      // spin on the same ids until MAX_BATCHES.
      const resolvedIds = mockResolvedIds;

      return {
        select: (...args: unknown[]) => makeSelectChain().select(...(args as [])),
        update: (patch: Record<string, unknown>) => {
          let cutoffIso: string | null = null;
          const updateChain = {
            eq: () => updateChain,
            lt: (_col: string, value: string) => {
              cutoffIso = value;
              return updateChain;
            },
            in: (col: string, values: string[]) => {
              if (col === 'id') {
                mocks.legacyUpdates.push({ ids: values, patch });
                for (const id of values) resolvedIds.add(id);
                const count = mocks.rows.filter(
                  (r) =>
                    r.id !== undefined &&
                    values.includes(r.id) &&
                    (cutoffIso === null || r.created_at < cutoffIso),
                ).length;
                return Promise.resolve({ data: null, error: null, count });
              }
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

/** Ids Rule C has already flipped this test, so the mocked re-select drops
 *  them the way PostgREST would. */
const mockResolvedIds = new Set<string>();

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
    mocks.legacyUpdates = [];
    mockResolvedIds.clear();
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

  // ── Rule C ────────────────────────────────────────────────────────────────
  // Rules A and B are keyed on fingerprint: the snapshot read carries
  // `.not('fingerprint','is',null)` and the UPDATE matches
  // `.in('fingerprint', batch)`, which cannot match NULL in SQL. Every row
  // written before fingerprinting shipped was therefore permanently invisible
  // to auto-resolution. Measured on production 2026-07-29: 87,653 of 88,782
  // unresolved error rows had no fingerprint, all created before 2026-07-11,
  // while the nightly job had been running for months unable to touch them.

  it('Rule C: ages out rows that have no fingerprint at all', async () => {
    mocks.rows = [
      { id: 'legacy-1', fingerprint: null, created_at: new Date(NOW - 30 * 86400_000).toISOString() },
      { id: 'legacy-2', fingerprint: null, created_at: new Date(NOW - 60 * 86400_000).toISOString() },
    ];

    const autoResolveFixedIncidents = await loadAutoResolve();
    const result = await autoResolveFixedIncidents();

    expect(result.resolvedLegacy).toBe(2);
    expect(mocks.legacyUpdates).toHaveLength(1);
    expect(mocks.legacyUpdates[0]!.ids.sort()).toEqual(['legacy-1', 'legacy-2']);
    // Rules A/B must not have fired — there are no fingerprints to fire on.
    expect(mocks.updates).toHaveLength(0);
  });

  it('Rule C: spares an unfingerprinted row inside the 14-day window', async () => {
    // Same cutoff as Rule B, deliberately: Rule C extends an already-accepted
    // policy to the rows it could not reach, it does not loosen it.
    mocks.rows = [
      { id: 'legacy-old', fingerprint: null, created_at: new Date(NOW - 30 * 86400_000).toISOString() },
      { id: 'legacy-fresh', fingerprint: null, created_at: new Date(NOW - 3 * 86400_000).toISOString() },
    ];

    const autoResolveFixedIncidents = await loadAutoResolve();
    const result = await autoResolveFixedIncidents();

    expect(result.resolvedLegacy).toBe(1);
    expect(mocks.legacyUpdates[0]!.ids).toEqual(['legacy-old']);
  });

  it('Rule C: leaves fingerprinted rows to Rules A and B', async () => {
    // The two paths must not double-count or cross over. A fingerprinted row
    // that is 14d quiet belongs to Rule B; Rule C must not also claim it.
    mocks.rows = [
      { id: 'fp-row', fingerprint: 'fp-quiet', created_at: new Date(NOW - 30 * 86400_000).toISOString() },
      { id: 'legacy-row', fingerprint: null, created_at: new Date(NOW - 30 * 86400_000).toISOString() },
    ];

    const autoResolveFixedIncidents = await loadAutoResolve();
    const result = await autoResolveFixedIncidents();

    expect(result.resolvedQuiet).toBe(1);
    expect(mocks.updates[0]!.fingerprints).toEqual(['fp-quiet']);
    expect(result.resolvedLegacy).toBe(1);
    expect(mocks.legacyUpdates[0]!.ids).toEqual(['legacy-row']);
  });

  it('Rule C reports 0 when there is no legacy backlog (non-vacuity)', async () => {
    // Guards against a Rule C that reports work it did not do — every
    // assertion above would still pass if it always claimed rows.
    mocks.rows = [
      { id: 'fp-row', fingerprint: 'fp-quiet', created_at: new Date(NOW - 30 * 86400_000).toISOString() },
    ];

    const autoResolveFixedIncidents = await loadAutoResolve();
    const result = await autoResolveFixedIncidents();

    expect(result.resolvedLegacy).toBe(0);
    expect(mocks.legacyUpdates).toHaveLength(0);
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
