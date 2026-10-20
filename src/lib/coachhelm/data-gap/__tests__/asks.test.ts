import { describe, expect, it } from 'vitest';
import {
  askForShot,
  askProgress,
  bandLabel,
  countTagged,
  counterText,
  holeGapFacts,
  isAskOpen,
  matchesGap,
  needsAsk,
  openAsks,
  parseDataGapAsk,
  storedGapFacts,
  type DataGapAsk,
  type GapShotFacts,
  type StoredPuttRow,
} from '../asks';

// The exact shape Slice 2 writes (`dataGapFor` / `shotFilterFor`, root-cause.ts).
const putt510Gap = {
  field: 'miss_direction',
  shot_filter: { shot_type: 'putting', first_putt: true, distance_feet: [5, 10], holed: false },
  target_count: 10,
  have_count: 4,
  prompt: 'Which side? Short · Long · High · Low',
};

function row(gap: unknown, extra: Record<string, unknown> = {}) {
  return { id: 'read-1', title: 'Putts from 5–10 ft', evidence: { data_gap: gap, window_end: '2026-10-01T00:00:00Z', ...extra } };
}

function shot(over: Partial<GapShotFacts> = {}): GapShotFacts {
  return {
    shot_type: 'putting',
    is_penalty: false,
    first_putt: true,
    distance_feet: 7,
    holed: false,
    has_miss_direction: false,
    ...over,
  };
}

function ask(over: Partial<DataGapAsk> = {}): DataGapAsk {
  const parsed = parseDataGapAsk(row(putt510Gap))!;
  return { ...parsed, taggedSince: 0, ...over };
}

describe('parseDataGapAsk', () => {
  it('reads the putt miss-direction gap Slice 2 writes', () => {
    expect(parseDataGapAsk(row(putt510Gap))).toEqual({
      readId: 'read-1',
      readTitle: 'Putts from 5–10 ft',
      field: 'miss_direction',
      filter: { shot_type: 'putting', first_putt: true, distance_feet: [5, 10], holed: false },
      targetCount: 10,
      haveCount: 4,
      bandLabel: '5–10 ft',
      windowEnd: '2026-10-01',
    });
  });

  it('keeps an open-ended band', () => {
    const open = { ...putt510Gap, shot_filter: { ...putt510Gap.shot_filter, distance_feet: [25, null] } };
    expect(parseDataGapAsk(row(open))?.bandLabel).toBe('25+ ft');
  });

  it('asks nothing for gaps this slice does not cover', () => {
    // The leave distance (Slice 2's other putt field), an approach gap, a tee gap.
    expect(parseDataGapAsk(row({ ...putt510Gap, field: 'distance_to_hole_after' }))).toBeNull();
    expect(
      parseDataGapAsk(row({ ...putt510Gap, shot_filter: { shot_type: 'approach', band: '50_125ft', found_green: false } })),
    ).toBeNull();
    expect(parseDataGapAsk(row({ ...putt510Gap, shot_filter: { shot_type: 'tee', par: [4, 5] } }))).toBeNull();
  });

  it('fails closed on a malformed row', () => {
    expect(parseDataGapAsk({ id: 'x', title: 't', evidence: null })).toBeNull();
    expect(parseDataGapAsk(row(null))).toBeNull();
    expect(parseDataGapAsk(row({ ...putt510Gap, target_count: 0 }))).toBeNull();
    expect(parseDataGapAsk(row({ ...putt510Gap, target_count: 2.5 }))).toBeNull();
    expect(parseDataGapAsk(row({ ...putt510Gap, have_count: -1 }))).toBeNull();
    expect(
      parseDataGapAsk(row({ ...putt510Gap, shot_filter: { ...putt510Gap.shot_filter, distance_feet: [10, 5] } })),
    ).toBeNull();
    expect(
      parseDataGapAsk(row({ ...putt510Gap, shot_filter: { ...putt510Gap.shot_filter, holed: true } })),
    ).toBeNull();
  });

  it('a read without a window has a null windowEnd', () => {
    expect(parseDataGapAsk({ id: 'r', title: null, evidence: { data_gap: putt510Gap } })?.windowEnd).toBeNull();
  });
});

