/**
 * Bridge archive data layer — thin I/O + derivation tests.
 *
 * `shipStatus` and the regression concept are pure and owned by
 * `src/lib/reliability/resolution.ts` (tested on their own there); nothing
 * here re-derives that logic. These tests cover exactly what this module
 * adds:
 *   1. raw `admin_error_resolutions` rows are wired through to
 *      `ArchivedResolution` unchanged (a column-name typo here would
 *      silently drop a field from the archive);
 *   2. `shipStatus` is computed correctly against the live production
 *      deploy for all three outcomes — shipped / pending / unknown — never
 *      collapsing `unknown` into `pending`;
 *   3. `regressed` derives from `reopened_at` alone;
 *   4. a query failure returns an honest AdminFetchResult error, never a
 *      fabricated empty archive;
 *   5. the exact-count truncation check is honest and its fallback is
 *      actually reachable (mirrors the regression qualifier-logic.ts pinned).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Probe {
  data: unknown[] | null;
  error: { message: string } | null;
  count?: number | null;
}

const page: Probe = { data: [], error: null };
const countProbe: Probe = { data: null, error: null, count: 0 };

function chainNode(result: Probe) {
  const node = {
    order: () => node,
    range: () => Promise.resolve(result),
    then: (onFulfilled: (v: Probe) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return node;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (table !== 'admin_error_resolutions') throw new Error(`unexpected table in test mock: ${table}`);
        const isCountProbe = Boolean(opts?.head);
        return chainNode(isCountProbe ? countProbe : page);
      },
    }),
  }),
}));

const getProductionDeployAt = vi.fn();
vi.mock('@/lib/admin/auto-resolve', () => ({
  getProductionDeployAt: (...args: unknown[]) => getProductionDeployAt(...args),
}));

import { fetchResolutionArchive } from '../resolutions';

function resetAll() {
  page.data = [];
  page.error = null;
  countProbe.count = 0;
  countProbe.error = null;
  getProductionDeployAt.mockReset();
  getProductionDeployAt.mockResolvedValue({ deployAt: null, deploySha: null, reason: 'not configured' });
}

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fingerprint: 'fp-1',
    resolved_at: '2026-08-20T00:00:00.000Z',
    resolved_by: 'user-1',
    resolution_source: 'manual',
    pr_number: 42,
    pr_url: 'https://github.com/org/repo/pull/42',
    fixed_in_sha: 'abcdef1',
    note: 'fixed the thing',
    last_seen_at_resolution: '2026-08-19T00:00:00.000Z',
    reopened_at: null,
    reopened_count: 0,
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('fetchResolutionArchive', () => {
  beforeEach(resetAll);

  it('wires a fetched row through to ArchivedResolution unchanged', async () => {
    page.data = [row()];
    countProbe.count = 1;
    getProductionDeployAt.mockResolvedValue({ deployAt: null, deploySha: null, reason: 'not configured' });

    const result = await fetchResolutionArchive();

    expect(result.status).toBe('ok');
    expect(result.data).not.toBeNull();
    expect(result.fetchedAt).not.toBeNull();
    expect(result.truncated).toBe(false);

    const [archived] = result.data!.resolutions;
    expect(archived).toEqual(
      expect.objectContaining({
        fingerprint: 'fp-1',
        resolvedAt: '2026-08-20T00:00:00.000Z',
        resolvedBy: 'user-1',
        resolutionSource: 'manual',
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42',
        fixedInSha: 'abcdef1',
        note: 'fixed the thing',
        lastSeenAtResolution: '2026-08-19T00:00:00.000Z',
        reopenedAt: null,
        reopenedCount: 0,
        createdAt: '2026-08-20T00:00:00.000Z',
        updatedAt: '2026-08-20T00:00:00.000Z',
        regressed: false,
      }),
    );
    expect(result.data!.evaluated).toBe(1);
    expect(result.data!.confirmedTotal).toBe(1);
  });

  it('normalizes an unexpected resolution_source value to manual, never silently to auto', async () => {
    page.data = [row({ resolution_source: 'something-unexpected' })];
    countProbe.count = 1;

    const result = await fetchResolutionArchive();

    expect(result.data!.resolutions[0]!.resolutionSource).toBe('manual');
  });

  it('derives regressed=true from a non-null reopened_at, and surfaces reopened_count', async () => {
    page.data = [row({ reopened_at: '2026-08-25T00:00:00.000Z', reopened_count: 3 })];
    countProbe.count = 1;

    const result = await fetchResolutionArchive();

    const archived = result.data!.resolutions[0]!;
    expect(archived.regressed).toBe(true);
    expect(archived.reopenedCount).toBe(3);
  });

  describe('shipStatus derivation', () => {
    it('reports shipped when fixed_in_sha matches the production SHA', async () => {
      page.data = [row({ fixed_in_sha: 'abc1234' })];
      countProbe.count = 1;
      getProductionDeployAt.mockResolvedValue({
        deployAt: Date.parse('2026-08-21T00:00:00.000Z'),
        deploySha: 'abc1234extra',
      });

      const result = await fetchResolutionArchive();

      expect(result.data!.resolutions[0]!.shipStatus).toBe('shipped');
    });

    it('falls back to shipped-by-time when a production deploy landed after resolvedAt', async () => {
      page.data = [row({ resolved_at: '2026-08-20T00:00:00.000Z', fixed_in_sha: null })];
      countProbe.count = 1;
      getProductionDeployAt.mockResolvedValue({
        deployAt: Date.parse('2026-08-21T00:00:00.000Z'),
        deploySha: 'unrelated-sha',
      });

      const result = await fetchResolutionArchive();

      expect(result.data!.resolutions[0]!.shipStatus).toBe('shipped');
    });

    it('reports pending when the newest production deploy predates the resolution', async () => {
      page.data = [row({ resolved_at: '2026-08-20T00:00:00.000Z', fixed_in_sha: null })];
      countProbe.count = 1;
      getProductionDeployAt.mockResolvedValue({
        deployAt: Date.parse('2026-08-10T00:00:00.000Z'),
        deploySha: 'older-sha',
      });

      const result = await fetchResolutionArchive();

      expect(result.data!.resolutions[0]!.shipStatus).toBe('pending');
    });

    it('reports unknown, never pending, when the production deploy is unreadable', async () => {
      page.data = [row()];
      countProbe.count = 1;
      getProductionDeployAt.mockResolvedValue({
        deployAt: null,
        deploySha: null,
        reason: 'Vercel deployments unavailable',
      });

      const result = await fetchResolutionArchive();

      expect(result.data!.resolutions[0]!.shipStatus).toBe('unknown');
    });

    it('still returns the archive (rows at unknown), never throwing, when getProductionDeployAt REJECTS', async () => {
      // getProductionDeployAt only turns a non-ok Vercel response into a
      // `reason`-carrying result — it does not guarantee the underlying
      // fetch never rejects. The DB read succeeded here and must not be
      // discarded just because Vercel could not be reached; `unknown` is
      // exactly the outcome that exists for this case.
      page.data = [row()];
      countProbe.count = 1;
      getProductionDeployAt.mockRejectedValue(new Error('fetch failed: ECONNRESET'));

      const result = await fetchResolutionArchive();

      expect(result.status).toBe('ok');
      expect(result.data!.resolutions[0]!.shipStatus).toBe('unknown');
    });
  });

  it('reports an honest error, not a fabricated empty archive, when the query fails', async () => {
    page.error = { message: 'connection reset' };

    const result = await fetchResolutionArchive();

    expect(result.status).toBe('error');
    expect(result.data).toBeNull();
    expect(result.error).toContain('admin_error_resolutions query failed');
    expect(result.error).toContain('connection reset');
  });

  it('flags truncation honestly when the exact count exceeds the fetched page', async () => {
    page.data = [row()];
    countProbe.count = 5_000;

    const result = await fetchResolutionArchive();

    expect(result.status).toBe('ok');
    expect(result.truncated).toBe(true);
    expect(result.data!.evaluated).toBe(1);
    expect(result.data!.confirmedTotal).toBe(5_000);
  });

  it('never reports a false "not truncated" when the count probe fails and the page came back short of the ceiling', async () => {
    page.data = [row()];
    countProbe.error = { message: 'count probe unavailable' };
    countProbe.count = null;

    const result = await fetchResolutionArchive();

    expect(result.status).toBe('ok');
    // A single fetched row is nowhere near the bounded ceiling, so the
    // honest fallback correctly reports "not truncated" even though the
    // count probe itself could not confirm it.
    expect(result.truncated).toBe(false);
    expect(result.data!.confirmedTotal).toBeNull();
    expect(result.data!.evaluated).toBe(1);
  });

  it('reports truncation via the reachable fallback when the ceiling stopped the read and the count probe is unavailable', async () => {
    // THE REGRESSION THIS PINS (same shape fixed in qualifier-logic.ts): the
    // fallback must be driven by whether accumulation actually hit the real
    // paging ceiling, never by comparing fetched length against a bound
    // PostgREST already clamps underneath it. The mock returns a FULL
    // 1,000-row page every time (as PostgREST does when more rows remain),
    // so accumulation runs all the way to the 5,000-row ceiling.
    // The shared `page` probe returns the same full 1,000-row result for
    // every `.range()` call regardless of the window asked for, so the
    // module's own `fetchUpTo` loop never sees a short page and keeps
    // paging until it hits RESOLUTION_ROW_CEILING (5,000) exactly as it
    // would against a real table that exceeds the ceiling.
    const fullPage = Array.from({ length: 1_000 }, (_unused, i) => row({ fingerprint: `fp-${i}` }));
    page.data = fullPage;
    countProbe.error = { message: 'count probe unavailable' };
    countProbe.count = null;

    const result = await fetchResolutionArchive();

    expect(result.status).toBe('ok');
    expect(result.data!.evaluated).toBe(5_000); // RESOLUTION_ROW_CEILING
    expect(result.truncated).toBe(true);
    expect(result.data!.confirmedTotal).toBeNull();
  });
});
