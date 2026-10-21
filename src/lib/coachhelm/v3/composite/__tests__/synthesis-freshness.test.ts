/**
 * Slice 0b through `synthesizeForPlayer`: a composite is stamped with the
 * rounds it read (flag-independent, bounds untouched with the flag off), and
 * with `coachhelm_reads_v1_copy` on a composite under its family floor is not
 * written and the stale sweep archives the old row. Synthetic rounds only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

const upsertInsightV3 = vi.fn();
const flagMock = vi.fn(() => false);
let archivedIds: string[] = [];
let selectRows: Array<Record<string, unknown>> = [];

const ROUND_IDS = ['r1', 'r2', 'r3', 'r4', 'r5'];
const rounds = createFakeSupabase({
  tables: {
    golf_rounds: ROUND_IDS.map((id, i) => ({
      id,
      player_id: 'player-1',
      status: 'completed',
      is_test: false,
      round_date: `2026-10-0${i + 1}`,
      created_at: `2026-10-0${i + 1}T18:00:00Z`,
      holes_played: 18,
      total_score: 78,
      front_nine: 39,
      back_nine: 39,
      total_putts: 32,
    })),
  },
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_rounds') return rounds.from('golf_rounds');
      const chain = {
        select: () => chain,
        eq: () => chain,
        like: () => chain,
        in: () => chain,
        is: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: selectRows, error: null }).then(resolve),
      };
      return {
        select: () => chain,
        update: () => ({
          eq: (col: string, val: string) => {
            if (col === 'id') archivedIds.push(val);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        }),
      };
    },
  }),
}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flagMock() }));
vi.mock('@/lib/coachhelm/v3/insights/upsert-v3', () => ({
  upsertInsightV3: (...args: unknown[]) => upsertInsightV3(...args),
  GATED_OUT: Symbol.for('GATED_OUT'),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/coachhelm/v3/composite/loader', () => ({
  loadRecentInsightsForPlayer: () => Promise.resolve([]),
}));
// Five rounds where holes 13-18 play a stroke worse: closing_hole_fatigue fires.
vi.mock('@/lib/coachhelm/v3/composite/hole-sequence-loader', () => ({
  loadCompositeContext: () =>
    Promise.resolve({
      hole_scores: ROUND_IDS.flatMap((rid) =>
        Array.from({ length: 18 }, (_, i) => ({
          round_id: rid,
          hole_number: i + 1,
          par: 4,
          score: i + 1 >= 13 ? 5 : 4,
        })),
      ),
      short_game_shots: [],
      flyer_lie_shots: [],
    }),
}));

import { synthesizeForPlayer } from '../synthesis';
import { __resetRoundIndexMemo } from '@/lib/coachhelm/v3/engine/read-window';

const STALE = { id: 'old-closing', signature: 'v3:composite:closing_hole_fatigue:old', metadata: null, lifecycle_state: 'detected' };

beforeEach(() => {
  vi.clearAllMocks();
  __resetRoundIndexMemo();
  archivedIds = [];
  selectRows = [STALE];
  upsertInsightV3.mockResolvedValue('row-1');
});

describe('synthesizeForPlayer — Slice 0b', () => {
  it('flag off: writes the composite stamped with its rounds and unit, bounds as composed', async () => {
    flagMock.mockReturnValue(false);
    const result = await synthesizeForPlayer('player-1');
    expect(result.below_floor ?? 0).toBe(0);
    const input = upsertInsightV3.mock.calls
      .map((c) => c[1] as { signature: string; evidence: Record<string, unknown> })
      .find((i) => i.signature.includes('closing_hole_fatigue'));
    expect(input?.evidence).toMatchObject({
      newest_round_id: 'r5',
      scanned_through_round_id: 'r5',
      rounds_n: 5,
      sample_unit: 'rounds',
      window_end: '',
    });
  });

  it('flag on: a composite under its floor (12 rounds) is not written and the old row is archived', async () => {
    flagMock.mockReturnValue(true);
    const result = await synthesizeForPlayer('player-1');
    expect(result.below_floor).toBeGreaterThanOrEqual(1);
    const wrote = upsertInsightV3.mock.calls.some((c) =>
      String((c[1] as { signature: string }).signature).includes('closing_hole_fatigue'),
    );
    expect(wrote).toBe(false);
    expect(archivedIds).toContain('old-closing');
  });
});
