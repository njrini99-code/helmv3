/**
 * Which players the genome nightly cron rebuilds on this run.
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
 *
 * The ordering used to live inline in `api/cron/v3/genome-nightly/route.ts`,
 * where nothing could test it, and it deadlocked the job for six weeks:
 *
 *   background_job_logs  v3-genome-nightly  47 runs, every one `completed`,
 *                        latest 2026-08-17 02:40, duration ~1,039 ms
 *   golf_player_genome   51 rows, newest computed_at 2026-07-07
 *
 * Six weeks of green runs, forty-one days of frozen data, and a runtime that
 * could not have rebuilt 25 genomes.
 *
 * ── THE JAM ─────────────────────────────────────────────────────────────────
 *
 * The old ordering was never-computed first, then oldest `computed_at`. A
 * player with no completed round inside the 90-day window yields zero valid
 * dimensions, and `computeGenomeForPlayer` then deliberately refuses to upsert
 * — an all-null vector is the trust-eroding state P2-21 forbids, so it returns
 * `skipped_reason: 'no_valid_dimensions'` and writes nothing.
 *
 * Writing nothing means no `computed_at`. No `computed_at` means the player
 * sorts to the front again tomorrow. And the night after.
 *
 * Production numbers make the collision exact:
 *
 *     80  active members
 *     32  never computed
 *     25  of those 32 have NO completed round in the window — permanently
 *         uncomputable until they play again
 *     25  PLAYERS_PER_INVOCATION
 *
 * Twenty-five uncomputable players filled a twenty-five-slot chunk every night.
 * The 7 never-computed players who DO have rounds never got in; the 48 real
 * genomes were never reached. The route's comment — "Self-balancing — next run
 * naturally grabs the now-stalest cohort" — described behaviour the skip path
 * made impossible.
 *
 * ── THE FIX ─────────────────────────────────────────────────────────────────
 *
 * Only consider players who CAN produce a vector. A dormant player is not
 * starved of attention by being excluded — there is nothing to compute for
 * them, and they re-enter the moment they log a round. Priority within the
 * eligible set is unchanged: never-computed first, then stalest.
 *
 * This does not paper over the skip path, which is correct and stays. It stops
 * feeding it inputs that are guaranteed to skip.
 */

/**
 * @param activePlayerIds     every active team member
 * @param computedAtByPlayer  existing `golf_player_genome.computed_at`, by player
 * @param eligiblePlayerIds   players with >= 1 completed round inside the window
 * @param limit               PLAYERS_PER_INVOCATION
 */
export function selectGenomeRefreshChunk(
  activePlayerIds: readonly string[],
  computedAtByPlayer: ReadonlyMap<string, string>,
  eligiblePlayerIds: ReadonlySet<string>,
  limit: number,
): string[] {
  // Returning fewer than `limit` — or none at all — is the honest answer. A
  // full chunk of guaranteed skips cost 25 orchestrator runs and reported
  // success; an empty chunk costs nothing and is visibly empty.
  const candidates = activePlayerIds.filter((id) => eligiblePlayerIds.has(id));

  candidates.sort((a, b) => {
    const ca = computedAtByPlayer.get(a);
    const cb = computedAtByPlayer.get(b);
    if (!ca && !cb) return 0;
    if (!ca) return -1; // never computed is still the most urgent
    if (!cb) return 1;
    return ca.localeCompare(cb);
  });

  return candidates.slice(0, limit);
}
