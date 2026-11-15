/**
 * CoachHelm chat: the notes on a turn that was not accepted.
 *
 * The prose audit that produced the first two of these is gone: an answer is no longer withheld, delayed or rewritten,
 * and the grounding check only logs (engine/grounding.ts). What remains is what stored conversations still need:
 * rows written before the rebuild carry these part types and notes, and a turn that fails today (a model error, a
 * stop, a refusal) is stored with a `data-turn-incomplete` part so a reload says what happened instead of showing a
 * fragment as an answer.
 */

/** The part types a stored failed turn can carry its note in. `data-grounding-flag` is only ever read (older rows). */
export type VerdictPartType = 'data-grounding-flag' | 'data-turn-incomplete';

export const STREAM_INCOMPLETE_NOTE =
  "This answer didn't finish coming through, so it isn't being shown. Please ask again.";
