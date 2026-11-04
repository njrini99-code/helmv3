import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';

/** L0 (W-LNS-1): goals read through the service client, so a coach's are held to the rule of `goals_coach_view` in `readPlans`. */

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForPlayer: vi.fn(),
  getThemesForPlayer: vi.fn(),
  getThemesForCoach: vi.fn(),
  getTopInsightsForPlayers: vi.fn(),
}));
const goals = vi.hoisted(() => ({ active: vi.fn(), achieved: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: goals.active, loadRecentlyAchievedGoals: goals.achieved }));

import { readPlans } from '../coachhelm-dive';

const PLAYER = 'player-1';
const TEAM = 'team-1';
const goal = (id: string, over: Partial<Goal>): Goal => ({ id, player_id: PLAYER, team_id: TEAM, creator_role: 'coach', shared_with_coach: false, ...over }) as Goal;

const MINE_PRIVATE = goal('private', { creator_role: 'player', shared_with_coach: false });
const SHARED = goal('shared', { creator_role: 'player', shared_with_coach: true });
const COACH_MADE = goal('coach-made', { creator_role: 'coach' });
const OTHER_TEAM = goal('other-team', { team_id: 'team-2', creator_role: 'coach', shared_with_coach: true });
const ACHIEVED_PRIVATE = goal('achieved-private', { creator_role: 'player', shared_with_coach: false });

const supabase = () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: async () => ({ data: [], error: null }),
  };
  return { from: () => chain } as unknown as Parameters<typeof readPlans>[0];
};

describe('readPlans: whose goals a viewer gets', () => {
  beforeEach(() => {
    goals.active.mockResolvedValue([MINE_PRIVATE, SHARED, COACH_MADE, OTHER_TEAM]);
    goals.achieved.mockResolvedValue([ACHIEVED_PRIVATE]);
  });

  it('a coach never receives a private player goal or a goal on another team', async () => {
    const plans = await readPlans(supabase(), PLAYER, { role: 'coach', teamId: TEAM });
    expect(plans?.goals.map((g) => g.id)).toEqual(['shared', 'coach-made']);
  });

  it('the player keeps all of their own', async () => {
    const plans = await readPlans(supabase(), PLAYER, { role: 'player' });
    expect(plans?.goals.map((g) => g.id)).toEqual(['private', 'shared', 'coach-made', 'other-team', 'achieved-private']);
  });
});
