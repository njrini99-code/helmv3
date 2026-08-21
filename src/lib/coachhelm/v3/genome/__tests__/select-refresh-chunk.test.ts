/**
 * The genome nightly cron ran green for six weeks and wrote nothing.
 *
 * Measured in production 2026-08-17:
 *
 *   background_job_logs  v3-genome-nightly  47 runs, all `completed`,
 *                        most recent 2026-08-17 02:40, duration ~1,039 ms
 *   golf_player_genome   51 rows, newest computed_at 2026-07-07
 *
 * Six weeks of successful runs, forty-one days of frozen data, and a runtime
 * that could not possibly have rebuilt 25 player genomes.
 *
 * THE JAM. The route selects a chunk of `PLAYERS_PER_INVOCATION = 25` players,
 * ordered never-computed-first, then by oldest `computed_at`:
 *
 *     if (!ca && !cb) return 0;
 *     if (!ca) return -1;      // never computed sorts to the front
 *     if (!cb) return 1;
 *     return ca.localeCompare(cb);
 *
 * A player with no completed rounds inside the 90-day window produces zero
 * valid dimensions, and `computeGenomeForPlayer` then deliberately refuses to
 * upsert — writing an all-null vector is the trust-eroding state P2-21 forbids,
 * so `skipped_reason = 'no_valid_dimensions'` and NOTHING is written.
 *
 * Which means that player still has no `computed_at` tomorrow. So it sorts to
 * the front again. Forever.
 *
 * The production numbers make the collision exact:
 *
 *   80 active members
 *   32 never computed
 *   25 of those 32 have NO completed round in the window — permanently
 *      uncomputable
 *   PLAYERS_PER_INVOCATION = 25
 *
 * Twenty-five uncomputable players fill a twenty-five-slot chunk, every night.
 * The 7 never-computed players who DO have rounds never get in. The 48 players
 * with real genomes are never reached. The route's own comment — "Self-
 * balancing — next run naturally grabs the now-stalest cohort" — describes
 * behaviour the skip path makes impossible.
 *
 * That is the mechanism behind the standing complaint that the Genome surface
 * is "out of sync": it is showing analysis computed on 2026-07-07.
 */
import { describe, it, expect } from 'vitest';
import { selectGenomeRefreshChunk } from '@/lib/coachhelm/v3/genome/select-refresh-chunk';

/** Production shape: 25 uncomputable, 7 computable-but-new, 48 already computed. */
function productionShape() {
  const uncomputable = Array.from({ length: 25 }, (_, i) => `dormant-${i}`);
  const newWithRounds = Array.from({ length: 7 }, (_, i) => `fresh-${i}`);
  const established = Array.from({ length: 48 }, (_, i) => `established-${i}`);

  const computedAt = new Map<string, string>();
  established.forEach((id, i) => {
    // Spread across July so "stalest first" has something to order by.
    computedAt.set(id, `2026-07-${String((i % 28) + 1).padStart(2, '0')}T05:00:00Z`);
  });

  return {
    active: [...uncomputable, ...newWithRounds, ...established],
    computedAt,
    // Only players with a completed round in the window can produce a vector.
    eligible: new Set([...newWithRounds, ...established]),
    uncomputable,
    newWithRounds,
    established,
  };
}

describe('selectGenomeRefreshChunk — dormant players must not jam the queue', () => {
  it('does not hand back a chunk made entirely of players who cannot produce a genome', () => {
    const { active, computedAt, eligible, uncomputable } = productionShape();
    const chunk = selectGenomeRefreshChunk(active, computedAt, eligible, 25);

    const dormantInChunk = chunk.filter((id) => uncomputable.includes(id));
    expect(dormantInChunk).toEqual([]);
    expect(chunk).toHaveLength(25);
  });

  it('still puts never-computed players first — among those that CAN be computed', () => {
    const { active, computedAt, eligible, newWithRounds } = productionShape();
    const chunk = selectGenomeRefreshChunk(active, computedAt, eligible, 25);

    // All 7 fresh players lead the chunk; catching up a player who has never
    // had a genome is still more urgent than refreshing one that exists.
    expect(chunk.slice(0, 7).sort()).toEqual([...newWithRounds].sort());
  });

  it('fills the rest with the stalest existing genomes, oldest first', () => {
    const { active, computedAt, eligible } = productionShape();
    const chunk = selectGenomeRefreshChunk(active, computedAt, eligible, 25);

    const tail = chunk.slice(7);
    const stamps = tail.map((id) => computedAt.get(id)!);
    expect(stamps).toEqual([...stamps].sort());
    // The single stalest genome must be in this run, not starved behind others.
    const stalest = [...computedAt.entries()].sort((a, b) => a[1].localeCompare(b[1]))[0]![0];
    expect(tail).toContain(stalest);
  });

  it('advances to a different cohort on the next run once stamps are written', () => {
    // The property the old code lost. Simulate one successful night: everything
    // in the chunk gets today's timestamp, then re-select.
    const { active, computedAt, eligible } = productionShape();
    const first = selectGenomeRefreshChunk(active, computedAt, eligible, 25);
    for (const id of first) computedAt.set(id, '2026-08-17T02:40:00Z');

    const second = selectGenomeRefreshChunk(active, computedAt, eligible, 25);
    expect(second).not.toEqual(first);
    // Nothing refreshed last night should be back tonight while staler rows wait.
    expect(second.filter((id) => first.includes(id))).toEqual([]);
  });

  it('returns fewer than the limit rather than padding with ineligible players', () => {
    const computedAt = new Map<string, string>();
    const chunk = selectGenomeRefreshChunk(
      ['a', 'b', 'dormant-1', 'dormant-2'],
      computedAt,
      new Set(['a', 'b']),
      25,
    );
    expect(chunk.sort()).toEqual(['a', 'b']);
  });

  it('returns an empty chunk when nobody is eligible, instead of 25 guaranteed skips', () => {
    // The exact production state for the dormant cohort. An empty chunk is the
    // honest answer and costs one round trip; a full chunk of skips costs 25
    // orchestrator runs and reports success.
    const chunk = selectGenomeRefreshChunk(['x', 'y', 'z'], new Map(), new Set(), 25);
    expect(chunk).toEqual([]);
  });
});

