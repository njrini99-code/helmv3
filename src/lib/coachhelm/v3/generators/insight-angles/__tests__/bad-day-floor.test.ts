import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

import {
  BadDayFloorGenerator,
  composeBadDayFloor,
  computeBadDayFloor,
  peerFloorGaps,
  splitHole,
  toFloorAggregate,
} from '../bad-day-floor';
import type { AngleHole, AngleRound } from '../angle-data';
import { PLAYER, mkData, mkHole, mkPeerRounds, mkRound } from './fixtures';

/**
 * `n` rounds of `holes` par-4 holes. Every 5th round is a "bad" round with
 * `badDoubles` triple-bogeys (one of them with a penalty stroke when
 * `penalty`); other rounds have `bogeys` bogeys spread by round index.
 */
function build(opts: { n?: number; holes?: 9 | 18; badDoubles?: number; penalty?: boolean; badArea?: 'tee' | 'putting' }) {
  const n = opts.n ?? 15;
  const nh = opts.holes ?? 18;
  const rounds: AngleRound[] = [];
  const holes: AngleHole[] = [];
  for (let i = 0; i < n; i++) {
    const bad = i % 5 === 0;
    const sg = { total: 0, tee: 0, approach: 0, short_game: 0, putting: 0 };
    if (bad) sg[opts.badArea ?? 'tee'] = -((opts.badDoubles ?? 3) * 2);
    const r = mkRound(i, { holes: nh, sg });
    rounds.push(r);
    const bogeys = i % 3;
    for (let h = 1; h <= nh; h++) {
      let score = 4;
      let pen = 0;
      if (bad && h <= (opts.badDoubles ?? 3)) {
        score = 7;
        if (opts.penalty && h === 1) pen = 1;
      } else if (h > nh - bogeys) score = 5;
      holes.push(mkHole(r.id, h, { score, penalty_strokes: pen }));
    }
  }
  return mkData(rounds, holes, []);
}

/** Teammates whose per-18 score to par cycles 0..spread (tight floor). */
function peers(players = 3, spread = 1) {
  return Array.from({ length: players }, (_, p) =>
    mkPeerRounds(`p${p}`, 12, (i) => ({ score_to_par: i % (spread + 1) })),
  ).flat();
}

describe('splitHole', () => {
  it('parts are non-overlapping and sum to the score to par', () => {
    for (const [tp, pen] of [[0, 0], [1, 0], [2, 0], [3, 1], [2, 2], [4, 2], [-1, 0], [0, 1]] as const) {
      const s = splitHole(tp, pen);
      expect(s.penalties + s.double_or_worse + s.everything_else).toBe(tp);
    }
    expect(splitHole(3, 1)).toEqual({ penalties: 1, double_or_worse: 1, everything_else: 1 });
    expect(splitHole(1, 0).double_or_worse).toBe(0);
  });
});

