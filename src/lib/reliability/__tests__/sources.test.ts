import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The test that matters most in this file is the self-feeding-read guard.
 *
 * This collector is a cron that READS the table crons write their failures to.
 * Without exclusions, one failed run becomes a signal, which becomes a triage
 * item, which produces another error row on the next pass — a loop that
 * manufactures work out of its own failure and never converges. The repo has
 * already been bitten by this exact shape once (`rca_analysis` rows being
 * counted as occurrences of the incident they analyzed), so the guard is
 * asserted at the query level, where it actually lives.
 */

const calls: Array<{ method: string; args: unknown[] }> = [];
let rowsToReturn: unknown[] = [];
let errorToReturn: { message: string } | null = null;

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  // Every chainable method records its arguments and returns the builder, so a
  // test can assert on the filters the query was actually built with.
  for (const method of ['select', 'neq', 'not', 'gte', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  // `limit` terminates the chain and resolves.
  builder.limit = (...args: unknown[]) => {
    calls.push({ method: 'limit', args });
    return Promise.resolve({ data: rowsToReturn, error: errorToReturn });
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return makeBuilder();
    },
  }),
}));

vi.mock('@/lib/admin/sentry-api', () => ({
  fetchSentryIssues: vi.fn(),
}));

vi.mock('@/lib/admin/vercel-api', () => ({
  fetchVercelDeployments: vi.fn(),
}));

import { collectSupabase, collectSentry, collectVercel } from '../sources';
import { RELIABILITY_SELF_EVENT_TITLE } from '../normalize';
import { fetchSentryIssues } from '@/lib/admin/sentry-api';
import { fetchVercelDeployments } from '@/lib/admin/vercel-api';

beforeEach(() => {
  calls.length = 0;
  rowsToReturn = [];
  errorToReturn = null;
  vi.clearAllMocks();
});

describe('collectSupabase — the self-feeding read is closed at the query', () => {
  it('excludes the collector’s own emissions from what it reads', async () => {
    await collectSupabase('2026-08-26T00:00:00.000Z');

    const notFilters = calls.filter((c) => c.method === 'not');
    // Both free-text columns are filtered: a failure surfaces in whichever of
    // title/message the writer happened to use.
    expect(notFilters).toHaveLength(2);
    expect(notFilters.map((c) => c.args[0]).sort()).toEqual(['message', 'title']);
    for (const filter of notFilters) {
      expect(filter.args[1]).toBe('ilike');
      expect(String(filter.args[2])).toContain('reliability-triage');
    }
  });

  it('excludes rca_analysis rows, so an analysis is not an occurrence', async () => {
    await collectSupabase('2026-08-26T00:00:00.000Z');
    const neq = calls.find((c) => c.method === 'neq');
    expect(neq?.args).toEqual(['event_type', 'rca_analysis']);
  });

  it('the EXACT row recordJobRun emits on failure is caught by the filter', async () => {
    // Not an approximation of the self-emission — the real one. When this cron
    // returns >=400, `recordJobRun` calls `logServerEvent` with the title
    // `Cron failed: <jobType>` and source='cron', writing an admin_events row
    // that this collector would read back on its next pass. That is the loop.
    //
    // Asserting against the shared constant (rather than a hand-typed string
    // that merely looks right) is what keeps this a guard: rename the job type
    // and both the filter and this expectation move together.
    expect(RELIABILITY_SELF_EVENT_TITLE).toBe('Cron failed: reliability-triage');

    await collectSupabase('2026-08-26T00:00:00.000Z');
    const titleFilter = calls.find((c) => c.method === 'not' && c.args[0] === 'title');
    const pattern = String(titleFilter?.args[2] ?? '');

    // The ilike pattern must actually match that title, case-insensitively.
    const body = pattern.replace(/^%/, '').replace(/%$/, '');
    expect(RELIABILITY_SELF_EVENT_TITLE.toLowerCase()).toContain(body.toLowerCase());
  });

  it('windows the read to the caller’s start time', async () => {
    await collectSupabase('2026-08-26T05:00:00.000Z');
    const gte = calls.find((c) => c.method === 'gte');
    expect(gte?.args).toEqual(['created_at', '2026-08-26T05:00:00.000Z']);
  });

  it('reports blind — not empty — when the table cannot be read', async () => {
    errorToReturn = { message: 'permission denied' };
    const result = await collectSupabase('2026-08-26T00:00:00.000Z');
    expect(result.status).toBe('blind');
    expect(result.reason).toBe('permission denied');
    expect(result.signals).toEqual([]);
  });

  it('groups rows by the stored fingerprint into one signal with a true count', async () => {
    rowsToReturn = [
      { id: '1', title: 't', message: 'm', severity: 'error', url: '/a', created_at: '2026-08-26T02:00:00.000Z', fingerprint: 'fp1', metadata: null },
      { id: '2', title: 't', message: 'm', severity: 'error', url: '/a', created_at: '2026-08-26T03:00:00.000Z', fingerprint: 'fp1', metadata: null },
      { id: '3', title: 'o', message: 'o', severity: 'warning', url: '/b', created_at: '2026-08-26T04:00:00.000Z', fingerprint: 'fp2', metadata: null },
    ];
    const result = await collectSupabase('2026-08-26T00:00:00.000Z');
    expect(result.signals).toHaveLength(2);
    const first = result.signals.find((s) => s.evidenceRef === 'fp1')!;
    expect(first.count).toBe(2);
    expect(first.firstSeen).toBe('2026-08-26T02:00:00.000Z');
    expect(first.lastSeen).toBe('2026-08-26T03:00:00.000Z');
  });
});

