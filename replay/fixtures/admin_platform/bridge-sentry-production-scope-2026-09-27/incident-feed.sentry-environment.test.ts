/**
 * The Bridge's merged incident feed must only merge PRODUCTION Sentry issues.
 *
 * Observed 2026-09-27: four `BAND_INK is not defined` issues
 * (JAVASCRIPT-NEXTJS-120..123, environment=development, url
 * http://localhost:3218/...) and earlier `RootSummary.tsx` module-not-found
 * issues (11Y/11Z, also development) were raised by a local `next dev`
 * session mid-edit. `fetchIncidentFeed`'s filter-scoped Sentry query — the
 * population merged into the triage queue and "Active groups" — sent no
 * `environment` scope, so those dev-machine issues showed on the Bridge as
 * production incidents. The reliability collector already scopes to
 * `['production']` (src/lib/reliability/sources.ts, SENTRY_ENVIRONMENTS);
 * the incident feed did not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const fetchSentryIssues = vi.fn(async () => ({ status: 'ok' as const, data: [], error: null }));
vi.mock('@/lib/admin/sentry-api', () => ({ fetchSentryIssues }));

vi.mock('@/lib/admin/auto-resolve', () => ({
  getProductionDeployAt: vi.fn(async () => ({ deployAt: null })),
  RELEASE_GRACE_MS: 24 * 60 * 60 * 1000,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const empty = { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'order', 'limit', 'not', 'or', 'filter', 'range', 'is']) {
        chain[m] = () => chain;
      }
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(empty).then(resolve);
      chain.single = async () => ({ data: null, error: null });
      chain.maybeSingle = async () => ({ data: null, error: null });
      return chain;
    },
    rpc: async () => ({ data: [], error: null }),
  }),
}));

describe('fetchIncidentFeed Sentry environment scope', () => {
  beforeEach(() => {
    fetchSentryIssues.mockClear();
  });

  it('scopes the merged (filter-scoped) Sentry query to production', async () => {
    const { fetchIncidentFeed } = await import('@/lib/admin/data/incident-feed');
    await fetchIncidentFeed({ windowHours: 24 });

    const calls = fetchSentryIssues.mock.calls as unknown as Array<[{ query?: string; environment?: readonly string[] }]>;
    const merged = calls.find(([opts]) => typeof opts?.query === 'string');
    expect(merged, 'the filter-scoped merge query was not issued').toBeDefined();
    expect(merged?.[0].environment).toEqual(['production']);
  });
});
