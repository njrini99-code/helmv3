import { describe, expect, it } from 'vitest';
import type { RawHoleRow, RawShotRow } from './approach-context';
import {
  MEASURED_MIN_EVENTS,
  OTHER_KEY,
  groupMeasured,
  measureWhat,
  measuredId,
  nodeIdForKey,
  puttKey,
  subKeyForMetric,
  teamMeasuredKeys,
  type MeasuredKeyValue,
} from './measured-what';
import { buildRootMap, measuredAreaNote } from './build-player-root-map';
import { findBranch, whyIdOf, type RootArea } from './build-root-map';
import { buildTeamRoots } from './build-team-roots';
import type { RankableEvidenceInsight } from '@/app/golf/actions/insight-delivery-ranking';

let seq = 0;
function shot(over: Partial<RawShotRow>): RawShotRow {
  seq += 1;
  return {
    id: `s${seq}`,
    round_id: 'r1',
    hole_id: 'h1',
    hole_number: 1,
    shot_number: 1,
    shot_type: 'tee',
    club_type: 'driver',
    lie_before: 'tee',
    lie_after: null,
    result: null,
    distance_to_hole_before: 400,
    distance_unit_before: 'yards',
    distance_to_hole_after: null,
    distance_unit_after: null,
    is_penalty: false,
    putt_made: null,
    miss_direction: null,
    created_at: null,
    putt_distance_feet: null,
    ...over,
  };
}

/** One par-4 hole: tee → approach from `appr` yd (lie) → putts. */
function hole(roundId: string, n: number, opts: { appr: number; lie: string; firstPuttFt: number; club?: string; sand?: boolean }) {
  const holeId = `${roundId}-h${n}`;
  const shots: RawShotRow[] = [
    shot({ round_id: roundId, hole_id: holeId, hole_number: n, shot_number: 1, club_type: opts.club ?? 'driver', distance_to_hole_after: opts.appr, distance_unit_after: 'yards', lie_after: opts.lie }),
    shot({ round_id: roundId, hole_id: holeId, hole_number: n, shot_number: 2, shot_type: 'approach', club_type: 'non_driver', lie_before: opts.lie, distance_to_hole_before: opts.appr, distance_to_hole_after: opts.sand ? 15 : opts.firstPuttFt, distance_unit_after: opts.sand ? 'yards' : 'feet', lie_after: opts.sand ? 'sand' : 'green' }),
  ];
  let k = 3;
  if (opts.sand) {
    shots.push(shot({ round_id: roundId, hole_id: holeId, hole_number: n, shot_number: k++, shot_type: 'around_green', club_type: 'non_driver', lie_before: 'sand', distance_to_hole_before: 15, distance_to_hole_after: opts.firstPuttFt, distance_unit_after: 'feet', lie_after: 'green' }));
  }
  shots.push(
    shot({ round_id: roundId, hole_id: holeId, hole_number: n, shot_number: k++, shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: opts.firstPuttFt, distance_unit_before: 'feet', putt_distance_feet: opts.firstPuttFt, distance_to_hole_after: 2, distance_unit_after: 'feet', putt_made: false }),
    shot({ round_id: roundId, hole_id: holeId, hole_number: n, shot_number: k++, shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: 2, distance_unit_before: 'feet', putt_distance_feet: 2, putt_made: true }),
  );
  const h: RawHoleRow = { id: holeId, round_id: roundId, hole_number: n, par: 4, yardage: 400, score: k - 1, penalty_strokes: 0, putts: 2, gir: !opts.sand };
  return { shots, hole: h };
}

function fixture(roundCount = 4) {
  const shots: RawShotRow[] = [];
  const holes: RawHoleRow[] = [];
  const rounds = [];
  for (let r = 0; r < roundCount; r += 1) {
    const id = `r${r}`;
    rounds.push({ id, holesPlayed: 18 });
    for (let n = 1; n <= 18; n += 1) {
      const x = hole(id, n, {
        appr: n % 3 === 0 ? 190 : n % 3 === 1 ? 150 : 100,
        lie: n % 2 === 0 ? 'rough' : 'fairway',
        firstPuttFt: n % 2 === 0 ? 18 : 7,
        club: n % 4 === 0 ? 'non_driver' : 'driver',
        sand: n % 6 === 0,
      });
      shots.push(...x.shots);
      holes.push(x.hole);
    }
  }
  return { rounds, shots, holes };
}

