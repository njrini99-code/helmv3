import { describe, expect, it, vi } from 'vitest';

const flagMock = vi.fn(() => false);
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flagMock() }));

import {
  applyWindowStamp,
  stampAndCheckRead,
  stampFromIds,
  stampFromRange,
  stampFromRounds,
  __resetRoundIndexMemo,
  type WindowRoundRow,
} from '../read-window';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

/** A countable 18-hole round (synthetic). */
function round(id: string, date: string, extra: Partial<WindowRoundRow> = {}): WindowRoundRow {
  return {
    id,
    round_date: date,
    created_at: `${date}T18:00:00Z`,
    is_test: false,
    holes_played: 18,
    total_score: 76,
    front_nine: 38,
    back_nine: 38,
    total_putts: 31,
    ...extra,
  };
}

function evidence(over: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'm',
    metric_label: 'M',
    unit: 'percent',
    your_value: 50,
    your_value_display: '50%',
    comparison_value: 60,
    comparison_label: 'Team',
    comparison_source: 'team_avg',
    sample_n: 30,
    window_days: 90,
    window_start: '',
    window_end: '',
    strokes_impact: 0,
    strokes_impact_method: 'peer_delta',
    confidence: 0,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
    ...over,
  };
}

const INDEX: WindowRoundRow[] = [
  round('r1', '2026-09-01'),
  round('r2', '2026-09-10'),
  round('r3', '2026-09-20'),
  // Same day as r3, entered later: the newer of the two.
  round('r4', '2026-09-20', { created_at: '2026-09-21T09:00:00Z' }),
  // Not countable: 18 declared, back nine missing.
  round('r5', '2026-10-01', { back_nine: null }),
];

describe('stampFromRounds', () => {
  it('returns null for no rounds', () => {
    expect(stampFromRounds([], 'ids')).toBeNull();
  });

  it('takes the oldest and newest day, the newest round by date then entry time, and counts countable rounds', () => {
    const s = stampFromRounds(INDEX.slice(0, 4), 'ids');
    expect(s).toMatchObject({
      window_start: '2026-09-01',
      window_end: '2026-09-20',
      newest_round_id: 'r4',
      rounds_n: 4,
      round_ids: ['r4', 'r3', 'r2', 'r1'],
    });
  });

  it('keeps a non-countable round in the window but not in rounds_n', () => {
    const s = stampFromRounds(INDEX, 'ids');
    expect(s?.newest_round_id).toBe('r5');
    expect(s?.window_end).toBe('2026-10-01');
    expect(s?.rounds_n).toBe(4);
  });

  it('drops test rounds', () => {
    const s = stampFromRounds([round('t', '2026-10-05', { is_test: true }), round('r', '2026-10-01')], 'ids');
    expect(s?.newest_round_id).toBe('r');
  });
});

describe('stampFromIds / stampFromRange', () => {
  it('stamps exactly the named rounds', () => {
    const s = stampFromIds(INDEX, ['r2', 'r3', 'missing']);
    expect(s).toMatchObject({ window_start: '2026-09-10', window_end: '2026-09-20', newest_round_id: 'r3', rounds_n: 2, basis: 'ids' });
  });

  it('a lifetime read with only a newest day takes every round up to it', () => {
    const s = stampFromRange(INDEX, evidence({ window_end: '2026-09-20' }));
    expect(s).toMatchObject({ window_start: '2026-09-01', window_end: '2026-09-20', newest_round_id: 'r4', rounds_n: 4, basis: 'range' });
  });

  it('an empty window means the last window_days', () => {
    const now = Date.parse('2026-10-05T00:00:00Z');
    const s = stampFromRange(INDEX, evidence({ window_days: 20 }), now);
    expect(s?.round_ids).toEqual(['r5', 'r4', 'r3']);
  });

  it('honours both composed bounds', () => {
    const s = stampFromRange(INDEX, evidence({ window_start: '2026-09-05', window_end: '2026-09-15T00:00:00Z' }));
    expect(s?.round_ids).toEqual(['r2']);
  });
});

describe('applyWindowStamp', () => {
  it('an id stamp replaces the composed window and sets the freshness fields', () => {
    const out = applyWindowStamp(
      evidence({ window_end: '2026-10-19' }),
      stampFromIds(INDEX, ['r1', 'r2']),
      'putts',
    );
    expect(out).toMatchObject({
      window_start: '2026-09-01',
      window_end: '2026-09-10',
      newest_round_id: 'r2',
      rounds_n: 2,
      sample_unit: 'putts',
      source_round_ids: ['r2', 'r1'],
    });
  });

  it('a range stamp only fills empty bounds', () => {
    const out = applyWindowStamp(
      evidence({ window_start: '2026-08-01', window_end: '2026-09-20' }),
      stampFromRange(INDEX, evidence({ window_end: '2026-09-20' })),
      null,
    );
    expect(out.window_start).toBe('2026-08-01');
    expect(out.window_end).toBe('2026-09-20');
    expect(out.newest_round_id).toBe('r4');
    expect(out.sample_unit).toBeUndefined();
  });

  it('never overwrites a sample unit the composer chose, and a null stamp changes only the unit', () => {
    const out = applyWindowStamp(evidence({ sample_unit: 'holes' }), null, 'rounds');
    expect(out.sample_unit).toBe('holes');
    expect(out.window_end).toBe('');
    expect(out.newest_round_id).toBeUndefined();
  });
});

describe('stampAndCheckRead', () => {
  function client() {
    return createFakeSupabase({
      tables: {
        golf_rounds: [
          { ...round('a', '2026-10-01'), player_id: 'p1', status: 'completed' },
          { ...round('b', '2026-10-08'), player_id: 'p1', status: 'completed' },
          { ...round('x', '2026-10-09'), player_id: 'p2', status: 'completed' },
        ],
      },
    }) as unknown as SupabaseClient;
  }

  it('stamps the window and never holds a read back while the flag is off', async () => {
    __resetRoundIndexMemo();
    flagMock.mockReturnValue(false);
    const { evidence: out, shortfall } = await stampAndCheckRead(
      client(), 'p1', 'approach_miss', evidence({ sample_n: 9 }), ['a', 'b'],
    );
    expect(shortfall).toBeNull();
    expect(out).toMatchObject({ window_start: '2026-10-01', window_end: '2026-10-08', newest_round_id: 'b', rounds_n: 2, sample_unit: 'approaches' });
  });

  it('holds a thin read back with a count-down when the flag is on', async () => {
    __resetRoundIndexMemo();
    flagMock.mockReturnValue(true);
    const { shortfall } = await stampAndCheckRead(
      client(), 'p1', 'approach_miss', evidence({ sample_n: 9 }), ['a', 'b'],
    );
    expect(shortfall).toEqual({
      family: 'approach_miss',
      needs: [
        { unit: 'rounds', have_n: 2, need_n: 4 },
        { unit: 'approaches', have_n: 9, need_n: 20 },
      ],
    });
    flagMock.mockReturnValue(false);
  });

  it('is failure-silent when the rounds cannot be read', async () => {
    __resetRoundIndexMemo();
    const broken = { from: () => { throw new Error('down'); } } as unknown as SupabaseClient;
    const { evidence: out } = await stampAndCheckRead(broken, 'p1', 'putt_distance', evidence(), null);
    expect(out.window_end).toBe('');
    expect(out.sample_unit).toBe('putts');
  });
});
