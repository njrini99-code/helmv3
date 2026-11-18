/**
 * P016 Tournaments: the typed refusal codes the tournament server actions return beside their copy
 * (`src/app/golf/actions/tournaments.ts`), so a screen decides what to show from `code`, never from the words. The
 * database half is held migration 20261024100200: every refusal there is SQLSTATE P0001 with the bare code as the
 * message. Pure and client-safe (a `'use server'` file may export only async functions, so the codes live here).
 */
import { isMissingSchemaError } from '@/lib/coachhelm/v3/verdicts/schema-missing';

export const TOUR_REFUSAL_CODES = [
  /** The tournament tables or RPCs are not there yet: the held migrations are not applied. */
  'not_set_up',
  /** golf_tournaments_v1 (or Clubhouse) is off for this user. */
  'off',
  'not_signed_in',
  'not_coach',
  'not_found',
  /** Someone changed the event after this edit was opened (compare-and-set on version). */
  'stale',
  'invalid',
  'locked',
  'lineup_empty',
  'too_many',
  'no_substitutions',
  'not_in_lineup',
  'already_in',
  'round_started',
  'round_order',
  'round_has_scores',
  'rounds_linked',
  'bad_transition',
  'reason_required',
  'not_final',
  'event_taken',
  /** Anything else: the error is reported, the copy is generic. */
  'failed',
] as const;
export type TourRefusalCode = (typeof TOUR_REFUSAL_CODES)[number];

const KNOWN = new Set<string>(TOUR_REFUSAL_CODES);

/** A missing function (the RPCs of 100200): Postgres 42883, PostgREST PGRST202. Tables and columns: isMissingSchemaError. */
const MISSING_FUNCTION = new Set(['42883', 'PGRST202']);

/** The held schema is not there: a table, a column (isMissingSchemaError's codes) or a function. */
export function isTourSchemaMissing(error: { code?: string | null } | null | undefined): boolean {
  return isMissingSchemaError(error) || (!!error && typeof error.code === 'string' && MISSING_FUNCTION.has(error.code));
}

/**
 * The refusal code for a failed tournament read or write. A P0001 carries its code as the message; a check, foreign
 * key, uniqueness or cast failure is the input's fault (`invalid`); RLS refusing the row is `not_coach`.
 */
export function tourRefusalOf(error: { code?: string | null; message?: string | null } | null | undefined): TourRefusalCode {
  if (!error) return 'failed';
  if (isTourSchemaMissing(error)) return 'not_set_up';
  const message = (error.message ?? '').trim();
  if (error.code === 'P0001' && KNOWN.has(message)) return message as TourRefusalCode;
  if (error.code === '42501') return 'not_coach';
  if (error.code === '23514' || error.code === '23503' || error.code === '23505' || error.code === '22P02' || error.code === '22007' || error.code === '22008') return 'invalid';
  return 'failed';
}

/** The words for each refusal, in the coach's terms. */
export const TOUR_REFUSAL_COPY: Record<TourRefusalCode, string> = {
  not_set_up: 'Tournaments aren’t set up for your team yet. Nothing was changed.',
  off: 'Tournaments aren’t turned on for your team yet.',
  not_signed_in: 'Your sign-in has ended. Sign in again and retry.',
  not_coach: 'Only a coach of this team can change its tournaments.',
  not_found: 'That event isn’t on your team any more.',
  stale: 'This event changed since you opened it. Reload it to see the latest, then make your change again.',
  invalid: 'Something in the event isn’t valid. Check the dates, rounds and scores, then try again.',
  locked: 'The lineup is locked. Make a substitution instead.',
  lineup_empty: 'Add players to the lineup first.',
  too_many: 'The lineup has more players than the format allows.',
  no_substitutions: 'This event doesn’t allow substitutions.',
  not_in_lineup: 'That player isn’t in this round’s lineup.',
  already_in: 'That player is already in this round’s lineup.',
  round_started: 'That round has started, so its lineup can’t change.',
  round_order: 'Start or finish the rounds in order.',
  round_has_scores: 'A round with scores can’t be removed.',
  rounds_linked: 'GolfHelm rounds are linked to this event. Unlink them to delete it; the rounds themselves are kept.',
  bad_transition: 'A round can’t move to that state from where it is.',
  reason_required: 'Say why the result is being reopened.',
  not_final: 'Every round has to be final before the result is official.',
  event_taken: 'That calendar event is already a round of another tournament.',
  failed: 'It didn’t save. Try again.',
};
