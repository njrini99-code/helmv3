/**
 * Stamped windows for v3 reads (CoachHelm Slice 0b, freshness plumbing).
 *
 * Production on 2026-10-20: 249 of 709 visible v3 reads carried an empty
 * `evidence.window_end` (approach_miss, putt_bias, warmup_hole, scrambling,
 * pressure_gap and the context-only composites), so nobody could say how fresh
 * a read was and the revision key collapsed to `sample_n`. Every v3 read now
 * says which rounds it read:
 *
 *   - `newest_round_id`: the newest round that contributed (round_date, then
 *     created_at, then id);
 *   - `rounds_n`: how many contributing rounds are countable
 *     (`round-countable.ts`);
 *   - `source_round_ids`: the contributing rounds, newest first, capped;
 *   - `scanned_through_round_id`: the newest countable round the read looked
 *     at. It can be newer than `newest_round_id`: a sand read whose newest
 *     round had no bunker shot still scanned that round.
 *
 * These four are written always; no surface a coach or player sees today
 * reads them. The displayed bounds (`window_start`, `window_end`) change only
 * behind `coachhelm_reads_v1_copy`: an empty bound is filled, and a
 * `window_end` on a day with no real round (a stats-cache date on a test
 * round while the cache migrations are held) is moved back to the newest real
 * round. A non-empty `window_end` on a real round's day is never moved, so
 * `window_end` keeps meaning "the newest round the read scanned", not "the
 * newest round that contributed".
 *
 * Two ways to say which rounds contributed:
 *   - by id (`windowRoundIds` on a generator aggregate, the context rows or
 *     source reads of a composite): the rounds behind `sample_n`;
 *   - by range (fallback): the player's completed, non-test rounds between the
 *     composed `window_start` (or the beginning) and `window_end` (or, when
 *     empty, the last `window_days`). Used for the stats-cache generators,
 *     whose lifetime aggregate has no round list.
 *
 * The rounds come from one query per player per engine pass (memoised
 * briefly). A failed load is logged and leaves the evidence as composed; the
 * upsert then carries the previous row's stamp forward
 * (`carryForwardStamp`), so a transient error never unstamps a read.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isCountableRound } from '@/lib/golf/round-countable';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerEvent } from '@/lib/server-error-logger';
import type { InsightEvidence, InsightSampleUnit } from '@/lib/coachhelm/v2/insights/types';
import { SOURCE_ROUND_IDS_CAP } from './source-rounds';
import {
  evaluateReadFloor,
  freshnessReadsEnabled,
  sampleUnitFor,
  type ReadFloorShortfall,
} from './read-floors';

/** One completed, non-test round as the stamp reads it. */
export interface WindowRoundRow {
  id: string;
  round_date: string;
  created_at: string | null;
  is_test?: boolean | null;
  holes_played: number | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
}

export interface WindowStamp {
  window_start: string;
  window_end: string;
  newest_round_id: string;
  rounds_n: number;
  /** Rounds in the window, newest first (uncapped; the caller caps). */
  round_ids: string[];
  /** 'ids' when the read named its rounds; 'range' for the date fallback. */
  basis: 'ids' | 'range';
}

/** What the read scanned up to: its newest real round and newest countable one. */
export interface ScannedThrough {
  /** Newest real round on or before the composed end (or today). */
  newest: WindowRoundRow | null;
  /** Newest countable round on or before it; what the sweep compares with. */
  newestCountable: WindowRoundRow | null;
}

const ROUND_COLUMNS =
  'id, round_date, created_at, is_test, holes_played, total_score, front_nine, back_nine, total_putts';
const MEMO_TTL_MS = 30_000;
const memo = new Map<string, { at: number; rows: WindowRoundRow[] }>();

/** Test hook: forget memoised round lists. */
export function __resetRoundIndexMemo(): void {
  memo.clear();
}

/** YYYY-MM-DD of an ISO date or timestamp; null when unparseable. */
export function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : new Date(t).toISOString().slice(0, 10);
}

