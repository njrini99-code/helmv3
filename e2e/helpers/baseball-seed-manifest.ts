/**
 * baseball-seed-manifest.ts — single source of truth for what
 * scripts/seed-rini-baseball-demo.ts CLAIMS to have written, consumed by
 * e2e/baseball-stats-smoke.spec.ts (#382).
 *
 * WHY THIS EXISTS: the smoke spec's core job is catching "empty state shown
 * while the seed claims data" (a source-mismatch / routing-drift bug), as
 * distinct from a healthy zero-data state. That distinction only works if the
 * spec's expectations are derived from the SAME claims the seed script makes —
 * not re-guessed from reading the UI. If the seed changes (different lineup,
 * different game count, different player), THIS FILE must be updated alongside
 * it, or the smoke will either false-fail or silently stop catching drift.
 *
 * The `gameId` below is NOT looked up at runtime — it is computed with the
 * exact same deterministic-UUID scheme (`detId`) as the seed script, keyed by
 * the identical `${NS}:game:past:0` input. If the seed's NS, key naming, or
 * the set of "past" (completed) games changes, recompute this value by mirroring
 * the change here. This intentional duplication (rather than importing the
 * script) keeps this manifest import-safe for Playwright — the seed script
 * pulls in `dotenv/config` and throws on missing Supabase env vars at module
 * load, which would break every spec file that transitively imports it.
 */
import { createHash } from 'node:crypto';

// Must match NS in scripts/seed-rini-baseball-demo.ts exactly.
const SEED_NAMESPACE = 'rini-baseball-demo-v1';

/** Mirrors detId() in scripts/seed-rini-baseball-demo.ts. */
function deterministicId(key: string): string {
  const h = createHash('sha1').update(`${SEED_NAMESPACE}:${key}`).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  // Non-null: h is a 40-char sha1 hex digest, so index 16 of the 32-char slice
  // is always in bounds.
  b[16] = ((parseInt(b[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export const BASEBALL_SEED_MANIFEST = {
  /** scripts/seed-rini-baseball-demo.ts — Section 2 (org + team). */
  teamName: 'Rini University Baseball',

  /**
   * The known stat-bearing player: the seeded PLAYER login itself
   * (rinin376@gmail.com), seeded as ROSTER key 'p1' and the first entry in
   * LINEUP_KEYS, so it always has a non-zero batting line on every completed
   * game.
   */
  player: {
    fullName: 'Marcus Rodriguez',
    firstName: 'Marcus',
    lastName: 'Rodriguez',
    position: 'SS',
    jersey: 7,
  },

  /**
   * Minimum counts the seed guarantees once aligned with the read models
   * (scripts/seed-rini-baseball-demo.ts §5b). Kept deliberately conservative
   * (>= 1, not the exact seeded count) so the manifest stays correct even if
   * a future seed run lands near a season-year boundary and a couple of the
   * relatively-dated games roll into a different `season_year` window (see
   * the seed script's "Season year matches..." comment) — the assertion is
   * "the seed produced real data", not "the seed produced exactly N rows".
   */
  minimums: {
    /** Stats Center summary.playersWithData (batters + pitchers combined). */
    playersWithData: 1,
    /** Stats Center summary.officialGames (game_type='game' in season window). */
    officialGames: 1,
    /** Command Center roster size (full 14-man ROSTER). */
    rosterSize: 1,
  },

  /**
   * A representative COMPLETED game guaranteed to have both batting and
   * pitching box-score lines — scripts/seed-rini-baseball-demo.ts seeds this
   * as `pastGames[0]` (vs "Coastal State", §5/§5b). Used to deep-link
   * directly to /baseball/dashboard/stats/games/{gameId} for the Box Score
   * assertions instead of depending on click-through games-list ordering.
   */
  completedGame: {
    id: deterministicId('game:past:0'),
    opponentName: 'Coastal State',
  },
} as const;

export type BaseballSeedManifest = typeof BASEBALL_SEED_MANIFEST;
