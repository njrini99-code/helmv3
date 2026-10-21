/**
 * The one-tap data-gap ask (CoachHelm supercharge Slice 8a, design 03 §3.3,
 * 04 Example 12). Pure: data in, value out. No fetch, no Supabase.
 *
 * Slice 2 (`v3/engine/root-cause.ts`, `dataGapFor`) writes
 * `evidence.data_gap` on a read whose failures miss one optional field:
 * `{ field, shot_filter, target_count, have_count, prompt }`. `target_count`
 * is how many of the NEXT failures must carry the field for coverage to
 * reach 60% (`dataGapTagsNeeded`); `have_count` is how many already did when
 * the read was written. This module turns those reads into asks for shot
 * entry, decides whether a just-recorded shot belongs to one, and counts the
 * progress toward the target.
 *
 * Only the putt miss direction is asked in this slice. A tee shot into an
 * `other` lie and the club chip (03 §3.3 bullets 2 and 3) need data that does
 * not exist yet; every other gap is ignored here, never guessed at.
 */

import type { PuttMissTag } from '@/lib/types/golf';
import { normalizeShotValue } from '@/lib/coachhelm/v3/context/normalize-shot';

/**
 * The engine's `dataGapTagsNeeded` (`v3/engine/root-cause.ts`): the smallest
 * x with (have + x) / (of + x) ≥ 60%, at least 1. Restated here, not
 * imported, so the shot screen's client bundle does not pull in the engine;
 * `asks.test.ts` pins it to the engine's function.
 */
export function tagsNeeded(have: number, of: number): number {
  return Math.max(1, Math.ceil((3 * of - 5 * have) / 2));
}

/** The putt miss tags the prompt offers, in the order the read's prompt
 *  names them ("Which side? Short · Long · High · Low"). The same values the
 *  optional miss chips write to `golf_shots.miss_direction`. */
export const PUTT_MISS_OPTIONS: readonly PuttMissTag[] = ['short', 'long', 'high', 'low'];

export const PUTT_MISS_LABEL: Record<PuttMissTag, string> = {
  short: 'Short',
  long: 'Long',
  high: 'High',
  low: 'Low',
};

/** The shot filter Slice 2 writes for a putt family read
 *  (`shotFilterFor`, `root-cause.ts`): missed first putts from
 *  `[min, max)` feet; `max` null means open-ended. */
export interface PuttGapFilter {
  shot_type: 'putting';
  first_putt: true;
  distance_feet: readonly [number, number | null];
  holed: false;
}

export interface DataGapAsk {
  /** `golf_coach_insights.id` of the read that asks. */
  readId: string;
  readTitle: string;
  field: 'miss_direction';
  filter: PuttGapFilter;
  /** Tags needed on the next failures (`data_gap.target_count`). */
  targetCount: number;
  /** Failures already tagged when the read was written (`data_gap.have_count`). */
  haveCount: number;
  /** Matching failures, in rounds after the read's window, that already
   *  carry the field when shot entry opened. */
  taggedSince: number;
  /** Matching failures, in rounds after the read's window, left without the
   *  field. Each one joins the engine's coverage population too, so it
   *  raises the target (`askTarget`). */
  untaggedSince: number;
  /** "5–10 ft" */
  bandLabel: string;
  /** `evidence.window_end` as `YYYY-MM-DD`; null when the read has none. */
  windowEnd: string | null;
}

/** One shot, reduced to what a shot filter can test. */
export interface GapShotFacts {
  shot_type: string | null;
  is_penalty: boolean;
  /** This is the hole's first non-penalty putt. */
  first_putt: boolean;
  /** Distance to the hole before the shot, in feet; null when unrecorded. */
  distance_feet: number | null;
  holed: boolean;
  /** The shot already carries a miss direction. */
  has_miss_direction: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function parseRange(v: unknown): readonly [number, number | null] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [min, max] = v as unknown[];
  if (typeof min !== 'number' || !Number.isFinite(min) || min < 0) return null;
  if (max === null) return [min, null];
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= min) return null;
  return [min, max];
}

/** "5–10 ft", "25+ ft" (the label `sequenceTargetFor` uses). */
export function bandLabel(range: readonly [number, number | null]): string {
  const [min, max] = range;
  return max === null ? `${min}+ ft` : `${min}–${max} ft`;
}

/**
 * The ask a read carries, or null when it carries none this slice asks:
 * the gap must be the putt `miss_direction` on missed first putts with a
 * valid distance band and a positive target. Anything else (another field,
 * another family, a malformed row) is not asked.
 */
