import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import type { CoachChatContext } from '../context';

// get_player_trend averaged whatever the last N rounds were, so a 9-hole 38 pulled "average score to par" toward half
// a round. It reads full 18-hole rounds only now, and says how many newer ones it left out.
vi.mock('@/lib/coachhelm/v3/ranking/score', () => ({ loadCoachWeightsForPlayer: vi.fn(async () => ({})) }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: vi.fn(async () => []) }));

import { getPlayerTrend } from '../read-tools';

const ctx = {
  team_id: 't1',
  team_name: 'Demo',
  timezone: 'America/New_York',
  roster: [{ id: 'p1', name: 'Avery' }],
} as unknown as CoachChatContext;

const round = (id: string, date: string, over: Record<string, unknown> = {}) => ({
  id,
  player_id: 'p1',
  is_test: false,
  status: 'completed',
  round_date: date,
  course_name: 'Oak',
  round_type: 'practice',
  holes_played: 18,
  total_score: 74,
  score_to_par: 2,
  front_nine: 37,
  back_nine: 37,
  total_putts: 30,
  ...over,
});

describe('get_player_trend', () => {
  it('averages full 18-hole rounds only and names the newer rounds it left out', async () => {
    const sb = createFakeSupabase({
      tables: {
        golf_rounds: [
          round('a', '2026-10-01', { score_to_par: 4, total_score: 76, back_nine: 39 }),
          round('nine', '2026-10-05', { holes_played: 9, total_score: 38, score_to_par: 2, back_nine: null, front_nine: 38, total_putts: 15 }),
          round('b', '2026-10-08', { score_to_par: 0, total_score: 72, back_nine: 35 }),
        ],
      },
    });
    const env = await getPlayerTrend(sb as never, ctx, { player_id: 'p1', metric_id: 'score_to_par', last_n: 5 });
    expect(env.series[0]!.points.map((p) => p.value)).toEqual([4, 0]);
    expect(env.measurements[0]!.value).toBe(2);
    expect(env.coverage_note).toMatch(/1 newer round was 9 holes or incomplete/);
    expect(env.summary).toMatch(/full 18-hole rounds/);
  });
});
