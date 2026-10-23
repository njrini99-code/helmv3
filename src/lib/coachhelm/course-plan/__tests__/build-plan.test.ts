import { describe, expect, it } from 'vitest';
import { buildCoursePlan, buildHoleHistory, eligibleCourses, holeList, type CoursePlanHole, type CoursePlanInput, type CoursePlanShot } from '../build-plan';

/** Synthetic 18-hole course: par 3s on 3, 7, 12, 16; par 5s on 5, 13; the rest par 4. */
const PAR = (n: number) => ([3, 7, 12, 16].includes(n) ? 3 : [5, 13].includes(n) ? 5 : 4);

interface HoleSpec {
  over?: number;
  putts?: number;
  tee?: Partial<CoursePlanShot> | null;
  penalties?: Array<string>;
}

function round(id: string, spec: Record<number, HoleSpec> = {}): { holes: CoursePlanHole[]; shots: CoursePlanShot[] } {
  const holes: CoursePlanHole[] = [];
  const shots: CoursePlanShot[] = [];
  for (let n = 1; n <= 18; n++) {
    const s = spec[n] ?? {};
    const par = PAR(n);
    holes.push({ roundId: id, holeNumber: n, par, score: par + (s.over ?? 0), putts: s.putts ?? 2, penaltyStrokes: s.penalties?.length ?? 0, yardage: par === 3 ? 150 + n * 3 : 380 });
    const base: CoursePlanShot = { roundId: id, holeNumber: n, shotNumber: 1, shotType: par === 3 ? 'approach' : 'tee', clubType: par === 3 ? 'non_driver' : 'driver', missDirection: null, result: par === 3 ? 'green' : 'fairway', penaltyType: null, distanceBefore: null, distanceUnitBefore: 'yards' };
    if (s.tee !== null) shots.push({ ...base, ...s.tee });
    (s.penalties ?? []).forEach((type, i) => shots.push({ ...base, shotNumber: 2 + i, shotType: 'penalty', result: 'penalty', penaltyType: type, clubType: 'non_driver' }));
  }
  return { holes, shots };
}

function input(rounds: Array<ReturnType<typeof round>>, elsewhere: CoursePlanInput['elsewhere'] = null): CoursePlanInput {
  return {
    courseName: 'Pine Hollow',
    roundIds: rounds.map((r) => r.holes[0]!.roundId),
    holes: rounds.flatMap((r) => r.holes),
    shots: rounds.flatMap((r) => r.shots),
    elsewhere,
  };
}

const WATER_RIGHT: HoleSpec = { over: 2, tee: { missDirection: 'right', result: 'other' }, penalties: ['water'] };
const RIGHT_ROUGH: HoleSpec = { over: 1, tee: { missDirection: 'right', result: 'rough' } };

describe('holeList', () => {
  it('joins hole numbers the way the copy says them', () => {
    expect(holeList([4])).toBe('4');
    expect(holeList([4, 11])).toBe('4 and 11');
    expect(holeList([4, 9, 11])).toBe('4, 9 and 11');
  });
});

