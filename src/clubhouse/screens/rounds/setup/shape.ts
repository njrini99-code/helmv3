import type { ChRoundType, ChTeeColor } from '../../../data/rounds-shape';

/**
 * Round setup's neutral contract (docs/clubhouse/ROUNDS_PLAN.md, step 3): what
 * the Clubhouse setup screen draws and what it hands back to start a round.
 * The round screen supplies the ports (the course library actions and the
 * legacy engine's round start, when step 4 moves it); the preview fakes them.
 * Pure and client-safe.
 */

export interface ChSetupHole {
  n: number;
  par: number;
  /** Yards, as typed (a string while editing). */
  yards: string;
}

export interface ChSetupTee {
  id: string;
  name: string;
  color: ChTeeColor | null;
  /** "Championship", "Men's", … (golf_course_tees.category), or null. */
  category: string | null;
  yards: number | null;
  par: number | null;
  rating: number | null;
  slope: number | null;
  holesCount: 9 | 18;
  /** An incomplete tee set (golf_course_tees.is_draft): shown, not playable. */
  draft: boolean;
}

export interface ChSetupCourse {
  id: string;
  name: string;
  /** "Pittsboro, NC", or null. */
  place: string | null;
  /**
   * The course's own city and state, as the library stores them. The round saves these two (Fairway's tee pick passes
   * them straight through); `place` is only how the picker prints them, and a place of one part can't say which it is.
   */
  city?: string | null;
  state?: string | null;
  par: number | null;
  teeCount: number | null;
  /** `saved`: one of the player's own saved courses (golf_player_courses, "Your courses"), as Fairway's setup lists them. */
  group: 'recent' | 'saved' | 'team' | 'library';
  /**
   * A saved course: its golf_player_courses row and the library course it is linked to (often none). Its id in the
   * picker is a stand-in (`saved:<row>`); the round starts with `courseId` and no tee, as Fairway's saved-course start does.
   */
  saved?: { id: string; courseId: string | null };
  /** "Oct 2", when the player last played it (recent only). */
  lastPlayed: string | null;
  /** Its photo: one uploaded to the library, else a bundled photo of the real course; none means the picker's default scene. */
  image?: string | null;
}

/** An open qualifier the player can play a round of now. */
export interface ChSetupQualifier {
  id: string;
  name: string;
  courseId: string | null;
  courseName: string | null;
  teeId: string | null;
  teeName: string | null;
  /** The next round to play, or null with `blocked` saying why. */
  nextRound: number | null;
  rounds: number;
  completed: number;
  blocked: string | null;
}

/** The course the round is at: from the library (ids), or typed by hand for this round. */
export interface ChSetupPick {
  courseId: string | null;
  courseName: string;
  place: string | null;
  /** The course's city and state, kept apart (see `ChSetupCourse`); absent, the start splits `place`. */
  city?: string | null;
  state?: string | null;
  /** The golf_player_courses row this pick came from ("Your courses"); its use is noted once the round starts. */
  savedId?: string | null;
  teeId: string | null;
  teeName: string;
  teeColor: ChTeeColor | null;
  rating: number | null;
  slope: number | null;
  yards: number | null;
}

export interface ChSetupForm {
  pick: ChSetupPick | null;
  type: ChRoundType;
  /** YYYY-MM-DD, never after today. */
  date: string;
  count: 9 | 18;
  nine: 'front' | 'back';
  holes: ChSetupHole[];
  /** The tee's own holes, to mark the ones edited for this round. */
  baseline: ChSetupHole[] | null;
  qualifierId: string | null;
  qualifierRound: number | null;
  /** A course typed by hand: save it for next time and offer it to the library (the legacy "save course" opt-in). */
  saveCourse: boolean;
  /** A course typed by hand: the photo chosen for it, uploaded to the library course once the round's start saves it. */
  coursePhoto?: File | null;
  /**
   * Shotgun start: the card's number of the hole the round starts on (15 on a back nine). Omitted, null or not one of
   * the holes played, the first hole played. Only the play order changes; every hole is still played once.
   */
  start?: number | null;
}

export type ChResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * A start that did not open a round. The words are the engine's own sentence. Without a `kind` it is a plain failure
 * (CH-11007: a toast with Retry); with one, the screen does what the reason calls for:
 *  - `handled`: another surface owns the outcome (the round already in progress asks what to do, or the qualifier's
 *    round in progress opened), so setup says nothing;
 *  - `final`: trying again can't change the answer, so the toast has no Retry.
 * `code` and `retry` name a failure toast that isn't CH-11007's, and what its action says instead of "Try again".
 */
export interface ChStartFailure {
  ok: false;
  error: string;
  kind?: 'handled' | 'final';
  code?: string;
  retry?: string;
}

export type ChStartResult = { ok: true; data: { roundId: string } } | ChStartFailure;

/** What the round screen supplies. */
export interface ChSetupPorts {
  listCourses: () => Promise<ChResult<ChSetupCourse[]>>;
  listTees: (courseId: string) => Promise<ChResult<ChSetupTee[]>>;
  teeHoles: (teeId: string) => Promise<ChResult<ChSetupHole[]>>;
  /** Creates the round; resolves once it is saved (then the round screen opens tracking). */
  start: (form: ChSetupForm) => Promise<ChStartResult>;
}

