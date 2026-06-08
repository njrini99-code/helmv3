import { describe, it, expect } from 'vitest';
import {
  computeCounterfactual,
  formatCounterfactualLine,
} from '@/lib/coachhelm/v3/counterfactual/compute';

describe('computeCounterfactual — confidence band', () => {
  it('low confidence (0.27, Grace par_4) widens the range and softens the verb', () => {
    const r = computeCounterfactual({
      metric_id: 'scoring_par_4', direction: 'lower_better',
      player_value: 4.47, pga_value: 3.97, cohort_value: null,
      player_30d_scoring_avg: 79.1, confidence: 0.27,
    });
    expect(r.confidence_band).toBe('low');
    const line = formatCounterfactualLine(r);
    expect(line.toLowerCase()).toContain('roughly');
    expect(line).not.toContain('Closing this gap →');
  });

  it('high confidence keeps the precise projection copy', () => {
    const r = computeCounterfactual({
      metric_id: 'scoring_par_4', direction: 'lower_better',
      player_value: 4.47, pga_value: 3.97, cohort_value: null,
      player_30d_scoring_avg: 79.1, confidence: 0.85,
    });
    expect(r.confidence_band).toBe('high');
    expect(formatCounterfactualLine(r)).toContain('Closing this gap →');
  });

  it('defaults to high band when confidence is not supplied (unchanged copy)', () => {
    const r = computeCounterfactual({
      metric_id: 'scoring_par_4', direction: 'lower_better',
      player_value: 4.47, pga_value: 3.97, cohort_value: null,
      player_30d_scoring_avg: 79.1,
    });
    expect(formatCounterfactualLine(r)).toContain('Closing this gap →');
  });
});
