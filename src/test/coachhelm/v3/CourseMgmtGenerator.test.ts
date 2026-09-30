import { describe, it, expect } from 'vitest';
import { CourseMgmtGenerator } from '@/lib/coachhelm/v3/generators/course-mgmt';
import { TOUR_STANDARDS } from '@/lib/golf/benchmarks/tour';

const PLAYER_ID = 'p-1';

function makeAgg(
  variant: 'penalty' | 'big_number',
  value: number,
  rounds = 20,
  tour: 'pga' | 'lpga' = 'pga',
  cause: Partial<{
    cause_penalty_pct: number;
    cause_missed_gir_pct: number;
    cause_three_putt_pct: number;
    worst_holes: Array<{
      course_id: string;
      course_name: string | null;
      hole_number: number;
      avg_to_par: number;
      n: number;
    }>;
    worst_holes_excluded_rounds: number;
  }> = {},
) {
  const t = TOUR_STANDARDS[tour];
  return {
    sampleN: rounds,
    playerValue: value,
    metric_value: value,
    variant,
    rounds_played: rounds,
    // Q-88: the team's Tour is the one anchor (aggregate() picks it by gender).
    anchor_value: variant === 'penalty' ? t.penaltiesPerRound : t.bigNumbersPer100Holes,
    anchor_label: t.label,
    cause_penalty_pct: cause.cause_penalty_pct ?? 0,
    cause_missed_gir_pct: cause.cause_missed_gir_pct ?? 0,
    cause_three_putt_pct: cause.cause_three_putt_pct ?? 0,
    spanDays: 54,
    first_round_date: '2026-04-01',
    last_round_date: '2026-05-25',
    worst_holes: cause.worst_holes ?? [],
    worst_holes_excluded_rounds: cause.worst_holes_excluded_rounds ?? 0,
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
    expect(c.content).toContain('The PGA Tour averages ~0.3');
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
    expect(c.content).toContain('The PGA Tour is ~2.0%');
    expect(c.signature).toBe('course_management:big_number');
    expect(c.evidence.unit).toBe('percent');
    expect(c.evidence.comparison_value).toBe(2);
  });

  // Q-88: priority, prose and tick all use the team's Tour. The thresholds are
  // the pre-cm-1 ones (penalties 0.6 high / 0.3 medium; big numbers 4% / 2%).
  describe('Tour anchoring (Q-88)', () => {
    it('penalty: over the Tour by more than 0.3 is HIGH, over it MEDIUM, at/under LOW', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'penalty');
      expect(g.composeContent(makeAgg('penalty', 0.7, 20)).priority).toBe('high');
      expect(g.composeContent(makeAgg('penalty', 0.5, 20)).priority).toBe('medium');
      expect(g.composeContent(makeAgg('penalty', 0.2, 20)).priority).toBe('low');
    });

    it('big_number: 4% high / 2% medium against the PGA Tour', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'big_number');
      expect(g.composeContent(makeAgg('big_number', 5, 20)).priority).toBe('high');
      expect(g.composeContent(makeAgg('big_number', 3, 20)).priority).toBe('medium');
      expect(g.composeContent(makeAgg('big_number', 1.5, 20)).priority).toBe('low');
    });

    it("a women's team is compared with the LPGA Tour, labelled as such", () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'penalty');
      const c = g.composeContent(makeAgg('penalty', 0.7, 20, 'lpga'));
      expect(c.content).toContain('The LPGA Tour averages ~0.4');
      expect(c.evidence.comparison_value).toBe(0.4);
      expect(c.evidence.comparison_label).toBe('LPGA Tour avg');
      expect(c.priority).toBe('medium'); // 0.7 - 0.4 = 0.3, not over 0.3
    });

    it('never names a college, cohort or division', () => {
      for (const v of ['penalty', 'big_number'] as const) {
        for (const tour of ['pga', 'lpga'] as const) {
          const c = new CourseMgmtGenerator(PLAYER_ID, v).composeContent(makeAgg(v, 1, 20, tour));
          expect(c.content.toLowerCase()).not.toMatch(/college|cohort|division/);
          expect(c.evidence.comparison_source).toBe('pga_baseline');
          expect(c.evidence.secondary_value).toBeUndefined();
        }
      }
    });
  });

  describe('C3 cause decomposition + worst holes', () => {
    it('big_number names the dominant proximate cause (3-putt vs penalty vs missed-GIR)', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'big_number');
      const c = g.composeContent(
        makeAgg('big_number', 9, 20, 'pga', {
          cause_three_putt_pct: 55, cause_missed_gir_pct: 30, cause_penalty_pct: 15,
        }),
      );
      // Dominant cause (3-putt at 55%) is named with its share.
      expect(c.content).toContain('55%');
      expect(c.content.toLowerCase()).toContain('3-putt');
    });

    it('penalty action is specific to the dominant cause, not generic "avoid penalties"', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'penalty');
      const c = g.composeContent(
        makeAgg('penalty', 1.4, 20, 'pga', {
          cause_penalty_pct: 70, cause_missed_gir_pct: 20, cause_three_putt_pct: 10,
        }),
      );
      // A real, cause-specific action (off-the-tee penalties → tee-club / target).
      expect(c.content.toLowerCase()).toMatch(/tee|aim|conservative line|bail-out/);
      expect(c.content.toLowerCase()).not.toContain('avoid penalties');
    });

    it('big_number surfaces the worst holes by avg-to-par when present', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'big_number');
      const c = g.composeContent(
        makeAgg('big_number', 9, 20, 'pga', {
          cause_three_putt_pct: 40, cause_missed_gir_pct: 40, cause_penalty_pct: 20,
          worst_holes: [
            { course_id: 'c-1', course_name: 'Pine Valley', hole_number: 7, avg_to_par: 0.9, n: 6 },
            { course_id: 'c-2', course_name: 'Old Town', hole_number: 14, avg_to_par: 0.7, n: 6 },
          ],
        }),
      );
      // Specific holes are named with their course — hole 7 at one course is
      // not hole 7 at another (addendum §6.3).
      expect(c.content).toContain('hole 7 at Pine Valley');
      expect(c.content).toContain('hole 14 at Old Town');
      expect(c.content).toContain('+0.9');
      expect(c.content).not.toContain('without a course on file');
    });

    it('big_number states the coverage gap when rounds without a course_id were left out of the ranking', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'big_number');
      const c = g.composeContent(
        makeAgg('big_number', 9, 20, 'pga', {
          cause_three_putt_pct: 40, cause_missed_gir_pct: 40, cause_penalty_pct: 20,
          worst_holes: [
            { course_id: 'c-1', course_name: null, hole_number: 3, avg_to_par: 1.2, n: 4 },
          ],
          worst_holes_excluded_rounds: 2,
        }),
      );
      expect(c.content).toContain('hole 3 at a course on file');
      expect(c.content).toContain('2 rounds without a course on file are not in this ranking');
    });
  });
});