/**
 * #1503 — the next layer down. `2e0632326` (above) fixed players who fail the
 * "has ≥1 round in the window" filter; it did nothing for players who PASS
 * that filter and still produce zero valid dimensions (6 rounds, none with a
 * sand shot, none a tournament round — `dimensions_computed: 0` every night).
 * Before orchestrator.ts started writing a refusal marker for that case, those
 * players kept no `computed_at`, so they sorted never-computed-first forever —
 * production measured 7 of 25 nightly slots burned this way once the eligible
 * pool (33) exceeded the chunk size.
 *
 * `selectGenomeRefreshChunk` itself needs no change for this — it already
 * treats ANY populated `computed_at` as "not never-computed", whether that
 * timestamp came from a real vector or a refusal marker. These tests pin that
 * the marker's `computed_at` is enough on its own to stop the crowd-out.
 */
describe('selectGenomeRefreshChunk — #1503 a refusal marker stops crowding the chunk', () => {
  function shapeWithRefusals() {
    // Matches the issue's measured shape: 80 active, 28 eligible, 7 of those
    // eligible-but-structurally-uncomputable, 15 with a genome older than a
    // day, PLAYERS_PER_INVOCATION 25.
    const refused = Array.from({ length: 7 }, (_, i) => `refused-${i}`);
    const stale = Array.from({ length: 15 }, (_, i) => `stale-${i}`);
    const dormant = Array.from({ length: 52 }, (_, i) => `dormant-${i}`); // no round in window

    const computedAt = new Map<string, string>();
    stale.forEach((id, i) => {
      computedAt.set(id, `2026-08-${String((i % 10) + 1).padStart(2, '0')}T05:00:00Z`);
    });

    return {
      active: [...refused, ...stale, ...dormant],
      computedAt,
      eligible: new Set([...refused, ...stale]), // dormant has no round in window
      refused,
      stale,
    };
  }

  it('a refused player marked LAST night no longer outranks a genuinely stale genome', () => {
    const { active, computedAt, eligible, refused, stale } = shapeWithRefusals();

    // Simulate last night: every refused player's refusal marker was written
    // with a recent stamp (orchestrator.ts writes computed_at unconditionally
    // now, even for the all-null case).
    for (const id of refused) computedAt.set(id, '2026-08-20T02:00:00Z');

    const chunk = selectGenomeRefreshChunk(active, computedAt, eligible, 25);

    // Both cohorts fit in a 25-slot chunk (15 stale + 7 refused = 22), but
    // ORDER is the property that matters: the stale, genuinely-computable
    // genomes lead — a freshly marked refusal is no longer treated as more
    // urgent than a real genome that hasn't refreshed in weeks — and the
    // refused cohort trails.
    expect(chunk.slice(0, stale.length).sort()).toEqual([...stale].sort());
    expect(chunk.slice(stale.length).sort()).toEqual([...refused].sort());
  });

  it('when slots are actually scarce, a marked refusal loses its slot to a stale genome', () => {
    const { active, computedAt, eligible, refused, stale } = shapeWithRefusals();
    for (const id of refused) computedAt.set(id, '2026-08-20T02:00:00Z');

    // Tighter than the 22 total eligible (15 stale + 7 refused) — this is the
    // shape that actually burns slots: before #1503, ALL 7 refused sorted
    // first and this size of chunk would have been refused players only.
    const chunk = selectGenomeRefreshChunk(active, computedAt, eligible, 20);

    expect(chunk).toHaveLength(20);
    // Every stale (genuinely computable) genome gets a slot.
    expect(stale.every((id) => chunk.includes(id))).toBe(true);
    // Only 5 of the 7 marked refusals fit — the ones bumped are refusals, not
    // stale genomes, which is the inversion of the pre-fix crowd-out.
    expect(chunk.filter((id) => refused.includes(id))).toHaveLength(5);
  });

  it('an UNMARKED refused player (first time, no computed_at yet) still gets one attempt', () => {
    const { active, computedAt, eligible, refused } = shapeWithRefusals();
    // No prior stamp for `refused` here — this is their first night, same as
    // any genuinely never-computed player. They are allowed IN the chunk once;
    // the fix is that they cannot dominate every chunk forever after.
    const chunk = selectGenomeRefreshChunk(active, computedAt, eligible, 25);

    expect(refused.every((id) => chunk.includes(id))).toBe(true);
  });
});
