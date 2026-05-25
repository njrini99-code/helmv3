import { describe, it, expect } from 'vitest';
import { CourseMgmtGenerator } from '@/lib/coachhelm/v3/generators/course-mgmt';

const PLAYER_ID = 'p-1';

function makeAgg(variant: 'penalty' | 'big_number', value: number, rounds = 20) {
  return {
    sampleN: rounds,
    playerValue: value,
    metric_value: value,
    variant,
    rounds_played: rounds,
  };
}

describe('CourseMgmtGenerator', () => {
  it('penalty variant identity + metric_id', () => {
    const g = new CourseMgmtGenerator(PLAYER_ID, 'penalty');
    expect(g.name).toBe('CourseMgmtGenerator');
    expect(g.insightType).toBe('course_management');
    expect(g.category).toBe('course_management');
    expect(g.metricId).toBe('penalty_rate_per_round');
  });

  it('big_number variant metric_id', () => {
    expect(new CourseMgmtGenerator(PLAYER_ID, 'big_number').metricId).toBe('big_number_rate');
  });

  it('penalty composeContent renders the per-round value + PGA anchor', () => {
    const g = new CourseMgmtGenerator(PLAYER_ID, 'penalty');
    const c = g.composeContent(makeAgg('penalty', 0.8, 22));
    expect(c.title).toContain('Penalty strokes');
    expect(c.title).toContain('0.8');
    expect(c.content).toContain('22 rounds');
    expect(c.content).toContain('PGA Tour is ~0.3');
    expect(c.signature).toBe('course_management:penalty_rate');
    expect(c.evidence.unit).toBe('count');
    expect(c.evidence.comparison_value).toBe(0.3);
    expect(c.evidence.comparison_source).toBe('pga_baseline');
  });

  it('big_number composeContent renders the percent value + Tour 2% anchor', () => {
    const g = new CourseMgmtGenerator(PLAYER_ID, 'big_number');
    const c = g.composeContent(makeAgg('big_number', 7.3));
    expect(c.title).toContain('Double bogey-or-worse');
    expect(c.title).toContain('7.3%');
    expect(c.content).toContain('PGA Tour is ~2%');
    expect(c.signature).toBe('course_management:big_number');
    expect(c.evidence.unit).toBe('percent');
    expect(c.evidence.comparison_value).toBe(2);
  });
});