describe('audit row 12 — print what the priority used, and label the window', () => {
  const g = (v: 'penalty' | 'big_number') => new CourseMgmtGenerator(PLAYER_ID, v);

  it('the comparison is the Tour value the priority used, with no secondary tick', () => {
    const pen = g('penalty').composeContent(makeAgg('penalty', 0.7, 20));
    expect(pen.priority).toBe('high');
    expect(pen.evidence.comparison_value).toBe(0.3);
    expect(pen.evidence.comparison_source).toBe('pga_baseline');
    expect(pen.evidence.secondary_value).toBeUndefined();

    const big = g('big_number').composeContent(makeAgg('big_number', 9, 20));
    expect(big.evidence.comparison_value).toBe(2);
    expect(big.evidence.comparison_label).toBe('PGA Tour avg');
  });

  it("a women's card carries the LPGA value and never the men's", () => {
    const c = g('big_number').composeContent(makeAgg('big_number', 9, 20, 'lpga'));
    expect(c.evidence.comparison_value).toBe(3);
    expect(c.evidence.comparison_label).toBe('LPGA Tour avg');
  });

  it('labels the window lifetime: the value is the all-time cache scalar', () => {
    const c = g('big_number').composeContent(makeAgg('big_number', 9, 20));
    expect(c.evidence.window_basis).toBe('lifetime');
    expect(c.content).not.toMatch(/last 20 rounds/);
    expect(c.content).toMatch(/all 20 rounds on file/);
  });
});
