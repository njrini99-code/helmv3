/**
 * What a new round starts from, and the rules that gate it. A plain module (no 'use client'), so the setup screens,
 * tests and any server code can import the rules without pulling in the engine hook. The engine re-exports all of it.
 */
import type { HoleConfig } from '@/lib/types/golf-course';
import { localDayIso } from '@/lib/golf/local-day';

export interface RoundSetupForm {
  courseName: string;
  courseCity: string;
  courseState: string;
  courseRating: string;
  courseSlope: string;
  teesPlayed: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
}

/**
 * The setup a round starts from: everything `validateStartForm` and `persistRoundStart` read. The legacy screen's
 * setup state passes as this; a renderer that keeps the form itself passes that.
 */
export interface NewRoundSetup {
  setup: RoundSetupForm;
  qualifierId: string | null;
  /** The qualifier's round number, when `setup.roundType` is 'qualifier'. */
  qualifierRoundNumber: number | null;
}

/** Everything `start` needs, as one argument (ROUNDS_PLAN step 5a). */
export interface NewRoundStartForm extends NewRoundSetup {
  /** golf_courses.id of a cloud pick, else null. */
  courseId: string | null;
  /** golf_course_tees.id of a cloud pick, else null. */
  teeId: string | null;
  /**
   * The holes this round plays, in order: 9 or 18 (the chosen nine of an 18-hole card already sliced), each par 3 to
   * 6 and yardage 1 to 999 (`validateStartHoles`). The engine numbers them 1..N by position, a back nine included, as
   * the legacy hole editor does, whatever `holeNumber` says.
   */
  holes: HoleConfig[];
  /** A hand-typed course: save it to the player's library and offer it to the cloud library (the legacy "save course" opt-in). */
  saveCourse: boolean;
}

export type NewRoundStartFailureReason =
  /** The form failed the start gate: course, qualifier, rating, slope, date or holes. */
  | 'invalid'
  /** Another `start` call is still running. Nothing was changed. */
  | 'in_flight'
  /** A round is already tracking or submitting on this engine (or was just created). Nothing was changed. */
  | 'already_started'
  /** The qualifier's next round could not be looked up (offline, signed out, not entered, not found). */
  | 'qualifier_unverified'
  /** The player already has a round in progress for this qualifier: continue it (`roundId`) instead of starting one. */
  | 'qualifier_round_active'
  /** The form's qualifier round is not one the player can play now (already played, past the qualifier's rounds). */
  | 'qualifier_round_unavailable'
  | 'offline'
  | 'in_progress_exists'
  | 'duplicate_completed_round'
  | 'server_rejected'
  | 'transport';

/**
 * How a start ended. `roundId` on success is the server round that now exists. A failure carries the player-facing
 * sentence, which the engine also sets as its `error` for every reason a start's own checks or writes produce
 * ('invalid', the qualifier reasons, 'offline', 'duplicate_completed_round', 'server_rejected', 'transport'). It does
 * not for 'in_progress_exists' (the conflict dialog draws that one) or for 'in_flight' and 'already_started' (those
 * calls changed nothing). A failure's `roundId` is the round to continue, on 'qualifier_round_active', and the
 * conflicting round, on 'in_progress_exists'.
 */
export type NewRoundStartResult =
  | { ok: true; roundId: string }
  | { ok: false; reason: NewRoundStartFailureReason; error: string; roundId?: string };

/**
 * Everything that must be true before a round can start, independent of WHICH control starts it. Returns the
 * user-facing error, or null to proceed. This is the body `validateBeforeStart` had, taking the setup as an argument
 * so `start(form)` checks the form it was given rather than the state.
 *
 * EXTRACTED 2026-07-25 and this is load-bearing, not tidying. These checks
 * used to live only inside `handleSetupSubmit`, and the confirm screen
 * reached them because a course pick with usable holes routed through the
 * form's submit button. The confirm screen now starts the round from the
 * hole editor's own "Start round" button instead — which never touches
 * `onSubmit`. Without this shared gate, a player who switched Round type to
 * "Qualifier" on the confirm screen and left the qualifier unpicked could
 * start a round that no qualifier owns.
 */
export function validateStartForm({ setup, qualifierId, qualifierRoundNumber }: NewRoundSetup): string | null {
  if (!setup.courseName) return 'Please enter a course name';
  if (setup.roundType === 'qualifier') {
    if (!qualifierId) return 'Please select a qualifier';
    if (!qualifierRoundNumber) return 'Please select which round of the qualifier this is';
  }
  // Ranges mirror the server Zod schema in golf.ts — keep them in step.
  if (setup.courseRating) {
    const rating = parseFloat(setup.courseRating);
    if (isNaN(rating) || rating < 50 || rating > 85) {
      return 'Course rating must be between 50.0 and 85.0';
    }
  }
  if (setup.courseSlope) {
    const slope = parseInt(setup.courseSlope);
    if (isNaN(slope) || slope < 55 || slope > 155) {
      return 'Course slope must be between 55 and 155';
    }
  }
  // B7: only the terminal submit path (golf.ts) rejected a future round
  // date — by which point an entire round had already been tracked under
  // the wrong day. This is the one gate every round-start entry point
  // (handleSetupSubmit, handleConfirmedHolesSave, start) shares, so catching
  // it here blocks it before persistRoundStart ever creates the round.
  if (setup.roundDate && setup.roundDate > localDayIso()) {
    return 'Round date cannot be in the future.';
  }
  return null;
}

/** The legacy hole editor's sanity ceiling on a hole's yardage (FairwayHoleConfig's MAX_HOLE_YARDAGE); the server sets none. */
export const MAX_START_HOLE_YARDS = 999;

/**
 * The hole rules `start(form)` enforces, the same the legacy confirm-screen hole editor enforces before it hands its
 * holes over: 9 or 18 holes, each par 3 to 6 (the server allows no other) and yardage 1 to 999. The legacy preloaded
 * start path also accepts yardage 0 for a cloud tee entered with pars only; `start` does not, because its holes come
 * from a hole editor that has already asked for every yardage. Not part of `validateStartForm`, so the screen's own
 * gate is unchanged.
 */
export function validateStartHoles(holes: readonly HoleConfig[]): string | null {
  if (holes.length !== 9 && holes.length !== 18) return 'A round has 9 or 18 holes';
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i]!;
    const label = `Hole ${i + 1}`;
    if (!Number.isInteger(hole.par) || hole.par < 3 || hole.par > 6) return `${label}: par must be 3 to 6`;
    if (!Number.isFinite(hole.yardage) || hole.yardage < 1) return `${label} needs a yardage`;
    if (hole.yardage > MAX_START_HOLE_YARDS) {
      return `${label}: ${hole.yardage} yards is too long (${MAX_START_HOLE_YARDS} at most)`;
    }
  }
  return null;
}
