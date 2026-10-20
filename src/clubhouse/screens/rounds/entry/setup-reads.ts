import { getNextQualifierRoundNumber, getPlayerQualifiers } from '@/app/golf/actions/qualifier-actions';
import { getCourseDetail, getRecentlyPlayedCourses, getTeamSavedCourses, getTeeWithHoles, listCoursesStrict } from '@/app/golf/actions/course-library';
import { getPlayerSavedCourses, touchSavedCourse, type SavedCourse } from '@/app/golf/actions/saved-courses';
import type { GolfCourse, GolfCourseTee } from '@/lib/types/golf-course';
import { resolveRealCourseImage } from '@/lib/golf/course-image-assets';
import type { NewRoundStartForm, NewRoundStartResult } from '@/lib/golf/round-session/start-form';
import { teeColorFor } from '../../../data/rounds-shape';
import { chReport } from '../../../lib/track';
import { blankHoles, holesForRound, startPosition, yardageRule, type ChResult, type ChSetupCourse, type ChSetupForm, type ChSetupHole, type ChSetupPorts, type ChSetupQualifier, type ChSetupTee, type ChStartFailure } from '../setup/shape';

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
  city: c.city?.trim() || null,
  state: c.state?.trim() || null,
  par: c.total_par ?? null,
  // The picker's "N tees" badge would take a second read per course; the tee list has the count once a course is opened.
  teeCount: null,
  group,
  // The recent list is ordered, not dated, so there is no day to print (nothing is invented).
  lastPlayed: null,
  image: c.image_url || resolveRealCourseImage(c.name, c.normalized_name),
});

// ── The player's own saved courses ("Your courses", golf_player_courses) ──
// Fairway's setup lists them beside the library (getPlayerSavedCourses), and most have no library course behind them
// (52 of 54 rows had no course_id on 2026-10-17), so without them a player has to type a course they saved in again.
// A saved course has one tee set, the one it was saved with, and its card is the holes it was saved with. In the picker
// both carry a stand-in id (`saved:<row>`), resolved here from the rows the library read last brought back.

const SAVED = 'saved:';
const savedRows = new Map<string, SavedCourse>();
const nameKey = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();

/** The tee name a saved course plays, as Fairway's saved-course pick defaults it. */
const savedTeeName = (s: SavedCourse) => s.teesPlayed?.trim() || 'White';
const savedCount = (s: SavedCourse): 9 | 18 => (s.holesPerRound === 9 ? 9 : 18);

function savedCourseCard(s: SavedCourse): ChSetupCourse {
  const city = s.courseCity?.trim() || null;
  const state = s.courseState?.trim() || null;
  return {
    id: SAVED + s.id,
    name: s.courseName,
    place: [city, state].filter(Boolean).join(', ') || null,
    city,
    state,
    par: s.holeConfigs.length ? s.holeConfigs.reduce((a, h) => a + h.par, 0) : null,
    teeCount: 1,
    group: 'saved',
    lastPlayed: null,
    image: resolveRealCourseImage(s.courseName),
    saved: { id: s.id, courseId: s.courseId },
  };
}

/** A saved course's row: the one the last library read brought back, else read again (a picker opened before it). */
async function savedRow(pickerId: string): Promise<SavedCourse | null> {
  const id = pickerId.slice(SAVED.length);
  const known = savedRows.get(id);
  if (known) return known;
  const res = await getPlayerSavedCourses();
  if (!res.success) throw new Error(res.error || 'Your saved courses could not be read.');
  for (const row of res.data) savedRows.set(row.id, row);
  return savedRows.get(id) ?? null;
}

/**
 * The course library as setup's picker groups it: recently played, then the player's own saved courses, then the
 * team's saved courses, then the rest. A course is in one group, the first that has it; a saved course is left out when
 * the library already lists its course (its link, or a library course of the same name), so a course is offered once.
 * The library read is the strict one, so a failed read is a failure (CH-11209) and never an empty library; the recent,
 * saved and team reads are best-effort, as the legacy picker's are.
 */
