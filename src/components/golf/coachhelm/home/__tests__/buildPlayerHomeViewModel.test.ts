import { describe, expect, it } from 'vitest';
import {
  buildFocusAreaPriorities,
  buildPlayerLedger,
  buildPlayerStandingTrack,
  buildPredictionVerdict,
  formatAreaName,
  formatPredictionHero,
  pickBestWorstStandingIds,
  sgToTrackPct,
} from '../buildPlayerHomeViewModel';

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

describe('sgToTrackPct / buildPlayerStandingTrack', () => {
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

  it('returns undefined (no track) when sgTotal is not finite', () => {
    expect(buildPlayerStandingTrack(null, 0.2)).toBeUndefined();
  });

  it('builds You + Team + Tour benchmarks when both are finite', () => {
    const track = buildPlayerStandingTrack(0.5, -0.2);
    expect(track?.subjectLabel).toBe('You');
    expect(track?.pct).toBe(sgToTrackPct(0.5));
    expect(track?.benchmarks).toEqual([
      { label: 'Team', pct: sgToTrackPct(-0.2) },
      { label: 'Tour', pct: 50, emphasis: true },
    ]);
  });

  it('omits the Team benchmark when teamAvg is not finite', () => {
    const track = buildPlayerStandingTrack(0.5, null);
    expect(track?.benchmarks).toEqual([{ label: 'Tour', pct: 50, emphasis: true }]);
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
  it('reads the prediction + normalized 0..1 confidence + top focus', () => {
    expect(buildPredictionVerdict(74.2, 0.68, 'Putting')).toBe(
      'Predicted to shoot 74.2 at 68% confidence. Top focus: putting.',
    );
  });
  it('accepts a 0..100 confidence unchanged', () => {
    expect(buildPredictionVerdict(74.2, 68, null)).toBe('Predicted to shoot 74.2 at 68% confidence.');
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
