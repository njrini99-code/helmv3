import { describe, expect, it } from 'vitest';
import { devProgress, devTitle, goalLine } from '../screens/stats/dev-format';

// F-54: Stats' Development list showed "Goal — putts_made_3_5ft_pct" and "Now 15.285714285714286 · target 18".
describe('development formatting (F-54)', () => {
  it('a goal titled by a metric id reads by the metric name; other titles are untouched', () => {
    expect(devTitle('Goal — putts_made_3_5ft_pct')).toBe('Putts made 3–5 ft');
    expect(devTitle('Wedge Distance Control (80-120 yards)')).toBe('Wedge Distance Control (80-120 yards)');
    expect(devTitle('Goal — not_a_metric')).toBe('Goal — not_a_metric');
  });

  it('values never print as raw floats', () => {
    expect(goalLine({ title: 'Wedge Distance Control', state: 'active', current: 15.285714285714286, target: 18 })).toBe('Now 15.29 · target 18');
    expect(goalLine({ title: 'Goal — sg_putting', state: 'active', current: -6.475, target: -0.185 })).not.toMatch(/6\.475|0\.185/);
    expect(goalLine({ title: 'Anything', state: 'achieved', current: null, target: 5 })).toBe('achieved');
  });

  it('focus area progress uses the metric when it has one', () => {
    expect(devProgress({ title: '3-5 ft putting', metric: null, current: 47.7, baseline: null, target: 68.5 })).toBe('47.7 → target 68.5');
    expect(devProgress({ title: 'Lag putts', metric: null, current: 1, baseline: null, target: null })).toBe('No target set');
  });
});