describe('collectSentry — degradation is reported, never swallowed', () => {
  it('reports blind with a reason when the token is missing', async () => {
    vi.mocked(fetchSentryIssues).mockResolvedValue({
      status: 'unconfigured',
      data: null,
      fetchedAt: null,
      error: 'Sentry read API not configured',
    });
    const result = await collectSentry();
    expect(result.status).toBe('blind');
    expect(result.reason).toContain('not configured');
    expect(result.signals).toEqual([]);
  });

  it('reports blind on a fetch error rather than returning an empty list', async () => {
    vi.mocked(fetchSentryIssues).mockResolvedValue({
      status: 'error',
      data: null,
      fetchedAt: null,
      error: 'HTTP 500',
    });
    const result = await collectSentry();
    expect(result.status).toBe('blind');
    expect(result.reason).toBe('HTTP 500');
  });

  it('maps fatal to critical and carries the permalink as evidence', async () => {
    vi.mocked(fetchSentryIssues).mockResolvedValue({
      status: 'ok',
      data: [
        {
          id: '1', shortId: 'S-1', title: 'boom', culprit: '/api/x', level: 'fatal',
          status: 'unresolved', substatus: null, count: 4, userCount: 2,
          firstSeen: '2026-08-26T01:00:00.000Z', lastSeen: '2026-08-26T02:00:00.000Z',
          permalink: 'https://sentry.io/issues/1', stats24h: [],
        },
      ],
      fetchedAt: '2026-08-26T02:00:00.000Z',
    });
    const result = await collectSentry();
    expect(result.status).toBe('ok');
    expect(result.signals[0]!.severity).toBe('critical');
    expect(result.signals[0]!.evidenceRef).toBe('https://sentry.io/issues/1');
    expect(result.signals[0]!.count).toBe(4);
  });
});

describe('collectVercel — build failures only, which Sentry cannot see', () => {
  it('surfaces ERROR deployments and ignores healthy ones', async () => {
    vi.mocked(fetchVercelDeployments).mockResolvedValue({
      status: 'ok',
      data: [
        { uid: 'dep-ok', state: 'READY', createdAt: 1756166400000, target: 'production' },
        { uid: 'dep-bad', state: 'ERROR', createdAt: 1756170000000, target: 'production' },
      ] as never,
      fetchedAt: '2026-08-26T02:00:00.000Z',
    });
    const result = await collectVercel();
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.evidenceRef).toBe('dep-bad');
    expect(result.signals[0]!.errorCode).toBe('vercel_error');
  });

  it('reports blind when no Vercel token is configured', async () => {
    vi.mocked(fetchVercelDeployments).mockResolvedValue({
      status: 'unconfigured',
      data: null,
      fetchedAt: null,
      error: 'Vercel API not configured',
    });
    const result = await collectVercel();
    expect(result.status).toBe('blind');
    expect(result.signals).toEqual([]);
  });
});
