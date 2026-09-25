import { describe, expect, it } from 'vitest';
import {
  TRAITS,
  buildStrand,
  buildVerdict,
  formatAdvantage,
  formatValue,
  headToHead,
  isGhost,
  rankTraits,
  readLevel,
  readWord,
  readTierWord,
  summarize,
  type StrandStandingInput,
} from '../strand-model';

function row(metric_id: string, over: Partial<StrandStandingInput> = {}): StrandStandingInput {
  return {
    metric_id,
    player_value: 0,
    team_avg: null,
    team_n: 8,
    team_pct: 50,
    pga_value: null,
    ...over,
  };
}

const SOLID = { roundsOnFile: 24, rounds90: 12 };

describe('buildStrand', () => {
  it('keeps every trait in strand order, with unmeasured traits as gaps', () => {
    const strand = buildStrand([row('gir_pct', { player_value: 60, team_avg: 55, pga_value: 67 })], SOLID);
    expect(strand.map((t) => t.id)).toEqual(TRAITS.map((t) => t.id));
    const sg = strand.find((t) => t.id === 'sg_ott')!;
    expect(sg.value).toBeNull();
    expect(sg.team.missingReason).toBe('Not measured yet');
  });

  it('signs the advantage so + always means better, for lower-is-better metrics too', () => {
    const strand = buildStrand(
      [
        row('gir_pct', { player_value: 60, team_avg: 55, pga_value: 67 }),
        row('penalty_rate_per_round', { player_value: 0.5, team_avg: 1.0, pga_value: 0.3 }),
      ],
      SOLID,
    );
    const gir = strand.find((t) => t.id === 'gir_pct')!;
    expect(gir.team.advantage).toBeCloseTo(5);
    expect(gir.tour.advantage).toBeCloseTo(-7);
    const pen = strand.find((t) => t.id === 'penalty_rate_per_round')!;
    // Fewer penalties than the team is better.
    expect(pen.team.advantage).toBeCloseTo(0.5);
    expect(pen.tour.advantage).toBeCloseTo(-0.2);
  });

  it('clamps magnitude to the display range', () => {
    const strand = buildStrand([row('sg_ott', { player_value: 9, team_avg: 0 })], SOLID);
    expect(strand.find((t) => t.id === 'sg_ott')!.team.magnitude).toBe(1);
  });

  it('withholds the Tour comparison when the loader omitted it, with the reason in words', () => {
    const strand = buildStrand(
      [
        row('approach_proximity_125_175ft', {
          player_value: 30,
          team_avg: 32,
          pga_value: 27,
          pga_omitted: true,
          pga_omitted_reason: 'basis_mismatch',
        }),
      ],
      SOLID,
    );
    const t = strand.find((x) => x.id === 'approach_proximity_125_175ft')!;
    expect(t.tour.magnitude).toBeNull();
    expect(t.tour.missingReason).toBe('Not comparable to Tour yet');
    expect(t.team.magnitude).not.toBeNull();
  });

  it('labels the Tour line LPGA for a women’s anchor', () => {
    const strand = buildStrand([row('gir_pct', { player_value: 60, team_avg: 55, pga_value: 62, is_womens: true })], SOLID);
    expect(strand.find((t) => t.id === 'gir_pct')!.tourLabel).toBe('LPGA');
  });

  it('marks a thin team baseline and hides its percentile', () => {
    const strand = buildStrand([row('gir_pct', { player_value: 60, team_avg: 55, team_n: 3, team_pct: 90 })], SOLID);
    const gir = strand.find((t) => t.id === 'gir_pct')!;
    expect(gir.team.thin).toBe(true);
    expect(gir.teamPercentile).toBeNull();
    expect(isGhost(gir, 'team')).toBe(true);
  });

  it('uses the 90-day sample for pressure traits and rounds on file elsewhere', () => {
    const strand = buildStrand(
      [row('opening_hole_delta', { player_value: 0.2, team_avg: 0.3 }), row('gir_pct', { player_value: 60, team_avg: 55 })],
      { roundsOnFile: 12, rounds90: 6 },
    );
    expect(strand.find((t) => t.id === 'opening_hole_delta')!.n).toBe(6);
    expect(strand.find((t) => t.id === 'gir_pct')!.n).toBe(12);
    expect(strand.find((t) => t.id === 'approach_proximity_50_125ft')!.n).toBeNull();
  });
});