/** The holes this round plays: all of them, or the chosen nine of an 18-hole card. */
export function holesForRound(holes: ChSetupHole[], count: 9 | 18, nine: 'front' | 'back'): ChSetupHole[] {
  if (count === 18 || holes.length <= 9) return holes.slice(0, count);
  return nine === 'back' ? holes.slice(9, 18) : holes.slice(0, 9);
}

/**
 * Where the round starts, as a position 1..N in the holes it plays (what the engine takes: it numbers the holes it
 * plays 1..N, a back nine included). The first hole when `start` is not one of them.
 */
export function startPosition(form: Pick<ChSetupForm, 'holes' | 'count' | 'nine' | 'start'>): number {
  const at = holesForRound(form.holes, form.count, form.nine).findIndex((h) => h.n === form.start);
  return at >= 0 ? at + 1 : 1;
}

export const parOf = (holes: ChSetupHole[]) => holes.reduce((s, h) => s + h.par, 0);
export const yardsOf = (holes: ChSetupHole[]) => holes.reduce((s, h) => s + (parseInt(h.yards, 10) || 0), 0);

/** How many holes differ from the tee's own card. */
export function editedCount(holes: ChSetupHole[], baseline: ChSetupHole[] | null): number {
  if (!baseline) return 0;
  return holes.filter((h, i) => baseline[i] && (baseline[i]!.par !== h.par || baseline[i]!.yards !== h.yards)).length;
}

/** Pars a hole can have (the round save allows 3 to 6, RE-F10). */
export const PARS = [3, 4, 5, 6] as const;
/** The legacy editor's sanity ceiling (the server sets none). */
export const MAX_HOLE_YARDS = 999;

/** A hole's yardage problem, or null: 1 to 999 yards, as the legacy editor checks. */
export function holeIssue(h: ChSetupHole): string | null {
  const y = parseInt(h.yards, 10);
  if (!h.yards.trim() || !Number.isFinite(y) || y < 1) return `Hole ${h.n} needs a yardage`;
  if (y > MAX_HOLE_YARDS) return `Hole ${h.n}: ${y} yards is too long (${MAX_HOLE_YARDS} at most)`;
  return null;
}

/**
 * Which holes need a yardage before a round can start, as Fairway decides it for the same course (its preloaded start,
 * `handleSetupSubmit`): a library tee's card starts on its pars alone, a saved course's needs a yardage on at least one
 * hole, and a course typed in by hand needs every one (Fairway's hole editor). A hole left blank starts at 0 yards.
 */
export function yardageRule(pick: ChSetupPick | null): 'every' | 'any' | 'none' {
  if (pick?.teeId) return 'none';
  if (pick?.savedId) return 'any';
  return 'every';
}

/**
 * The one thing that stops Start, in words, or null. CH-11107 (a hole),
 * CH-11109 (a date after today), in the order a player fixes them.
 */
export function setupBlocker(form: ChSetupForm, today: string): string | null {
  if (!form.pick) return 'Choose a course to start';
  if (!form.date) return 'Pick the date you played';
  if (form.date > today) return "The round’s date can’t be after today";
  if (form.type === 'qualifier' && (!form.qualifierId || !form.qualifierRound)) return 'Choose the qualifier round';
  const holes = holesForRound(form.holes, form.count, form.nine);
  if (holes.length < form.count) return `This card has ${holes.length} holes; play 9`;
  const rule = yardageRule(form.pick);
  for (const h of holes) {
    // A blank yardage is allowed where Fairway allows it (`yardageRule`); one over the limit never is.
    if (rule !== 'every' && !(parseInt(h.yards, 10) > 0)) continue;
    const issue = holeIssue(h);
    if (issue) return issue;
  }
  if (rule === 'any' && !holes.some((h) => parseInt(h.yards, 10) > 0)) return 'Add a yardage for at least one hole';
  return null;
}

/** Courses for the picker: grouped (recent, team, library), or one Results list when searching. */
export function groupCourses(list: ChSetupCourse[], q: string): Array<{ key: string; label: string; courses: ChSetupCourse[] }> {
  const needle = q.trim().toLowerCase();
  if (needle) {
    const hits = list.filter((c) => `${c.name} ${c.place ?? ''}`.toLowerCase().includes(needle));
    return hits.length ? [{ key: 'results', label: 'Results', courses: hits }] : [];
  }
  const groups: Array<[ChSetupCourse['group'], string]> = [
    ['recent', 'Recently played'],
    ['saved', 'Your courses'],
    ['team', 'Team courses'],
    ['library', 'Course library'],
  ];
  return groups.map(([key, label]) => ({ key, label, courses: list.filter((c) => c.group === key) })).filter((g) => g.courses.length);
}

/** The default 18-hole card for a course typed by hand: par 72, empty yardages. */
export function blankHoles(count: 9 | 18): ChSetupHole[] {
  const card = [4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
  return card.slice(0, count).map((par, i) => ({ n: i + 1, par, yards: '' }));
}
