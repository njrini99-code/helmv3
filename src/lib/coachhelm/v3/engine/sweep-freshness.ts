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
 * every night. A read "names" a round when it is its newest contributing
 * round or the newest countable round it scanned
 * (`scanned_through_round_id`), so a read built after a round that added
 * nothing to its family is still current. Pure; the route does the I/O.
 */
import { dayOf } from './read-window';

export interface SweepRound {
  id: string;
  round_date: string;
}

export interface SweepRead {
  window_end?: string | null;
  newest_round_id?: string | null;
  scanned_through_round_id?: string | null;
}

/** Most players re-analyzed for freshness per night. */
export const MAX_FRESHNESS_REFRESHES_PER_RUN = 25;

/**
 * A player whose engine ran in the last this-many days is not re-run for
 * freshness: the run is deterministic, so if it left the reads behind, an
 * immediate re-run would too (engine parked, every read gated). It is tried
 * again once the cooldown passes.
 */
export const FRESHNESS_COOLDOWN_DAYS = 7;

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
 *   - a read already names that round: false;
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
  if (reads.some((r) => r.newest_round_id === newest.id || r.scanned_through_round_id === newest.id)) {
    return false;
  }
  const roundDay = dayOf(newest.round_date);
  if (!roundDay) return false;
  const readDay = newestReadDay(reads);
  if (readDay === null) return true;
  if (roundDay > readDay) return true;
  if (roundDay === readDay) {
    return reads.some((r) => dayOf(r.window_end ?? null) === readDay && !!r.scanned_through_round_id);
  }
  return false;
}

/** Small stable string hash (FNV-1a), for the nightly rotation. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Split freshness candidates at the nightly cap, round-robin by night
 * (`night`, days since the epoch) instead of always taking the most
 * out-of-date first: a player the engine cannot move stays "behind" and
 * would otherwise hold a slot every night, so oldest-first would let 25 of
 * them pin the cap. Candidates sit in a fixed hashed order and each night
 * starts `cap` further along it, so while the set is stable every candidate
 * gets a turn within ceil(N / cap) nights.
 */
export function planFreshnessRefreshes<T extends { playerId: string }>(
  candidates: readonly T[],
  night: number,
  cap: number = MAX_FRESHNESS_REFRESHES_PER_RUN,
): { run: T[]; deferred: T[] } {
  const ring = candidates
    .map((c) => ({ c, k: hash32(c.playerId) }))
    .sort((a, b) => a.k - b.k || (a.c.playerId < b.c.playerId ? -1 : 1))
    .map((x) => x.c);
  const n = Math.min(Math.max(0, cap), ring.length);
  if (n === ring.length) return { run: ring, deferred: [] };
  const start = (((Math.trunc(night) * n) % ring.length) + ring.length) % ring.length;
  const rotated = [...ring.slice(start), ...ring.slice(0, start)];
  return { run: rotated.slice(0, n), deferred: rotated.slice(n) };
}