function sumKeys(keys: MeasuredKeyValue[]): number {
  return keys.reduce((t, k) => t + k.sg, 0);
}

describe('measured What split', () => {
  const fx = fixture();
  const probe = measureWhat({ ...fx, scale: 1, whereSg: { tee: -9, approach: -9, short_game: -9, putting: -9 }, whereRounds: 4 });

  it('files every kept shot under a key: the keys add up to the recomputed area SG exactly', () => {
    for (const area of ['tee', 'approach', 'short_game', 'putting'] as RootArea[]) {
      const m = probe[area]!;
      expect(sumKeys(m.keys)).toBeCloseTo(m.recomputed * m.scale, 10);
    }
    expect(probe.putting!.keys.map((k) => k.key).sort()).toEqual(['15_25', '5_10']);
    // one first putt per hole: 72 holes
    expect(probe.putting!.keys.reduce((t, k) => t + k.n, 0)).toBe(72);
    expect(probe.tee!.keys.map((k) => k.key).sort()).toEqual(['driver', 'non_driver']);
    expect(probe.short_game!.keys.map((k) => k.key)).toEqual(['sand']);
    expect(probe.approach!.keys.find((k) => k.key === '125_175')?.lies?.fairway?.n).toBeGreaterThan(0);
  });

  it('prints measured values when the split reconciles with the stored SG', () => {
    const where = { putting: probe.putting!.recomputed - 0.1 };
    const m = measureWhat({ ...fx, scale: 1, whereSg: where, whereRounds: 4 }).putting!;
    expect(m.mode).toBe('measured');
    expect(m.scale).toBe(1);
  });

  it('shows shares of the stored total when the split is off but covers it', () => {
    const where = { putting: probe.putting!.recomputed * 1.4 };
    const m = measureWhat({ ...fx, scale: 1, whereSg: where, whereRounds: 4 }).putting!;
    expect(m.mode).toBe('share');
    expect(sumKeys(m.keys)).toBeCloseTo(where.putting, 10);
  });

  it('writes the share note without "your": the coach drill reuses it', () => {
    const where = { putting: probe.putting!.recomputed * 1.4 };
    const m = measureWhat({ ...fx, scale: 1, whereSg: where, whereRounds: 4 }).putting!;
    const note = measuredAreaNote('putting', 'share', m.rounds, m.stored, m.recomputed, groupMeasured('putting', m.keys));
    expect(note).toMatch(/did not match the stored/);
    expect(note).not.toMatch(/\byour?\b/i);
  });

  it('falls back when the split covers too little, or reads another window', () => {
    const where = { putting: probe.putting!.recomputed * 3 };
    expect(measureWhat({ ...fx, scale: 1, whereSg: where, whereRounds: 4 }).putting!.mode).toBe('none');
    const same = { putting: probe.putting!.recomputed };
    const off = measureWhat({ ...fx, scale: 1, whereSg: same, whereRounds: 5 }).putting!;
    expect(off.mode).toBe('none');
    expect(off.reason).toMatch(/same rounds/);
  });

  it('uses the stats writer putt bands, half-open', () => {
    expect([2.9, 3, 4.99, 5, 9.9, 10, 15, 24.9, 25].map(puttKey)).toEqual([
      '0_3', '3_5', '3_5', '5_10', '5_10', '10_15', '15_25', '15_25', '25_plus',
    ]);
  });
});

