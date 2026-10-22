/**
 * The program's Track record (02 §9, 03 §7.3, 07 §2 F): per family × rung,
 * how many reads were shown since a date, how many held, cleared or were
 * contradicted when rechecked, and what the program's coaches said about them
 * (Not this, Wrong cause, Already on it, Show later, Good read).
 *
 * Computed on read, from rows the loader has already fetched: one row per
 * read shown in the window (its newest exposure's ladder, its current ladder
 * and its lifecycle block) and the corrections on those reads. No rollup
 * table: the largest program today has 64 shown reads since Aug 1 (228 at
 * most), and the per-read newest exposure comes from one SQL function.
 *
 * Counting rules (on top of `rollupPrecision`'s):
 *   - A read's rung is the ladder its newest exposure recorded
 *     (`rank_factors.ladder`); when the exposure has none (written before
 *     Slice 1, or with the support flag off) its current `evidence.ladder`;
 *     else `unrated`, which is counted in the program totals but in no rung.
 *   - "Rechecked" = held + cleared + contradicted. The held line is
 *     "held of rechecked", never of shown: a read not rechecked yet has not
 *     been graded.
 *   - Below {@link TRACK_RECORD_MIN_RECHECKED} rechecked reads a row is
 *     "Not enough yet": the counts are given, the held share is not judged.
 *   - Program corrections are the coaches' (`author_role = coach`), the newest
 *     per coach per read, on reads shown in the window.
 *   - "Cleared on their own later": reads a coach marked Not this or Wrong
 *     cause whose outcome is Cleared, reached after that correction.
 *
 * Pure: data in, counts out. No fetch, no Supabase.
 */
import { latestPerRead } from '@/lib/coachhelm/v3/corrections/coach-weights';
import {
  rollupPrecision,
  rungFromRankFactors,
  type CorrectionForPrecision,
  type PrecisionCell,
  type PrecisionRung,
} from '@/lib/coachhelm/v3/corrections/precision-counters';
import type { CorrectionKind } from '@/lib/coachhelm/v3/corrections/types';
import type { ReadLifecycleMeta } from '@/lib/coachhelm/v3/lifecycle/types';
import type { LadderRung } from '@/lib/coachhelm/v3/support/ladder';
import { readOutcomeFromLifecycle, type ReadOutcome } from './outcome';

/** Rechecked reads a row needs before its held share is judged against the target. */
export const TRACK_RECORD_MIN_RECHECKED = 10;

/** The five ladder rungs, strongest first (the strip's order). */
export const TRACK_RECORD_RUNGS: readonly LadderRung[] = [
  'seen_repeatedly',
  'observed',
  'likely',
  'working_hypothesis',
  'not_enough_yet',
];

/**
 * The back-test's acceptance bars (02 §8), in tenths: Seen repeatedly holds
 * at least 8 in 10, Observed 7, Likely 6; Not enough yet should hold fewer
 * than 5 in 10 (more than 6 means the floors are too strict). Working
 * hypothesis has no bar in the standard.
 */
export type RungTarget = { kind: 'at_least'; tenths: number } | { kind: 'below'; tenths: number; tooStrictAbove: number };
export const RUNG_TARGETS: Readonly<Record<LadderRung, RungTarget | null>> = {
  seen_repeatedly: { kind: 'at_least', tenths: 8 },
  observed: { kind: 'at_least', tenths: 7 },
  likely: { kind: 'at_least', tenths: 6 },
  working_hypothesis: null,
  not_enough_yet: { kind: 'below', tenths: 5, tooStrictAbove: 6 },
};

/** One read shown in the window, as the loader hands it over. */
export interface ShownRead {
  insight_id: string;
  /** `golf_coach_insights.insight_type`. */
  family: string;
  /** The newest exposure in the window. */
  last_shown_at: string;
  /** `rank_factors.ladder` on that exposure, when written. */
  shown_ladder: string | null;
  /** `evidence.ladder` on the read now. */
  current_ladder: string | null;
  /** `metadata.coachhelm_lifecycle`, parsed. */
  lifecycle: ReadLifecycleMeta | null;
}

export interface TrackCounts {
  shown: number;
  held: number;
  cleared: number;
  contradicted: number;
  /** held + cleared + contradicted. */
  rechecked: number;
}

/** Where a row's held share sits against its target. */
export type TargetStanding = 'not_enough' | 'on_target' | 'below_target' | 'too_strict' | 'no_target';

export interface RungRow extends TrackCounts {
  rung: LadderRung;
  target: RungTarget | null;
  standing: TargetStanding;
}

export interface FamilyRow extends TrackCounts {
  family: string;
  not_this: number;
  confirm: number;
  standing: Exclude<TargetStanding, 'on_target' | 'below_target' | 'too_strict'>;
}

export type ProgramCorrectionCounts = Record<CorrectionKind, number>;

export interface TrackRecord {
  program: TrackCounts;
  /** Shown reads with no ladder recorded (before Slice 1): in the program line, in no rung. */
  unrated: TrackCounts;
  rungs: RungRow[];
  families: FamilyRow[];
  corrections: ProgramCorrectionCounts;
  /** Reads a coach marked Not this or Wrong cause that later cleared on their own. */
  correctedThenCleared: number;
}

