import { describe, it, expect } from 'vitest';
import {
  toneVsBenchmark,
  relativeTones,
  skewTone,
  buildVitalDelta,
  detailGridColClass,
  computeGainLeak,
} from './FairwayStatsCockpit';

// ── toneVsBenchmark (P921 #2 — DetailGrid tone vs a real PGA/team baseline) ───

describe('toneVsBenchmark', () => {
  it('reads good when meaningfully ahead of the benchmark (higher_better)', () => {
    expect(toneVsBenchmark(70, 60, 'higher_better')).toBe('good');
  });

  it('reads warn when meaningfully behind the benchmark (higher_better)', () => {
    expect(toneVsBenchmark(50, 60, 'higher_better')).toBe('warn');
  });

  it('reads neutral inside the dead zone (higher_better)', () => {
    expect(toneVsBenchmark(61, 60, 'higher_better')).toBe('neutral');
    expect(toneVsBenchmark(58, 60, 'higher_better')).toBe('neutral');
  });

  it('flips ahead/behind for lower_better metrics (e.g. proximity, miss bias)', () => {
    // Lower is better: a smaller value than the benchmark is 'good'.
    expect(toneVsBenchmark(10, 20, 'lower_better')).toBe('good');
    expect(toneVsBenchmark(30, 20, 'lower_better')).toBe('warn');
    expect(toneVsBenchmark(21, 20, 'lower_better')).toBe('neutral');
  });

  it('never fabricates a comparison — neutral when either input is missing', () => {
    expect(toneVsBenchmark(null, 60, 'higher_better')).toBe('neutral');
    expect(toneVsBenchmark(70, null, 'higher_better')).toBe('neutral');
    expect(toneVsBenchmark(null, null, 'higher_better')).toBe('neutral');
  });

  it('respects a custom deadzone', () => {
    expect(toneVsBenchmark(65, 60, 'higher_better', 10)).toBe('neutral');
    expect(toneVsBenchmark(71, 60, 'higher_better', 10)).toBe('good');
  });
});

// ── relativeTones (P921 #2 — GirByDistanceBoard self-referential read) ────────

describe('relativeTones', () => {
  it('flags the strongest band good and the weakest band warn when the spread is real', () => {
    const tones = relativeTones([40, 70, 55]);
    expect(tones).toEqual(['warn', 'good', 'neutral']);
  });

  it('stays all-neutral with fewer than 3 real values', () => {
    expect(relativeTones([40, 70])).toEqual(['neutral', 'neutral']);
    expect(relativeTones([40])).toEqual(['neutral']);
    expect(relativeTones([])).toEqual([]);
  });

  it('stays all-neutral when the spread is inside minGap (noise, not a trend)', () => {
    expect(relativeTones([50, 52, 54])).toEqual(['neutral', 'neutral', 'neutral']);
  });

  it('treats nulls as honest gaps, never fabricating a tone for missing data', () => {
    const tones = relativeTones([40, null, 70, 55]);
    expect(tones).toEqual(['warn', 'neutral', 'good', 'neutral']);
  });

  it('respects a custom minGap', () => {
    expect(relativeTones([50, 55, 60], 20)).toEqual(['neutral', 'neutral', 'neutral']);
    expect(relativeTones([50, 55, 60], 5)).toEqual(['warn', 'neutral', 'good']);
  });
});

// ── skewTone (P921 #2 — TeeMissByClub L/R symmetry read, no external baseline) ─

describe('skewTone', () => {
  it('warns when a share is meaningfully lopsided', () => {
    expect(skewTone(70)).toBe('warn');
    expect(skewTone(62)).toBe('warn');
  });

  it('reads neutral for a roughly even split', () => {
    expect(skewTone(50)).toBe('neutral');
    expect(skewTone(55)).toBe('neutral');
  });

  it('never reads good — a missed fairway is never a positive outcome', () => {
    expect(skewTone(0)).toBe('neutral');
    expect(skewTone(100)).toBe('warn');
  });

  it('is neutral (never fabricated) when the value is missing', () => {
    expect(skewTone(null)).toBe('neutral');
  });

  it('respects a custom threshold', () => {
    expect(skewTone(55, 70)).toBe('neutral');
    expect(skewTone(75, 70)).toBe('warn');
  });
});

// ── buildVitalDelta (#945 — routed through the canonical classifyTrendDelta) ──
// The direction/sign math here must be UNCHANGED after routing the
// improving/declining decision through `@/lib/coachhelm/trend`'s
// classifyTrendDelta — these lock in the exact same cockpit behavior
// ("green ▲ −7.0" for putts dropping) the issue cites as the desired rule.

