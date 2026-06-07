/**
 * Canonical golf stat formulas — single source of truth.
 *
 * Every stat surface (player Stats page, Team Stats, dashboards, profile,
 * shot-analytics, CoachHelm) must compute these the SAME way the DB cache does,
 * or the two layers drift (the class of bug fixed across STAGES 1-4 on
 * 2026-06-06). These pure functions mirror the prod SQL exactly:
 *
 *  - percentages mirror `update_player_stats_complete()` / `refresh_player_standing`
 *    → NULL when the denominator is 0 (means "no data", NOT 0%), rounded to 1 dp.
 *  - fairway denominator = par-4/5 holes with a RECORDED fairway result
 *    (recompute_golf_round_totals: par>=4 AND fairway_hit IS NOT NULL).
 *  - sand-save denominator = greenside-bunker visits (sand_save IS NOT NULL); do
 *    NOT gate on the `gir` column (mislabeled on real bunker holes).
 *  - putts/round + penalties/round are 18-hole-normalized by total holes played.
 *  - scoring average uses 18-hole rounds only (matches the cache).
 *
 * Prefer these over ad-hoc `(made/total)*100`. Do not reintroduce a variant that
 * returns 0 on an empty denominator — that renders "0%" where the truth is "—".
 */

/** Round to `dp` decimal places (default 1), half-up. */
export function round(value: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/**
 * Canonical percentage. Returns null when total <= 0 (no data), else
 * round1(part/total*100). Mirrors the DB `IF total>0 THEN ... END` guard.
 */
export function pct(part: number, total: number, dp = 1): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return round((part / total) * 100, dp);
}

/** Fairway accuracy %. total = par-4/5 holes with a recorded fairway result. */
export function computeFairwayPct(fairwaysHit: number, fairwaysTotal: number): number | null {
  return pct(fairwaysHit, fairwaysTotal);
}

/** Greens-in-regulation %. */
export function computeGirPct(greensHit: number, greensTotal: number): number | null {
  return pct(greensHit, greensTotal);
}

/** Scrambling %. attempts = missed-GIR holes; converted = made par-or-better. */
export function computeScramblingPct(converted: number, attempts: number): number | null {
  return pct(converted, attempts);
}

/** Sand-save %. attempts = greenside-bunker visits (NOT gated on the gir column). */
export function computeSandSavePct(saves: number, attempts: number): number | null {
  return pct(saves, attempts);
}

/**
 * Putts per round, normalized to 18 holes by total holes played
 * (mirrors update_player_stats_complete: total_putts / total_holes * 18).
 */
export function computePuttsPerRound(totalPutts: number, totalHoles: number): number | null {
  if (!Number.isFinite(totalHoles) || totalHoles <= 0) return null;
  return round((totalPutts / totalHoles) * 18, 2);
}

/** Per-round rate normalized to 18 holes (penalties, etc.). */
export function computePerRound18(total: number, totalHoles: number): number | null {
  if (!Number.isFinite(totalHoles) || totalHoles <= 0) return null;
  return round((total / totalHoles) * 18, 2);
}

/** Scoring average over 18-hole rounds only (matches the cache). */
export function computeScoringAverage(totalScore18: number, rounds18: number): number | null {
  if (!Number.isFinite(rounds18) || rounds18 <= 0) return null;
  return round(totalScore18 / rounds18, 2);
}

/** Scoring average vs par over 18-hole rounds only. */
export function computeScoringAverageVsPar(scoreToPar18: number, rounds18: number): number | null {
  if (!Number.isFinite(rounds18) || rounds18 <= 0) return null;
  return round(scoreToPar18 / rounds18, 2);
}