export function parseDataGapAsk(row: {
  id: string;
  title: string | null;
  evidence: unknown;
}): Omit<DataGapAsk, 'taggedSince' | 'untaggedSince'> | null {
  if (!isRecord(row.evidence)) return null;
  const gap = row.evidence.data_gap;
  if (!isRecord(gap) || gap.field !== 'miss_direction') return null;
  const f = gap.shot_filter;
  if (!isRecord(f)) return null;
  if (f.shot_type !== 'putting' || f.first_putt !== true || f.holed !== false) return null;
  const range = parseRange(f.distance_feet);
  if (!range) return null;
  if (!isCount(gap.target_count) || gap.target_count < 1 || !isCount(gap.have_count)) return null;
  const end = row.evidence.window_end;
  const windowEnd = typeof end === 'string' && /^\d{4}-\d{2}-\d{2}/.test(end) ? end.slice(0, 10) : null;
  return {
    readId: row.id,
    readTitle: (row.title ?? '').trim(),
    field: 'miss_direction',
    filter: { shot_type: 'putting', first_putt: true, distance_feet: range, holed: false },
    targetCount: gap.target_count,
    haveCount: gap.have_count,
    bandLabel: bandLabel(range),
    windowEnd,
  };
}

/**
 * Does the shot belong to the gap's filter? Fails closed: a filter key this
 * module does not know never matches, and a penalty stroke never matches.
 * The field itself is not part of the filter: whether the shot still needs
 * it is `needsAsk`.
 */
export function matchesGap(shot: GapShotFacts, filter: Record<string, unknown> | PuttGapFilter): boolean {
  if (shot.is_penalty) return false;
  for (const [key, want] of Object.entries(filter)) {
    switch (key) {
      case 'shot_type':
        if (shot.shot_type !== want) return false;
        break;
      case 'first_putt':
        if (typeof want !== 'boolean' || shot.first_putt !== want) return false;
        break;
      case 'holed':
        if (typeof want !== 'boolean' || shot.holed !== want) return false;
        break;
      case 'distance_feet': {
        const range = parseRange(want);
        const d = shot.distance_feet;
        if (!range || d === null) return false;
        if (d < range[0] || (range[1] !== null && d >= range[1])) return false;
        break;
      }
      default:
        return false;
    }
  }
  return true;
}

/** The shot matches and the field is still empty: the prompt may ask. */
export function needsAsk(shot: GapShotFacts, ask: Pick<DataGapAsk, 'filter'>): boolean {
  return !shot.has_miss_direction && matchesGap(shot, ask.filter);
}

/** One hole's shots in shot order, as the engine reads them: the first
 *  non-penalty putt is the hole's first putt. */
export function holeGapFacts<T>(
  shots: readonly T[],
  read: (s: T) => Omit<GapShotFacts, 'first_putt'>,
): GapShotFacts[] {
  let firstSeen = false;
  return shots.map((s) => {
    const base = read(s);
    const isFirst = !firstSeen && base.shot_type === 'putting' && !base.is_penalty;
    if (isFirst) firstSeen = true;
    return { ...base, first_putt: isFirst };
  });
}

/** Feet from a recorded `(value, unit)` pair, its own unit only. */
export function feetOf(value: number | null | undefined, unit: string | null | undefined): number | null {
  const v = normalizeShotValue(value, unit);
  return v.kind === 'value' ? v.value : null;
}

/** The `golf_shots` columns a stored putt needs to be tested. */
export interface StoredPuttRow {
  round_id: string;
  hole_number: number;
  shot_number: number;
  shot_type: string | null;
  is_penalty: boolean | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  result: string | null;
  putt_made: boolean | null;
  miss_direction: string | null;
}

/** Stored rows → facts, grouped by hole, the first putt marked per hole. */
export function storedGapFacts(rows: readonly StoredPuttRow[]): Array<GapShotFacts & { round_id: string }> {
  const byHole = new Map<string, StoredPuttRow[]>();
  for (const r of rows) {
    const key = `${r.round_id}:${r.hole_number}`;
    const list = byHole.get(key);
    if (list) list.push(r);
    else byHole.set(key, [r]);
  }
  const out: Array<GapShotFacts & { round_id: string }> = [];
  for (const list of byHole.values()) {
    const sorted = [...list].sort((a, b) => a.shot_number - b.shot_number);
    const facts = holeGapFacts(sorted, (r) => ({
      shot_type: r.shot_type,
      is_penalty: r.is_penalty === true,
      distance_feet: feetOf(r.distance_to_hole_before, r.distance_unit_before),
      holed: r.result === 'hole' || r.putt_made === true,
      has_miss_direction: !!r.miss_direction,
    }));
    facts.forEach((f, i) => out.push({ ...f, round_id: sorted[i]!.round_id }));
  }
  return out;
}

