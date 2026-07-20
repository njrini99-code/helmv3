import { describe, it, expect } from 'vitest';
import {
  biggestLeakArea,
  buildLedger,
  buildPriorities,
  formatSgSigned,
  sgToTrackPct,
  buildStandingTrack,
  buildVerdict,
} from '../buildStatsViewModel';

describe('biggestLeakArea', () => {
  it('picks putting given a fixture where sg_putting is the most negative category', () => {
    const rows = [
      { metricId: 'sg_ott', value: 0.1 },
      { metricId: 'sg_approach', value: -0.2 },
      { metricId: 'sg_around_green', value: 0.05 },
      { metricId: 'sg_putting', value: -0.8 },
    ];
    expect(biggestLeakArea(rows)).toBe('putting');
  });

  it('picks driving when sg_ott is the most negative category', () => {
    const rows = [
      { metricId: 'sg_ott', value: -1.1 },
      { metricId: 'sg_approach', value: -0.2 },
      { metricId: 'sg_around_green', value: 0.05 },
      { metricId: 'sg_putting', value: -0.4 },
    ];
    expect(biggestLeakArea(rows)).toBe('driving');
  });

  it('ignores non-SG metric ids', () => {
    const rows = [
      { metricId: 'gir_pct', value: -50 },
      { metricId: 'sg_approach', value: -0.3 },
    ];
    expect(biggestLeakArea(rows)).toBe('approach');
  });

  it('falls back to putting when every value is null/undefined (cold start)', () => {
    const rows = [
      { metricId: 'sg_ott', value: null },
      { metricId: 'sg_approach', value: undefined },
    ];
    expect(biggestLeakArea(rows)).toBe('putting');
  });

  it('falls back to putting on an empty fixture', () => {
    expect(biggestLeakArea([])).toBe('putting');
  });
});

describe('buildLedger', () => {
  it('extracts rounds/fairways/greens/putts with honest formatting', () => {
    const rows = buildLedger({ roundsPlayed: 12, fairwayPct: 61.4, girPct: 52.9, puttsPerRound: 29.3 });
    expect(rows).toEqual([
      { label: 'Rounds', value: '12' },
      { label: 'Fairways', value: '61%' },
      { label: 'Greens', value: '53%' },
      { label: 'Putts / rd', value: '29.3' },
    ]);
  });

  it('em-dashes null/undefined fields instead of fabricating zeros', () => {
    const rows = buildLedger({ roundsPlayed: 0, fairwayPct: null, girPct: undefined, puttsPerRound: null });
    expect(rows).toEqual([
      { label: 'Rounds', value: '0' },
      { label: 'Fairways', value: '—' },
      { label: 'Greens', value: '—' },
      { label: 'Putts / rd', value: '—' },
    ]);
  });
});

describe('buildPriorities', () => {
  it('ranks weaknesses by absolute stroke impact, numbered by order', () => {
    const items = buildPriorities([
      { label: 'Putting 5-10ft', strokeImpact: -0.3 },
      { label: 'Approach 150-175yd', strokeImpact: -0.9 },
      { label: 'Off the tee accuracy', strokeImpact: -0.5 },
    ]);
    expect(items).toEqual([
      { rank: 1, title: 'Approach 150-175yd', value: '−0.90' },
      { rank: 2, title: 'Off the tee accuracy', value: '−0.50' },
      { rank: 3, title: 'Putting 5-10ft', value: '−0.30' },
    ]);
  });

  it('caps at the requested max', () => {
    const items = buildPriorities(
      [
        { label: 'A', strokeImpact: -1 },
        { label: 'B', strokeImpact: -2 },
        { label: 'C', strokeImpact: -3 },
        { label: 'D', strokeImpact: -4 },
      ],
      2,
    );
    expect(items.map((i) => i.title)).toEqual(['D', 'C']);
  });

  it('drops null/undefined/zero-impact entries', () => {
    const items = buildPriorities([
      { label: 'Zero', strokeImpact: 0 },
      { label: 'Missing', strokeImpact: null },
      { label: 'Real', strokeImpact: -0.6 },
    ]);
    expect(items).toEqual([{ rank: 1, title: 'Real', value: '−0.60' }]);
  });
});

describe('formatSgSigned', () => {
  it('formats a positive value with a leading +', () => {
    expect(formatSgSigned(0.42)).toBe('+0.42');
  });
  it('formats a negative value with a minus sign', () => {
    expect(formatSgSigned(-0.31)).toBe('−0.31');
  });
  it('formats exactly zero as E', () => {
    expect(formatSgSigned(0)).toBe('E');
  });
  it('formats null/undefined as an em dash', () => {
    expect(formatSgSigned(null)).toBe('—');
    expect(formatSgSigned(undefined)).toBe('—');
  });
});

describe('sgToTrackPct', () => {
  it('anchors 0 SG at the rail center', () => {
    expect(sgToTrackPct(0)).toBe(50);
  });
  it('clamps a value beyond +halfRange to 100', () => {
    expect(sgToTrackPct(5, 2)).toBe(100);
  });
  it('clamps a value beyond -halfRange to 0', () => {
    expect(sgToTrackPct(-5, 2)).toBe(0);
  });
  it('defaults null to the center (no fabricated lean)', () => {
    expect(sgToTrackPct(null)).toBe(50);
  });
});

describe('buildStandingTrack', () => {
  it('returns undefined when sgTotal has no value yet', () => {
    expect(buildStandingTrack(null, 0.1)).toBeUndefined();
  });

  it('includes a Tour benchmark anchored at 50 and a Team benchmark when known', () => {
    const track = buildStandingTrack(0.5, 0.2);
    expect(track?.subjectLabel).toBe('You');
    expect(track?.benchmarks.find((b) => b.label === 'Tour')?.pct).toBe(sgToTrackPct(0));
    expect(track?.benchmarks.find((b) => b.label === 'Team')).toBeDefined();
  });

  it('omits the Team benchmark when team average is unknown', () => {
    const track = buildStandingTrack(0.5, null);
    expect(track?.benchmarks.find((b) => b.label === 'Team')).toBeUndefined();
  });

  it('labels the subject with the player\'s initials when a coach views a teammate', () => {
    const track = buildStandingTrack(0.5, 0.2, 'coach', 'Jordan Smith');
    expect(track?.subjectLabel).toBe('JS');
  });

  it('defaults to "You" for the self viewer context', () => {
    const track = buildStandingTrack(0.5, 0.2, 'self', 'Jordan Smith');
    expect(track?.subjectLabel).toBe('You');
  });
});

describe('buildVerdict', () => {
  it('reads a cold-start message when SG total is unknown', () => {
    expect(buildVerdict(null, null)).toMatch(/fills in/);
  });

  it('reads a gaining headline for a positive SG total', () => {
    expect(buildVerdict(0.6, null)).toBe('Gaining +0.60 strokes per round on the field.');
  });

  it('appends the leak label when known', () => {
    expect(buildVerdict(-0.4, 'Putting')).toBe(
      '−0.40 strokes per round vs the field. Leaking most in putting.',
    );
  });
});
