/**
 * Shotgun starts: the order a round's holes are PLAYED in, when it does not start on the first hole.
 *
 * Holes keep their own numbers, pars and places everywhere (`holes[i]` is hole `i + 1`, scores and shots land on
 * `holes[i].number`, Out/In and front/back are by hole number). Only the walk changes: a round that starts on hole 6
 * plays 6..18 then 1..5, and is finished once the 18th hole it played (hole 5) is done. A 9-hole round wraps inside
 * its nine: the engine numbers the nine it plays 1..9 (a back nine included), so the start is a position in it.
 *
 * Plain module (no 'use client', no 'use server') so both round engines, both UIs, the server pages and the tests
 * share one set of rules. `start` is always the engine's 1-based hole position (1..total); `index` is 0-based.
 */

/** The start hole a round has, as a position 1..total. Anything missing or out of range is the first hole. */
export function normalizeStartHole(value: unknown, total: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || total < 1 || n < 1 || n > total) return 1;
  return n;
}

/** The hole indexes in the order they are played: start 6 of 18 is [5..17, 0..4]. */
export function playOrder(total: number, start: number): number[] {
  const s = normalizeStartHole(start, total) - 1;
  return Array.from({ length: Math.max(0, total) }, (_, k) => (s + k) % total);
}

/** Where a hole falls in the round as played: 1 for the starting hole, `total` for the last one. */
export function playPosition(index: number, total: number, start: number): number {
  const s = normalizeStartHole(start, total) - 1;
  return ((((index - s) % total) + total) % total) + 1;
}

/** The index of the last hole the round plays (the one before the start, wrapping). */
export function lastPlayIndex(total: number, start: number): number {
  return (normalizeStartHole(start, total) - 2 + total) % total;
}

/** Whether `index` is the last hole the round plays. */
export function isLastPlayIndex(index: number, total: number, start: number): boolean {
  return index === lastPlayIndex(total, start);
}

/** The hole played after `index`, wrapping from the card's last hole to its first. The last hole played stays put. */
export function nextPlayIndex(index: number, total: number, start: number): number {
  if (isLastPlayIndex(index, total, start)) return index;
  return (index + 1) % total;
}

/** The hole played before `index`, or null for the starting hole. */
export function previousPlayIndex(index: number, total: number, start: number): number | null {
  if (playPosition(index, total, start) === 1) return null;
  return (index - 1 + total) % total;
}

/** Whether hole `a` is played before hole `b` in this round. */
export function playedBefore(a: number, b: number, total: number, start: number): boolean {
  return playPosition(a, total, start) < playPosition(b, total, start);
}

/**
 * The first hole without a score, in play order: where the round picks up. -1 when every hole has one.
 * `scored(i)` says whether hole index `i` has a score.
 */
export function frontierIndex(total: number, start: number, scored: (index: number) => boolean): number {
  for (const i of playOrder(total, start)) if (!scored(i)) return i;
  return -1;
}

/** The start-hole choices for a round of `total` holes, labelled by the card's own numbers (`labels[i]`, else i + 1). */
export function startHoleOptions(total: number, labels?: ReadonlyArray<number>): Array<{ value: number; label: number }> {
  return Array.from({ length: Math.max(0, total) }, (_, i) => ({ value: i + 1, label: labels?.[i] ?? i + 1 }));
}

/** What handleHoleComplete should do immediately after recording/editing a hole's score. */
export type PostHoleCompleteAction =
  | { type: 'finish' }
  | { type: 'return-to-frontier' }
  | { type: 'advance'; nextHoleIndex: number };

/**
 * Pure decision logic for handleHoleComplete's post-save navigation —
 * exported for unit testing. Mirrors continue-round-client.tsx's identical
 * `allHolesScored` gate inside the `isReEdit` branch (P1 fix, production-
 * readiness mission 2026-07-09): re-editing a completed hole that turns out
 * to be the LAST unscored hole in the round must surface the finish
 * confirmation with the freshly-updated stats, not silently return to the
 * active frontier with a stale scorecard and no path to submit.
 */
export function decidePostHoleCompleteAction(params: {
  allHolesScored: boolean;
  isReEdit: boolean;
  holeIndex: number;
  totalHoles: number;
  /** The round's starting hole as a position 1..totalHoles (shotgun start); omitted, the first hole. */
  startHole?: number;
}): PostHoleCompleteAction {
  const { allHolesScored, isReEdit, holeIndex, totalHoles, startHole = 1 } = params;
  // "Last" is the last hole PLAYED: with a shotgun start on 6 that is hole 5, and hole 18 advances to hole 1.
  const isLast = isLastPlayIndex(holeIndex, totalHoles, startHole);

  // Last hole (re-)completed and all holes scored — always show finish confirmation.
  if (allHolesScored && isLast) {
    return { type: 'finish' };
  }
  if (isReEdit) {
    // All holes scored after re-edit — show finish confirmation.
    if (allHolesScored) return { type: 'finish' };
    // Re-editing a previously completed hole — return to the active frontier.
    return { type: 'return-to-frontier' };
  }
  if (!isLast) {
    // Normal progression — advance to the next hole in play order (wrapping past the card's last hole).
    return { type: 'advance', nextHoleIndex: nextPlayIndex(holeIndex, totalHoles, startHole) };
  }
  // Last hole completed for the first time — show finish confirmation.
  return { type: 'finish' };
}
