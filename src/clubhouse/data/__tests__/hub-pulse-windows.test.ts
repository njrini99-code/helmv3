import { describe, expect, it, vi } from 'vitest';

/** Audit A13: the Hub pulse reads exactly 30 days of rounds and counts a player active over exactly 14, today included. */

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));

import { createClient } from '@/lib/supabase/server';
import { rosterPulse } from '../hub';

const round = (id: string, player: string, date: string) => ({
  id,
  player_id: player,
  round_date: date,
  total_score: 75,
  score_to_par: 3,
  front_nine: 38,
  back_nine: 37,
  holes_played: 18,
  status: 'completed',
  // A scoring round: practice rounds are not counted (DF-C-03, below).
  round_type: 'tournament',
});

describe('Hub pulse windows', () => {
  it('A13 asks for rounds from 29 days before today (30 days with today) and calls a round 13 days back, not 14, "in the last 14"', async () => {
    const reads: Array<Array<[string, unknown[]]>> = [];
    tables.current = {
      golf_rounds: (filters) => {
        reads.push(filters);
        return { data: [round('a', 'pa', '2026-10-18'), round('b', 'pb', '2026-10-17'), round('c', 'pc', '2026-10-30')] };
      },
    };
    const supabase = await createClient();
    // Today is 31 October: 13 days back is the 18th (inside 14 days), 14 days back is the 17th (outside).
    const pulse = await rosterPulse(supabase, new Map([['pa', 'Ana'], ['pb', 'Ben'], ['pc', 'Cy']]), '2026-10-31');
    expect(reads.flat()).toContainEqual(['gte', ['round_date', '2026-10-02']]);
    expect(pulse).toMatchObject({ active14: 2, players: 3 });
    expect(pulse!.byPlayer!.find((p) => p.id === 'pa')!.recent).toBe(true);
    expect(pulse!.byPlayer!.find((p) => p.id === 'pb')!.recent).toBe(false);
  });

  it('DF-C-03: counts the rounds Home and Roster count, scoring rounds of either length, never practice', async () => {
    tables.current = {
      golf_rounds: {
        data: [
          round('a', 'pa', '2026-10-30'),
          { ...round('n', 'pa', '2026-10-29'), holes_played: 9, back_nine: null, total_score: 38, score_to_par: 2 },
          { ...round('p', 'pb', '2026-10-30'), round_type: 'practice' },
          { ...round('u', 'pb', '2026-10-28'), round_type: null },
        ],
      },
    };
    const supabase = await createClient();
    const pulse = await rosterPulse(supabase, new Map([['pa', 'Ana'], ['pb', 'Ben'], ['pc', 'Cy']]), '2026-10-31');
    // Ana's eighteen and nine; Ben's round with no type (a scoring round); not Ben's practice round.
    expect(pulse).toMatchObject({ rounds30: 3, active14: 2, players: 3 });
    expect(pulse!.byPlayer!.map((p) => [p.id, p.rounds])).toEqual([['pa', 2], ['pb', 1], ['pc', 0]]);
  });
});
