import { getNextQualifierRoundNumber, getPlayerQualifiers } from '@/app/golf/actions/golf';
import { getCourseDetail, getRecentlyPlayedCourses, getTeamSavedCourses, getTeeWithHoles, listCoursesStrict } from '@/app/golf/actions/course-library';
import type { GolfCourse, GolfCourseTee } from '@/lib/types/golf-course';
import type { NewRoundStartForm, NewRoundStartResult } from '@/lib/golf/round-session/start-form';
import { teeColorFor } from '../../../data/rounds-shape';
import { chReport } from '../../../lib/track';
import { holesForRound, type ChResult, type ChSetupCourse, type ChSetupForm, type ChSetupHole, type ChSetupPorts, type ChSetupQualifier, type ChSetupTee, type ChStartFailure } from '../setup/shape';

/*
 * The reads and the start form behind round setup's ports (docs/clubhouse/ROUNDS_PLAN.md step 3 to 5): the course
 * library actions the legacy picker uses, shaped for the Clubhouse setup, and the setup form shaped for the engine's
 * `start(form)`. Each read reports its own failure to Sentry, since setup's reads run in the browser and nothing else
 * would (VERIFY.md, "Found and not fixed").
 */

const words = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Something went wrong.');

async function read<T>(action: string, run: () => Promise<ChResult<T>>): Promise<ChResult<T>> {
  try {
    return await run();
  } catch (err) {
    chReport(err, { surface: 'rounds', action: `rounds.${action}` });
    return { ok: false, error: words(err) };
  }
}

const place = (c: Pick<GolfCourse, 'city' | 'state'>) => [c.city?.trim(), c.state?.trim()].filter(Boolean).join(', ') || null;

const course = (c: GolfCourse, group: ChSetupCourse['group']): ChSetupCourse => ({
  id: c.id,
  name: c.name,
  place: place(c),
  par: c.total_par ?? null,
  // The picker's "N tees" badge would take a second read per course; the tee list has the count once a course is opened.
  teeCount: null,
  group,
  // The recent list is ordered, not dated, so there is no day to print (nothing is invented).
  lastPlayed: null,
});

/**
 * The course library as setup's picker groups it: recently played, then the team's saved courses, then the rest.
 * A course is in one group, the first that has it. The library read is the strict one, so a failed read is a failure
 * (CH-11209) and never an empty library; the recent and team reads are best-effort, as the legacy picker's are.
 */
export function listCoursesRead(): Promise<ChResult<ChSetupCourse[]>> {
  return read('courses', async () => {
    const [library, recent, team] = await Promise.all([
      listCoursesStrict({ limit: 200 }),
      getRecentlyPlayedCourses(12).catch((err: unknown) => {
        chReport(err, { surface: 'rounds', action: 'rounds.courses.recent', severity: 'low' });
        return [] as GolfCourse[];
      }),
      getTeamSavedCourses()
        .then((rows) => rows.map((r) => r.course))
        .catch((err: unknown) => {
          chReport(err, { surface: 'rounds', action: 'rounds.courses.team', severity: 'low' });
          return [] as GolfCourse[];
        }),
    ]);
    const seen = new Set<string>();
    const out: ChSetupCourse[] = [];
    for (const [group, list] of [['recent', recent], ['team', team], ['library', library]] as const) {
      for (const c of list) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(course(c, group));
      }
    }
    return { ok: true, data: out };
  });
}

const CATEGORY: Record<string, string> = { mens: 'Men’s', womens: 'Women’s', tournament: 'Tournament', mixed: 'Mixed', senior: 'Senior', junior: 'Junior' };

export function teeFrom(t: GolfCourseTee): ChSetupTee {
  return {
    id: t.id,
    name: t.tee_name,
    color: teeColorFor(t.tee_color) ?? teeColorFor(t.tee_name),
    category: t.category ? (CATEGORY[t.category] ?? null) : null,
    yards: t.total_yards ?? null,
    par: t.total_par ?? null,
    rating: t.course_rating ?? null,
    slope: t.slope_rating ?? null,
    holesCount: t.holes_count === 9 ? 9 : 18,
    draft: t.is_draft,
  };
}

/** A course's tee sets. A course the player can't read is a failure, not "no tees". */
export function listTeesRead(courseId: string): Promise<ChResult<ChSetupTee[]>> {
  return read('tees', async () => {
    const detail = await getCourseDetail(courseId);
    if (!detail) return { ok: false, error: 'That course could not be read.' };
    return { ok: true, data: detail.tees.map(teeFrom) };
  });
}

/** A tee's card, in hole order. A hole with no yardage stays blank, and Start names it (CH-11107). */
export function teeHolesRead(teeId: string): Promise<ChResult<ChSetupHole[]>> {
  return read('holes', async () => {
    const tee = await getTeeWithHoles(teeId);
    if (!tee) return { ok: false, error: 'That tee could not be read.' };
    const holes = tee.holes
      .slice()
      .sort((a, b) => a.hole_number - b.hole_number)
      .map((h, i) => ({ n: i + 1, par: h.par, yards: h.yardage != null ? String(h.yardage) : '' }));
    return { ok: true, data: holes };
  });
}

/** How long setup waits for the qualifier reads before it says they didn't load (CH-11211), so a slow read never blocks a practice round. */
export const QUALIFIER_READ_MS = 6000;

/**
 * The player's qualifiers that a coach hasn't closed, each with the round they can play now. A closed qualifier is
 * closed (D-31); one with every round in, or with a round already in progress, is listed with why it can't be played.
 * Null when the list itself didn't load. The engine's own `getPlayerQualifiers` call (its legacy dropdown) is separate.
 */
