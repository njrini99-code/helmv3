// =============================================================================
// Regression test: loadLiftSummary (Staff Decision Room lift-compliance card)
// must read from the unified helm_lifting_sessions table, not the legacy
// baseball_lift_sessions table — which holds 0 rows for real activity since
// createLiftAssignment / publishLiftDay / logLiftResult write ONLY to
// helm_lifting_* now (the W2-G rewire).
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

import { loadLiftSummary } from '@/lib/baseball/read-models/decision-room/lift';

const TEAM_ID = 'team-1';
const ORG_ID = 'org-1';
const PLAYER_ID = 'player-1';
const PLAYER_2_ID = 'player-2';
const ATHLETE_ID = 'athlete-1';
const ATHLETE_2_ID = 'athlete-2';

function recentYmd(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function baseTables() {
  return {
    baseball_teams: [{ id: TEAM_ID, organization_id: ORG_ID }],
    helm_lifting_athletes: [
      { id: ATHLETE_ID, organization_id: ORG_ID, sport: 'baseball', sport_player_id: PLAYER_ID, team_id: TEAM_ID },
      { id: ATHLETE_2_ID, organization_id: ORG_ID, sport: 'baseball', sport_player_id: PLAYER_2_ID, team_id: TEAM_ID },
    ],
    // Legacy table seeded ON PURPOSE with rows inside the window — proves the
    // summary no longer reads it.
    baseball_lift_sessions: [
      { id: 'legacy-1', team_id: TEAM_ID, player_id: PLAYER_ID, scheduled_date: recentYmd(1), status: 'missed', completed_at: null },
    ],
    helm_lifting_sessions: [] as Array<Record<string, unknown>>,
  };
}

describe('loadLiftSummary — reads helm_lifting_sessions (unified), not legacy baseball_lift_sessions', () => {
  it('returns an honest empty summary when the team has no Helm Lifting organization', async () => {
    const tables = baseTables();
    tables.baseball_teams = [{ id: TEAM_ID, organization_id: null as unknown as string }];
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const summary = await loadLiftSummary(fake as unknown as never, TEAM_ID);

    expect(summary.scheduledCount).toBe(0);
    expect(summary.completedCount).toBe(0);
    expect(summary.nonCompliantPlayers).toEqual([]);
  });

  it('ignores rows seeded ONLY in the legacy baseball_lift_sessions table', async () => {
    const tables = baseTables(); // legacy has a missed session; helm is empty
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const summary = await loadLiftSummary(fake as unknown as never, TEAM_ID);

    expect(summary.scheduledCount).toBe(0);
    expect(summary.completedCount).toBe(0);
    expect(summary.nonCompliantPlayers).toEqual([]);
  });

  it('computes compliance + non-compliant players from real helm_lifting_sessions rows', async () => {
    const tables = baseTables();
    tables.helm_lifting_sessions = [
      { id: 'helm-1', organization_id: ORG_ID, athlete_id: ATHLETE_ID, scheduled_date: recentYmd(1), status: 'completed', completed_at: recentYmd(1) },
      { id: 'helm-2', organization_id: ORG_ID, athlete_id: ATHLETE_2_ID, scheduled_date: recentYmd(2), status: 'missed', completed_at: null },
      { id: 'helm-3', organization_id: ORG_ID, athlete_id: ATHLETE_2_ID, scheduled_date: recentYmd(3), status: 'missed', completed_at: null },
    ];
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const summary = await loadLiftSummary(fake as unknown as never, TEAM_ID);

    expect(summary.scheduledCount).toBe(3);
    expect(summary.completedCount).toBe(1);
    expect(summary.nonCompliantPlayers).toEqual([
      { playerId: PLAYER_2_ID, playerName: null, missedCount: 2 },
    ]);
  });
});
