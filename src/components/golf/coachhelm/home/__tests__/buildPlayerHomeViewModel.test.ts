import { describe, expect, it } from 'vitest';
import {
  buildFocusAreaPriorities,
  buildPlayerLedger,
  buildPlayerStandingBars,
  buildPredictionVerdict,
  buildStandingPreviewRows,
  buildThemeMagnitudeBars,
  classifyTrendSignal,
  formatAreaName,
  formatPredictionHero,
  genomeRadarPolygonPoints,
  genomeRadarSpokes,
  pickBestWorstStandingIds,
  pickStrongestWeakestAxis,
  sgToTrackPct,
  summarizeThemeCauseCounts,
} from '../buildPlayerHomeViewModel';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

describe('formatAreaName', () => {
  it('title-cases a snake_case area', () => {
    expect(formatAreaName('short_putts')).toBe('Short Putts');
  });
  it('leaves an already-humanized label alone', () => {
    expect(formatAreaName('Mid-Long (160-190) Shots')).toBe('Mid-Long (160-190) Shots');
  });
  it('returns empty for empty input', () => {
    expect(formatAreaName('')).toBe('');
  });
});

describe('buildPlayerLedger', () => {
  it('formats every field when present', () => {
    expect(
      buildPlayerLedger({ roundsAnalyzed: 12, fairwayPct: 61.4, girPct: 55.2, puttsPerRound: 29.3 }),
    ).toEqual([
      { label: 'Rounds', value: '12' },
      { label: 'Fairways', value: '61%' },
      { label: 'Greens', value: '55%' },
      { label: 'Putts / rd', value: '29.3' },
    ]);
  });

  it('honestly em-dashes null/undefined fields', () => {
    expect(
      buildPlayerLedger({ roundsAnalyzed: null, fairwayPct: undefined, girPct: NaN, puttsPerRound: null }),
    ).toEqual([
      { label: 'Rounds', value: '—' },
      { label: 'Fairways', value: '—' },
      { label: 'Greens', value: '—' },
      { label: 'Putts / rd', value: '—' },
    ]);
  });
});

describe('buildFocusAreaPriorities', () => {
  it('ranks the top 3 by absolute strokesGained, formats the title', () => {
    const out = buildFocusAreaPriorities([
      { area: 'short_putts', strokesGained: -0.4 },
      { area: 'driving_accuracy', strokesGained: -1.2 },
      { area: 'approach_proximity', strokesGained: -0.9 },
      { area: 'scrambling', strokesGained: -0.1 },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ rank: 1, title: 'Driving Accuracy', value: '−1.20' });
    expect(out[1]?.title).toBe('Approach Proximity');
    expect(out[2]?.title).toBe('Short Putts');
  });

  it('drops zero/null-impact rows and honors a custom max', () => {
    const out = buildFocusAreaPriorities(
      [
        { area: 'a', strokesGained: 0 },
        { area: 'b', strokesGained: null },
        { area: 'c', strokesGained: -2 },
        { area: 'd', strokesGained: -1 },
      ],
      1,
    );
    expect(out).toEqual([{ rank: 1, title: 'C', value: '−2.00' }]);
  });

  it('prefers the native value+unit display when present', () => {
    const out = buildFocusAreaPriorities([
      { area: 'proximity', strokesGained: -5, value: 24.3, unit: 'yd from target' },
    ]);
    expect(out).toEqual([{ rank: 1, title: 'Proximity', value: '24.3' }]);
  });
});

describe('sgToTrackPct', () => {
  it('centers a null value at 50', () => {
    expect(sgToTrackPct(null)).toBe(50);
    expect(sgToTrackPct(undefined)).toBe(50);
  });
  it('clamps to the rail bounds', () => {
    expect(sgToTrackPct(10)).toBe(100);
    expect(sgToTrackPct(-10)).toBe(0);
  });
  it('maps 0 SG to the rail center', () => {
    expect(sgToTrackPct(0)).toBe(50);
  });
});

/**
 * buildPlayerStandingBars — replaced `buildPlayerStandingTrack` (2026-09-10,
 * the dot-on-a-rail `StandingTrack` removal). Passes the FULL `sg_total` row
 * through to `StandingBars`, which derives its own cold-start gate — unlike
 * the old builder, which drew a Team marker whenever `team_avg` wasn't null,
 * with no `team_n` check at all.
 */