describe('buildCoursePlan', () => {
  it('answers too_few below three rounds on the course', () => {
    const plan = buildCoursePlan(input([round('r1'), round('r2')]));
    expect(plan).toEqual({ status: 'too_few', courseName: 'Pine Hollow', rounds: 2 });
  });

  it('counts only rounds with scored holes', () => {
    const empty = round('r3');
    empty.holes.forEach((h) => (h.score = null));
    expect(buildCoursePlan(input([round('r1'), round('r2'), empty])).status).toBe('too_few');
  });

  it('builds the tee-trouble line from a side lean and penalties, never naming a club', () => {
    const plan = buildCoursePlan(input([round('r1', { 4: WATER_RIGHT, 11: RIGHT_ROUGH }), round('r2', { 4: WATER_RIGHT, 11: WATER_RIGHT }), round('r3', { 4: RIGHT_ROUGH, 11: { over: 1, tee: { missDirection: 'right', result: 'sand' } } })]));
    if (plan.status !== 'plan') throw new Error('expected a plan');
    const tee = plan.lines.find((l) => l.kind === 'tee')!;
    expect(tee.holes).toEqual([4, 11]);
    expect(tee.stake).toBeCloseTo(5 / 3 + 4 / 3);
    expect(tee.coach).toBe('Holes 4 and 11: all 6 tee shots missed right, driver on 6 of 6, 3 penalties, all water. Plan: favour the left half off the tee. 3.0 over par a round on those two.');
    expect(tee.player).toBe("4 and 11: aim at the left half off the tee. All 6 tee shots there missed right and you've taken 3 penalties.");
    for (const text of [...plan.coach.lines, ...plan.player.lines]) {
      expect(text).not.toMatch(/\b(\d-wood|wood|iron|hybrid|wedge|one more club|club up|club down)\b/i);
    }
  });

  it('counts a penalty entered as the first shot as a tee shot with no side', () => {
    const penTee: HoleSpec = { over: 2, tee: { shotType: 'penalty', result: 'penalty', penaltyType: 'ob', clubType: 'non_driver' } };
    const history = buildHoleHistory(input([round('r1', { 6: penTee }), round('r2', { 6: penTee }), round('r3', { 6: penTee })]));
    const h6 = history.find((h) => h.holeNumber === 6)!;
    expect(h6).toMatchObject({ teeShots: 3, driver: 0, missLeft: 0, missRight: 0, penalties: 3, waterPenalties: 0 });
  });

  it('plans the widest part of the fairway when penalties pile up with no side lean', () => {
    const pen: HoleSpec = { over: 2, tee: { missDirection: null, result: 'fairway' }, penalties: ['ob'] };
    const plan = buildCoursePlan(input([round('r1', { 9: pen }), round('r2', { 9: pen }), round('r3', { 9: { over: 1 } })]));
    if (plan.status !== 'plan') throw new Error('expected a plan');
    expect(plan.lines[0]).toMatchObject({ kind: 'tee', holes: [9] });
    expect(plan.lines[0]!.coach).toBe('Hole 9: driver on 3 of 3, 2 penalties. Plan: aim at the widest part of the fairway. 1.7 over par a round on that hole.');
    expect(plan.lines[0]!.player).toBe("9: aim at the widest part of the fairway. You've taken 2 penalties there.");
  });

  it('leaves out a costly hole with neither a lean nor penalties', () => {
    const plan = buildCoursePlan(input([round('r1', { 2: { over: 2 } }), round('r2', { 2: { over: 2 } }), round('r3', { 2: { over: 2 } })]));
    if (plan.status !== 'plan') throw new Error('expected a plan');
    expect(plan.lines.filter((l) => l.kind === 'tee')).toEqual([]);
  });

  it('builds the par-3 line with the short lean and a yardage range', () => {
    const short: HoleSpec = { over: 1, tee: { result: 'rough', missDirection: 'short' } };
    const spec = { 3: short, 7: short, 12: { over: 1, tee: { result: 'sand', missDirection: 'short_right' } } };
    const plan = buildCoursePlan(input([round('r1', spec), round('r2', spec), round('r3', { 3: short })]));
    if (plan.status !== 'plan') throw new Error('expected a plan');
    const p3 = plan.lines.find((l) => l.kind === 'par3')!;
    expect(p3.coach).toBe('Par 3s (159–198 yd): 2.3 over par a round; greens 5 of 12; 7 of 7 misses short. Plan: aim past the middle of the green.');
    expect(p3.player).toBe('Par 3s: aim past the middle of the green. 7 of your 7 misses here were short.');
  });

  it('keeps the par-3 target to the middle when the misses do not lean', () => {
    const s: HoleSpec = { over: 1, tee: { result: 'rough', missDirection: 'short' } };
    const l: HoleSpec = { over: 1, tee: { result: 'rough', missDirection: 'long' } };
    const plan = buildCoursePlan(input([round('r1', { 3: s, 7: l }), round('r2', { 3: l, 7: s }), round('r3', { 12: s, 16: l })]));
    if (plan.status !== 'plan') throw new Error('expected a plan');
    const p3 = plan.lines.find((x) => x.kind === 'par3')!;
    expect(p3.coach).toMatch(/Plan: the middle of the green, whatever the flag\.$/);
    expect(p3.player).toBe("Par 3s: aim at the middle of the green, whatever the flag. You've hit 6 of 12 greens on them here.");
  });

  it('builds the greens line against the player elsewhere, and drops it when the gap is small', () => {
    const three = (id: string) => round(id, { 1: { over: 1, putts: 3 }, 8: { over: 1, putts: 3 } });
    const rounds = () => [three('r1'), three('r2'), round('r3', { 1: { over: 1, putts: 3 } })];
    const plan = buildCoursePlan(input(rounds(), { rounds: 10, threePutts: 5 }));
    if (plan.status !== 'plan') throw new Error('expected a plan');
    const g = plan.lines.find((l) => l.kind === 'greens')!;
    expect(g.coach).toBe('Greens: 1.7 three-putts a round here (0.5 elsewhere). Plan: a lag ladder before the round.');
    expect(g.player).toBe("Greens: a lag ladder before you play here. You've averaged 1.7 three-putts a round on these greens, 0.5 elsewhere.");
    expect(g.stake).toBeCloseTo(5 / 3 - 0.5);

    // 1.7 against 0.8 is 0.87 strokes a round: under the stake floor, so the line is not offered.
    const under = buildCoursePlan(input(rounds(), { rounds: 10, threePutts: 8 }));
    if (under.status !== 'plan') throw new Error('expected a plan');
    expect(under.lines.some((l) => l.kind === 'greens')).toBe(false);

    const close = buildCoursePlan(input([three('r1'), three('r2'), three('r3')], { rounds: 10, threePutts: 18 }));
    if (close.status !== 'plan') throw new Error('expected a plan');
    expect(close.lines.some((l) => l.kind === 'greens')).toBe(false);
  });

  it('states the greens line without a comparison when the player has too few other rounds', () => {
    const three = (id: string) => round(id, { 1: { over: 1, putts: 3 }, 8: { over: 1, putts: 3 } });
    const plan = buildCoursePlan(input([three('r1'), three('r2'), three('r3')], { rounds: 2, threePutts: 0 }));
    if (plan.status !== 'plan') throw new Error('expected a plan');
    expect(plan.lines.find((l) => l.kind === 'greens')!.coach).toBe('Greens: 2.0 three-putts a round here. Plan: a lag ladder before the round.');
  });

  it('caps at three lines ranked by stake and adds the thin-history line below six rounds', () => {
    const r = (id: string) =>
      round(id, {
        4: WATER_RIGHT,
        9: { over: 2, tee: { missDirection: 'left', result: 'rough' } },
        14: { over: 2, tee: { missDirection: null }, penalties: ['ob'] },
        3: { over: 1, tee: { result: 'rough', missDirection: 'short' } },
        1: { over: 1, putts: 3 },
        8: { over: 1, putts: 3 },
      });
    const plan = buildCoursePlan(input([r('r1'), r('r2'), r('r3')], { rounds: 10, threePutts: 2 }));
    if (plan.status !== 'plan') throw new Error('expected a plan');
    expect(plan.lines).toHaveLength(3);
    const stakes = plan.lines.map((l) => l.stake);
    expect(stakes).toEqual([...stakes].sort((a, b) => b - a));
    expect(plan.thin).toBe(true);
    expect(plan.coach.thinLine).toBe('3 rounds is a thin history; treat this as a reminder, not a read.');
    expect(plan.coach.title).toBe('Course plan: Pine Hollow · from 3 rounds here');
    expect(plan.player.title).toBe('At Pine Hollow');
    // chs-21: the player's own copy carries the thin line in their voice, and no empty line while it has lines.
    expect(plan.player.thinLine).toBe('From your 3 rounds here, so take it as a reminder, not a read.');
    expect(plan.player.emptyLine).toBeNull();
  });

  it('drops the thin line from six rounds and never uses a ladder word', () => {
    const rounds = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => round(id, { 4: WATER_RIGHT }));
    const plan = buildCoursePlan(input(rounds));
    if (plan.status !== 'plan') throw new Error('expected a plan');
    expect(plan.thin).toBe(false);
    expect(plan.coach.thinLine).toBeNull();
    expect(plan.player.thinLine).toBeNull();
    for (const text of [plan.coach.title, ...plan.coach.lines, ...plan.player.lines]) {
      expect(text).not.toMatch(/\b(likely|confirmed|emerging|possible|probable)\b/i);
    }
  });

  it('says so when nothing on the course costs a stroke a round', () => {
    const plan = buildCoursePlan(input([round('r1'), round('r2'), round('r3')]));
    if (plan.status !== 'plan') throw new Error('expected a plan');
    expect(plan.lines).toEqual([]);
    expect(plan.coach.lines).toEqual(['Nothing here costs a stroke a round yet across 3 rounds: no hole, par 3 or green stands out.']);
    expect(plan.player.lines).toEqual([]);
    expect(plan.player.emptyLine).toBe('Nothing here has cost you a stroke a round yet across your 3 rounds.');
  });
});