describe('read words', () => {
  it('never shows a percentage, only a word', () => {
    expect(readWord(4)).toBe('Thin read, n=4');
    expect(readWord(12)).toBe('Early read');
    expect(readWord(24)).toBe('Solid read');
    expect(readWord(null)).toBe('Thin read');
    expect(readTierWord(4)).toBe('Thin read');
    expect(readLevel(4)).toBe('thin');
    expect(readLevel(14)).toBe('solid');
  });

  it('ghosts every trait on a thin read', () => {
    const strand = buildStrand([row('gir_pct', { player_value: 60, team_avg: 55 })], { roundsOnFile: 4, rounds90: 4 });
    expect(isGhost(strand.find((t) => t.id === 'gir_pct')!, 'team')).toBe(true);
  });
});

describe('formatting', () => {
  it('uses a real minus sign and a leading plus', () => {
    expect(formatAdvantage('strokes_round', -0.5)).toBe('−0.50');
    expect(formatAdvantage('percent', 5)).toBe('+5.0');
    expect(formatValue('percent', 61.234)).toBe('61.2%');
    expect(formatValue('feet', 21.84)).toBe('21.8 ft');
  });
});

describe('ranking and verdict', () => {
  const strand = buildStrand(
    [
      row('gir_pct', { player_value: 65, team_avg: 55 }),
      row('putts_made_3_5ft_pct', { player_value: 80, team_avg: 90 }),
      row('scoring_par_4', { player_value: 4.3, team_avg: 4.4 }),
    ],
    SOLID,
  );

  it('ranks the biggest edge first and the biggest gap last', () => {
    const ranked = rankTraits(strand, 'team').map((t) => t.id);
    expect(ranked[0]).toBe('gir_pct');
    expect(ranked[ranked.length - 1]).toBe('putts_made_3_5ft_pct');
  });

  it('summarises and writes a one-sentence verdict from the strand only', () => {
    const s = summarize(strand, 'team');
    expect(s).toMatchObject({ comparable: 3, ahead: 2, behind: 1 });
    const v = buildVerdict('Owen', strand, 'team')!;
    expect(v).toMatch(/^Owen is ahead of the team on 2 of 3 skills;/);
    expect(v).toContain('greens in regulation (+10.0 pts)');
    expect(v).toContain('putts 3–5 ft (−10.0 pts)');
    expect(v.endsWith('.')).toBe(true);
  });

  it('says nothing when nothing is comparable', () => {
    expect(buildVerdict('Audit', buildStrand([], { roundsOnFile: 0, rounds90: 0 }), 'team')).toBeNull();
  });
});

describe('headToHead', () => {
  it('compares only skills both players have, + meaning player A is better', () => {
    const a = buildStrand([row('gir_pct', { player_value: 65 }), row('penalty_rate_per_round', { player_value: 0.4 })], SOLID);
    const b = buildStrand([row('gir_pct', { player_value: 55 }), row('penalty_rate_per_round', { player_value: 1.4 })], SOLID);
    const h = headToHead(a, b);
    expect(h.map((x) => x.id).sort()).toEqual(['gir_pct', 'penalty_rate_per_round']);
    const pen = h.find((x) => x.id === 'penalty_rate_per_round')!;
    expect(pen.margin).toBeCloseTo(1);
    // Sorted by the size of the split.
    expect(Math.abs(h[0]!.magnitude)).toBeGreaterThanOrEqual(Math.abs(h[1]!.magnitude));
  });
});
