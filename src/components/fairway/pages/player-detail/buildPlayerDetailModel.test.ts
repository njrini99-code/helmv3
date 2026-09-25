import { describe, expect, it } from 'vitest';
import type { RoundStatsCacheRow } from '@/lib/golf/countable-round-stats';
import {
  buildPlayerDetailModel,
  formatDayLabel,
  formatSigned,
  formatRoundToPar,
  rollingMean,
  type PlayerDetailInputs,
  type RawRound,
} from './buildPlayerDetailModel';

let seq = 0;
function round(date: string, total: number, overrides: Partial<RawRound> = {}): RawRound {
  seq += 1;
  const holes = overrides.holes_played ?? 18;
  const par = holes === 9 ? 36 : 72;
  return {
    id: `r${seq}`,
    round_date: date,
    course_name: 'Pebble Beach',
    total_score: total,
    score_to_par: total - par,
    front_nine: holes === 9 ? total : Math.floor(total / 2),
    back_nine: holes === 9 ? null : total - Math.floor(total / 2),
    holes_played: holes,
    total_putts: 32,
    round_type: 'tournament',
    status: 'completed',
    ...overrides,
  };
}

function stats(roundId: string, over: Partial<RoundStatsCacheRow> = {}): RoundStatsCacheRow {
  return {
    round_id: roundId,
    birdies: 2,
    eagles: 0,
    total_putts: 32,
    three_putts: 1,
    fairways_hit: 9,
    fairways_total: 14,
    greens_hit: 11,
    greens_total: 18,
    scramble_attempts: 7,
    scrambles_converted: 3,
    strokes_gained_total: -1,
    strokes_gained_tee: 0.5,
    strokes_gained_approach: -1.5,
    strokes_gained_around_green: 0.2,
    strokes_gained_putting: -0.2,
    ...over,
  };
}

function inputs(rounds: RawRound[], over: Partial<PlayerDetailInputs> = {}): PlayerDetailInputs {
  return {
    firstName: 'Owen',
    seasonYear: 2026,
    rounds: { ok: true, value: rounds },
    roundStats: { ok: true, value: rounds.map((r) => stats(r.id)) },
    genome: { ok: true, value: null },
    insights: { ok: true, value: [] },
    focusAreas: { ok: true, value: [] },
    goals: { ok: true, value: [] },
    ...over,
  };
}

/** The prod Sep 17 round: 18 scored holes summing to 37, SG +34.51. */
const bogus = () =>
  round('2026-09-17', 37, { front_nine: 19, back_nine: 18, total_putts: 18, score_to_par: -35 });

