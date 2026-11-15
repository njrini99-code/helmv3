import type { ChSetupQualifier } from '../setup/shape';
import { plural } from '../../../lib/plural';

/*
 * Round setup's qualifier list, shaped from the two qualifier reads. A plain module (no client or server imports) so the
 * route's server loader reads it (data/setup-qualifiers.ts, PMAC-03) with the same rules the screen used when it read
 * the list in the browser.
 */

/** How long setup waits for the qualifier reads before it says they didn't load (CH-11211), so a slow read never blocks a practice round. */
export const QUALIFIER_READ_MS = 6000;

/**
 * Why a qualifier has no round to play, from the server's refusal (`getNextQualifierRoundNumber`). Fairway shows the
 * server's own sentence; here each definitive refusal gets one the player can act on, and only a read that failed says
 * to try again. A refusal that is not a read failure never reads as "try again": trying again can't change it.
 */
export function qualifierBlockedReason(next: { error?: string; code?: string }, numRounds: number): string {
  const error = next.error ?? '';
  if (next.code === 'qualifier_round_limit_reached') return `All ${plural(numRounds, 'round is', 'rounds are')} in. Ask your coach to add a round if you need another.`;
  if (/more than one saved round/i.test(error)) return 'You have more than one saved round in this qualifier. Continue one from Rounds.';
  if (/not entered in this qualifier/i.test(error)) return 'You’re no longer entered in this qualifier. Ask your coach.';
  if (/qualifier not found/i.test(error)) return 'This qualifier isn’t there any more. Ask your coach.';
  return 'We couldn’t check this qualifier. Try again in a moment.';
}

type Result<T> = { success: true; data: T } | { success: false; error?: string; code?: string };

/** One qualifier as `getPlayerQualifiers` lists it (the fields setup reads). */
export interface SetupQualifierRow {
  id: string;
  name: string;
  status: string;
  numRounds: number;
  roundsCompleted: number;
  courseName: string | null;
}

/** The reads behind the list, and where a failure is reported. */
export interface SetupQualifierReads {
  list: () => Promise<Result<SetupQualifierRow[]>>;
  next: (qualifierId: string) => Promise<Result<{ nextRoundNumber: number; availableRounds: number[]; activeRoundId?: string }>>;
  report: (err: unknown, read: 'list' | 'next') => void;
}

/**
 * The player's qualifiers that a coach hasn't closed, each with the round they can play now. A closed qualifier is
 * closed (D-31; a round can't be submitted to it, `submit_round_atomic`); one with every round in, or with a round
 * already in progress, is listed with why it can't be played. Null when the list itself didn't load. The engine's own
 * `getPlayerQualifiers` call (its legacy dropdown) is separate.
 *
 * Every open qualifier asks the server for its next round, all at once, as Fairway's picker does when one is chosen:
 * the count `getPlayerQualifiers` gives (`roundsCompleted`, which can come from the entry's stored totals or count a
 * round with no round number) is not the rule; `resolveQualifierRoundNumber` is, and a free slot it finds is playable.
 */
export async function readSetupQualifiers(reads: SetupQualifierReads): Promise<ChSetupQualifier[] | null> {
  try {
    const all = await reads.list();
    if (!all.success) return null;
    const open = all.data.filter((q) => q.status !== 'completed');
    return await Promise.all(
      open.map(async (q): Promise<ChSetupQualifier> => {
        const base = { id: q.id, name: q.name, courseId: null, courseName: q.courseName, teeId: null, teeName: null, rounds: q.numRounds, completed: q.roundsCompleted };
        try {
          const next = await reads.next(q.id);
          if (!next.success) return { ...base, nextRound: null, blocked: qualifierBlockedReason(next, q.numRounds) };
          if (next.data.activeRoundId) return { ...base, nextRound: null, blocked: 'A round is already in progress. Continue it from Rounds.' };
          const round = next.data.availableRounds.includes(next.data.nextRoundNumber) ? next.data.nextRoundNumber : null;
          return { ...base, nextRound: round, blocked: round == null ? 'No round is open to you right now.' : null };
        } catch (err) {
          reads.report(err, 'next');
          return { ...base, nextRound: null, blocked: 'We couldn’t check this qualifier. Try again in a moment.' };
        }
      }),
    );
  } catch (err) {
    reads.report(err, 'list');
    return null;
  }
}
