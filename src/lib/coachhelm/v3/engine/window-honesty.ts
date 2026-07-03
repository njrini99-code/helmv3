/**
 * Phase E — window & sample-size honesty helpers (cross-engine).
 *
 * The cache-backed v3 generators (putt-distance, par-type, scrambling) read
 * stats the refresh writer computes over a player's ENTIRE completed+scored
 * history (no round_date filter — see refresh_player_stats_cache). They used
 * to stamp window_days:90 anyway, which is a lie for any player with rounds
 * older than 90 days. lifetimeSpanDays() turns the cache's first/last round
 * dates into the TRUE span so evidence.window_days is honest.
 *
 * Make-% bands also shipped without disclosing the attempt count behind them
 * (a "0% from 25+ ft" over 1 putt and over 31 putts looked identical).
 * attemptGate() enforces a floor and produces the "(N attempts)" disclosure.
 *
 * Both pure + exported for direct unit testing.
 */

/** Minimum attempts in a band/bucket before a make-/save-% may be REPORTED.
 *  Below this the rate is noise and the generator suppresses the row.
 *  Calibrated to the per-band attempt counts on real rosters (Nick Rini's
 *  thinnest reported band, 25+ ft, carries 31 attempts; a 5-round player can
 *  reach ~8 in a thin band — 8 is the smallest band we trust). */
export const ATTEMPT_FLOOR = 8;

/**
 * Inclusive span in days between the first and last contributing round.
 * Returns null when either bound is missing/unparseable — the caller then
 * falls back to its own conservative span (never silently re-claims 90).
 */
export function lifetimeSpanDays(
  firstRoundDate: string | null | undefined,
  lastRoundDate: string | null | undefined,
): number | null {
  if (!firstRoundDate || !lastRoundDate) return null;
  const a = Date.parse(firstRoundDate);
  const b = Date.parse(lastRoundDate);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const days = Math.round(Math.abs(b - a) / 86400_000) + 1; // +1: inclusive
  return Math.max(1, days);
}

export interface AttemptGateResult {
  /** True when the band has enough attempts to report a rate. */
  report: boolean;
  /** " (N attempt[s])" when reportable; '' otherwise. Append to prose. */
  disclosure: string;
}

/**
 * Decide whether a band/bucket rate may be reported and build its sample-size
 * disclosure. A rate is only honest alongside its n.
 */
export function attemptGate(
  attempts: number,
  opts: { floor?: number } = {},
): AttemptGateResult {
  const floor = opts.floor ?? ATTEMPT_FLOOR;
  const n = Number.isFinite(attempts) ? Math.max(0, Math.trunc(attempts)) : 0;
  if (n < floor) return { report: false, disclosure: '' };
  const noun = n === 1 ? 'attempt' : 'attempts';
  return { report: true, disclosure: ` (${n} ${noun})` };
}

/** Days after which a card must disclose how old its newest data is. */
const STALE_DATA_DISCLOSURE_DAYS = 21;

/**
 * Staleness disclosure for cache-backed cards (regrade VAL-P3): a "high"
 * alert generated today can describe play from 7-9 weeks ago, and nothing on
 * the card said so. Returns " Data through YYYY-MM-DD." when the newest round
 * is older than STALE_DATA_DISCLOSURE_DAYS, else ''. Append to card content.
 */
export function staleDataSuffix(lastRoundDate: string | null | undefined): string {
  if (!lastRoundDate) return '';
  const last = Date.parse(lastRoundDate);
  if (!Number.isFinite(last)) return '';
  const ageDays = (Date.now() - last) / 86400_000;
  if (ageDays <= STALE_DATA_DISCLOSURE_DAYS) return '';
  return ` Data through ${String(lastRoundDate).slice(0, 10)}.`;
}
