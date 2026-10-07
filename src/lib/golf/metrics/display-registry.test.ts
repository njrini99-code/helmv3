import { describe, expect, it } from 'vitest';
import {
  METRIC_REGISTRY,
  MINUS,
  MISSING,
  formatDistanceRange,
  formatExclusions,
  formatMetric,
  formatMetricText,
  formatSample,
  getMetricDefinition,
} from './display-registry';
import { METRIC_IDS, getMetricDirection } from '@/lib/coachhelm/v3/metrics/registry';
import { formatToPar } from '@/lib/golf/format-to-par';
import { formatScoringAverage } from '@/lib/golf/format-scoring-average';

describe('formatMetric: §5.2 precision table', () => {
  it('prints one round score as an integer', () => {
    expect(formatMetricText('round_score', 73)).toBe('73');
  });

  it('prints to par signed, with the true minus and E at level', () => {
    expect(formatMetricText('round_to_par', 1)).toBe('+1');
    expect(formatMetricText('round_to_par', -2)).toBe(`${MINUS}2`);
    expect(formatMetricText('round_to_par', 0)).toBe('E');
    expect(formatMetricText('round_to_par', -2)).not.toContain('-');
  });

  it('prints scoring and to-par averages at 1 dp', () => {
    expect(formatMetricText('scoring_average', 72.75)).toBe('72.8');
    expect(formatMetricText('scoring_average_vs_par', 0.84)).toBe('+0.8');
    expect(formatMetricText('scoring_average_vs_par', -1.26)).toBe(`${MINUS}1.3`);
  });

  it('prints strokes gained signed at 2 dp', () => {
    expect(formatMetricText('sg_total', 1.978)).toBe('+1.98');
    expect(formatMetricText('sg_putting', -0.834)).toBe(`${MINUS}0.83`);
  });

  it('prints percentages as integers with no space', () => {
    expect(formatMetricText('gir_pct', 47.6)).toBe('48%');
    expect(formatMetricText('scrambling_pct', 34)).toBe('34%');
  });

  it('prints per-round rates at 1 dp and hole averages at 2 dp', () => {
    expect(formatMetricText('putts_per_round', 32.94)).toBe('32.9');
    expect(formatMetricText('scoring_par_3', 3.271)).toBe('3.27');
  });

  it('prints distances as integers with a spaced unit', () => {
    expect(formatMetricText('driving_distance', 262.4)).toBe('262 yd');
    expect(formatMetricText('approach_proximity', 31.6)).toBe('32 ft');
  });

  it('prints counts with a noun, pluralised', () => {
    expect(formatMetricText('rounds_counted', 21)).toBe('21 full rounds');
    expect(formatMetricText('rounds_counted', 1)).toBe('1 full round');
  });

  it('prints strokes deltas signed at 1 dp', () => {
    expect(formatMetricText('strokes_impact', -0.42)).toBe(`${MINUS}0.4 a round`);
    expect(formatMetricText('practice_tournament_delta', 2.26)).toBe('+2.3');
  });
});

describe('formatMetric: missing and zero', () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'prints the em dash for %s',
    (v) => {
      const out = formatMetric('sg_total', v);
      expect(out.text).toBe(MISSING);
      expect(out.missing).toBe(true);
      expect(out.tone).toBe('neutral');
    },
  );

  it('never prints a signed zero (no "−0.00", no "+0.0")', () => {
    expect(formatMetricText('sg_total', -0.004)).toBe('0.00');
    expect(formatMetricText('sg_total', 0.004)).toBe('0.00');
    expect(formatMetricText('strokes_impact', -0.04)).toBe('0.0 a round');
    expect(formatMetric('sg_total', -0.004).tone).toBe('neutral');
  });

  it('prints E for a to-par average that rounds to zero', () => {
    expect(formatMetricText('scoring_average_vs_par', -0.04)).toBe('E');
    expect(formatMetricText('round_to_par', -0)).toBe('E');
  });

  it('rounds half away from zero symmetrically', () => {
    expect(formatMetricText('sg_total', 0.125)).toBe('+0.13');
    expect(formatMetricText('sg_total', -0.125)).toBe(`${MINUS}0.13`);
  });

  it('groups thousands in counts', () => {
    expect(formatMetricText('holes_played', 1234)).toBe('1,234 holes');
  });
});

describe('formatMetric: tone from polarity × sign', () => {
  it('SG: positive is good, negative is bad', () => {
    expect(formatMetric('sg_approach', 0.5).tone).toBe('good');
    expect(formatMetric('sg_approach', -0.5).tone).toBe('bad');
  });

  it('to par: under par is good, over par is bad, E is neutral', () => {
    expect(formatMetric('round_to_par', -2).tone).toBe('good');
    expect(formatMetric('round_to_par', 3).tone).toBe('bad');
    expect(formatMetric('round_to_par', 0).tone).toBe('neutral');
  });

  it('plain values are not toned', () => {
    expect(formatMetric('scoring_average', 72.8).tone).toBe('neutral');
    expect(formatMetric('gir_pct', 80).tone).toBe('neutral');
  });

  it('a delta of a lower-is-better metric is good when it falls', () => {
    const drop = formatMetric('scoring_average', -1.24, { delta: true });
    expect(drop.text).toBe(`${MINUS}1.2`);
    expect(drop.tone).toBe('good');
    const rise = formatMetric('scoring_average', 0.6, { delta: true });
    expect(rise.text).toBe('+0.6');
    expect(rise.tone).toBe('bad');
  });

  it('a delta of a higher-is-better metric is good when it rises', () => {
    expect(formatMetric('gir_pct', 4, { delta: true })).toMatchObject({ text: '+4%', tone: 'good' });
    expect(formatMetric('gir_pct', -4, { delta: true })).toMatchObject({ text: `${MINUS}4%`, tone: 'bad' });
  });
});