describe('eligibleCourses', () => {
  it('keeps courses with three or more rounds, most played then most recent first', () => {
    const rows = [
      { courseId: 'a', courseName: 'Alder', roundDate: '2026-05-01' },
      { courseId: 'a', courseName: 'Alder', roundDate: '2026-06-01' },
      { courseId: 'a', courseName: 'Alder CC', roundDate: '2026-07-01' },
      { courseId: 'b', courseName: 'Birch', roundDate: '2026-08-01' },
      { courseId: 'b', courseName: 'Birch', roundDate: '2026-08-02' },
      { courseId: null, courseName: 'Typed in', roundDate: '2026-08-03' },
      { courseId: null, courseName: 'Typed in', roundDate: '2026-08-04' },
      { courseId: null, courseName: 'Typed in', roundDate: '2026-08-05' },
      { courseId: 'c', courseName: null, roundDate: '2026-09-01' },
      { courseId: 'c', courseName: null, roundDate: '2026-09-02' },
      { courseId: 'c', courseName: null, roundDate: '2026-09-03' },
    ];
    expect(eligibleCourses(rows)).toEqual([
      { courseId: 'c', name: 'This course', rounds: 3, lastPlayed: '2026-09-03' },
      { courseId: 'a', name: 'Alder CC', rounds: 3, lastPlayed: '2026-07-01' },
    ]);
  });
});
