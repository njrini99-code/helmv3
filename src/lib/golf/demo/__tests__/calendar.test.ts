import { describe, expect, it } from 'vitest';
import { academicYearFor, buildSeasonPlan, dayLabel, instantAt, mondayOf, thanksgiving, weekday } from '../calendar';

describe('the season calendar', () => {
  it('anchors the academic year on 1 Aug', () => {
    expect(academicYearFor('2026-07-31').label).toBe('2025-26');
    expect(academicYearFor('2026-08-01')).toEqual({ startYear: 2026, anchor: '2026-08-01', label: '2026-27' });
  });

  it('is the same plan every time for the same year', () => {
    expect(buildSeasonPlan(academicYearFor('2026-11-15'))).toEqual(buildSeasonPlan(academicYearFor('2026-09-01')));
  });

  for (const startYear of [2025, 2026, 2027, 2028, 2031]) {
    it(`puts every competition on a weekday and none in a break (${startYear})`, () => {
      const plan = buildSeasonPlan(academicYearFor(`${startYear}-09-01`));
      const days = [...plan.tournaments.flatMap((t) => t.days), ...plan.qualifiers.flatMap((q) => q.days), ...plan.practiceDays, ...plan.practiceRoundDays];
      for (const d of days) {
        expect([0, 6], d).not.toContain(weekday(d));
        const winter = d > plan.fall.to && d < plan.spring.from;
        expect(winter, `${d} is in the winter break`).toBe(false);
        expect(mondayOf(d) === mondayOf(thanksgiving(startYear)), `${d} is in Thanksgiving week`).toBe(false);
      }
      expect(plan.tournaments.filter((t) => t.term === 'fall')).toHaveLength(5);
      expect(plan.tournaments.filter((t) => t.springOpener)).toHaveLength(1);
      // the spring opener's qualifier straddles mid-November, so it is live in the middle of the month
      const q = plan.qualifiers.find((x) => x.key === 'q-spring-opener')!;
      expect(q.days[0]! < `${startYear}-11-15`).toBe(true);
      expect(q.days[q.days.length - 1]! >= `${startYear}-11-15`).toBe(true);
      // every qualifier ends before the tournament it decides
      for (const x of plan.qualifiers) {
        const t = plan.tournaments.find((y) => y.key === x.forTournamentKey)!;
        expect(x.days[x.days.length - 1]! < t.days[0]!).toBe(true);
      }
    });
  }

  it('keeps the 2026 fall where the story needs it', () => {
    const plan = buildSeasonPlan(academicYearFor('2026-11-15'));
    expect(plan.fall).toEqual({ from: '2026-08-18', to: '2026-11-20' });
    expect(thanksgiving(2026)).toBe('2026-11-26');
  });

  it('writes weekdays from the date (DD-18)', () => {
    expect(dayLabel('2026-11-12')).toBe('Thursday 12 Nov');
    expect(dayLabel('2028-02-29')).toBe('Tuesday 29 Feb');
  });

  it('turns a wall-clock time in the team zone into an instant, across DST', () => {
    expect(instantAt('2026-07-01', '14:30', 'America/New_York')).toBe('2026-07-01T18:30:00.000Z');
    expect(instantAt('2026-12-01', '14:30', 'America/New_York')).toBe('2026-12-01T19:30:00.000Z');
  });
});
