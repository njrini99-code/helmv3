import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TeamsEkgLens, TeamsEkgRow } from '@/lib/admin/lenses/teams-ekg';

/** activity-threads.ts issues ZERO new admin_events queries — it reuses
 *  fetchTeamsEkgLens()'s already-fetched buckets entirely, so this test
 *  mocks that one function directly rather than the Supabase client. */
let ekgResult: TeamsEkgLens;
vi.mock('@/lib/admin/lenses/teams-ekg', () => ({
  fetchTeamsEkgLens: async () => ekgResult,
}));

import { fetchSemanticActivityThreads } from '../activity-threads';

function row(overrides: Partial<TeamsEkgRow> = {}): TeamsEkgRow {
  return {
    teamId: 't1',
    name: 'Rini University',
    sport: 'golf',
    playerCount: 12,
    buckets: [
      { date: '2026-09-01', activity: 2, errors: 0, critical: false },
      { date: '2026-09-02', activity: 3, errors: 1, critical: false },
    ],
    lastActivityDate: '2026-09-02',
    daysSinceActivity: 1,
    halo: 'fresh',
    activity30d: 10,
    errors30d: 2,
    criticalErrors30d: 0,
    attentionScore: 5,
    href: '/admin/golf',
    threadHref: '/admin/thread/team/t1',
    releaseImpact: 0,
    unresolvedIncidents: 0,
    ...overrides,
  };
}

describe('fetchSemanticActivityThreads', () => {
  beforeEach(() => {
    ekgResult = { teams: [], windowDays: 30, sort: 'most-active', liveReleaseSha: null, liveReleaseSinceIso: null, generatedAt: '2026-09-03T00:00:00Z', degradedNote: null };
  });

  it('an empty team roster produces zero threads, never a fabricated one', async () => {
    const lens = await fetchSemanticActivityThreads();
    expect(lens.threads).toEqual([]);
  });

  it('builds an honest sentence from real 48h activity/error buckets, never invented counts', async () => {
    ekgResult = { ...ekgResult, teams: [row()] };

    const lens = await fetchSemanticActivityThreads();

    expect(lens.threads).toHaveLength(1);
    expect(lens.threads[0]!.sentence).toContain('5 events');
    expect(lens.threads[0]!.sentence).toContain('1 error');
    expect(lens.threads[0]!.severity).toBe('warning');
  });

  it('a critical team always ranks above a merely noisy one, regardless of raw volume', async () => {
    const noisy = row({
      teamId: 'noisy',
      name: 'Noisy U',
      buckets: [
        { date: '2026-09-01', activity: 50, errors: 5, critical: false },
        { date: '2026-09-02', activity: 50, errors: 5, critical: false },
      ],
    });
    const critical = row({
      teamId: 'critical',
      name: 'Critical U',
      buckets: [
        { date: '2026-09-01', activity: 1, errors: 1, critical: true },
        { date: '2026-09-02', activity: 0, errors: 0, critical: false },
      ],
    });
    ekgResult = { ...ekgResult, teams: [noisy, critical] };

    const lens = await fetchSemanticActivityThreads();

    expect(lens.threads[0]!.teamId).toBe('critical');
    expect(lens.threads[0]!.severity).toBe('critical');
  });

  it('a blind source (degraded EKG) is passed through, not silently dropped', async () => {
    ekgResult = { ...ekgResult, teams: [row()], degradedNote: 'unresolved-incident read failed: timeout' };

    const lens = await fetchSemanticActivityThreads();

    expect(lens.degradedNote).toBe('unresolved-incident read failed: timeout');
  });
});