export function listCoursesRead(): Promise<ChResult<ChSetupCourse[]>> {
  return read('courses', async () => {
    const [library, recent, team, saved] = await Promise.all([
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
      getPlayerSavedCourses()
        .then((res) => {
          if (!res.success) throw new Error(res.error || 'Saved courses read failed');
          return res.data;
        })
        .catch((err: unknown) => {
          chReport(err, { surface: 'rounds', action: 'rounds.courses.saved', severity: 'low' });
          return [] as SavedCourse[];
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
    const names = new Set(out.map((c) => nameKey(c.name)));
    const mine: ChSetupCourse[] = [];
    for (const row of saved) {
      savedRows.set(row.id, row);
      if (!row.courseName?.trim()) continue;
      if ((row.courseId && seen.has(row.courseId)) || names.has(nameKey(row.courseName))) continue;
      names.add(nameKey(row.courseName));
      mine.push(savedCourseCard(row));
    }
    // Recently played first, then the player's own, as the picker draws them.
    const recentCount = out.filter((c) => c.group === 'recent').length;
    return { ok: true, data: [...out.slice(0, recentCount), ...mine, ...out.slice(recentCount)] };
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
    if (courseId.startsWith(SAVED)) {
      const row = await savedRow(courseId);
      if (!row) return { ok: false, error: 'That saved course could not be read.' };
      const name = savedTeeName(row);
      const yards = row.holeConfigs.reduce((a, h) => a + (h.yardage > 0 ? h.yardage : 0), 0);
      const tee: ChSetupTee = {
        id: courseId,
        name,
        color: teeColorFor(name),
        category: null,
        yards: yards || null,
        par: row.holeConfigs.length ? row.holeConfigs.reduce((a, h) => a + h.par, 0) : null,
        rating: row.courseRating ?? null,
        slope: row.courseSlope ?? null,
        holesCount: savedCount(row),
        draft: false,
      };
      return { ok: true, data: [tee] };
    }
    const detail = await getCourseDetail(courseId);
    if (!detail) return { ok: false, error: 'That course could not be read.' };
    return { ok: true, data: detail.tees.map(teeFrom) };
  });
}

/** A tee's card, in hole order. A hole with no yardage stays blank, and Start names it (CH-11107). */
export function teeHolesRead(teeId: string): Promise<ChResult<ChSetupHole[]>> {
  return read('holes', async () => {
    if (teeId.startsWith(SAVED)) {
      // The card the course was saved with; a saved course with none is a blank card of its length, to fill in.
      const row = await savedRow(teeId);
      if (!row) return { ok: false, error: 'That saved course could not be read.' };
      if (!row.holeConfigs.length) return { ok: true, data: blankHoles(savedCount(row)) };
      const holes = row.holeConfigs
        .slice()
        .sort((a, b) => a.holeNumber - b.holeNumber)
        .map((h, i) => ({ n: i + 1, par: h.par, yards: h.yardage > 0 ? String(h.yardage) : '' }));
      return { ok: true, data: holes };
    }
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
 * Why a qualifier has no round to play, from the server's refusal (`getNextQualifierRoundNumber`). Fairway shows the
 * server's own sentence; here each definitive refusal gets one the player can act on, and only a read that failed says
 * to try again. A refusal that is not a read failure never reads as "try again": trying again can't change it.
 */
export function qualifierBlockedReason(next: { error?: string; code?: string }, numRounds: number): string {
  const error = next.error ?? '';
  if (next.code === 'qualifier_round_limit_reached') return `All ${numRounds} ${numRounds === 1 ? 'round is' : 'rounds are'} in. Ask your coach to add a round if you need another.`;
  if (/more than one saved round/i.test(error)) return 'You have more than one saved round in this qualifier. Continue one from Rounds.';
  if (/not entered in this qualifier/i.test(error)) return 'You’re no longer entered in this qualifier. Ask your coach.';
  if (/qualifier not found/i.test(error)) return 'This qualifier isn’t there any more. Ask your coach.';
  return 'We couldn’t check this qualifier. Try again in a moment.';
}

/**
 * The player's qualifiers that a coach hasn't closed, each with the round they can play now. A closed qualifier is
 * closed (D-31; a round can't be submitted to it, `submit_round_atomic`); one with every round in, or with a round
 * already in progress, is listed with why it can't be played. Null when the list itself didn't load. The engine's own
 * `getPlayerQualifiers` call (its legacy dropdown) is separate.
 *
 * Every open qualifier asks the server for its next round, as Fairway's picker does when one is chosen: the count
 * `getPlayerQualifiers` gives (`roundsCompleted`, which can come from the entry's stored totals or count a round with
 * no round number) is not the rule; `resolveQualifierRoundNumber` is, and a free slot it finds is playable.
 */
export async function loadSetupQualifiers(): Promise<ChSetupQualifier[] | null> {
  try {
    const all = await getPlayerQualifiers();
    if (!all.success) return null;
    const open = all.data.filter((q) => q.status !== 'completed');
    return await Promise.all(
      open.map(async (q): Promise<ChSetupQualifier> => {
        const base = { id: q.id, name: q.name, courseId: null, courseName: q.courseName, teeId: null, teeName: null, rounds: q.numRounds, completed: q.roundsCompleted };
        try {
          const next = await getNextQualifierRoundNumber(q.id);
          if (!next.success) return { ...base, nextRound: null, blocked: qualifierBlockedReason(next, q.numRounds) };
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
  // The course's own city and state when the pick carries them: "NC" alone is a state, which `placeParts` would read as
  // a city. A pick without them (an older fixture) falls back to splitting the printed place.
  const split = placeParts(pick?.place ?? null);
  const city = pick?.city !== undefined ? (pick.city ?? '') : split.city;
  const state = pick?.state !== undefined ? (pick.state ?? '') : split.state;
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
      startHole: startPosition(f),
    },
    qualifierId: f.type === 'qualifier' ? f.qualifierId : null,
    qualifierRoundNumber: f.type === 'qualifier' ? f.qualifierRound : null,
    courseId: pick?.courseId ?? null,
    teeId: pick?.teeId ?? null,
    // A hole left blank (allowed by `yardageRule`, as on Fairway) starts at 0 yards.
    holes: holesForRound(f.holes, f.count, f.nine).map((h, i) => ({ holeNumber: i + 1, par: h.par, yardage: parseInt(h.yards, 10) || 0 })),
    yardage: yardageRule(pick),
    // A saved course with no library course behind it is offered to the library with the holes played under the card's
    // numbers, and the round is linked to what that finds (the engine's opt-in), as Fairway's saved-course start does.
    ...(pick?.savedId && !pick.courseId && !f.saveCourse
      ? { libraryOffer: holesForRound(f.holes, f.count, f.nine).map((h) => ({ holeNumber: h.n, par: h.par, yardage: parseInt(h.yards, 10) || 0 })) }
      : {}),
    saveCourse: f.saveCourse,
    // Only a course typed by hand is saved by the start, so only it carries a photo.
    courseImage: pick && !pick.courseId && f.saveCourse ? (f.coursePhoto ?? null) : null,
  };
}

/**
 * Fairway notes a saved course's use (`touchSavedCourse`) so it stays first in the player's list. Here it is noted when
 * a round starts from it ("Your courses"), not when it is picked, so a course looked at and left is not moved.
 * Best-effort, never awaited. The library offer of a saved course with no library course is the engine's
 * (`libraryOffer` in `toStartForm`), so the round is linked to the course it creates.
 */
export function afterSavedCourseStart(f: ChSetupForm): void {
  const savedId = f.pick?.savedId;
  if (!savedId) return;
  void Promise.resolve()
    .then(() => touchSavedCourse(savedId))
    .catch((err: unknown) => chReport(err, { surface: 'rounds', action: 'rounds.courses.savedTouch', severity: 'low' }));
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
