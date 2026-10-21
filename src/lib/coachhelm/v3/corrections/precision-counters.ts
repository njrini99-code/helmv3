/**
 * Precision counters per family x rung (07 §2 F; 02 §9; 03 §7.3): how many
 * reads were shown, and of those how many held, cleared or were contradicted
 * on recheck, and how many a coach or player marked "Not this".
 *
 * A pure rollup over three inputs the caller loads:
 *   - exposure rows (`golf_insight_exposure`: insight_id, shown_at,
 *     rank_factors) with the insight's family (`insight_type`) resolved;
 *   - recheck outcomes per insight (Slice 3 writes them; until then the list
 *     is empty and held / cleared / contradicted stay 0);
 *   - corrections (`golf_coachhelm_corrections`).
 *
 * Counting rules (assumptions, documented because the spec gives the counter
 * names but not the arithmetic):
 *   - `shown` counts READS, not exposures: one insight shown on five surfaces
 *     over a month is one. Production logs about 2,500 exposures a week for
 *     about 475 distinct reads a month, so counting exposures would make every
 *     ratio meaningless.
 *   - A read is counted under the rung of its NEWEST exposure (the claim the
 *     coach last saw). Exposures written before Slice 1 carry no ladder in
 *     `rank_factors` and count under `unrated`.
 *   - held / cleared / contradicted: the newest recheck outcome of a shown
 *     read, in that read's cell. A read never rechecked counts in none.
 *   - not_this: a shown read on which at least one author's newest
 *     correction is "Not this" (one per read, however many authors).
 *   - confirm: the same, for "Good read" (Slice 6b). A read two authors
 *     disagree on counts once in each.
 *   - Outcomes and corrections on reads with no exposure are ignored: the
 *     counters are precision OF WHAT WAS SHOWN.
 *
 * Pure: data in, counts out. No fetch, no Supabase.
 */
import { latestPerRead } from './coach-weights';
import type { CorrectionAuthorRole, CorrectionKind } from './types';

export const PRECISION_RUNGS = [
  'seen_repeatedly',
  'observed',
  'likely',
  'working_hypothesis',
  'not_enough_yet',
  'unrated',
] as const;
export type PrecisionRung = (typeof PRECISION_RUNGS)[number];

const LADDER_RUNGS: ReadonlySet<string> = new Set(PRECISION_RUNGS.filter((r) => r !== 'unrated'));

export type RecheckOutcome = 'held' | 'cleared' | 'contradicted';

export interface ExposureForPrecision {
  insight_id: string;
  /** The insight's `insight_type`. */
  family: string;
  shown_at: string;
  /** `golf_insight_exposure.rank_factors` as stored (Slice 1 writes `ladder`). */
  rank_factors?: unknown;
}

export interface OutcomeForPrecision {
  insight_id: string;
  outcome: RecheckOutcome;
  /** When the recheck was computed. */
  at: string;
}

export interface CorrectionForPrecision {
  insight_id: string;
  author_user_id: string;
  author_role: CorrectionAuthorRole;
  kind: CorrectionKind;
  created_at: string;
}

export interface PrecisionCell {
  family: string;
  rung: PrecisionRung;
  shown: number;
  held: number;
  cleared: number;
  contradicted: number;
  not_this: number;
  confirm: number;
}

export interface PrecisionRollup {
  /** One cell per (family, rung) with at least one shown read; sorted. */
  cells: PrecisionCell[];
  /** The same counts summed over every cell. */
  totals: Omit<PrecisionCell, 'family' | 'rung'>;
}

/** The rung recorded on an exposure's `rank_factors.ladder`, else `unrated`. */
export function rungFromRankFactors(rankFactors: unknown): PrecisionRung {
  if (!rankFactors || typeof rankFactors !== 'object' || Array.isArray(rankFactors)) return 'unrated';
  const ladder = (rankFactors as { ladder?: unknown }).ladder;
  return typeof ladder === 'string' && LADDER_RUNGS.has(ladder) ? (ladder as PrecisionRung) : 'unrated';
}

function newestBy<T>(rows: readonly T[], key: (row: T) => string, at: (row: T) => string): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    const prev = out.get(k);
    if (!prev || at(row) >= at(prev)) out.set(k, row);
  }
  return out;
}

const RUNG_ORDER = new Map<PrecisionRung, number>(PRECISION_RUNGS.map((r, i) => [r, i]));

export function rollupPrecision(input: {
  exposures: readonly ExposureForPrecision[];
  outcomes?: readonly OutcomeForPrecision[];
  corrections?: readonly CorrectionForPrecision[];
}): PrecisionRollup {
  const newestExposure = newestBy(
    input.exposures.filter((e) => e.insight_id && e.family),
    (e) => e.insight_id,
    (e) => e.shown_at,
  );
  const newestOutcome = newestBy(input.outcomes ?? [], (o) => o.insight_id, (o) => o.at);

  const notThisReads = new Set<string>();
  const confirmReads = new Set<string>();
  for (const c of latestPerRead(input.corrections ?? [])) {
    if (c.kind === 'not_this') notThisReads.add(c.insight_id);
    if (c.kind === 'confirm') confirmReads.add(c.insight_id);
  }

  const cells = new Map<string, PrecisionCell>();
  for (const [insightId, exposure] of newestExposure) {
    const rung = rungFromRankFactors(exposure.rank_factors);
    const key = `${exposure.family}\u0000${rung}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { family: exposure.family, rung, shown: 0, held: 0, cleared: 0, contradicted: 0, not_this: 0, confirm: 0 };
      cells.set(key, cell);
    }
    cell.shown += 1;
    const outcome = newestOutcome.get(insightId)?.outcome;
    if (outcome) cell[outcome] += 1;
    if (notThisReads.has(insightId)) cell.not_this += 1;
    if (confirmReads.has(insightId)) cell.confirm += 1;
  }

  const sorted = [...cells.values()].sort(
    (a, b) =>
      a.family.localeCompare(b.family) || (RUNG_ORDER.get(a.rung) ?? 0) - (RUNG_ORDER.get(b.rung) ?? 0),
  );
  const totals = { shown: 0, held: 0, cleared: 0, contradicted: 0, not_this: 0, confirm: 0 };
  for (const c of sorted) {
    totals.shown += c.shown;
    totals.held += c.held;
    totals.cleared += c.cleared;
    totals.contradicted += c.contradicted;
    totals.not_this += c.not_this;
    totals.confirm += c.confirm;
  }
  return { cells: sorted, totals };
}