/** Newest first: round_date desc, then created_at desc, then id desc. */
export function compareNewestFirst(a: WindowRoundRow, b: WindowRoundRow): number {
  if (a.round_date !== b.round_date) return a.round_date < b.round_date ? 1 : -1;
  const ac = a.created_at ?? '';
  const bc = b.created_at ?? '';
  if (ac !== bc) return ac < bc ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Pure: the player's newest countable round in an index, by the same order
 * and rule the stamp uses, so the sweep and the stamp can never disagree.
 */
export function newestCountableRound(index: readonly WindowRoundRow[]): WindowRoundRow | null {
  return (
    [...index]
      .filter((r) => r.is_test !== true && dayOf(r.round_date) !== null && isCountableRound(r))
      .sort(compareNewestFirst)[0] ?? null
  );
}

/** Pure: the stamp for a set of rounds, or null when the set is empty. */
export function stampFromRounds(
  rows: readonly WindowRoundRow[],
  basis: WindowStamp['basis'],
): WindowStamp | null {
  const usable = rows.filter((r) => r.is_test !== true && dayOf(r.round_date) !== null);
  if (usable.length === 0) return null;
  const sorted = [...usable].sort(compareNewestFirst);
  const newest = sorted[0] as WindowRoundRow;
  const oldest = sorted[sorted.length - 1] as WindowRoundRow;
  return {
    window_start: dayOf(oldest.round_date) as string,
    window_end: dayOf(newest.round_date) as string,
    newest_round_id: newest.id,
    rounds_n: sorted.filter((r) => isCountableRound(r)).length,
    round_ids: sorted.map((r) => r.id),
    basis,
  };
}

/** Pure: stamp the rounds named by id (ids the index does not hold are ignored). */
export function stampFromIds(
  index: readonly WindowRoundRow[],
  roundIds: readonly string[],
): WindowStamp | null {
  const wanted = new Set(roundIds);
  return stampFromRounds(index.filter((r) => wanted.has(r.id)), 'ids');
}

/**
 * Pure: stamp the rounds inside the composed window. An empty `window_end`
 * means "up to `now`" and an empty `window_start` means "the last
 * `windowDays`" when the end is also empty, else "from the beginning"
 * (a lifetime aggregate that only knows its newest round).
 */
export function stampFromRange(
  index: readonly WindowRoundRow[],
  evidence: Pick<InsightEvidence, 'window_start' | 'window_end' | 'window_days'>,
  now: number = Date.now(),
): WindowStamp | null {
  const end = dayOf(evidence.window_end) ?? new Date(now).toISOString().slice(0, 10);
  let start = dayOf(evidence.window_start);
  if (!start && !dayOf(evidence.window_end)) {
    const days = Number.isFinite(evidence.window_days) && evidence.window_days > 0
      ? evidence.window_days
      : 90;
    start = new Date(now - days * 86400_000).toISOString().slice(0, 10);
  }
  return stampFromRounds(
    index.filter((r) => {
      const d = dayOf(r.round_date);
      return d !== null && d <= end && (start === null || d >= start);
    }),
    'range',
  );
}

/**
 * Pure: the newest real and newest countable round on or before the composed
 * `window_end` (today when empty). A generator scans every round up to that
 * day even when the newest ones add nothing to its family.
 */
export function scannedThrough(
  index: readonly WindowRoundRow[],
  evidence: Pick<InsightEvidence, 'window_end'>,
  now: number = Date.now(),
): ScannedThrough {
  const cap = dayOf(evidence.window_end) ?? new Date(now).toISOString().slice(0, 10);
  const upTo = index.filter((r) => {
    const d = dayOf(r.round_date);
    return r.is_test !== true && d !== null && d <= cap;
  });
  return {
    newest: [...upTo].sort(compareNewestFirst)[0] ?? null,
    newestCountable: newestCountableRound(upTo),
  };
}

/**
 * Pure: apply a stamp (and the sample unit) to composed evidence.
 *
 * Always: `newest_round_id`, `rounds_n`, `source_round_ids` (the
 * contributing rounds), `scanned_through_round_id` and `sample_unit` (never
 * overwriting a unit the composer chose). None of these is shown today.
 *
 * Only with `fillBounds` (the Slice 0 flag): an empty `window_start` takes the
 * oldest contributing round's day; `window_end` becomes the newest scanned
 * round's day when it is empty or names a day with no real round, and is
 * otherwise left exactly as composed.
 */
export function applyWindowStamp<E extends InsightEvidence>(
  evidence: E,
  stamp: WindowStamp | null,
  sampleUnit: InsightSampleUnit | null,
  scanned: ScannedThrough | null = null,
  fillBounds = false,
): E {
  const unit = evidence.sample_unit ?? sampleUnit ?? undefined;
  const withUnit = unit ? { ...evidence, sample_unit: unit } : evidence;
  if (!stamp) return withUnit;
  const scannedCountable = scanned?.newestCountable ?? null;
  const out: E = {
    ...withUnit,
    newest_round_id: stamp.newest_round_id,
    rounds_n: stamp.rounds_n,
    source_round_ids: stamp.round_ids.slice(0, SOURCE_ROUND_IDS_CAP),
    ...(scannedCountable ? { scanned_through_round_id: scannedCountable.id } : {}),
  };
  if (!fillBounds) return out;
  const scannedDay = dayOf(scanned?.newest?.round_date ?? null);
  const composedEndDay = dayOf(evidence.window_end);
  const window_end =
    composedEndDay && (scannedDay === null || composedEndDay === scannedDay)
      ? evidence.window_end
      : scannedDay ?? (evidence.window_end || stamp.window_end);
  return {
    ...out,
    window_start: evidence.window_start || stamp.window_start,
    window_end,
  };
}

/**
 * The player's completed, non-test rounds with the columns the countable rule
 * needs. One query per player per engine pass (memoised for MEMO_TTL_MS; a
 * requested id the memo lacks forces a refetch so a round submitted seconds
 * ago is never missed). Returns null on any failure; callers sort with
 * `compareNewestFirst` (the query's order is only for stable paging).
 */
export async function loadPlayerRoundIndex(
  supabase: SupabaseClient,
  playerId: string,
  mustInclude: readonly string[] = [],
): Promise<WindowRoundRow[] | null> {
  const hit = memo.get(playerId);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) {
    const known = new Set(hit.rows.map((r) => r.id));
    if (mustInclude.every((id) => known.has(id))) return hit.rows;
  }
  try {
    const { data, error } = await fetchAllRowsResult<WindowRoundRow>((from, to) =>
      supabase
        .from('golf_rounds')
        .select(ROUND_COLUMNS)
        .eq('player_id', playerId)
        .eq('status', 'completed')
        .eq('is_test', false)
        .order('round_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
          data: WindowRoundRow[] | null;
          error: { message: string } | null;
        }>,
    );
    if (error || !data) return null;
    memo.set(playerId, { at: Date.now(), rows: data });
    return data;
  } catch {
    return null;
  }
}

