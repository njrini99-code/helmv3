/**
 * The producer half of TEAM_GRADE_READ_FAILURE_READS_AS_HEALTHY.
 *
 * `computeTeamGrade` now returns UNKNOWN for a null count — but only if the
 * producer actually SENDS null. Reverting that line to `: 0` typechecks
 * cleanly (`number` is assignable to `number | null`), so nothing but a
 * behavioural test stops the defect being reintroduced silently. Discovered by
 * an injection that compiled without complaint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let errorCountsBehaviour: 'ok' | 'reject' = 'ok';

vi.mock('@/lib/admin/data/team-scope', () => ({
  resolveTeamErrorCounts: vi.fn(async () => {
    if (errorCountsBehaviour === 'reject') throw new Error('connection reset by peer');
    return new Map([['team-1', 4]]);
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const empty = { data: [], error: null, count: 0 };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'not', 'order', 'limit']) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: null, error: null });
    chain.then = (r: (v: unknown) => unknown) => Promise.resolve(empty).then(r);
    return { from: () => chain };
  },
}));

import { fetchTeamPageExtras } from '@/lib/admin/data/team-page-extras';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a rejected error-count read surfaces as null, never as zero', () => {
  const input = { teamId: 'team-1', organizationId: null, coachIds: [] };

  it('a healthy read returns the real count', () => {
    errorCountsBehaviour = 'ok';
    return fetchTeamPageExtras(input).then((x) => expect(x.errors7d).toBe(4));
  });

  it('a REJECTED read returns null — the value that grades UNKNOWN', async () => {
    errorCountsBehaviour = 'reject';
    const extras = await fetchTeamPageExtras(input);
    expect(extras.errors7d, 'a failed read must not resolve to 0 — 0 grades the team A').toBeNull();
  });

  it('the two outcomes are distinguishable', async () => {
    errorCountsBehaviour = 'ok';
    const good = (await fetchTeamPageExtras(input)).errors7d;
    errorCountsBehaviour = 'reject';
    const bad = (await fetchTeamPageExtras(input)).errors7d;
    expect(bad).not.toBe(good);
    expect(bad).not.toBe(0);
  });
});
