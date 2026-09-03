import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueMockAdminClient, type MockResult } from './test-helpers';
import type { PulseGridResult } from '@/lib/admin/data/pulse-grid';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import type { ReleaseLedgerData } from '@/lib/admin/data/release-ledger';

/**
 * teams-ekg.ts WRAPS fetchPulseGrid()/fetchReleaseLedger() rather than
 * re-querying admin_events for activity/error buckets — so this test mocks
 * those two modules directly (their own internal query shapes are covered
 * by their own callers/usage in production, not re-verified here) and only
 * fakes the two admin_events queries teams-ekg.ts issues itself.
 */
const perTable: Record<string, Array<() => MockResult>> = {};
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => queueMockAdminClient(perTable),
}));

let pulseResult: PulseGridResult;
vi.mock('@/lib/admin/data/pulse-grid', () => ({
  fetchPulseGrid: async () => pulseResult,
}));

let releaseResult: AdminFetchResult<ReleaseLedgerData>;
vi.mock('@/lib/admin/data/release-ledger', () => ({
  fetchReleaseLedger: async () => releaseResult,
}));

import { fetchTeamsEkgLens } from '../teams-ekg';

function team(overrides: Partial<PulseGridResult['teams'][number]> = {}): PulseGridResult['teams'][number] {
  return {
    teamId: 't1',
    name: 'Rini University',
    sport: 'golf',
    playerCount: 12,
    buckets: [],
    lastActivityDate: '2026-09-02',
    daysSinceActivity: 1,
    halo: 'fresh',
    activity30d: 10,
    errors30d: 2,
    criticalErrors30d: 0,
    attentionScore: 5,
    href: '/admin/golf',
    threadHref: '/admin/thread/team/t1',
    ...overrides,
  };
}

describe('fetchTeamsEkgLens', () => {
  beforeEach(() => {
    for (const k of Object.keys(perTable)) delete perTable[k];
    pulseResult = { teams: [], windowDays: 30, sort: 'attention', degradedNote: '', generatedAt: '2026-09-03T00:00:00Z' };
    releaseResult = { status: 'unconfigured', data: null, fetchedAt: null, error: 'Vercel not configured' };
  });

  it('an empty team roster reports an empty grid, not a fabricated row', async () => {
    perTable['admin_events'] = [() => ({ data: [], error: null })]; // unresolved query only (no live release)

    const lens = await fetchTeamsEkgLens();

    expect(lens.teams).toEqual([]);
    expect(lens.liveReleaseSinceIso).toBeNull();
  });

  it('release impact stays null when no live release can be identified — never coerced to 0', async () => {
    pulseResult = { ...pulseResult, teams: [team()] };
    perTable['admin_events'] = [() => ({ data: [], error: null })]; // unresolved

    const lens = await fetchTeamsEkgLens();

    expect(lens.teams[0]!.releaseImpact).toBeNull();
    expect(lens.teams[0]!.unresolvedIncidents).toBe(0);
  });

  it('computes release impact and unresolved counts per team once a live release exists', async () => {
    pulseResult = { ...pulseResult, teams: [team({ teamId: 't1' }), team({ teamId: 't2', name: 'Demo University' })] };
    releaseResult = {
      status: 'ok',
      data: {
        trend: [],
        cards: [
          {
            uid: 'r1',
            commitSha: 'abc123',
            commitMessage: null,
            commitRef: null,
            commitAuthor: null,
            createdAt: Date.parse('2026-09-01T00:00:00Z'),
            isLive: true,
            gatheringSignal: false,
            errorsBefore2h: 0,
            errorsAfter2h: 0,
            delta: 0,
            verdict: { tone: 'success', label: 'Clean' },
            resolvedAndQuietSince: 0,
            newFingerprintsSince: 0,
            topFeatureDeltas: [],
            newFingerprintSamples: [],
          },
        ],
        currentBuildSha: 'abc123',
        deploySource: 'vercel',
      },
      fetchedAt: '2026-09-03T00:00:00Z',
    };
    perTable['admin_events'] = [
      () => ({ data: [{ team_id: 't1' }, { team_id: 't1' }, { team_id: 't2' }], error: null }), // release impact
      () => ({ data: [{ team_id: 't1' }], error: null }), // unresolved
    ];

    const lens = await fetchTeamsEkgLens();

    const t1 = lens.teams.find((t) => t.teamId === 't1')!;
    const t2 = lens.teams.find((t) => t.teamId === 't2')!;
    expect(t1.releaseImpact).toBe(2);
    expect(t1.unresolvedIncidents).toBe(1);
    expect(t2.releaseImpact).toBe(1);
    expect(t2.unresolvedIncidents).toBe(0);
    expect(lens.liveReleaseSha).toBe('abc123');
  });

  it('blind source: a failed unresolved-incident read is disclosed and every team gets a null, not a fabricated zero', async () => {
    pulseResult = { ...pulseResult, teams: [team()] };
    perTable['admin_events'] = [() => ({ error: { message: 'timeout' } })];

    const lens = await fetchTeamsEkgLens();

    expect(lens.teams[0]!.unresolvedIncidents).toBeNull();
    expect(lens.degradedNote).toContain('unresolved-incident read failed');
  });

  it('paginates the unresolved-incident read past the PostgREST 1000-row cap — a team whose only row lands past page 1 is not fabricated to 0', async () => {
    pulseResult = { ...pulseResult, teams: [team({ teamId: 't1' }), team({ teamId: 'late-team', name: 'Late University' })] };
    const page1 = Array.from({ length: 1000 }, () => ({ team_id: 't1' }));
    const page2 = [{ team_id: 'late-team' }];
    // No live release configured (unconfigured), so only the unresolved
    // query's `.from('admin_events')` calls fire — two pages of it.
    perTable['admin_events'] = [() => ({ data: page1, error: null }), () => ({ data: page2, error: null })];

    const lens = await fetchTeamsEkgLens();

    const late = lens.teams.find((t) => t.teamId === 'late-team')!;
    expect(late.unresolvedIncidents).toBe(1); // NOT 0 — a single-page read would have silently dropped this team's only row
    const t1 = lens.teams.find((t) => t.teamId === 't1')!;
    expect(t1.unresolvedIncidents).toBe(1000);
  });
});
