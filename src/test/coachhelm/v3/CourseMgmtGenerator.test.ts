import { describe, it, expect } from 'vitest';
import { CourseMgmtGenerator } from '@/lib/coachhelm/v3/generators/course-mgmt';

const PLAYER_ID = 'p-1';

function makeAgg(
  variant: 'penalty' | 'big_number',
  value: number,
  rounds = 20,
  anchor: { anchor_value?: number | null; anchor_is_cohort?: boolean } = {},
  cause: Partial<{
    cause_penalty_pct: number;
    cause_missed_gir_pct: number;
    cause_three_putt_pct: number;
    worst_holes: Array<{ hole_number: number; avg_to_par: number; n: number }>;
  }> = {},
  cohortGender: 'mens' | 'womens' | null = 'mens',
) {
  return {
    sampleN: rounds,
    playerValue: value,
    metric_value: value,
    variant,
    rounds_played: rounds,
    // cm-1: cohort/PGA anchor the prose + priority key off. Default null →
    // composeContent falls back to the raw PGA anchors (pre-cm-1 behavior).
    anchor_value: anchor.anchor_value ?? null,
    anchor_is_cohort: anchor.anchor_is_cohort ?? false,
    cohort_gender: cohortGender,
    cause_penalty_pct: cause.cause_penalty_pct ?? 0,
    cause_missed_gir_pct: cause.cause_missed_gir_pct ?? 0,
    cause_three_putt_pct: cause.cause_three_putt_pct ?? 0,
    spanDays: 54,
    first_round_date: '2026-04-01',
    last_round_date: '2026-05-25',
    worst_holes: cause.worst_holes ?? [],
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

  // cm-1: priority + prose anchor to the cohort the counterfactual uses, not
  // the raw PGA value. An at/below-cohort player must NOT get a HIGH "3× Tour"
  // card whose strokes_impact is 0.
  describe('cm-1 cohort anchoring', () => {
    it('penalty: at/below cohort is LOW (not a HIGH 3× Tour card)', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'penalty');
      // 0.9/rd is 3× the PGA 0.3, but the player's cohort also averages 0.9 →
      // no gap to close → descriptive (low), matching the zero counterfactual.
      const c = g.composeContent(makeAgg('penalty', 0.9, 20, { anchor_value: 0.9, anchor_is_cohort: true }));
      expect(c.priority).toBe('low');
      expect(c.content).toContain('College players in our data average ~0.9');
      expect(c.content).toContain('College players in our data average');
    });

    it('penalty: well above cohort escalates to HIGH', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'penalty');
      const c = g.composeContent(makeAgg('penalty', 1.4, 20, { anchor_value: 0.9, anchor_is_cohort: true }));
      expect(c.priority).toBe('high'); // 1.4 - 0.9 = 0.5 > 0.3 highMargin
    });

    it('penalty: PGA fallback (no cohort) preserves the pre-cm-1 thresholds', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'penalty');
      // anchor_value null → falls back to PGA default 0.3: >0.6 high, >0.3 medium.
      expect(g.composeContent(makeAgg('penalty', 0.7, 20)).priority).toBe('high');
      expect(g.composeContent(makeAgg('penalty', 0.5, 20)).priority).toBe('medium');
      expect(g.composeContent(makeAgg('penalty', 0.2, 20)).priority).toBe('low');
    });

    it('big_number: at/below cohort is LOW; above escalates', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'big_number');
      const atCohort = g.composeContent(makeAgg('big_number', 6, 20, { anchor_value: 6, anchor_is_cohort: true }));
      expect(atCohort.priority).toBe('low');
      expect(atCohort.content).toContain('College players in our data average ~6.0%');
      const above = g.composeContent(makeAgg('big_number', 9, 20, { anchor_value: 6, anchor_is_cohort: true }));
      expect(above.priority).toBe('high'); // 9 - 6 = 3 > 2 highMargin
    });

    it('big_number: PGA fallback preserves pre-cm-1 thresholds (4% high / 2% medium)', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'big_number');
      expect(g.composeContent(makeAgg('big_number', 5, 20)).priority).toBe('high');
      expect(g.composeContent(makeAgg('big_number', 3, 20)).priority).toBe('medium');
      expect(g.composeContent(makeAgg('big_number', 1.5, 20)).priority).toBe('low');
    });

    it('does NOT assert a "division cohort" (level_avg is an app-wide population)', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'penalty');
      const c = g.composeContent(makeAgg('penalty', 0.9, 20, { anchor_value: 0.9, anchor_is_cohort: true }));
      expect(c.content.toLowerCase()).not.toContain('division cohort');
    });
  });

  describe('C3 cause decomposition + worst holes', () => {
    it('big_number names the dominant proximate cause (3-putt vs penalty vs missed-GIR)', () => {
      const g = new CourseMgmtGenerator(PLAYER_ID, 'big_number');
      const c = g.composeContent(
        makeAgg('big_number', 9, 20, { anchor_value: 6, anchor_is_cohort: true }, {
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
        makeAgg('penalty', 1.4, 20, { anchor_value: 0.9, anchor_is_cohort: true }, {
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
        makeAgg('big_number', 9, 20, { anchor_value: 6, anchor_is_cohort: true }, {
          cause_three_putt_pct: 40, cause_missed_gir_pct: 40, cause_penalty_pct: 20,
          worst_holes: [
            { hole_number: 7, avg_to_par: 0.9, n: 6 },
            { hole_number: 14, avg_to_par: 0.7, n: 6 },
          ],
        }),
      );
      expect(c.content).toContain('hole 7');
      expect(c.content).toContain('+0.9');
    });
  });
});
