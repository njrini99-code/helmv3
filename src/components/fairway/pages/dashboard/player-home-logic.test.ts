/**
 * The player home derivations. The load-bearing tests are the ones that pin a
 * caption to the thing it describes: all three defects this rebuild carries
 * forward were a sentence asserting something its own data contradicted.
 */
import { describe, it, expect } from 'vitest';

import type { StrokesGainedSnapshot, ActionItem } from '@/app/golf/actions/dashboard-data';
import {
  readStrokesGained,
  sgTakeaway,
  sgZones,
  hasBenchmark,
  buildPlayerVerdict,
  verdictText,
  overdueCount,
  stageRounds,
  stageAxis,
  stageState,
  readReadout,
  scoringTrend,
  EIGHTEEN_HOLE_FLOOR,
} from './player-home-logic';

const sg = (over: Partial<StrokesGainedSnapshot> = {}): StrokesGainedSnapshot => ({
  sg_total: null,
  sg_off_tee: 0.4,
  sg_approach: -0.2,
  sg_around_green: 0.1,
  sg_putting: -0.9,
  ...over,
});

const task = (over: Partial<ActionItem> = {}): ActionItem => ({
  id: 't1',
  type: 'task',
  title: 'Range session',
  date: '2026-09-01',
  ...over,
});

describe('sgTakeaway checks BOTH ends of the range', () => {
  it('names the leak when the zones are mixed', () => {
    expect(sgTakeaway(readStrokesGained(sg()))).toBe(
      'Gaining most off the tee, leaking most on the greens.',
    );
  });

  it('calls a positive worst zone the thinnest edge, not a leak', () => {
    const read = readStrokesGained(
      sg({ sg_off_tee: 0.9, sg_approach: 0.4, sg_around_green: 0.2, sg_putting: 0.1 }),
    );
    expect(read.allPositive).toBe(true);
    expect(sgTakeaway(read)).toBe('Gaining in every zone; the thinnest edge is on the greens.');
  });

  it('never claims a gain when every zone is negative', () => {
    // The v2 sentence said "Gaining most off the tee" here, because it asked
    // whether the WORST zone was positive and never asked about the best.
    const read = readStrokesGained(
      sg({ sg_off_tee: -0.1, sg_approach: -0.5, sg_around_green: -0.8, sg_putting: -1.4 }),
    );
    expect(read.allNegative).toBe(true);
    const line = sgTakeaway(read);
    expect(line).toBe('Leaking in every zone; least off the tee, most on the greens.');
    expect(line).not.toMatch(/gain/i);
  });

  it('says nothing at all below three zones', () => {
    const read = readStrokesGained(sg({ sg_around_green: null, sg_putting: null }));
    expect(read.legible).toBe(false);
    expect(sgTakeaway(read)).toBeNull();
  });

  it('drops zones with no value rather than reading them as zero', () => {
    expect(sgZones(sg({ sg_approach: null })).map((z) => z.label)).toEqual(['Tee', 'ATG', 'Putt']);
    expect(sgZones(null)).toEqual([]);
  });

  it('treats an exact zero as not a leak', () => {
    const read = readStrokesGained(
      sg({ sg_off_tee: 0.5, sg_approach: 0.2, sg_around_green: 0.1, sg_putting: 0 }),
    );
    expect(read.allPositive).toBe(true);
    expect(read.allNegative).toBe(false);
  });
});

describe('hasBenchmark gates the sentence on the line, not on a round existing', () => {
  it('is false without a scoring average, however many rounds exist', () => {
    expect(hasBenchmark(null)).toBe(false);
    expect(hasBenchmark(undefined)).toBe(false);
    expect(hasBenchmark(Number.NaN)).toBe(false);
    expect(hasBenchmark(74.2)).toBe(true);
  });
});