describe('computeBadDayFloor', () => {
  it('returns null without usable rounds', () => {
    expect(computeBadDayFloor(mkData([], [], []), null)).toBeNull();
  });

  it('finds the bad-day gap, splits it, and qualifies against a tighter team', () => {
    const r = computeBadDayFloor(build({ badDoubles: 3, penalty: true }), peers())!;
    expect(r.rounds).toHaveLength(15);
    expect(r.peer_n).toBe(3);
    expect(r.floor_gap).toBeGreaterThan(r.peer_gap!);
    expect(r.qualifies).toBe(true);
    // The split adds up to bad − middle.
    const sum = r.split.penalties + r.split.double_or_worse + r.split.everything_else;
    expect(sum).toBeCloseTo(r.bad_mean - r.middle_mean, 1);
    expect(r.split.penalties).toBeGreaterThan(0);
    expect(r.split.double_or_worse).toBeGreaterThan(r.split.penalties);
    expect(r.driver).toBe('tee');
    expect(r.examples.length).toBeGreaterThan(0);
    expect(r.examples.length).toBeLessThanOrEqual(5);
    expect(r.examples[0]!.note).toContain('+3');
  });

  it('needs 10 rounds', () => {
    const r = computeBadDayFloor(build({ n: 8 }), peers())!;
    expect(r.qualifies).toBe(false);
    expect(toFloorAggregate(r, 74)).toBeNull();
  });

  it('needs 3 teammates with 10+ rounds; the player is never their own peer', () => {
    const own = mkPeerRounds(PLAYER, 12, () => ({ score_to_par: 0 }));
    const r = computeBadDayFloor(build({}), [...peers(2), ...own])!;
    expect(r.peer_n).toBe(2);
    expect(r.qualifies).toBe(false);
  });

  it('does not flag a floor no wider than teammates\'', () => {
    const r = computeBadDayFloor(build({ badDoubles: 1 }), peers(3, 6))!;
    expect(r.qualifies).toBe(false);
  });

  it('excludes rounds with an unscored hole and counts them (missing is not zero)', () => {
    const data = build({});
    data.holes = data.holes.map((h) => (h.round_id === 'r1' && h.hole_number === 2 ? { ...h, score: null } : h));
    const r = computeBadDayFloor(data, peers())!;
    expect(r.excluded.incomplete_hole_scores).toBe(1);
    expect(r.rounds).toHaveLength(14);
  });

  it('scales 9-hole rounds × 2 to per 18', () => {
    const r = computeBadDayFloor(build({ holes: 9, n: 15 }), peers())!;
    expect(r.nine_hole_rounds).toBe(15);
    // A bad 9-hole round with three +3 holes is +9 over 9 → +18 per 18.
    const bad = r.rounds.find((x) => x.id === 'r0')!;
    expect(bad.to_par).toBe(18);
    expect(bad.parts.double_or_worse + bad.parts.everything_else + bad.parts.penalties).toBe(18);
  });

  it('peerFloorGaps scales a teammate\'s 9-hole score to par to 18', () => {
    const nine = mkPeerRounds('p9', 10, (i) => ({ holes: 9, score_to_par: i % 2 }));
    // Per 18: 0, 2, 0, 2 … → median 1, P80 2.
    expect(peerFloorGaps(nine, PLAYER)).toEqual([1]);
  });
});

describe('composeBadDayFloor', () => {
  it('files under the area bad rounds lose most in, sizes one round in five', () => {
    const r = computeBadDayFloor(build({ badDoubles: 3, badArea: 'putting' }), peers())!;
    const c = composeBadDayFloor(toFloorAggregate(r, 74)!);
    const ev = c.evidence as typeof c.evidence & { counterfactual: { strokes_saved_per_round: number; attempts_used: number } };
    expect(c.category).toBe('putting');
    expect(ev.metric).toBe('round_bad_day_floor');
    expect(ev.comparison_source).toBe('team_avg');
    expect(ev.counterfactual.attempts_used).toBe(0.2);
    expect(ev.counterfactual.strokes_saved_per_round).toBeCloseTo(Math.min(2.5, r.extra_gap * 0.2), 1);
    expect(ev.diagnosis?.causality_level).toBe('inferred_hypothesis');
    const receipts = (ev.detail as { receipts: { samples: Record<string, number>; definition: string } }).receipts;
    expect(receipts.samples.rounds).toBe(15);
    expect(receipts.definition).toContain('scaled × 2');
    expect(c.signature).toBe('bad_day_floor:score_to_par');
    const agg = toFloorAggregate(r, 74)! as unknown as Record<string, unknown>;
    expect(agg.stddev).toBeUndefined();
    expect(agg.round_dates).toBeUndefined();
  });

  it('falls back to scoring when SG is not stored on the rounds', () => {
    const data = build({ badDoubles: 3 });
    data.rounds = data.rounds.map((r) => ({ ...r, sg: { total: null, tee: null, approach: null, short_game: null, putting: null } }));
    const r = computeBadDayFloor(data, peers())!;
    expect(r.driver).toBeNull();
    const gen = new BadDayFloorGenerator(PLAYER);
    gen.composeContent(toFloorAggregate(r, 74)!);
    expect(gen.category).toBe('scoring');
  });
});