describe('grouping', () => {
  const keys: MeasuredKeyValue[] = [
    { key: '0_3', sg: 0.05, n: 40, rounds: 8 },
    { key: '3_5', sg: -0.2, n: 30, rounds: 8 },
    { key: '5_10', sg: -0.5, n: 30, rounds: 8 },
    { key: '10_15', sg: -0.1, n: MEASURED_MIN_EVENTS - 1, rounds: 8 },
    { key: '15_25', sg: -0.4, n: 30, rounds: 8 },
    { key: '25_plus', sg: -0.3, n: 20, rounds: 8 },
  ];

  it('folds only thin keys into Other by default, keeping the sum', () => {
    const g = groupMeasured('putting', keys);
    expect(g.losing.map((s) => s.key)).toEqual(['5_10', '15_25', '25_plus', '3_5', OTHER_KEY]);
    expect(g.losing.find((s) => s.key === OTHER_KEY)!.merged).toEqual(['10_15']);
  });

  it('folds keys past an explicit node cap into Other, keeping the sum', () => {
    const g = groupMeasured('putting', keys, { maxNodes: 3 });
    expect(g.losing.map((s) => s.key)).toEqual(['5_10', '15_25', '25_plus', OTHER_KEY]);
    const other = g.losing.find((s) => s.key === OTHER_KEY)!;
    expect(other.merged.sort()).toEqual(['10_15', '3_5']);
    expect(other.sg).toBeCloseTo(-0.3, 10);
    expect(g.gaining.map((s) => s.key)).toEqual(['0_3']);
    const total = [...g.losing, ...g.gaining].reduce((t, s) => t + s.sg, 0);
    expect(total).toBeCloseTo(sumKeys(keys), 10);
    expect(nodeIdForKey(g, '3_5')).toBe(measuredId('putting', OTHER_KEY));
    expect(nodeIdForKey(g, '0_3')).toBeNull();
  });

  it('maps stored metrics onto their spot', () => {
    expect(subKeyForMetric('putting', 'putts_made_5_10ft_pct')).toBe('5_10');
    expect(subKeyForMetric('putting', 'putts_made_25_plus_ft_pct')).toBe('25_plus');
    expect(subKeyForMetric('approach', 'approach_proximity_175_plus_ft')).toBe('175_plus');
    expect(subKeyForMetric('short_game', 'scrambling_pct_sand')).toBe('sand');
    expect(subKeyForMetric('putting', 'putt_miss_bias_left_pct')).toBeNull();
  });
});

function insight(id: string, category: string, metric: string, over: Record<string, unknown> = {}): RankableEvidenceInsight {
  return {
    id,
    title: `${metric} read`,
    content: 'c',
    category,
    insight_type: 'x',
    created_at: '2026-07-01T00:00:00Z',
    evidence: {
      metric,
      metric_label: metric,
      unit: 'percent',
      your_value: 30,
      comparison_value: 60,
      sample_n: 40,
      confidence: 0.8,
      diagnosis: { symptom: 's', root_cause: 'Lag speed', causality_level: 'inferred_hypothesis', drivers: [], recommended_action: 'r' },
      ...over,
    },
  } as unknown as RankableEvidenceInsight;
}