describe('formatMetric: read quality, window chip, exclusions', () => {
  it('prints no number under the floor and says how many more', () => {
    const out = formatMetric('scoring_average', 71.2, { sample: 1 });
    expect(out.text).toBe(MISSING);
    expect(out.missing).toBe(true);
    expect(out.readQuality).toBe('insufficient');
    expect(out.needsMore).toBe(2);
    expect(out.qualityNote).toBe('Needs 2 more rounds');
  });

  it('tags floor ≤ sample < 2 × floor as an early read, and never prints a confidence %', () => {
    const out = formatMetric('scoring_average', 71.2, { sample: 4 });
    expect(out.text).toBe('71.2');
    expect(out.readQuality).toBe('early');
    expect(out.qualityNote).toBe('Early read');
    expect(out.ariaLabel).not.toMatch(/confiden/i);
  });

  it('reads as solid at 2 × floor', () => {
    expect(formatMetric('scoring_average', 71.2, { sample: 6 }).readQuality).toBe('solid');
  });

  it('uses the metric sample noun', () => {
    expect(formatMetric('putts_made_3_5ft_pct', 80, { sample: 9 }).qualityNote).toBe('Needs 1 more putt');
  });

  it('shows a window chip only when the window differs from the screen default', () => {
    expect(formatMetric('scrambling_pct', 27, { window: 'last_90_days' }).windowChip).toBe('Last 90 days');
    expect(formatMetric('scrambling_pct', 34, { window: 'all_time' }).windowChip).toBeNull();
    expect(
      formatMetric('scrambling_pct', 27, { window: 'last_90_days', screenWindow: 'last_90_days' }).windowChip,
    ).toBeNull();
  });

  it('states exclusions instead of dropping them silently', () => {
    expect(formatExclusions(21, 2)).toBe('21 full rounds · 2 not counted (partial or test)');
    expect(formatExclusions(1, 0)).toBe('1 full round');
  });

  it('formats samples as noun phrases, never n=', () => {
    expect(formatSample(44, ['putt', 'putts'])).toBe('44 putts');
    expect(formatSample(1)).toBe('1 round');
  });

  it('formats distance ranges with an en dash and one unit', () => {
    expect(formatDistanceRange(5, 10, 'ft')).toBe('5–10 ft');
    expect(formatDistanceRange(175, 200, 'yd')).toBe('175–200 yd');
    expect(formatDistanceRange(25, null, 'ft')).toBe('25+ ft');
  });

  it('builds a spoken label with the sign as a word', () => {
    expect(formatMetric('sg_putting', -0.83).ariaLabel).toBe('Strokes gained: putting, minus 0.83');
    expect(formatMetric('round_to_par', 0).ariaLabel).toBe('To par, even par');
  });
});

describe('formatMetric: percent scale is explicit, never guessed', () => {
  it('treats stored percentages as 0–100 (a real 0.8% stays 1%, not 80%)', () => {
    expect(formatMetricText('putts_made_25_plus_ft_pct', 0.8)).toBe('1%');
  });
});

describe('registry', () => {
  it('covers every v3 insight metric id with the v3 polarity', () => {
    for (const id of METRIC_IDS) {
      const d = getMetricDefinition(id);
      const expected = getMetricDirection(id) === 'higher_better' ? 'higher' : 'lower';
      expect(d.polarity, id).toBe(expected);
    }
  });

  it('has no legacy 15–20 / 20+ ft putting band', () => {
    const ids = Object.keys(METRIC_REGISTRY);
    expect(ids.some((id) => /15_20|20_plus/.test(id))).toBe(false);
    expect(Object.values(METRIC_REGISTRY).some((d) => /15[–-]20|20\+/.test(d.label))).toBe(false);
  });

  it('uses sentence-case labels (no lowercased metric names, NUM-37)', () => {
    for (const d of Object.values(METRIC_REGISTRY)) {
      expect(d.label.charAt(0), d.id).toBe(d.label.charAt(0).toUpperCase());
    }
  });

  it('throws on an unknown id so a typo fails in a test', () => {
    expect(() => formatMetric('sg_totl', 1)).toThrow(/Unknown golf metric id/);
  });
});

describe('agrees with the older helpers it replaces', () => {
  it.each([-5, -1, 0, 1, 12])('formatToPar(%d)', (v) => {
    expect(formatMetricText('round_to_par', v)).toBe(formatToPar(v));
  });

  it('formatToPar(null) and formatScoringAverage(null) share the glyph', () => {
    expect(formatMetricText('round_to_par', null)).toBe(formatToPar(null));
    expect(formatMetricText('scoring_average', null)).toBe(formatScoringAverage(null));
  });

  it.each([72.75, 75.58333333333334, 70, 81.04])('formatScoringAverage(%d)', (v) => {
    expect(formatMetricText('scoring_average', v)).toBe(formatScoringAverage(v));
  });
});
