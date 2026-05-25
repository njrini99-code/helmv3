/**
 * Counterfactual (W17) — pure compute + line formatter + component tests.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  computeCounterfactual,
  formatCounterfactualLine,
} from '@/lib/coachhelm/v3/counterfactual/compute';
import { CounterfactualLine } from '@/components/golf/coachhelm/v3/CounterfactualLine';
import { COUNTERFACTUAL_SUPPRESS_THRESHOLD } from '@/lib/coachhelm/v3/counterfactual/types';

describe('computeCounterfactual', () => {
  it('returns suppressed=true with unknown_metric when metric_id not in lookup', () => {
    const p = computeCounterfactual({
      metric_id: 'never-heard-of-it',
      direction: 'higher_better',
      player_value: 50,
      pga_value: 60,
      player_30d_scoring_avg: 75,
    });
    expect(p.suppressed).toBe(true);
    expect(p.suppress_reason).toBe('unknown_metric');
  });

  it('returns suppressed=true with no_gap when player is already past PGA (higher_better)', () => {
    const p = computeCounterfactual({
      metric_id: 'gir_pct',
      direction: 'higher_better',
      player_value: 70,
      pga_value: 66,
      player_30d_scoring_avg: 70,
    });
    expect(p.suppressed).toBe(true);
    expect(p.suppress_reason).toBe('no_gap');
  });

  it('returns suppressed=true with no_gap when player is already past PGA (lower_better)', () => {
    const p = computeCounterfactual({
      metric_id: 'penalty_rate_per_round',
      direction: 'lower_better',
      player_value: 0.2,
      pga_value: 0.3,
      player_30d_scoring_avg: 72,
    });
    expect(p.suppressed).toBe(true);
    expect(p.suppress_reason).toBe('no_gap');
  });

  it('suppresses with below_threshold when computed impact is < 0.3 strokes', () => {
    // putts_made_10_15ft_pct: 0.02 strokes per pp; gap of 5 pp = 0.1 strokes
    const p = computeCounterfactual({
      metric_id: 'putts_made_10_15ft_pct',
      direction: 'higher_better',
      player_value: 30,
      pga_value: 35,
      player_30d_scoring_avg: 72,
    });
    expect(p.strokes_saved_per_round).toBeCloseTo(0.1);
    expect(p.suppressed).toBe(true);
    expect(p.suppress_reason).toBe('below_threshold');
    expect(p.strokes_saved_per_round).toBeLessThan(COUNTERFACTUAL_SUPPRESS_THRESHOLD);
  });

  it('suppresses with no_baseline when player has no scoring average', () => {
    // Gap big enough to clear threshold, but no baseline → can't project
    const p = computeCounterfactual({
      metric_id: 'sg_total',
      direction: 'higher_better',
      player_value: -1,
      pga_value: 0,
      player_30d_scoring_avg: null,
    });
    expect(p.strokes_saved_per_round).toBe(1.0);
    expect(p.suppressed).toBe(true);
    expect(p.suppress_reason).toBe('no_baseline');
  });

  it('returns a full projection when gap is meaningful + baseline exists', () => {
    const p = computeCounterfactual({
      metric_id: 'sg_putting',
      direction: 'higher_better',
      player_value: -0.5,
      pga_value: 0,
      player_30d_scoring_avg: 75.2,
    });
    expect(p.suppressed).toBe(false);
    expect(p.strokes_saved_per_round).toBeCloseTo(0.5);
    expect(p.projected_score_if_closed).toBeCloseTo(74.7);
    expect(p.weeks_to_typical_close).toBe(4);
  });

  it('handles lower_better metrics correctly when there IS a gap', () => {
    // Player has 1.0 penalty/round, PGA has 0.3 → gap = 0.7 → 0.7 * 1.5 = 1.05 strokes
    const p = computeCounterfactual({
      metric_id: 'penalty_rate_per_round',
      direction: 'lower_better',
      player_value: 1.0,
      pga_value: 0.3,
      player_30d_scoring_avg: 75.0,
    });
    expect(p.suppressed).toBe(false);
    expect(p.strokes_saved_per_round).toBeCloseTo(1.05, 1);
    expect(p.projected_score_if_closed).toBeCloseTo(73.95, 1);
  });
});

describe('formatCounterfactualLine', () => {
  it('returns empty string when suppressed', () => {
    expect(formatCounterfactualLine({
      current_baseline_score: 75,
      projected_score_if_closed: null,
      strokes_saved_per_round: 0,
      weeks_to_typical_close: 4,
      suppressed: true,
    })).toBe('');
  });

  it('formats the canonical "Closing this gap → A → B (≈N wks)" line', () => {
    const line = formatCounterfactualLine({
      current_baseline_score: 75.2,
      projected_score_if_closed: 74.5,
      strokes_saved_per_round: 0.7,
      weeks_to_typical_close: 4,
      suppressed: false,
    });
    expect(line).toBe('Closing this gap → 75.2 → 74.5 (≈4 wks)');
  });

  it('uses singular "wk" when weeks == 1', () => {
    const line = formatCounterfactualLine({
      current_baseline_score: 75,
      projected_score_if_closed: 74.4,
      strokes_saved_per_round: 0.6,
      weeks_to_typical_close: 1,
      suppressed: false,
    });
    expect(line).toContain('(≈1 wk)');
  });

  it('clamps weeks to at least 1 when rounding hits zero', () => {
    const line = formatCounterfactualLine({
      current_baseline_score: 75,
      projected_score_if_closed: 74.4,
      strokes_saved_per_round: 0.6,
      weeks_to_typical_close: 0.3,
      suppressed: false,
    });
    expect(line).toContain('(≈1 wk)');
  });
});

describe('<CounterfactualLine />', () => {
  it('renders nothing when projection is suppressed', () => {
    const { container } = render(
      <CounterfactualLine
        metric_id="sg_total"
        direction="higher_better"
        player_value={1.0}
        pga_value={0}
        player_30d_scoring_avg={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the line when projection is valid', () => {
    render(
      <CounterfactualLine
        metric_id="sg_putting"
        direction="higher_better"
        player_value={-0.5}
        pga_value={0}
        player_30d_scoring_avg={75.2}
      />,
    );
    expect(screen.getByTestId('counterfactual-line').textContent).toContain('Closing this gap');
    expect(screen.getByTestId('counterfactual-line').textContent).toContain('75.2');
  });

  it('honors size prop for text sizing', () => {
    render(
      <CounterfactualLine
        metric_id="sg_putting"
        direction="higher_better"
        player_value={-0.5}
        pga_value={0}
        player_30d_scoring_avg={75.2}
        size="hero"
      />,
    );
    const el = screen.getByTestId('counterfactual-line');
    expect(el.className).toContain('text-sm');
  });
});