describe('buildRootMap with a measured What row', () => {
  const measured = {
    putting: {
      area: 'putting' as const,
      mode: 'measured' as const,
      rounds: 12,
      stored: -1.5,
      recomputed: -1.45,
      scale: 1,
      reason: null,
      keys: [
        { key: '0_3', sg: 0.05, n: 40, rounds: 12 },
        { key: '5_10', sg: -0.5, n: 30, rounds: 12 },
        { key: '15_25', sg: -0.8, n: 30, rounds: 12 },
        { key: '25_plus', sg: -0.2, n: 5, rounds: 4 },
      ],
    },
  };
  const model = buildRootMap({
    areas: [
      { area: 'tee', sgPerRound: 0.3 },
      { area: 'approach', sgPerRound: null },
      { area: 'short_game', sgPerRound: null },
      { area: 'putting', sgPerRound: -1.5 },
    ],
    insights: [
      insight('i510', 'putting', 'putts_made_5_10ft_pct'),
      insight('ibias', 'putting', 'putt_miss_bias_left_pct'),
    ],
    measured,
  });
  const putting = model.losses.find((a) => a.area === 'putting')!;

  it('draws one node per losing spot, with the stored insight attached as its Why', () => {
    expect(putting.causes.map((c) => c.label)).toEqual(['15–25 ft putts', '5–10 ft putts', 'Other putts']);
    const n510 = putting.causes.find((c) => c.label === '5–10 ft putts')!;
    expect(n510.strokes).toBeCloseTo(0.5, 10);
    expect(n510.style).toBe('likely');
    expect(n510.whyId).toBe('i510');
    expect(n510.measured?.unit).toBe('holes');
    const n1525 = putting.causes.find((c) => c.label === '15–25 ft putts')!;
    expect(n1525.style).toBe('unexplained');
    expect(whyIdOf(n1525)).toBeNull();
    // an insight id selects its spot
    expect(findBranch(model, 'i510')?.id).toBe(measuredId('putting', '5_10'));
  });

  it('puts a read with no matching spot under Other reads, and the rest is "not tracked"', () => {
    expect(model.other.map((o) => o.id)).toContain('ibias');
    expect(model.unsized).toEqual([]);
    expect(putting.measured?.note).toMatch(/measured from 12 rounds of recorded shots/);
    expect(putting.measured?.offsets).toEqual([{ label: '0–3 ft putts', sg: 0.05 }]);
    // 1.50 stored − (0.8 + 0.5 + 0.2) drawn = 0 remainder here; values print as stored
    const drawn = putting.causes.reduce((t, c) => t + c.strokes, 0);
    expect(drawn).toBeCloseTo(1.5, 10);
  });

  it('keeps the stored-insight row for an area with no measured split', () => {
    const legacy = buildRootMap({
      areas: [{ area: 'putting', sgPerRound: -1.5 }],
      insights: [insight('i510', 'putting', 'putts_made_5_10ft_pct', { counterfactual: { strokes_saved_per_round: 0.4 } })],
      measured: { putting: { ...measured.putting, mode: 'none' as const } },
    });
    const a = legacy.losses[0]!;
    expect(a.measured).toBeNull();
    expect(a.causes.map((c) => c.id)).toEqual(['i510']);
    expect(a.remainder?.strokes).toBeCloseTo(1.1, 10);
  });
});

describe('team measured What row', () => {
  it('sums the players over the team-average denominator and counts players losing strokes', () => {
    const a = { area: 'putting' as const, mode: 'measured' as const, rounds: 10, stored: -1, recomputed: -1, scale: 1, reason: null, keys: [{ key: '5_10', sg: -0.6, n: 20, rounds: 10 }, { key: '15_25', sg: -0.4, n: 20, rounds: 10 }] };
    const b = { ...a, keys: [{ key: '5_10', sg: 0.2, n: 20, rounds: 10 }, { key: '15_25', sg: -1.2, n: 20, rounds: 10 }] };
    const t = teamMeasuredKeys('putting', [a, b, undefined], 3);
    expect(t.measuredPlayers).toBe(2);
    expect(t.keys.find((k) => k.key === '5_10')?.sg).toBeCloseTo(-0.4 / 3, 10);
    expect(t.playersByKey['15_25']).toBe(2);
    expect(t.playersByKey['5_10']).toBe(1);

    const team = buildTeamRoots({
      players: [
        { id: 'p1', name: 'A', roundsPlayed: 10, sgTotal: -1, sg: { tee: null, approach: null, short_game: null, putting: -1 } },
        { id: 'p2', name: 'B', roundsPlayed: 10, sgTotal: -1, sg: { tee: null, approach: null, short_game: null, putting: -1 } },
        { id: 'p3', name: 'C', roundsPlayed: 10, sgTotal: -1, sg: { tee: null, approach: null, short_game: null, putting: -1.5 } },
      ],
      signals: [],
      measured: new Map([
        ['p1', { putting: a }],
        ['p2', { putting: b }],
      ]),
    });
    const putting = team.map.losses[0]!;
    expect(putting.measured?.note).toMatch(/for 2 of 3 players/);
    expect(putting.causes.map((c) => [c.label, c.players])).toEqual([
      ['15–25 ft putts', 2],
      ['5–10 ft putts', 1],
    ]);
    // player C has no shots: their share of the team loss stays "not tracked"
    expect(putting.remainder?.strokes).toBeGreaterThan(0.4);
  });
});