export async function loadSetupQualifiers(): Promise<ChSetupQualifier[] | null> {
  try {
    const all = await getPlayerQualifiers();
    if (!all.success) return null;
    const open = all.data.filter((q) => q.status !== 'completed');
    return await Promise.all(
      open.map(async (q): Promise<ChSetupQualifier> => {
        const base = { id: q.id, name: q.name, courseId: null, courseName: q.courseName, teeId: null, teeName: null, rounds: q.numRounds, completed: q.roundsCompleted };
        if (q.roundsCompleted >= q.numRounds) return { ...base, nextRound: null, blocked: `All ${q.numRounds} ${q.numRounds === 1 ? 'round is' : 'rounds are'} in; your coach is selecting.` };
        try {
          const next = await getNextQualifierRoundNumber(q.id);
          if (!next.success) return { ...base, nextRound: null, blocked: 'We couldn’t check this qualifier. Try again in a moment.' };
          if (next.data.activeRoundId) return { ...base, nextRound: null, blocked: 'A round is already in progress. Continue it from Rounds.' };
          const round = next.data.availableRounds.includes(next.data.nextRoundNumber) ? next.data.nextRoundNumber : null;
          return { ...base, nextRound: round, blocked: round == null ? 'No round is open to you right now.' : null };
        } catch (err) {
          chReport(err, { surface: 'rounds', action: 'rounds.qualifiers.next', severity: 'low' });
          return { ...base, nextRound: null, blocked: 'We couldn’t check this qualifier. Try again in a moment.' };
        }
      }),
    );
  } catch (err) {
    chReport(err, { surface: 'rounds', action: 'rounds.qualifiers' });
    return null;
  }
}

/** "Pittsboro, NC" back to a city and a state; the last comma splits them, and one part alone is a city. */
export function placeParts(text: string | null): { city: string; state: string } {
  const t = text?.trim();
  if (!t) return { city: '', state: '' };
  const at = t.lastIndexOf(',');
  return at < 0 ? { city: t, state: '' } : { city: t.slice(0, at).trim(), state: t.slice(at + 1).trim() };
}

/**
 * The setup form as the engine starts from it: the chosen nine (or eighteen) numbered 1 to N, the tee's rating and
 * slope as the text the engine's own gate reads, and the qualifier and its round. `saveCourse` is the "save this
 * course" opt-in of a hand-typed course.
 */
export function toStartForm(f: ChSetupForm): NewRoundStartForm {
  const pick = f.pick;
  const { city, state } = placeParts(pick?.place ?? null);
  return {
    setup: {
      courseName: pick?.courseName ?? '',
      courseCity: city,
      courseState: state,
      courseRating: pick?.rating != null ? String(pick.rating) : '',
      courseSlope: pick?.slope != null ? String(pick.slope) : '',
      teesPlayed: pick?.teeName ?? '',
      roundType: f.type,
      roundDate: f.date,
    },
    qualifierId: f.type === 'qualifier' ? f.qualifierId : null,
    qualifierRoundNumber: f.type === 'qualifier' ? f.qualifierRound : null,
    courseId: pick?.courseId ?? null,
    teeId: pick?.teeId ?? null,
    holes: holesForRound(f.holes, f.count, f.nine).map((h, i) => ({ holeNumber: i + 1, par: h.par, yardage: parseInt(h.yards, 10) })),
    saveCourse: f.saveCourse,
  };
}

/** The read ports a setup screen needs besides Start, which the round screen makes from the engine. */
export const SETUP_READ_PORTS: Pick<ChSetupPorts, 'listCourses' | 'listTees' | 'teeHoles'> = {
  listCourses: listCoursesRead,
  listTees: listTeesRead,
  teeHoles: teeHolesRead,
};

/**
 * What a refused start means to the setup screen (ROUNDS_PLAN step 5a: the engine's `reason` decides).
 *  - The round already in progress for this course and date is the conflict dialog's (CH-11514), and a qualifier round
 *    already in progress opens (`open`, CH-11907); a call that changed nothing (`in_flight`, `already_started`) says
 *    nothing. Setup stays quiet for all of these (`handled`).
 *  - A qualifier round the player can't play now can't be fixed by trying again (CH-11014); one that couldn't be
 *    checked can (CH-11015).
 *  - A completed round on this course and date warns once, and the second Start goes ahead: the toast's action is
 *    that Start (CH-11016).
 *  - An offline start is the shell's refusal (CH-1903), in the engine's words.
 *  - Everything else (`invalid`, `server_rejected`, `transport`) is CH-11007's toast with Retry.
 */
export function startRefusal(refusal: Extract<NewRoundStartResult, { ok: false }>): ChStartFailure & { open?: string } {
  const { error } = refusal;
  switch (refusal.reason) {
    case 'in_progress_exists':
    case 'in_flight':
    case 'already_started':
      return { ok: false, error, kind: 'handled' };
    case 'qualifier_round_active':
      return { ok: false, error, kind: 'handled', open: refusal.roundId };
    case 'qualifier_round_unavailable':
      return { ok: false, error, kind: 'final', code: 'CH-11014' };
    case 'qualifier_unverified':
      return { ok: false, error, code: 'CH-11015' };
    case 'duplicate_completed_round':
      return { ok: false, error, code: 'CH-11016', retry: 'Start anyway' };
    case 'offline':
      return { ok: false, error, code: 'CH-1903' };
    default:
      return { ok: false, error };
  }
}
