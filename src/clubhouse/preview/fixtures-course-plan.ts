import { buildCoursePlan, type CoursePlanCourse, type CoursePlanHole, type CoursePlanShot } from '@/lib/coachhelm/course-plan/build-plan';
import type { ChCoursePlanReads, ChMyCoursePlanReads } from '../screens/coachhelm/writes';

/**
 * Course plan fixtures for the dev preview (Slice 7c): synthetic rounds run through the real builder, so the preview shows the
 * copy the engine writes. Pine Hollow is supercharge 04 Example 10 (three rounds: water right on 4 and 11, par 3s short, more
 * three-putts than elsewhere); Cedar Ridge has seven rounds, so it carries no thin-history line.
 */
const PARS: Record<number, number> = { 3: 3, 7: 3, 12: 3, 16: 3, 5: 5, 13: 5 };
const YARDS: Record<number, number> = { 3: 165, 7: 185, 12: 205, 16: 175 };

type Hole = { over?: number; putts?: number; tee?: Partial<CoursePlanShot>; pens?: string[] };

function round(id: string, spec: Record<number, Hole>): { holes: CoursePlanHole[]; shots: CoursePlanShot[] } {
  const holes: CoursePlanHole[] = [];
  const shots: CoursePlanShot[] = [];
  for (let n = 1; n <= 18; n++) {
    const s = spec[n] ?? {};
    const par = PARS[n] ?? 4;
    holes.push({ roundId: id, holeNumber: n, par, score: par + (s.over ?? 0), putts: s.putts ?? 2, penaltyStrokes: s.pens?.length ?? 0, yardage: YARDS[n] ?? (par === 5 ? 520 : 390) });
    shots.push({ roundId: id, holeNumber: n, shotNumber: 1, shotType: par === 3 ? 'approach' : 'tee', clubType: par === 3 ? 'non_driver' : 'driver', missDirection: null, result: par === 3 ? 'green' : 'fairway', penaltyType: null, distanceBefore: null, distanceUnitBefore: 'yards', ...s.tee });
    (s.pens ?? []).forEach((p, i) => shots.push({ roundId: id, holeNumber: n, shotNumber: 2 + i, shotType: 'penalty', clubType: 'non_driver', missDirection: null, result: 'penalty', penaltyType: p, distanceBefore: null, distanceUnitBefore: 'yards' }));
  }
  return { holes, shots };
}

const waterRight: Hole = { over: 2, tee: { missDirection: 'right', result: 'other' }, pens: ['water'] };
const rightRough: Hole = { over: 1, tee: { missDirection: 'right', result: 'rough' } };
const short: Hole = { over: 1, tee: { missDirection: 'short', result: 'rough' } };
const shortRight: Hole = { over: 1, tee: { missDirection: 'short_right', result: 'sand' } };
const longLeft: Hole = { over: 1, tee: { missDirection: 'long_left', result: 'rough' } };
const threePutt: Hole = { over: 1, putts: 3 };

const PINE = [
  round('p1', { 4: waterRight, 11: rightRough, 3: short, 7: short, 12: short, 1: threePutt }),
  round('p2', { 4: rightRough, 11: waterRight, 7: shortRight, 12: short, 16: longLeft, 8: threePutt, 15: threePutt }),
  round('p3', { 4: waterRight, 11: rightRough, 3: shortRight, 16: longLeft, 12: { over: 2, tee: { missDirection: 'short', result: 'other' } }, 2: threePutt }),
];

const CEDAR = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].map((id, i) =>
  round(id, { 9: i % 2 ? { over: 1, tee: { missDirection: 'left', result: 'rough' } } : { over: 2, tee: { missDirection: 'left', result: 'sand' } }, 14: i < 4 ? { over: 2, tee: { missDirection: null }, pens: ['ob'] } : { over: 1 } }),
);

function plan(name: string, rounds: ReturnType<typeof round>[], elsewhere: { rounds: number; threePutts: number }) {
  return buildCoursePlan({ courseName: name, roundIds: rounds.map((r) => r.holes[0]!.roundId), holes: rounds.flatMap((r) => r.holes), shots: rounds.flatMap((r) => r.shots), elsewhere });
}

export const PREVIEW_COURSES: CoursePlanCourse[] = [
  { courseId: 'c-cedar', name: 'Cedar Ridge', rounds: 7, lastPlayed: '2026-10-04' },
  { courseId: 'c-pine', name: 'Pine Hollow', rounds: 3, lastPlayed: '2026-09-27' },
];

export const PREVIEW_PLANS = {
  'c-pine': plan('Pine Hollow', PINE, { rounds: 20, threePutts: 4 }),
  'c-cedar': plan('Cedar Ridge', CEDAR, { rounds: 16, threePutts: 13 }),
} as const;

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));

/** `courseplan` answers both courses; `courseplannone` a player with no course at three rounds; `courseplanfailed` fails the read. */
export function previewCoursePlanReads(state?: string): ChCoursePlanReads {
  return {
    courses: () => wait(state === 'courseplanfailed' ? { status: 'failed' as const } : { status: 'ok' as const, courses: state === 'courseplannone' ? [] : PREVIEW_COURSES }),
    plan: (_p, courseId) => wait({ status: 'ok' as const, plan: PREVIEW_PLANS[courseId as keyof typeof PREVIEW_PLANS] ?? { status: 'too_few' as const, courseName: 'This course', rounds: 0 } }),
  };
}

/**
 * The player's own course plan (chs-21) over the same plans, in their voice only, as `getMyCoursePlan` answers: `courseplan`
 * answers both courses, `courseplannone` a player with no course at three rounds, `courseplanfailed` fails the read.
 */
export function previewMyCoursePlanReads(state?: string): ChMyCoursePlanReads {
  return {
    courses: () => wait(state === 'courseplanfailed' ? { status: 'failed' as const } : { status: 'ok' as const, courses: state === 'courseplannone' ? [] : PREVIEW_COURSES }),
    plan: (courseId) => {
      const plan = PREVIEW_PLANS[courseId as keyof typeof PREVIEW_PLANS];
      if (!plan || plan.status === 'too_few') return wait({ status: 'ok' as const, plan: plan ?? { status: 'too_few' as const, courseName: 'This course', rounds: 0 } });
      const { player } = plan;
      return wait({ status: 'ok' as const, plan: { status: 'plan' as const, courseName: plan.courseName, rounds: plan.rounds, title: player.title, lines: player.lines, thinLine: player.thinLine, emptyLine: player.emptyLine } });
    },
  };
}
