import { describe, expect, it, vi } from 'vitest';

/*
 * Launch readiness 2026-11-15, DF-P-06: the Board's penalty strip read `golf_rounds.total_penalties` over the last 8 rounds of any
 * length, so a nine sat beside eighteens and a round posted as a total showed a zero nobody recorded. It now reads the one figures
 * helper's rounds (eighteen holes, practice and test out, countable), only those with their holes, and each round's penalty strokes
 * from its stats row, as My stats and Ask do.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));

import { loadFilePenalties } from '../coachhelm-file';

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const base = { player_id: 'p1', status: 'completed', is_test: false, course_name: 'Pines', tees_played: 'White', round_type: 'tournament', holes_played: 18, total_score: 75, score_to_par: 3, front_nine: 37, back_nine: 38, total_putts: 31, total_penalties: 0 };

const ROUNDS = [
  { ...base, id: 'nine', round_date: day(2), holes_played: 9, total_score: 38, score_to_par: 2, front_nine: 38, back_nine: null, total_putts: 15 },
  { ...base, id: 'total', round_date: day(3), front_nine: null, back_nine: null, total_putts: null },
  { ...base, id: 'practice', round_date: day(4), round_type: 'practice' },
  ...Array.from({ length: 9 }, (_, i) => ({ ...base, id: `r${i + 1}`, round_date: day(5 + i) })),
];
// Each 18's penalty strokes is its number; r5 has no stats row, so the strip reaches past it. The nine's row must never show.
const CACHE = [
  ...Array.from({ length: 9 }, (_, i) => ({ round_id: `r${i + 1}`, penalty_strokes: i + 1 })).filter((r) => r.round_id !== 'r5'),
  { round_id: 'nine', penalty_strokes: 5 },
  { round_id: 'practice', penalty_strokes: 6 },
];

function sb() {
  return {
    from(table: string) {
      const rows = table === 'golf_rounds' ? ROUNDS : table === 'golf_round_stats_cache' ? CACHE : [];
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'not', 'gte', 'order', 'range', 'limit']) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
      return chain;
    },
  } as never;
}

describe('Board penalties read the figures helper’s rounds and the stats rows (DF-P-06)', () => {
  it('the last 8 eighteen-hole rounds with their holes, oldest first, from each round’s stats row', async () => {
    const strip = await loadFilePenalties(sb(), 'p1', 'America/New_York');
    expect(strip?.map((s) => s.value)).toEqual([9, 8, 7, 6, 4, 3, 2, 1]);
    expect(strip).toHaveLength(8);
  });
});