describe('matchesGap', () => {
  const f = ask().filter;

  it('matches a missed first putt inside [min, max)', () => {
    expect(matchesGap(shot({ distance_feet: 5 }), f)).toBe(true);
    expect(matchesGap(shot({ distance_feet: 9.9 }), f)).toBe(true);
  });

  it('excludes the band edges the engine excludes', () => {
    expect(matchesGap(shot({ distance_feet: 4.9 }), f)).toBe(false);
    expect(matchesGap(shot({ distance_feet: 10 }), f)).toBe(false);
  });

  it('excludes holed putts, later putts, non-putts, penalties and unknown distances', () => {
    expect(matchesGap(shot({ holed: true }), f)).toBe(false);
    expect(matchesGap(shot({ first_putt: false }), f)).toBe(false);
    expect(matchesGap(shot({ shot_type: 'around_green' }), f)).toBe(false);
    expect(matchesGap(shot({ is_penalty: true }), f)).toBe(false);
    expect(matchesGap(shot({ distance_feet: null }), f)).toBe(false);
  });

  it('an open-ended band has no top', () => {
    expect(matchesGap(shot({ distance_feet: 60 }), { ...f, distance_feet: [25, null] })).toBe(true);
  });

  it('fails closed on a filter key it does not know', () => {
    expect(matchesGap(shot(), { ...f, putt_slope: 'downhill' })).toBe(false);
  });

  it('needsAsk only when the field is still empty', () => {
    expect(needsAsk(shot(), ask())).toBe(true);
    expect(needsAsk(shot({ has_miss_direction: true }), ask())).toBe(false);
  });
});

describe('first putt per hole', () => {
  it('marks the first non-penalty putt only', () => {
    const facts = holeGapFacts(
      [
        { t: 'approach', p: false },
        { t: 'putting', p: true },
        { t: 'putting', p: false },
        { t: 'putting', p: false },
      ],
      (s) => ({ shot_type: s.t, is_penalty: s.p, distance_feet: 7, holed: false, has_miss_direction: false }),
    );
    expect(facts.map((x) => x.first_putt)).toEqual([false, false, true, false]);
  });

  it('stored rows: groups by hole, orders by shot number, converts yards to feet', () => {
    const base: Omit<StoredPuttRow, 'hole_number' | 'shot_number'> = {
      round_id: 'r1',
      shot_type: 'putting',
      is_penalty: false,
      distance_to_hole_before: 7,
      distance_unit_before: 'feet',
      result: 'green',
      putt_made: false,
      miss_direction: null,
    };
    const facts = storedGapFacts([
      { ...base, hole_number: 1, shot_number: 4, result: 'hole', putt_made: true, distance_to_hole_before: 1 },
      { ...base, hole_number: 1, shot_number: 3, miss_direction: 'short' },
      { ...base, hole_number: 2, shot_number: 2, distance_to_hole_before: 2, distance_unit_before: 'yards' },
      { ...base, hole_number: 3, shot_number: 2, putt_made: true, result: 'green' },
    ]);
    const first = facts.filter((x) => x.first_putt);
    expect(first).toHaveLength(3);
    expect(first.find((x) => x.distance_feet === 6)).toBeTruthy(); // 2 yd
    // putt_made true counts as holed even when result is not 'hole'.
    expect(facts.filter((x) => x.holed)).toHaveLength(2);
    expect(countTagged(facts, ask())).toBe(1);
  });
});

describe('progress and the counter', () => {
  it('counts tags since the read plus taps this session', () => {
    const a = ask({ taggedSince: 3 });
    expect(askProgress(a, 1)).toBe(4);
    expect(counterText(a, 1)).toBe('4 of 10 for your 5–10 ft putt read');
  });

  it('closes at the target', () => {
    expect(isAskOpen(ask({ taggedSince: 9 }), 0)).toBe(true);
    expect(isAskOpen(ask({ taggedSince: 9 }), 1)).toBe(false);
    expect(isAskOpen(ask({ taggedSince: 12 }), 0)).toBe(false);
  });

  it('openAsks drops met asks and keeps one per band, the one needing most', () => {
    const met = ask({ readId: 'met', taggedSince: 10 });
    const a = ask({ readId: 'a', targetCount: 6, taggedSince: 1 });
    const b = ask({ readId: 'b', targetCount: 12, taggedSince: 2 });
    const other = ask({ readId: 'c', filter: { ...ask().filter, distance_feet: [3, 5] }, bandLabel: bandLabel([3, 5]) });
    expect(openAsks([met, a, b, other]).map((x) => x.readId)).toEqual(['b', 'c']);
  });

  it('askForShot skips an ask this session already filled', () => {
    const a = ask({ readId: 'a', taggedSince: 9 });
    expect(askForShot([a], shot(), {})?.readId).toBe('a');
    expect(askForShot([a], shot(), { a: 1 })).toBeNull();
    expect(askForShot([a], shot({ distance_feet: 20 }), {})).toBeNull();
  });
});