describe('buildPlayerStandingBars', () => {
  function standingRow(overrides: Partial<PlayerStanding> = {}): PlayerStanding {
    return {
      player_id: 'p1',
      metric_id: 'sg_total',
      player_value: 0.5,
      team_avg: -0.2,
      team_n: 8,
      team_pct: 60,
      level_avg: null,
      level_n: 0,
      level_pct: null,
      pga_value: 0,
      pga_delta: 0.5,
      computed_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('returns undefined when there is no row, or player_value is not finite', () => {
    expect(buildPlayerStandingBars(null)).toBeUndefined();
    expect(buildPlayerStandingBars(undefined)).toBeUndefined();
  });

  it('carries the full sg_total row through, filling direction/unit/scale from metric-config', () => {
    const out = buildPlayerStandingBars(standingRow());
    expect(out).toMatchObject({
      metric_id: 'sg_total',
      metric_label: 'SG: Total',
      player_value: 0.5,
      team_avg: -0.2,
      team_n: 8,
      team_pct: 60,
      pga_value: 0,
      direction: 'higher_better',
      unit: 'strokes',
      scale: { min: -2, max: 2 },
    });
  });

  it('passes team_n through untouched (the cold-start fix) — a 2-teammate cohort is not gated here, StandingBars gates it', () => {
    const out = buildPlayerStandingBars(standingRow({ team_n: 2 }));
    expect(out?.team_n).toBe(2);
    expect(out?.team_avg).toBe(-0.2);
  });

  it('carries pga_omitted / is_womens through when the row sets them', () => {
    const out = buildPlayerStandingBars(standingRow({ pga_omitted: true, is_womens: true }));
    expect(out?.pga_omitted).toBe(true);
    expect(out?.is_womens).toBe(true);
  });
});

describe('formatPredictionHero', () => {
  it('honest em-dash with no unit when predictedValue is not finite', () => {
    expect(formatPredictionHero(null)).toEqual({ value: '—' });
  });
  it('formats a finite value with a humanized metric unit', () => {
    expect(formatPredictionHero(74.234, 'score_to_par')).toEqual({ value: '74.2', unit: 'score to par' });
  });
  it('falls back to "predicted score" when metric is omitted', () => {
    expect(formatPredictionHero(72)).toEqual({ value: '72.0', unit: 'predicted score' });
  });
});

describe('buildPredictionVerdict', () => {
  it('honest awaiting sentence with no prediction and no focus', () => {
    expect(buildPredictionVerdict(null, null, null)).toBe(
      'Your next-round prediction fills in once CoachHelm has enough tracked rounds.',
    );
  });
  it('honest awaiting sentence with no prediction but a top focus', () => {
    expect(buildPredictionVerdict(undefined, null, 'Putting')).toBe(
      'Your next-round prediction fills in with more tracked rounds. Top focus: putting.',
    );
  });
  it('states the interval and attributes the percentage to it, not to the point estimate', () => {
    expect(buildPredictionVerdict(74.2, 0.68, 'Putting', { low: 72, high: 77 })).toBe(
      'Predicted 72.0\u201377.0 (68% of predictions like this land in that range). Top focus: putting.',
    );
  });
  it('accepts a 0..100 confidence unchanged', () => {
    expect(buildPredictionVerdict(74.2, 68, null, { low: 72, high: 77 })).toBe(
      'Predicted 72.0\u201377.0 (68% of predictions like this land in that range).',
    );
  });
  it('falls back to a track-record framing when no interval is available', () => {
    expect(buildPredictionVerdict(74.2, 0.68, 'Putting')).toBe(
      'Predicted to shoot 74.2 \u2014 predictions like this have been accurate about 68% of the time. Top focus: putting.',
    );
  });
  it('never states a bare confidence next to the point estimate', () => {
    for (const sentence of [
      buildPredictionVerdict(74.2, 0.68, null, { low: 72, high: 77 }),
      buildPredictionVerdict(74.2, 0.68, null),
    ]) {
      expect(sentence).not.toMatch(/at \d+% confidence/);
    }
  });
  it('drops the confidence clause entirely when confidence is unknown', () => {
    expect(buildPredictionVerdict(74.2, null, null, { low: 72, high: 77 })).toBe(
      'Predicted 72.0\u201377.0.',
    );
    expect(buildPredictionVerdict(74.2, null, null)).toBe('Predicted to shoot 74.2.');
  });
});

describe('pickBestWorstStandingIds', () => {
  it('picks the highest and lowest team_pct', () => {
    expect(
      pickBestWorstStandingIds({
        sg_putting: { team_pct: 82 },
        sg_ott: { team_pct: 40 },
        sg_approach: { team_pct: 15 },
      }),
    ).toEqual({ bestId: 'sg_putting', worstId: 'sg_approach' });
  });

  it('ignores entries with a null/missing team_pct', () => {
    expect(
      pickBestWorstStandingIds({
        sg_putting: { team_pct: null },
        sg_ott: undefined,
        sg_approach: { team_pct: 55 },
      }),
    ).toEqual({ bestId: 'sg_approach', worstId: 'sg_approach' });
  });

  it('returns nulls when nothing has a finite team_pct', () => {
    expect(pickBestWorstStandingIds({})).toEqual({ bestId: null, worstId: null });
  });
});

describe('buildStandingPreviewRows', () => {
  it('returns every entry, sorted strongest-first, when there are max or fewer', () => {
    expect(
      buildStandingPreviewRows({ sg_putting: { team_pct: 82 }, sg_ott: { team_pct: 40 } }, 3),
    ).toEqual([
      { id: 'sg_putting', pct: 82 },
      { id: 'sg_ott', pct: 40 },
    ]);
  });

  it('keeps the strongest (max-1) plus the single weakest so the leak the sentence names is always visible', () => {
    const rows = buildStandingPreviewRows(
      {
        sg_putting: { team_pct: 90 },
        sg_ott: { team_pct: 70 },
        sg_approach: { team_pct: 50 },
        sg_around_green: { team_pct: 10 },
      },
      3,
    );
    expect(rows).toEqual([
      { id: 'sg_putting', pct: 90 },
      { id: 'sg_ott', pct: 70 },
      { id: 'sg_around_green', pct: 10 },
    ]);
  });

  it('does not duplicate the weakest row when it is already among the strongest (max-1)', () => {
    const rows = buildStandingPreviewRows({ sg_putting: { team_pct: 90 } }, 3);
    expect(rows).toEqual([{ id: 'sg_putting', pct: 90 }]);
  });

  it('ignores entries with a null/missing team_pct', () => {
    expect(buildStandingPreviewRows({ sg_putting: { team_pct: null }, sg_ott: undefined }, 3)).toEqual([]);
  });

  it('returns empty for an empty input', () => {
    expect(buildStandingPreviewRows({}, 3)).toEqual([]);
  });
});

describe('genomeRadarSpokes', () => {
  it('returns empty for a zero axis count', () => {
    expect(genomeRadarSpokes(0)).toEqual([]);
  });

  it('places 4 evenly-spaced spokes starting at 12 o\'clock, all sharing the same center', () => {
    const spokes = genomeRadarSpokes(4, 64);
    expect(spokes).toHaveLength(4);
    for (const spoke of spokes) {
      expect(spoke.x1).toBe(32);
      expect(spoke.y1).toBe(32);
    }
    // First spoke points straight up (12 o'clock): x2 == cx, y2 < cy.
    expect(spokes[0]?.x2).toBe(32);
    expect(spokes[0]?.y2).toBeLessThan(32);
    // Second spoke (quarter turn clockwise) points straight right: x2 > cx, y2 == cy.
    expect(spokes[1]?.x2).toBeGreaterThan(32);
    expect(Math.round(spokes[1]?.y2 ?? -1)).toBe(32);
  });
});

describe('genomeRadarPolygonPoints', () => {
  it('returns an empty string for zero axes or a non-positive max', () => {
    expect(genomeRadarPolygonPoints([], 64, 100)).toBe('');
    expect(genomeRadarPolygonPoints([{ value: 50 }], 64, 0)).toBe('');
  });

  it('collapses a zero-value axis to the exact center', () => {
    const points = genomeRadarPolygonPoints([{ value: 0 }], 64, 100);
    expect(points).toBe('32,32');
  });

  it('places a full-value single axis at the top of the rail (12 o\'clock)', () => {
    const points = genomeRadarPolygonPoints([{ value: 100 }], 64, 100);
    const [x, y] = points.split(',').map(Number);
    expect(x).toBe(32);
    expect(y).toBeLessThan(32);
  });

  it('clamps out-of-range values into [0, maxValue] instead of drawing outside the rail', () => {
    const overMax = genomeRadarPolygonPoints([{ value: 500 }], 64, 100);
    const atMax = genomeRadarPolygonPoints([{ value: 100 }], 64, 100);
    expect(overMax).toBe(atMax);
  });

  it('treats a non-finite value as 0 (center), never a fabricated position', () => {
    expect(genomeRadarPolygonPoints([{ value: NaN }], 64, 100)).toBe('32,32');
  });
});

describe('pickStrongestWeakestAxis', () => {
  it('picks the highest and lowest value by label', () => {
    expect(
      pickStrongestWeakestAxis([
        { label: 'Putting', value: 82 },
        { label: 'Driving', value: 40 },
        { label: 'Approach', value: 15 },
      ]),
    ).toEqual({ strongest: 'Putting', weakest: 'Approach' });
  });

  it('ignores non-finite values', () => {
    expect(
      pickStrongestWeakestAxis([
        { label: 'Putting', value: NaN },
        { label: 'Driving', value: 55 },
      ]),
    ).toEqual({ strongest: 'Driving', weakest: 'Driving' });
  });

  it('returns nulls for an empty axis list', () => {
    expect(pickStrongestWeakestAxis([])).toEqual({ strongest: null, weakest: null });
  });
});

describe('buildThemeMagnitudeBars', () => {
  it('normalizes magnitudes to the largest, sorted biggest-first, with the biggest marked emphasis', () => {
    const bars = buildThemeMagnitudeBars([
      { displayLabel: 'Putting', themeStrokesPerRound: -0.2 },
      { displayLabel: 'Off the Tee', themeStrokesPerRound: -0.8 },
      { displayLabel: 'Scoring', themeStrokesPerRound: 0.4 },
    ]);
    expect(bars).toEqual([
      { label: 'Tee', heightPct: 100, emphasis: true },
      { label: 'Score', heightPct: 50, emphasis: false },
      { label: 'Putt', heightPct: 25, emphasis: false },
    ]);
  });

  it('falls back to a 6-char slice for an unrecognized label', () => {
    const bars = buildThemeMagnitudeBars([{ displayLabel: 'Something Unmapped', themeStrokesPerRound: -1 }]);
    expect(bars[0]?.label).toBe('Someth');
  });

  it('is honestly all-zero (never fabricated height) when every theme has zero magnitude', () => {
    const bars = buildThemeMagnitudeBars([{ displayLabel: 'Putting', themeStrokesPerRound: 0 }]);
    expect(bars).toEqual([{ label: 'Putt', heightPct: 0, emphasis: false }]);
  });

  it('caps to max and returns empty for an empty input', () => {
    expect(buildThemeMagnitudeBars([])).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => ({ displayLabel: `Theme ${i}`, themeStrokesPerRound: -(i + 1) }));
    expect(buildThemeMagnitudeBars(many, 3)).toHaveLength(3);
  });
});

describe('summarizeThemeCauseCounts', () => {
  it('sums causes by leak/strength state and ignores thin themes', () => {
    expect(
      summarizeThemeCauseCounts([
        { state: 'leak', causes: [1, 2] },
        { state: 'strength', causes: [1] },
        { state: 'thin', causes: [1, 2, 3] },
        { state: 'leak', causes: [] },
      ]),
    ).toEqual({ leakCount: 2, strengthCount: 1 });
  });

  it('returns zeros for an empty input', () => {
    expect(summarizeThemeCauseCounts([])).toEqual({ leakCount: 0, strengthCount: 0 });
  });
});

describe('classifyTrendSignal', () => {
  it('maps every known humanized MultiWindowAnalysis signal to a tone + label', () => {
    expect(classifyTrendSignal('Strong improving')).toMatchObject({ tone: 'hot', label: 'Improving' });
    expect(classifyTrendSignal('Short term spike')).toMatchObject({ tone: 'hot', label: 'Spiking' });
    expect(classifyTrendSignal('Strong declining')).toMatchObject({ tone: 'watch', label: 'Declining' });
    expect(classifyTrendSignal('Short term dip')).toMatchObject({ tone: 'watch', label: 'Dipping' });
    expect(classifyTrendSignal('Trajectory change')).toMatchObject({ tone: 'watch', label: 'Shifting' });
    expect(classifyTrendSignal('Mixed')).toMatchObject({ tone: 'quiet', label: 'Mixed signals' });
    expect(classifyTrendSignal('Stable')).toMatchObject({ tone: 'quiet', label: 'Stable' });
  });

  // Every chip must carry player-facing prose. The bento used to print the
  // humanized ENUM ("Strong declining") as the card body under a chip that
  // already said "Declining" — a raw signal name showing through as a
  // sentence (audit P-27). toMatchObject above allows the added field; this
  // asserts it is actually populated and is not just the label again.
  it('carries a real sentence for every signal, distinct from the label', () => {
    for (const signal of [
      'Strong improving',
      'Short term spike',
      'Strong declining',
      'Short term dip',
      'Trajectory change',
      'Mixed',
      'Stable',
    ]) {
      const chip = classifyTrendSignal(signal);
      expect(chip).not.toBeNull();
      expect(chip!.sentence.length).toBeGreaterThan(20);
      expect(chip!.sentence).not.toBe(chip!.label);
      expect(chip!.sentence.toLowerCase()).not.toBe(signal.toLowerCase());
    }
  });

  it('matches case-insensitively', () => {
    expect(classifyTrendSignal('stable')).toMatchObject({ tone: 'quiet', label: 'Stable' });
    expect(classifyTrendSignal('STRONG IMPROVING')).toMatchObject({ tone: 'hot', label: 'Improving' });
  });

  it('returns null for null/undefined/unrecognized input', () => {
    expect(classifyTrendSignal(null)).toBeNull();
    expect(classifyTrendSignal(undefined)).toBeNull();
    expect(classifyTrendSignal('')).toBeNull();
    expect(classifyTrendSignal('some unrelated sentence')).toBeNull();
  });
});
