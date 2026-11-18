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
 *    NOT gate on the `gir` column (mislabeled on real bunker holes). A save is
 *    the PGA Tour's definition (SC-02): out of the greenside bunker and holed in
 *    two strokes or fewer, the bunker shot included, whatever the score (a bogey
 *    out in two after a penalty counts). Par or better is NOT part of it; a
 *    "sand par save" would be a separate metric with no Tour grade, never this
 *    column. golf_pga_standards' 50% benchmark is on the Tour definition.
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

/**
 * One hole's scramble chance (2026-11-16, at a coach's ask: Scrambling counts
 * sand saves). Mirrors the DB cache writers `update_round_stats_cache` and
 * `refresh_player_stats_cache` exactly
 * (supabase/migrations/20261116200000_golf_scrambling_counts_sand_saves.sql):
 *
 *  - attempt = a scored hole that missed the green in regulation OR had a
 *    greenside-bunker visit (`sand_save` not null);
 *  - made    = a missed green saved for par or better OR a sand save
 *    (`sand_save` true, the Tour's sand-save rule: out in two, any score).
 *
 * A hole is one chance however many of the two it meets, so nothing counts
 * twice. A hole with no score is never a chance: we cannot know whether it
 * converted. Sand saves stay their own figure too (`computeSandSavePct`).
 * Because of the bunker holes, this is not the Tour's own Scrambling
 * definition (missed greens only); a Tour comparison says so.
 */
export function holeScramble(h: {
  /** The hole missed the green in regulation (callers decide how a missing `gir` reads). */
  missedGreen: boolean;
  score: number | null | undefined;
  par: number;
  sandSave: boolean | null | undefined;
}): { attempt: boolean; made: boolean } {
  if (h.score == null) return { attempt: false, made: false };
  const bunker = h.sandSave != null;
  const attempt = h.missedGreen || bunker;
  const made = (h.missedGreen && h.score <= h.par) || h.sandSave === true;
  return { attempt, made };
}

/** Scrambling %. attempts and converted are `holeScramble` counts: missed greens and greenside-bunker visits, pars-or-better and sand saves. */
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
