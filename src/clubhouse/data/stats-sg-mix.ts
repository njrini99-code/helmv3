import { pluralWord } from '../lib/plural';
import type { ChRound } from './season';

/**
 * Measured or estimated: where a round's stored strokes gained came from.
 *
 * `recalculate_round_strokes_gained` (supabase/schemas/functions/public.sql) writes one of two things into the same columns. With
 * shots logged it sums each shot against the Tour's expected-strokes curve: measured. With holes scored and no usable shot it calls
 * `sg_estimate_from_holes`, which adds fixed credits for a fairway, a green, the putts, an up-and-down and a sand save: an estimate
 * that never reads the curve, so it is not on the Tour's scale. No column says which a round got.
 *
 * The test is the function's own, word for word: a round is measured when it has at least one shot row with a type, a lie and a
 * distance before it, and an end (a distance after, a made putt, or a holed result). `loadMeasuredRounds` (stats-common.ts) asks the
 * database exactly that; this file holds what the answer means, the one switch, and the words. It is pure and takes `season.ts` as a
 * type only, so a client screen may import it.
 */

/**
 * THE ONE FLAG. Whether a round whose strokes gained was estimated from the scorecard counts in a strokes gained average.
 *
 * `include`: every stored figure counts, as it always has; the screens say how many were estimated.
 * `exclude`: an estimated round keeps its score, putts and greens, and gives no strokes gained to any figure, floor or trend.
 *
 * The owner's decision (it moves numbers a coach sees), not made yet: it stays `include` until he says. Every loader reads it through
 * `sgPolicyAtSource` (stats-common.ts), so this line is the whole change.
 */
export const sgPolicy: { estimated: 'include' | 'exclude' } = { estimated: 'include' };

/** What the database said about a set of rounds. `error`: the read failed, so nothing is claimed either way. */
export interface ChSgSourceRead {
  /** The rounds whose strokes gained was measured from shots. */
  measured: ReadonlySet<string>;
  /** The rounds whose estimated strokes gained was taken out (only under `exclude`). */
  dropped: ReadonlySet<string>;
  error: boolean;
}

/** How a strokes gained figure's rounds split. Both zero when it rests on no round. */
export interface ChSgMix {
  /** Rounds in the figure that were shot-tracked. */
  measured: number;
  /** Rounds estimated from the scorecard: in the figure when `estimatedCounted`, left out of it otherwise. */
  estimated: number;
  estimatedCounted: boolean;
}

const SG_KEYS = ['strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach', 'strokes_gained_around_green', 'strokes_gained_putting'] as const;
const hasSg = (r: Pick<ChRound, 'strokes_gained_total'>) => r.strokes_gained_total != null;

/**
 * The rounds as the policy leaves them. Under `include`, or when the read failed, they are returned as they are. Under `exclude` an
 * estimated round is copied with its five strokes gained fields null, so every sum, floor and trend downstream skips it without knowing
 * why, and its score still counts. `dropped` names the rounds changed.
 */
export function sgCounted<T extends ChRound>(rounds: readonly T[], measured: { ids: ReadonlySet<string>; error: boolean } | null, policy: 'include' | 'exclude' = sgPolicy.estimated): { rounds: T[]; dropped: Set<string> } {
  const dropped = new Set<string>();
  if (policy === 'include' || !measured || measured.error) return { rounds: rounds as T[], dropped };
  const out = rounds.map((r) => {
    if (!hasSg(r) || measured.ids.has(r.id)) return r;
    dropped.add(r.id);
    const copy = { ...r };
    for (const k of SG_KEYS) (copy as ChRound)[k] = null;
    return copy;
  });
  return { rounds: out, dropped };
}

/**
 * The split for the rounds a figure reads (already the policy's, already the window's and the players' the figure counts). Null when
 * the read failed or was not made: the screen then says nothing, never a guess.
 */
export function sgMixOf(rounds: readonly Pick<ChRound, 'id' | 'strokes_gained_total'>[], read: ChSgSourceRead | null | undefined): ChSgMix | null {
  if (!read || read.error) return null;
  const withSg = rounds.filter(hasSg);
  const measured = withSg.filter((r) => read.measured.has(r.id)).length;
  const left = rounds.filter((r) => read.dropped.has(r.id)).length;
  return left > 0 || sgPolicy.estimated === 'exclude' ? { measured, estimated: left, estimatedCounted: false } : { measured, estimated: withSg.length - measured, estimatedCounted: true };
}

/** A figure that rests on estimated rounds alone: the figure itself is marked, not only the line under it. */
export function sgIsEstimate(mix: ChSgMix | null | undefined): boolean {
  return !!mix && mix.estimatedCounted && mix.estimated > 0 && mix.measured === 0;
}

const roundsWord = (n: number) => pluralWord(n, 'round');

/**
 * The line under a strokes gained figure. Nothing when every round was shot-tracked (the figure is what it says it is) or when the
 * read failed. "6 of 10 rounds shot-tracked; 4 estimated from the scorecard" when they are mixed; "Estimated from the scorecard: no
 * round shot-tracked" when none was; and, with estimated rounds left out, how many were.
 */
export function sgMixWords(mix: ChSgMix | null | undefined): string | null {
  if (!mix || mix.estimated <= 0) return null;
  if (!mix.estimatedCounted) return `${mix.estimated} ${roundsWord(mix.estimated)} without shots left out`;
  if (mix.measured === 0) return 'Estimated from the scorecard: no round shot-tracked';
  return `${mix.measured} of ${mix.measured + mix.estimated} rounds shot-tracked; ${mix.estimated} estimated from the scorecard`;
}

/** The short form for a narrow cell or a row: "6 of 10 shot-tracked", "Estimated", "4 left out". */
export function sgMixShort(mix: ChSgMix | null | undefined): string | null {
  if (!mix || mix.estimated <= 0) return null;
  if (!mix.estimatedCounted) return `${mix.estimated} left out`;
  if (mix.measured === 0) return 'Estimated';
  return `${mix.measured} of ${mix.measured + mix.estimated} shot-tracked`;
}
