import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PMAC-12 (production audit 2026-11-15): Practice took 825 ms to its first byte. The coach's loader read the team row,
 * then the plans, then the practices in the window with the roster, though all of them need only the team id; the
 * player's read the team row before the live versions. They now start together: here they are asked for while the team
 * row has not answered, and the page still comes out as before once it does.
 */
vi.mock('server-only', () => ({}));
vi.mock('@/lib/coachhelm/v3/chat/context', () => ({ resolveCoachChatContext: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/practice-reads', () => ({ getTeamStrokesGained: vi.fn() }));
vi.mock('../team-sg', () => ({ loadTeamStrokesGained: vi.fn() }));
vi.mock('../practice-plan', () => ({ editedAfterPublish: () => false, loadPlayerPractice: vi.fn() }));
vi.mock('@/lib/golf/player-profiles', () => ({
  readGolfPlayerProfiles: async () => ({ data: [], error: null }),
  profilesById: () => new Map(),
}));

const reads = vi.hoisted(() => [] as string[]);
const gate = vi.hoisted(() => ({ release: () => {} }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      reads.push(table);
      const answer = { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'gte', 'lte', 'gt', 'order', 'limit']) chain[m] = () => chain;
      // The team row is the first wave's read: held until the test lets it answer.
      chain.maybeSingle = () =>
        table === 'golf_teams'
          ? new Promise((resolve) => (gate.release = () => resolve({ data: { name: 'Team', timezone: 'America/New_York', organization_id: 'org1' }, error: null })))
          : Promise.resolve({ data: null, error: null });
      chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer).then(ok, bad);
      return chain;
    },
  }),
}));

import { loadCoachPracticeHome, loadPlayerPracticeHome } from '../practice-home';

beforeEach(() => {
  reads.length = 0;
});

describe('Practice reads in one wave (PMAC-12)', () => {
  it('a coach’s plans, practices and roster start before the team row has answered', async () => {
    const page = loadCoachPracticeHome('t1', new Date('2026-11-15T12:00:00Z'));
    await vi.waitFor(() => expect(reads).toEqual(expect.arrayContaining(['golf_teams', 'golf_practice_plans', 'golf_events', 'golf_team_members'])), { timeout: 500 });
    gate.release();
    const data = await page;
    expect(data.status).toBe('ready');
  });

  it('a player’s live versions start before the team row has answered', async () => {
    const page = loadPlayerPracticeHome('t1', 'p1', new Date('2026-11-15T12:00:00Z'));
    await vi.waitFor(() => expect(reads).toEqual(expect.arrayContaining(['golf_teams', 'golf_practice_plan_versions'])), { timeout: 500 });
    gate.release();
    const data = await page;
    expect(data.status).toBe('ready');
  });
});