describe('buildPlayerVerdict', () => {
  const series = [80, 79, 78, 76, 75];

  it('states the count, the trend and the leak, and links the leak', () => {
    const parts = buildPlayerVerdict({
      roundsPlayed: 12,
      scoringAverage: 77.6,
      scoringSeries: series,
      sg: sg(),
      actionItems: [],
    });
    const text = verdictText(parts);
    expect(text).toContain('12 rounds logged.');
    expect(text).toContain('Scoring 77.6, down');
    expect(text).toContain('on the greens is costing you most.');
    expect(parts.find((p) => p.href === '#strokes')).toBeDefined();
  });

  it('never names a costliest zone when nothing is actually negative', () => {
    const text = verdictText(
      buildPlayerVerdict({
        roundsPlayed: 12,
        scoringAverage: 77.6,
        scoringSeries: series,
        sg: sg({ sg_off_tee: 0.9, sg_approach: 0.4, sg_around_green: 0.2, sg_putting: 0.1 }),
        actionItems: [],
      }),
    );
    expect(text).not.toMatch(/costing/);
  });

  it('says the trend is not callable rather than dropping the clause', () => {
    const text = verdictText(
      buildPlayerVerdict({
        roundsPlayed: 2,
        scoringAverage: 77.6,
        scoringSeries: [80, 79],
        sg: null,
        actionItems: [],
      }),
    );
    expect(text).toContain('Not enough rounds yet to call a trend.');
  });

  it('omits the average from the trend clause when there is no average', () => {
    const text = verdictText(
      buildPlayerVerdict({
        roundsPlayed: 12,
        scoringAverage: null,
        scoringSeries: series,
        sg: null,
        actionItems: [],
      }),
    );
    expect(text).toMatch(/down \d/);
    expect(text).not.toMatch(/Scoring/);
  });

  it('counts only overdue items, and omits the clause at zero', () => {
    expect(overdueCount([task(), task({ id: 't2', overdue: true })])).toBe(1);
    const none = verdictText(
      buildPlayerVerdict({
        roundsPlayed: 12,
        scoringAverage: null,
        scoringSeries: series,
        sg: null,
        actionItems: [task()],
      }),
    );
    expect(none).not.toMatch(/overdue/);

    const some = buildPlayerVerdict({
      roundsPlayed: 12,
      scoringAverage: null,
      scoringSeries: series,
      sg: null,
      actionItems: [task({ overdue: true }), task({ id: 't2', overdue: true })],
    });
    expect(verdictText(some)).toContain('2 overdue.');
    expect(some.find((p) => p.href === '#plate')).toBeDefined();
  });

  it('has no stray space before its final period', () => {
    const text = verdictText(
      buildPlayerVerdict({
        roundsPlayed: 12,
        scoringAverage: null,
        scoringSeries: series,
        sg: null,
        actionItems: [task({ overdue: true })],
      }),
    );
    expect(text).not.toMatch(/ \./);
  });

  it('says nothing is logged rather than reporting a zero trend', () => {
    expect(
      verdictText(
        buildPlayerVerdict({
          roundsPlayed: 0,
          scoringAverage: null,
          scoringSeries: [],
          sg: null,
          actionItems: [],
        }),
      ),
    ).toBe('No rounds logged yet.');
  });
});

describe('stageRounds and the axis', () => {
  const trend = [
    { label: 'Apr 2', value: 78 },
    { label: 'May 9', value: 74 },
    { label: 'Jun 1', value: 41 }, // nine holes
  ];

  it('drops totals below the 18-hole floor rather than drawing a fake collapse', () => {
    const rounds = stageRounds(trend, 72);
    expect(rounds.map((r) => r.score)).toEqual([78, 74]);
    expect(EIGHTEEN_HOLE_FLOOR).toBeGreaterThan(41);
  });

  it('computes to par only when a par is known', () => {
    expect(stageRounds(trend, 72)[0]!.toPar).toBe(6);
    expect(stageRounds(trend, null)[0]!.toPar).toBeNull();
  });

  it('stays ordinal while any round lacks a real date', () => {
    // "Apr 2" carries no year, so a date axis built from it would be invented.
    expect(stageAxis(stageRounds(trend, 72))).toBe('ordinal');
    expect(
      stageAxis(
        stageRounds(
          [
            { label: 'Apr 2', value: 78, date: '2026-04-02' },
            { label: 'May 9', value: 74, date: '2026-05-09' },
          ],
          72,
        ),
      ),
    ).toBe('date');
  });

  it('is ordinal when there is nothing to plot', () => {
    expect(stageAxis([])).toBe('ordinal');
    expect(stageRounds(null, 72)).toEqual([]);
  });
});

describe('stageState', () => {
  const r = (n: number) =>
    stageRounds(
      Array.from({ length: n }, (_, i) => ({ label: `R${i}`, value: 75 + i })),
      72,
    );

  it('draws no trend below three rounds and says how many are missing', () => {
    expect(stageState(r(1)).canTrend).toBe(false);
    expect(stageState(r(1)).thinCaption).toBe('2 more rounds and your trend draws.');
    expect(stageState(r(2)).thinCaption).toBe('1 more round and your trend draws.');
  });

  it('is silent once the trend is drawable', () => {
    expect(stageState(r(3)).canTrend).toBe(true);
    expect(stageState(r(3)).thinCaption).toBeNull();
  });

  it('has its own line for a player with nothing logged', () => {
    expect(stageState([]).thinCaption).toBe('No rounds logged yet. Your first one starts the line.');
  });
});

describe('readReadout', () => {
  it('prints no delta for a metric with no series, and does not borrow one', () => {
    // sparklines.handicap.sparkline is hardcoded [] at the source.
    const handicap = readReadout('Handicap', 4.2, [], 'down');
    expect(handicap.value).toBe(4.2);
    expect(handicap.trend).toBeNull();
  });

  it('derives the delta from the same call that will colour the sparkline', () => {
    const scoring = readReadout('Scoring', 77.6, [80, 79, 78, 76, 75], 'down');
    expect(scoring.trend).not.toBeNull();
    expect(scoring.trend!.direction).toBe('improving');
    expect(scoring.trend).toEqual(scoringTrend([80, 79, 78, 76, 75]));
  });

  it('keeps a null value null rather than showing a fake zero', () => {
    expect(readReadout('GIR', null, [1, 2, 3], 'up').value).toBeNull();
    expect(readReadout('GIR', Number.NaN, [1, 2, 3], 'up').value).toBeNull();
  });
});
