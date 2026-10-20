/**
 * Roster-sweep freshness predicate (CoachHelm Slice 0b, `07` §2 D/G).
 *
 * The nightly sweep used to skip any player whose latest completed round had
 * `coachhelm_analyzed_at` set, and nothing else ever re-analyzed them, so a
 * read made when a player had 6 rounds was still shown at 14 (production
 * 2026-10-19: median 13.1 days since a visible read was refreshed). Behind
 * `coachhelm_reads_v1_copy` the sweep also refreshes a player whose newest
 * countable round is newer than their newest visible read.
 *
 * "Newest read" is the read whose window reaches furthest. Comparing against
 * the newest (not every) read keeps a family that legitimately has no new
 * observations (no bunker shot in the last round) from re-queuing the player
 * every night. Pure; the route does the I/O.
 */
import { dayOf } from './read-window';

export interface SweepRound {
  id: string;
  round_date: string;
}

export interface SweepRead {
  window_end?: string | null;
  newest_round_id?: string | null;
}

/** Most reads re-analyzed for freshness per night (oldest first). */
export const MAX_FRESHNESS_REFRESHES_PER_RUN = 25;

/** The newest `window_end` day across the reads, or null when none is set. */
export function newestReadDay(reads: readonly SweepRead[]): string | null {
  let best: string | null = null;
  for (const r of reads) {
    const d = dayOf(r.window_end ?? null);
    if (d && (best === null || d > best)) best = d;
  }
  return best;
}

/**
 * True when the player's newest countable round is newer than their newest
 * visible read, so their reads should be refreshed.
 *
 *   - no reads: false (first analysis is the legacy predicate's job);
 *   - a read already names that round as its newest: false;
 *   - no read carries a window end: true (freshness unknowable; a refresh
 *     stamps one);
 *   - otherwise: the round's day is after the newest read's window end, or
 *     on the same day when stamped reads exist and none names this round
 *     (a second round that day).
 */
export function readsBehindNewestRound(
  newest: SweepRound | null,
  reads: readonly SweepRead[],
): boolean {
  if (!newest || reads.length === 0) return false;
  if (reads.some((r) => r.newest_round_id === newest.id)) return false;
  const roundDay = dayOf(newest.round_date);
  if (!roundDay) return false;
  const readDay = newestReadDay(reads);
  if (readDay === null) return true;
  if (roundDay > readDay) return true;
  if (roundDay === readDay) {
    return reads.some((r) => dayOf(r.window_end ?? null) === readDay && !!r.newest_round_id);
  }
  return false;
}

/**
 * Order freshness candidates oldest-first (the most out-of-date reads first;
 * unknown freshness first of all) and split at the nightly cap.
 */
export function planFreshnessRefreshes<T extends { newestReadDay: string | null }>(
  candidates: readonly T[],
  cap: number = MAX_FRESHNESS_REFRESHES_PER_RUN,
): { run: T[]; deferred: T[] } {
  const sorted = [...candidates].sort((a, b) => {
    const ad = a.newestReadDay ?? '';
    const bd = b.newestReadDay ?? '';
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });
  return { run: sorted.slice(0, Math.max(0, cap)), deferred: sorted.slice(Math.max(0, cap)) };
}