function counts(cell: Pick<PrecisionCell, 'shown' | 'held' | 'cleared' | 'contradicted'>): TrackCounts {
  return {
    shown: cell.shown,
    held: cell.held,
    cleared: cell.cleared,
    contradicted: cell.contradicted,
    rechecked: cell.held + cell.cleared + cell.contradicted,
  };
}

const ZERO: TrackCounts = { shown: 0, held: 0, cleared: 0, contradicted: 0, rechecked: 0 };

function add(a: TrackCounts, b: TrackCounts): TrackCounts {
  return {
    shown: a.shown + b.shown,
    held: a.held + b.held,
    cleared: a.cleared + b.cleared,
    contradicted: a.contradicted + b.contradicted,
    rechecked: a.rechecked + b.rechecked,
  };
}

/** The rung a shown read counts under: what the exposure recorded, else the read's ladder now, else `unrated`. */
export function rungOfShownRead(read: Pick<ShownRead, 'shown_ladder' | 'current_ladder'>): PrecisionRung {
  const shown = rungFromRankFactors({ ladder: read.shown_ladder });
  return shown !== 'unrated' ? shown : rungFromRankFactors({ ladder: read.current_ladder });
}

/** Judge a row's held share against its target, in whole-number arithmetic (no rounding at the edges). */
export function targetStanding(row: Pick<TrackCounts, 'held' | 'rechecked'>, target: RungTarget | null): TargetStanding {
  if (row.rechecked < TRACK_RECORD_MIN_RECHECKED) return 'not_enough';
  if (!target) return 'no_target';
  const heldTenths = row.held * 10;
  if (target.kind === 'at_least') return heldTenths >= target.tenths * row.rechecked ? 'on_target' : 'below_target';
  if (heldTenths > target.tooStrictAbove * row.rechecked) return 'too_strict';
  return heldTenths < target.tenths * row.rechecked ? 'on_target' : 'below_target';
}

export function buildTrackRecord(input: {
  reads: readonly ShownRead[];
  corrections?: readonly CorrectionForPrecision[];
}): TrackRecord {
  const outcomes = new Map<string, ReadOutcome>();
  for (const read of input.reads) {
    const o = readOutcomeFromLifecycle(read.lifecycle);
    if (o) outcomes.set(read.insight_id, o);
  }
  const shownIds = new Set(input.reads.map((r) => r.insight_id));
  const corrections = (input.corrections ?? []).filter((c) => shownIds.has(c.insight_id));

  const rollup = rollupPrecision({
    exposures: input.reads.map((r) => ({
      insight_id: r.insight_id,
      family: r.family,
      shown_at: r.last_shown_at,
      rank_factors: { ladder: rungOfShownRead(r) },
    })),
    outcomes: [...outcomes].map(([insight_id, o]) => ({ insight_id, outcome: o.outcome, at: o.at })),
    corrections,
  });

  const byRung = new Map<PrecisionRung, TrackCounts>();
  const byFamily = new Map<string, FamilyRow>();
  for (const cell of rollup.cells) {
    byRung.set(cell.rung, add(byRung.get(cell.rung) ?? ZERO, counts(cell)));
    const prev = byFamily.get(cell.family);
    const c = add(prev ?? ZERO, counts(cell));
    byFamily.set(cell.family, {
      ...c,
      family: cell.family,
      not_this: (prev?.not_this ?? 0) + cell.not_this,
      confirm: (prev?.confirm ?? 0) + cell.confirm,
      standing: 'not_enough',
    });
  }

  const rungs: RungRow[] = TRACK_RECORD_RUNGS.map((rung) => {
    const c = byRung.get(rung) ?? ZERO;
    const target = RUNG_TARGETS[rung];
    return { rung, ...c, target, standing: targetStanding(c, target) };
  });

  const families = [...byFamily.values()]
    .map((f) => ({ ...f, standing: f.rechecked < TRACK_RECORD_MIN_RECHECKED ? ('not_enough' as const) : ('no_target' as const) }))
    .sort((a, b) => b.shown - a.shown || a.family.localeCompare(b.family));

  const coachLatest = latestPerRead(corrections.filter((c) => c.author_role === 'coach'));
  const tally: ProgramCorrectionCounts = { not_this: 0, wrong_cause: 0, already_on_it: 0, snooze: 0, confirm: 0 };
  const clearedLater = new Set<string>();
  for (const c of coachLatest) {
    tally[c.kind] += 1;
    if (c.kind !== 'not_this' && c.kind !== 'wrong_cause') continue;
    const o = outcomes.get(c.insight_id);
    if (o?.outcome === 'cleared' && o.at > c.created_at) clearedLater.add(c.insight_id);
  }

  return {
    program: counts(rollup.totals),
    unrated: byRung.get('unrated') ?? ZERO,
    rungs,
    families,
    corrections: tally,
    correctedThenCleared: clearedLater.size,
  };
}