/**
 * Stamp one composed read and judge it against its family floor — the single
 * call the generator base and the composite runner make. The stamp fields
 * and the sample unit always apply; the displayed bounds and the floor only
 * when `coachhelm_reads_v1_copy` is on. `shortfall` non-null means "do not
 * write this as an open read". A failed round load is logged and the read is
 * left unstamped (and, with the flag on, not judged on rounds it cannot see).
 */
export async function stampAndCheckRead<E extends InsightEvidence>(
  supabase: SupabaseClient,
  playerId: string,
  familyKey: string,
  evidence: E,
  windowRoundIds: readonly string[] | null | undefined,
  sampleUnit: InsightSampleUnit | null = sampleUnitFor(familyKey),
): Promise<{ evidence: E; shortfall: ReadFloorShortfall | null }> {
  const ids = windowRoundIds && windowRoundIds.length > 0 ? windowRoundIds : null;
  const index = await loadPlayerRoundIndex(supabase, playerId, ids ?? []);
  if (!index) {
    try {
      await logServerEvent(
        `coachhelm.readWindow: round index load failed; ${familyKey} read left unstamped`,
        { action: 'coachhelm.v3.readWindow.load', featureArea: 'coachhelm', extra: { playerId, familyKey } },
        'warning',
      );
    } catch {
      // Logging never fails a generator run.
    }
  }
  const stamp = index ? (ids ? stampFromIds(index, ids) : stampFromRange(index, evidence)) : null;
  const scanned = index ? scannedThrough(index, evidence) : null;
  const on = freshnessReadsEnabled();
  const stamped = applyWindowStamp(evidence, stamp, sampleUnit, scanned, on);
  const shortfall = on && index ? evaluateReadFloor(familyKey, stamped) : null;
  return { evidence: stamped, shortfall };
}

/**
 * Resolve the stamp for one read: by id when the read named its rounds, else
 * by the composed range. Null when the rounds cannot be loaded or none match.
 */
export async function resolveWindowStamp(
  supabase: SupabaseClient,
  playerId: string,
  evidence: Pick<InsightEvidence, 'window_start' | 'window_end' | 'window_days'>,
  windowRoundIds: readonly string[] | null | undefined,
): Promise<WindowStamp | null> {
  const ids = windowRoundIds && windowRoundIds.length > 0 ? windowRoundIds : null;
  const index = await loadPlayerRoundIndex(supabase, playerId, ids ?? []);
  if (!index) return null;
  return ids ? stampFromIds(index, ids) : stampFromRange(index, evidence);
}
