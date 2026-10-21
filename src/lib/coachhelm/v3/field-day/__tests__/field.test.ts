import { describe, expect, it } from 'vitest';
import { FIELD_DAY_LABEL, buildFieldDayContext, pressureFieldSummary, summariseFieldSide, type FieldRoundInput } from '../field';

const r = (id: string, player: string, toPar: number | null, over: Partial<FieldRoundInput> = {}): FieldRoundInput => ({
  round_id: id,
  player_id: player,
  team_id: 't1',
  date: '2026-10-01',
  course_id: 'c1',
  score_to_par: toPar,
  holes: 18,
  ...over,
});

describe('buildFieldDayContext', () => {
  it('makes a field from 3 players on one team, day and course, relative to the mean', () => {
    const ctx = buildFieldDayContext([r('a', 'p1', 3), r('b', 'p2', 6), r('c', 'p3', 9)]);
    expect(ctx.get('a')).toMatchObject({ field_n: 3, field_mean: 6, relative: -3 });
    expect(ctx.get('c')!.relative).toBe(3);
  });

  it('two players are not a field', () => {
    expect(buildFieldDayContext([r('a', 'p1', 3), r('b', 'p2', 6)]).size).toBe(0);
  });

  it('a second round by the same player does not make a third member', () => {
    expect(buildFieldDayContext([r('a', 'p1', 3), r('a2', 'p1', 4), r('b', 'p2', 6)]).size).toBe(0);
  });

  it('splits by course, day and team; skips rounds without a course or score', () => {
    const ctx = buildFieldDayContext([
      r('a', 'p1', 3),
      r('b', 'p2', 6),
      r('c', 'p3', 9, { course_id: 'c2' }),
      r('d', 'p3', 9, { date: '2026-10-02' }),
      r('e', 'p3', 9, { team_id: 't2' }),
      r('f', 'p3', 9, { course_id: null }),
      r('g', 'p3', null),
    ]);
    expect(ctx.size).toBe(0);
  });

  it('scales 9-hole rounds to 18', () => {
    const ctx = buildFieldDayContext([r('a', 'p1', 2, { holes: 9 }), r('b', 'p2', 4), r('c', 'p3', 4)]);
    expect(ctx.get('a')!.relative).toBe(0);
  });
});

describe('summaries', () => {
  const ctx = buildFieldDayContext([
    ...['1', '2', '3'].flatMap((d) => [r(`pr${d}`, 'me', 2, { date: `2026-09-0${d}` }), r(`x${d}`, 'p2', 2, { date: `2026-09-0${d}` }), r(`y${d}`, 'p3', 2, { date: `2026-09-0${d}` })]),
    ...['1', '2', '3'].flatMap((d) => [r(`tn${d}`, 'me', 8, { date: `2026-10-0${d}` }), r(`u${d}`, 'p2', 5, { date: `2026-10-0${d}` }), r(`v${d}`, 'p3', 5, { date: `2026-10-0${d}` })]),
  ]);

  it('summarises one side', () => {
    expect(summariseFieldSide(['pr1', 'pr2', 'nope'], ctx)).toEqual({ n: 2, mean_relative: 0 });
    expect(summariseFieldSide([], ctx)).toEqual({ n: 0, mean_relative: null });
  });

  it('gives the pressure gap net of the day, with 3+ field rounds a side', () => {
    const s = pressureFieldSummary(['pr1', 'pr2', 'pr3'], ['tn1', 'tn2', 'tn3'], ctx);
    expect(s.label).toBe(FIELD_DAY_LABEL);
    expect(s.gap).toBe(2);
    expect(pressureFieldSummary(['pr1', 'pr2'], ['tn1', 'tn2', 'tn3'], ctx).gap).toBeNull();
  });
});