describe('buildVitalDelta', () => {
  it('fewer putts (goodWhenLower) reads as an UP/green delta with the raw negative sign', () => {
    const delta = buildVitalDelta({
      current: 29,
      previous: 36,
      currentRounds: 5,
      previousRounds: 5,
      goodWhenLower: true,
      digits: 1,
    });
    expect(delta?.direction).toBe('up');
    expect(delta?.value).toBe(-7);
    expect(delta?.format?.(-7)).toBe('−7.0');
  });

  it('more putts (goodWhenLower) reads as a DOWN/amber delta', () => {
    const delta = buildVitalDelta({
      current: 36,
      previous: 29,
      currentRounds: 5,
      previousRounds: 5,
      goodWhenLower: true,
    });
    expect(delta?.direction).toBe('down');
    expect(delta?.value).toBe(7);
  });

  it('a higher fairway% (goodWhenLower false) reads as an UP/green delta', () => {
    const delta = buildVitalDelta({
      current: 65,
      previous: 55,
      currentRounds: 5,
      previousRounds: 5,
      percent: true,
    });
    expect(delta?.direction).toBe('up');
  });

  it('no change reads flat, never up or down', () => {
    const delta = buildVitalDelta({
      current: 30,
      previous: 30,
      currentRounds: 5,
      previousRounds: 5,
      goodWhenLower: true,
    });
    expect(delta?.direction).toBe('flat');
  });

  it('is honestly undefined (no fabricated delta) when either window has zero rounds', () => {
    expect(
      buildVitalDelta({ current: 30, previous: 32, currentRounds: 0, previousRounds: 5 }),
    ).toBeUndefined();
    expect(
      buildVitalDelta({ current: 30, previous: 32, currentRounds: 5, previousRounds: 0 }),
    ).toBeUndefined();
  });

  it('is honestly undefined when a value is null/non-finite', () => {
    expect(
      buildVitalDelta({ current: null, previous: 32, currentRounds: 5, previousRounds: 5 }),
    ).toBeUndefined();
  });
});

// ── computeGainLeak (audit W3 — "Biggest gain" mislabeling a negative SG value) ──
// Root cause: the SG tab's "Biggest gain"/"Biggest leak" callout used to pick
// purely by RANK (max/min across the 4 SG categories) and hard-coded the
// "gain"/green-leader treatment onto the max slot regardless of its actual
// sign — so a player below the Tour baseline in every category still saw
// "BIGGEST GAIN −0.15 · Approach" in green. `computeGainLeak` fixes this by
// classifying each slot against the real zero point (the Tour baseline).

describe('computeGainLeak', () => {
  it('pins the exact defect: the max of four NEGATIVE values is a loss, never a gain', () => {
    // All four SG categories below Tour — the strongest one (−0.10) used to
    // render as "Biggest gain −0.10 · Putting" in green. It is still a cost.
    const result = computeGainLeak([
      { label: 'SG: Off the Tee', value: -0.42 },
      { label: 'SG: Approach', value: -0.55 },
      { label: 'SG: Around the Green', value: -0.31 },
      { label: 'SG: Putting', value: -0.1 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.best.label).toBe('SG: Putting');
    expect(result!.best.value).toBe(-0.1);
    // The label/tone-driving flag must say this is NOT a gain — it's negative.
    expect(result!.bestIsGain).toBe(false);
    expect(result!.worst.label).toBe('SG: Approach');
    expect(result!.worstIsLeak).toBe(true);
  });

  it('symmetric case: the min of four POSITIVE values is a gain, never a leak', () => {
    const result = computeGainLeak([
      { label: 'SG: Off the Tee', value: 0.42 },
      { label: 'SG: Approach', value: 0.55 },
      { label: 'SG: Around the Green', value: 0.31 },
      { label: 'SG: Putting', value: 0.1 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.worst.label).toBe('SG: Putting');
    expect(result!.worst.value).toBe(0.1);
    // Smallest gain is still a GAIN — must never be flagged as a leak.
    expect(result!.worstIsLeak).toBe(false);
    expect(result!.best.label).toBe('SG: Approach');
    expect(result!.bestIsGain).toBe(true);
  });

  it('the normal mixed case: a real gain and a real leak both classify correctly', () => {
    const result = computeGainLeak([
      { label: 'SG: Off the Tee', value: 0.3 },
      { label: 'SG: Approach', value: -0.6 },
      { label: 'SG: Around the Green', value: 0.05 },
      { label: 'SG: Putting', value: -0.1 },
    ]);
    expect(result).toEqual({
      best: { label: 'SG: Off the Tee', value: 0.3 },
      worst: { label: 'SG: Approach', value: -0.6 },
      bestIsGain: true,
      worstIsLeak: true,
    });
  });

  it('needs at least 2 distinct-label values to compare', () => {
    expect(computeGainLeak([])).toBeNull();
    expect(computeGainLeak([{ label: 'SG: Putting', value: 0.4 }])).toBeNull();
    expect(
      computeGainLeak([
        { label: 'SG: Putting', value: 0.4 },
        { label: 'SG: Putting', value: 0.4 },
      ]),
    ).toBeNull();
  });
});

// ── detailGridColClass (bug #949 #2 — Round scoring "74.8" / "Avg to par" overlap) ─

describe('detailGridColClass', () => {
  it('defers the 4-col jump past the `lg` breakpoint every columns=4 caller is nested at', () => {
    // Every columns=4 DetailGrid (Round scoring, Efficiency-from-lie, Putting
    // efficiency, Personal bests) lives inside a `grid-cols-1 lg:grid-cols-2`
    // wrapper. If this ever regresses back to `lg:grid-cols-4`, the 4-col grid
    // jumps at the SAME breakpoint the wrapper halves the row's width, cutting
    // each cell's real width roughly in half exactly when it needs the most
    // room — the "74.8" / "Avg to par" overlap this locks against.
    const cls = detailGridColClass(4);
    expect(cls).not.toContain('lg:grid-cols-4');
    expect(cls).toContain('sm:grid-cols-2');
    expect(cls).toContain('2xl:grid-cols-4');
  });

  it('columns=3 stays a single sm breakpoint (no nested-wrapper doubling risk)', () => {
    expect(detailGridColClass(3)).toBe('sm:grid-cols-3');
  });

  it('columns=2 (default) is the plain 2-up recipe', () => {
    expect(detailGridColClass(2)).toBe('sm:grid-cols-2');
  });
});
