/**
 * ============================================================================
 * development-logic — the player development v3 pure derivations
 * ----------------------------------------------------------------------------
 * The load-bearing test is the first one: `explainProgress` mirrors
 * `getProgressPercent`'s branches so the screen can name WHICH of six real
 * situations produced its single `null`, and that mirror has to be pinned or
 * it rots the first time either function changes.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';

import { getProgressPercent } from './areaTypes';
import type { FocusAreaCardData } from './FocusAreaCard';
import {
  explainProgress,
  progressPctOf,
  progressCaption,
  fieldRowState,
  thinRowCaption,
  rowReadout,
  markTone,
  fieldDomain,
  movementCounts,
  buildDevelopmentVerdict,
  verdictText,
  readingsLog,
} from './development-logic';

// gir_pct is higher_better; putts_made_3_5ft_pct is higher_better;
// penalty_rate_per_round is lower_better. All three are in the v3 registry.
const HIGHER = 'gir_pct';
const LOWER = 'penalty_rate_per_round';
const UNREGISTERED = 'not_a_real_metric_xyz';

function area(overrides: Partial<FocusAreaCardData> = {}): FocusAreaCardData {
  return {
    id: 'fa-1',
    area_type: 'approach',
    title: 'Greens in regulation',
    target_metric: HIGHER,
    baseline_value: 50,
    current_value: 56,
    target_value: 65,
    started_at: '2026-06-01',
    progressHistory: [],
    snapshots: [],
    ...overrides,
  } as FocusAreaCardData;
}

describe('explainProgress mirrors getProgressPercent', () => {
  const cases: Array<[string, number | null, number | null, string | null, number | null]> = [
    ['ordinary higher-is-better', 56, 65, HIGHER, 50],
    ['ordinary lower-is-better', 1.2, 0.5, LOWER, 2.0],
    ['target met, higher', 70, 65, HIGHER, 50],
    ['target met, lower', 0.4, 0.5, LOWER, 2.0],
    ['below the starting value', 44, 65, HIGHER, 50],
    ['no target', 56, null, HIGHER, 50],
    ['no baseline', 56, 65, HIGHER, null],
    ['no current', null, 65, HIGHER, 50],
    ['unknown direction', 56, 65, UNREGISTERED, 50],
    ['target equals baseline, already cleared', 56, 50, HIGHER, 50],
    ['target equals baseline, not cleared', 44, 50, HIGHER, 50],
    ['target the wrong way, higher', 35, 40, HIGHER, 50],
    ['target the wrong way, lower', 3.5, 3.0, LOWER, 2.0],
  ];

  it.each(cases)('%s: the collapsed read equals the shipped number', (_label, current, target, metric, baseline) => {
    expect(progressPctOf(explainProgress(current, target, metric, baseline))).toBe(
      getProgressPercent(current, target, metric, baseline),
    );
  });

  it('names which field is actually missing rather than defaulting to one excuse', () => {
    expect(explainProgress(56, null, HIGHER, 50).kind).toBe('no-target');
    expect(explainProgress(56, 65, HIGHER, null).kind).toBe('no-baseline');
    expect(explainProgress(null, 65, HIGHER, 50).kind).toBe('no-current');
    expect(explainProgress(56, 65, UNREGISTERED, 50).kind).toBe('unknown-direction');
    // Both malformed-target branches are only reachable for a reader who has
    // NOT cleared the target: a met target answers the question first.
    expect(explainProgress(44, 50, HIGHER, 50).kind).toBe('target-is-start');
    expect(explainProgress(35, 40, HIGHER, 50).kind).toBe('target-wrong-way');
    expect(explainProgress(3.5, 3.0, LOWER, 2.0).kind).toBe('target-wrong-way');

    expect(progressCaption(explainProgress(56, null, HIGHER, 50))).toBe('No target set.');
    expect(progressCaption(explainProgress(56, 65, HIGHER, null))).toBe('No starting value on record.');
    // A row that can be plotted has no caption at all.
    expect(progressCaption(explainProgress(56, 65, HIGHER, 50))).toBeNull();
  });

  it('answers "you are there" before it complains about the target', () => {
    // Target sits at or behind the starting value AND the reader has passed it.
    // Saying "target is where you started" to someone at 56 on a target of 50
    // would be true and useless. 100 is the honest read.
    expect(explainProgress(56, 50, HIGHER, 50).kind).toBe('met');
    expect(explainProgress(56, 40, HIGHER, 50).kind).toBe('met');
    expect(progressPctOf(explainProgress(56, 40, HIGHER, 50))).toBe(100);
  });

  it('drops the zero floor for the plotted mark while the printed number keeps it', () => {
    // Started at 50, target 65, now 44: eleven points BELOW the starting value.
    const read = explainProgress(44, 65, HIGHER, 50);
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;
    expect(read.pct).toBe(0); // what every other screen prints
    expect(read.raw).toBeLessThan(0); // where the mark actually sits
    expect(read.pct).toBe(getProgressPercent(44, 65, HIGHER, 50));
  });
});

describe('markTone reads against the baseline, never against the previous mark', () => {
  it('is green above the rule, amber below it, neutral on it', () => {
    expect(markTone(40)).toBe('good');
    expect(markTone(-12)).toBe('warn');
    expect(markTone(0)).toBe('neutral');
  });
});

describe('fieldRowState and its captions', () => {
  it('plots a row with two or more readings', () => {
    const state = fieldRowState(
      area({ snapshots: [{ date: '2026-06-01', value: 50 }, { date: '2026-07-01', value: 56 }] }),
    );
    expect(state.kind).toBe('plot');
    if (state.kind !== 'plot') return;
    expect(state.marks.map((m) => m.value)).toEqual([50, 56]);
    expect(thinRowCaption(state)).toBeNull();
  });

  it('never draws a trend through one point', () => {
    const state = fieldRowState(area({ snapshots: [{ date: '2026-07-01', value: 56 }] }));
    expect(state.kind).toBe('single');
    expect(thinRowCaption(state)).toBe('One reading. Log a second to see movement.');
  });

  it('says what unlocks the line when nothing is logged', () => {
    const state = fieldRowState(area({ snapshots: [], progressHistory: [] }));
    expect(state.kind).toBe('no-readings');
    expect(thinRowCaption(state)).toBe('No readings yet. Log one to start the line.');
  });

  it('refuses to plot a row whose direction cannot be resolved, and says so', () => {
    const state = fieldRowState(
      area({
        target_metric: UNREGISTERED,
        snapshots: [{ date: '2026-06-01', value: 50 }, { date: '2026-07-01', value: 56 }],
      }),
    );
    expect(state.kind).toBe('caption');
    expect(thinRowCaption(state)).toBe('No direction known for this metric.');
  });

  it('still plots readings when only the denormalized current_value is absent', () => {
    const state = fieldRowState(
      area({
        current_value: null,
        snapshots: [{ date: '2026-06-01', value: 50 }, { date: '2026-07-01', value: 56 }],
      }),
    );
    expect(state.kind).toBe('plot');
  });
});

describe('rowReadout keeps a contradictory number out of the mark eyeline', () => {
  it('prints the percent when the latest reading is at or above the start', () => {
    const state = fieldRowState(
      area({ snapshots: [{ date: '2026-06-01', value: 50 }, { date: '2026-07-01', value: 56 }] }),
    );
    expect(rowReadout(state)).toEqual({ kind: 'pct', pct: 40 });
  });

  it('prints no percent at all when the latest reading is below the start', () => {
    const state = fieldRowState(
      area({ snapshots: [{ date: '2026-06-01', value: 50 }, { date: '2026-07-01', value: 44 }] }),
    );
    // The clamped percent here would be 0, sitting beside a mark below the
    // baseline rule. The row says the words instead.
    expect(rowReadout(state)).toEqual({ kind: 'below-start' });
  });
});

describe('fieldDomain', () => {
  it('spans the earliest reading or start date to the supplied today, and reads no clock', () => {
    const d = fieldDomain(
      [
        area({ id: 'a', started_at: '2026-06-01', snapshots: [{ date: '2026-06-15', value: 51 }] }),
        area({ id: 'b', started_at: '2026-05-02', snapshots: [] }),
      ],
      '2026-09-10',
    );
    expect(d).toEqual({ start: '2026-05-02', end: '2026-09-10' });
  });

  it('never ends before it starts', () => {
    const d = fieldDomain([area({ started_at: '2026-09-20', snapshots: [] })], '2026-09-10');
    expect(d).toEqual({ start: '2026-09-20', end: '2026-09-20' });
  });

  it('is null when there is nothing dated to plot', () => {
    expect(fieldDomain([], '2026-09-10')).toBeNull();
  });
});

describe('movementCounts', () => {
  it('counts only areas with a resolved direction and at least two readings', () => {
    const counts = movementCounts([
      // higher-is-better, rising: improving
      area({ id: 'a', snapshots: [{ date: '2026-06-01', value: 50 }, { date: '2026-07-01', value: 56 }] }),
      // higher-is-better, falling: declining
      area({ id: 'b', snapshots: [{ date: '2026-06-01', value: 60 }, { date: '2026-07-01', value: 52 }] }),
      // lower-is-better, falling: improving
      area({
        id: 'c',
        target_metric: LOWER,
        baseline_value: 2,
        target_value: 0.5,
        snapshots: [{ date: '2026-06-01', value: 2.0 }, { date: '2026-07-01', value: 1.2 }],
      }),
      // one reading: not counted either way
      area({ id: 'd', snapshots: [{ date: '2026-07-01', value: 56 }] }),
      // unresolvable direction: not counted
      area({
        id: 'e',
        target_metric: UNREGISTERED,
        snapshots: [{ date: '2026-06-01', value: 50 }, { date: '2026-07-01', value: 56 }],
      }),
    ]);
    expect(counts).toEqual({ improving: 2, declining: 1, flat: 0, legible: 3 });
  });
});

describe('buildDevelopmentVerdict', () => {
  const withReadings = (id: string, from: number, to: number) =>
    area({ id, title: `Area ${id}`, snapshots: [{ date: '2026-06-01', value: from }, { date: '2026-07-01', value: to }] });

  it('states the count, names the lead area as a link, and reports movement', () => {
    const parts = buildDevelopmentVerdict({
      activeAreas: [withReadings('a', 50, 56), withReadings('b', 60, 52)],
      proposedCount: 0,
      suggestionCount: 0,
    });
    const text = verdictText(parts);
    expect(text).toContain('2 focus areas in progress.');
    expect(text).toContain('needs it most.');
    expect(text).toContain('1 moving, 1 sliding.');
    expect(parts.some((p) => p.href?.startsWith('#area-'))).toBe(true);
  });

  it('says direction is not legible rather than dropping the clause', () => {
    const parts = buildDevelopmentVerdict({
      activeAreas: [area({ snapshots: [{ date: '2026-07-01', value: 56 }] })],
      proposedCount: 0,
      suggestionCount: 0,
    });
    expect(verdictText(parts)).toContain('Not enough readings yet to call direction.');
    expect(verdictText(parts)).not.toContain('moving,');
  });

  it('omits the decisions clause at zero and links it when there is anything waiting', () => {
    expect(
      verdictText(buildDevelopmentVerdict({ activeAreas: [], proposedCount: 0, suggestionCount: 0 })),
    ).toBe('Nothing in progress yet.');

    const parts = buildDevelopmentVerdict({ activeAreas: [], proposedCount: 1, suggestionCount: 2 });
    expect(verdictText(parts)).toBe('Nothing in progress yet. 3 waiting on you.');
    expect(parts.find((p) => p.href === '#decisions')).toBeDefined();
  });

  it('singularizes one area', () => {
    const parts = buildDevelopmentVerdict({
      activeAreas: [withReadings('a', 50, 56)],
      proposedCount: 0,
      suggestionCount: 0,
    });
    expect(verdictText(parts)).toContain('1 focus area in progress.');
  });
});

describe('readingsLog', () => {
  it('is newest first, carries the player note, and leaves the first change blank', () => {
    const rows = readingsLog(
      [
        area({
          id: 'fa-1',
          title: 'Greens in regulation',
          snapshots: [{ date: '2026-06-01', value: 50 }],
          progressHistory: [
            { at: '2026-07-01T12:00:00Z', value: 56, note: 'Better contact off the turf.' },
          ],
        }),
      ],
      [area({ id: 'fa-2', title: 'Three footers', snapshots: [{ date: '2026-05-01', value: 70 }] })],
    );

    expect(rows.map((r) => r.day)).toEqual(['2026-07-01', '2026-06-01', '2026-05-01']);
    expect(rows[0]!.note).toBe('Better contact off the turf.');
    expect(rows[0]!.change).toBe(6);
    expect(rows[0]!.towardTarget).toBe(true);
    // An area's FIRST reading has no previous value: blank, never a zero that
    // would read as "no movement".
    expect(rows[1]!.change).toBeNull();
    expect(rows[1]!.towardTarget).toBeNull();
    expect(rows[2]!.completed).toBe(true);
  });

  it('marks a change away from the target as such', () => {
    const rows = readingsLog([
      area({ snapshots: [{ date: '2026-06-01', value: 56 }, { date: '2026-07-01', value: 51 }] }),
    ]);
    expect(rows[0]!.change).toBe(-5);
    expect(rows[0]!.towardTarget).toBe(false);
  });
});