/** Matching failures that already carry the field. */
export function countTagged(facts: readonly GapShotFacts[], ask: Pick<DataGapAsk, 'filter'>): number {
  return facts.filter((f) => f.has_miss_direction && matchesGap(f, ask.filter)).length;
}

/** Matching failures that do not carry the field. */
export function countUntagged(facts: readonly GapShotFacts[], ask: Pick<DataGapAsk, 'filter'>): number {
  return facts.filter((f) => !f.has_miss_direction && matchesGap(f, ask.filter)).length;
}

/**
 * The read's population (`of`, its failures when it was written), recovered
 * from the stored `have_count` and `target_count`. The engine writes
 * `target = max(1, ceil((3·of − 5·have) / 2))` only when coverage is below
 * 60%, so `(3·of − 5·have) / 2` is in `(target − 1, target]` and a half
 * integer: one of `2·target` and `2·target − 1` is `3·of − 5·have`. Null
 * when neither gives a population that reproduces the stored target.
 */
export function impliedPopulation(have: number, target: number): number | null {
  for (const twice of [2 * target, 2 * target - 1]) {
    const n = twice + 5 * have;
    if (twice <= 0 || n % 3 !== 0) continue;
    const of = n / 3;
    if (of > 0 && have / of < 0.6 && tagsNeeded(have, of) === target) return of;
  }
  return null;
}

/**
 * Tags needed, counting the matching failures left untagged since the read
 * (stored ones plus putts skipped this session): each joins the population
 * as it does in the engine's coverage, so the target is
 * `dataGapTagsNeeded(have, of + untagged)`. When the population cannot be
 * recovered, `target + ceil(1.5 · untagged)`, which is never below the exact
 * answer (each untagged failure adds 1.5 to the bound).
 */
export function askTarget(
  ask: Pick<DataGapAsk, 'targetCount' | 'haveCount' | 'untaggedSince'>,
  skipsThisSession = 0,
): number {
  const untagged = ask.untaggedSince + Math.max(0, skipsThisSession);
  if (untagged === 0) return ask.targetCount;
  const of = impliedPopulation(ask.haveCount, ask.targetCount);
  return of === null
    ? ask.targetCount + Math.ceil(1.5 * untagged)
    : tagsNeeded(ask.haveCount, of + untagged);
}

type ProgressAsk = Pick<DataGapAsk, 'taggedSince' | 'untaggedSince' | 'targetCount' | 'haveCount'>;

/** Progress toward the target: tagged before entry opened plus taps since. */
export function askProgress(ask: Pick<DataGapAsk, 'taggedSince'>, tapsThisSession: number): number {
  return ask.taggedSince + Math.max(0, tapsThisSession);
}

export function isAskOpen(ask: ProgressAsk, tapsThisSession: number, skipsThisSession = 0): boolean {
  return askProgress(ask, tapsThisSession) < askTarget(ask, skipsThisSession);
}

/** "4 of 10 for your 5–10 ft putt read" */
export function counterText(
  ask: ProgressAsk & Pick<DataGapAsk, 'bandLabel'>,
  tapsThisSession: number,
  skipsThisSession = 0,
): string {
  return `${askProgress(ask, tapsThisSession)} of ${askTarget(ask, skipsThisSession)} for your ${ask.bandLabel} putt read`;
}

function filterKey(f: PuttGapFilter): string {
  return `${f.shot_type}|${f.distance_feet[0]}|${f.distance_feet[1] ?? 'open'}`;
}

/**
 * The asks shot entry should carry: open ones only, one per shot filter
 * (two reads on the same band ask once; the one needing the most tags
 * wins, so the prompt does not vanish while a read still needs tags).
 */
export function openAsks(asks: readonly DataGapAsk[]): DataGapAsk[] {
  const byFilter = new Map<string, DataGapAsk>();
  for (const a of asks) {
    if (!isAskOpen(a, 0)) continue;
    const key = filterKey(a.filter);
    const prev = byFilter.get(key);
    if (!prev || askTarget(a) - a.taggedSince > askTarget(prev) - prev.taggedSince) byFilter.set(key, a);
  }
  return [...byFilter.values()];
}

/** The first open ask the shot belongs to and still needs, or null. */
export function askForShot(
  asks: readonly DataGapAsk[],
  shot: GapShotFacts,
  tapsByRead: Readonly<Record<string, number>>,
  skipsByRead: Readonly<Record<string, number>> = {},
): DataGapAsk | null {
  for (const a of asks) {
    if (!isAskOpen(a, tapsByRead[a.readId] ?? 0, skipsByRead[a.readId] ?? 0)) continue;
    if (needsAsk(shot, a)) return a;
  }
  return null;
}
