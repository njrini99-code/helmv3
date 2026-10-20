/**
 * CH-11912: coming back to the Rounds library from a round (owner rule 8, 2026-10-01). The library's search and grouping come back through the
 * shell's `useChSessionState`, and its place in the list through RouteFrame, which records the scroll per page and restores it on
 * Back or Forward (a popstate; a new page still opens at the top, CH-1904). What is left for the rounds screens is making the review's
 * Back a real Back: a push to the library is a new page, so it would open at the top and not where the player was.
 *
 * A review opened from the library leaves a note in `sessionStorage` (this tab only), and the review's Back then steps back in history
 * (which brings the library back with its search and its place) instead of pushing a new library on top. With no note (a deep link,
 * a fresh tab, Home's recent round) Back goes to the library's address as before.
 *
 * Client-only. A blocked store only costs the step back: Back then goes to the address.
 */

const FROM_KEY = 'ch:rounds:from-library';

/** A review is being opened from the library: remember which. */
export function noteOpenedFromLibrary(roundId: string): void {
  try {
    sessionStorage.setItem(FROM_KEY, JSON.stringify({ roundId: roundId.toLowerCase() }));
  } catch {
    /* Back goes to the library's address */
  }
}

/** Was this review opened from the library in this tab? Then the entry before it is the library, and Back is a step back in history. */
export function openedFromLibrary(roundId: string): boolean {
  try {
    const note = JSON.parse(sessionStorage.getItem(FROM_KEY) ?? 'null') as { roundId?: string } | null;
    return note?.roundId === roundId.toLowerCase();
  } catch {
    return false;
  }
}