describe('formatters', () => {
  it('formats dates without a timezone', () => {
    expect(formatDayLabel('2026-08-02')).toBe('Aug 2');
    expect(formatDayLabel('2026-12-31T23:00:00Z')).toBe('Dec 31');
  });
  it('signs numbers with a real minus and E for level par', () => {
    expect(formatSigned(0.43)).toBe('+0.4');
    expect(formatSigned(-1.61)).toBe('−1.6');
    expect(formatRoundToPar(0)).toBe('E');
    expect(formatRoundToPar(-3)).toBe('−3');
    expect(formatRoundToPar(2)).toBe('+2');
  });
  it('computes a trailing mean', () => {
    expect(rollingMean([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
  });
});

describe('buildPlayerDetailModel', () => {
  it('leaves the 37-stroke round out of the strip, the masthead and the best round', () => {
    const b = bogus();
    const real = round('2026-08-02', 74);
    const m = buildPlayerDetailModel(
      inputs([b, real, round('2026-07-20', 76)], {
        roundStats: { ok: true, value: [stats(b.id, { strokes_gained_total: 34.51 }), stats(real.id)] },
      }),
    );
    expect(m.statusLine).toBe('Last round Aug 2 · 74 (+2)');
    expect(m.statusNote).toBe('1 later round not counted');
    expect(m.allRounds.map((r) => r.id)).not.toContain(b.id);
    expect(m.bestRoundId).toBe(real.id);
    expect(m.excludedRounds).toBe(1);
    for (const s of m.scopes) expect(s.rounds.map((r) => r.id)).not.toContain(b.id);
  });

  it('excludes an SG-implausible round even when its score looks fine', () => {
    const weird = round('2026-08-10', 70);
    const m = buildPlayerDetailModel(
      inputs([weird, round('2026-08-02', 74)], {
        roundStats: { ok: true, value: [stats(weird.id, { strokes_gained_total: 22 })] },
      }),
    );
    expect(m.allRounds.map((r) => r.id)).not.toContain(weird.id);
    expect(m.statusLine).toMatch(/^Last round Aug 2/);
  });

  it('slices Last 5, Last 10 and the calendar-year season', () => {
    const rounds = [
      ...[9, 8, 7, 6, 5, 4, 3, 2, 1].map((mo) => round(`2026-0${mo}-10`, 72 + mo)),
      ...[12, 11, 10].map((mo) => round(`2025-${mo}-10`, 75)),
    ];
    const m = buildPlayerDetailModel(inputs(rounds));
    const by = Object.fromEntries(m.scopes.map((s) => [s.key, s]));
    expect(by.last5!.rounds).toHaveLength(5);
    expect(by.last10!.rounds).toHaveLength(10);
    expect(by.season!.rounds.every((r) => r.date.startsWith('2026'))).toBe(true);
    expect(by.season!.windowLabel).toBe('2026 season');
    expect(m.defaultScope).toBe('last10');
  });

  it('never doubles a 9-hole round; it is counted but not plotted', () => {
    const m = buildPlayerDetailModel(inputs([round('2026-08-05', 38, { holes_played: 9, total_putts: 16 }), round('2026-08-02', 74)]));
    expect(m.statusLine).toBe('Last round Aug 5 · 38 (+2) · 9 holes');
    const last5 = m.scopes.find((s) => s.key === 'last5')!;
    expect(last5.rounds).toHaveLength(1);
    expect(last5.nineHoleRounds).toBe(1);
  });

  it('prints each ledger stat with its sample and flags thin reads', () => {
    const m = buildPlayerDetailModel(inputs([round('2026-08-02', 74), round('2026-07-28', 76)]));
    const ledger = m.scopes.find((s) => s.key === 'last5')!.ledger;
    const scoring = ledger.find((l) => l.key === 'scoring')!;
    expect(scoring.value).toBe('75.0');
    expect(scoring.aside).toBe('+3.0 to par');
    expect(scoring.thin).toBe(true);
    expect(ledger.find((l) => l.key === 'fir')!.sample).toBe('18 of 28 fairways');
    expect(ledger.find((l) => l.key === 'sg')!.value).toBe('−1.0');
    expect(ledger.find((l) => l.key === 'sg')!.tone).toBe('bad');
  });

  it('says a failed stats read is unavailable, not untracked', () => {
    const m = buildPlayerDetailModel(inputs([round('2026-08-02', 74)], { roundStats: { ok: false } }));
    const sg = m.scopes[0]!.ledger.find((l) => l.key === 'sg')!;
    expect(sg.sample).toBe("Couldn't load");
    expect(m.waterfall.state).toBe('unavailable');
  });

  it('builds the verdict from real rounds', () => {
    const ten = Array.from({ length: 10 }, (_, i) => round(`2026-08-${String(20 - i).padStart(2, '0')}`, i < 5 ? 73 : 75));
    expect(buildPlayerDetailModel(inputs(ten)).verdict).toBe(
      'Owen is averaging 73.0 over the last 5 rounds, 2.0 strokes better than the 5 before.',
    );
    expect(buildPlayerDetailModel(inputs([round('2026-08-02', 74)])).verdict).toBe(
      'Owen has one counted round: 74 at Pebble Beach.',
    );
  });

  it('reports a 0-round player as empty and a failed read as unavailable', () => {
    const empty = buildPlayerDetailModel(inputs([]));
    expect(empty.roundsState).toBe('empty');
    expect(empty.statusLine).toBeNull();
    expect(empty.verdict).toBeNull();
    const failed = buildPlayerDetailModel(inputs([], { rounds: { ok: false } }));
    expect(failed.roundsState).toBe('unavailable');
  });

  it('keeps previews honest: failed vs not computed', () => {
    const m = buildPlayerDetailModel(
      inputs([round('2026-08-02', 74)], { genome: { ok: false }, insights: { ok: true, value: [] } }),
    );
    expect(m.strand.state).toBe('unavailable');
    expect(m.scouting.state).toBe('empty');
  });

  it('picks the highest-priority open insight for the scouting preview', () => {
    const m = buildPlayerDetailModel(
      inputs([], {
        insights: {
          ok: true,
          value: [
            { id: 'a', title: 'Newer, low', priority: 'low', created_at: '2026-09-02' },
            { id: 'b', title: 'Three-putts from 25+ ft', priority: 'high', created_at: '2026-08-01' },
          ],
        },
      }),
    );
    expect(m.scouting).toEqual({ state: 'ready', headline: 'Three-putts from 25+ ft', openReads: 2 });
  });

  it('measures plan progress from baseline to target in either direction', () => {
    const m = buildPlayerDetailModel(
      inputs([], {
        focusAreas: {
          ok: true,
          value: [{ id: 'f', title: 'Putts per round', status: 'active', baseline_value: 34, current_value: 32, target_value: 30 }],
        },
        goals: {
          ok: true,
          value: [{ id: 'g', title: 'GIR', state: 'active', baseline_value: null, current_value: 60, target_value: 70, ends_at: '2026-10-04' }],
        },
      }),
    );
    expect(m.plan[0]).toMatchObject({ kind: 'focus', progress: 0.5, detail: 'Now 32 · target 30' });
    expect(m.plan[1]).toMatchObject({ kind: 'goal', progress: null, detail: 'Now 60 · target 70 · ends Oct 4' });
  });
});
