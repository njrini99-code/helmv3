/**
 * Contradicted pairing (CoachHelm Slice 3; 03 §9 "Contradicted", 04 Example
 * 7, 07 §2 D). Pure: reads in, pairs out. The lifecycle step writes the
 * result as `conflict` on both rows' evidence.
 *
 * Two kinds:
 *
 *   opposing_direction  two supported reads on ONE subject (the delivery
 *                       dedupe's subject key: the metric id, v2 par aliases
 *                       folded) say opposite things, one "worse than its
 *                       benchmark", the other "better". The newest wins when
 *                       it clears the floor; the older one is retired.
 *                       ("Contradicted — the last 29 putts say above the
 *                       team; the longer record said below. Going with the
 *                       newer read; the older one is retired.")
 *   opposing_strategy   driver is the favoured tee club (`tee_strategy:sharp`)
 *                       while the penalty-rate read is a leak AND the record
 *                       counts the link: >= 4 penalties after a driver tee
 *                       shot, >= 30% of all penalties, in the recheck window
 *                       (the 02 §6 Observed-path floors). Both reads stay;
 *                       delivery prints one item with the net.
 *
 * "Supported": a visible read (not tentative) at or above its family floor
 * (02 §7; the floors Slice 1 uses, PR #2219 `v3/support/families.ts`), and,
 * once Slice 1 writes `evidence.support`, q <= 0.10.
 */
import { isNegativePolarityMetric } from '@/components/golf/coachhelm/insight-card/tone-derivation';
import type { ConflictRecord, LifecycleReadRow } from './types';

/** BH q for a supported read (02 §5). */
export const SUPPORT_Q = 0.1;
/** Counted link for a strategy pair (02 §6 Observed path floors). */
export const STRATEGY_LINK_MIN = 4;
export const STRATEGY_LINK_MIN_SHARE = 0.3;

/**
 * Family floors in the row's own `sample_n` unit. Copied from Slice 1
 * (PR #2219, `v3/support/families.ts`) because that branch is not on main.
 */
export function floorForRead(read: Pick<LifecycleReadRow, 'insight_type' | 'evidence'>): number {
  const t = read.insight_type ?? '';
  const m = read.evidence?.metric ?? '';
  if (t === 'putt_distance' || m.startsWith('putts_made_')) return 20;
  if (t === 'approach_miss' || m.startsWith('approach_proximity_')) return 20;
  if (t === 'scrambling' || m.startsWith('scrambling_pct_')) return 12;
  if (t === 'tee_strategy') return 20;
  if (m === 'penalty_rate_per_round' || m === 'big_number_rate') return 8;
  if (m === 'putt_slope_downhill_penalty_pct') return 15;
  if (t === 'pressure_gap' || m === 'practice_tournament_delta') return 12;
  if (t === 'warmup_hole' || m === 'opening_hole_delta') return 12;
  if (t === 'par_scoring' || m.startsWith('scoring_par_')) return 8;
  // The platform floor (`upsert.ts` MIN_SAMPLE_N).
  return 5;
}

export function isSupported(read: LifecycleReadRow): boolean {
  if (read.dismissed) return false;
  if (!['detected', 'matured', 'addressed'].includes(read.lifecycle_state ?? '')) return false;
  const ev = read.evidence;
  if (!ev || typeof ev.sample_n !== 'number' || ev.sample_n < floorForRead(read)) return false;
  const q = ev.support?.q_adj;
  if (typeof q === 'number' && q > SUPPORT_Q) return false;
  return true;
}

/** Same subject key as `dedupeBySubject` (`insight-delivery-ranking.ts`). */
export function subjectOf(read: Pick<LifecycleReadRow, 'evidence' | 'title'>): string {
  const m = (read.evidence?.metric ?? '').toLowerCase();
  if (!m) return '';
  const v2Par = /^par_scoring_par(\d)$/.exec(m);
  return v2Par ? `scoring_par_${v2Par[1]}` : m;
}

/**
 * 'worse' when the player is on the wrong side of the read's benchmark,
 * 'better' when on the right side, null when level or unknown. Tee strategy
 * carries its direction in the signature (laggy = driver costs, sharp =
 * driver performs); its headline value is not a benchmark gap.
 */
export function directionOf(read: Pick<LifecycleReadRow, 'insight_type' | 'signature' | 'evidence'>): 'worse' | 'better' | null {
  if (read.insight_type === 'tee_strategy') {
    if (read.signature?.endsWith(':laggy')) return 'worse';
    if (read.signature?.endsWith(':sharp')) return 'better';
    return null;
  }
  const ev = read.evidence;
  if (!ev || typeof ev.your_value !== 'number' || typeof ev.comparison_value !== 'number' || !ev.metric) return null;
  if (ev.your_value === ev.comparison_value) return null;
  const lowerBetter = isNegativePolarityMetric(ev.metric, {
    polarity: ev.polarity,
    unit: ev.unit,
    metric_label: ev.metric_label,
  });
  const playerLower = ev.your_value < ev.comparison_value;
  return playerLower === lowerBetter ? 'better' : 'worse';
}

function dayOf(v: string | null | undefined): string {
  return typeof v === 'string' ? v.slice(0, 10) : '';
}

/** Newer read first: window end, then last update, then id (stable). */
export function newerFirst(a: LifecycleReadRow, b: LifecycleReadRow): number {
  const w = dayOf(b.evidence?.window_end).localeCompare(dayOf(a.evidence?.window_end));
  if (w !== 0) return w;
  const u = (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
  if (u !== 0) return u;
  return a.id.localeCompare(b.id);
}

export interface PairResult {
  /** Conflict to write, keyed by read id. */
  conflicts: Map<string, ConflictRecord>;
  /** Reads retired by an opposing_direction pair. */
  retire: Set<string>;
}

export interface StrategyLink {
  penalties_after_driver: number;
  penalties: number;
  rounds_n: number;
}

function strokesOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Pair a player's reads. `reads` are the player's live v3 reads; `link` is
 * the counted driver-penalty link in the recheck window (null when not
 * loaded).
 */
export function pairReads(reads: readonly LifecycleReadRow[], link: StrategyLink | null, nowIso: string): PairResult {
  const conflicts = new Map<string, ConflictRecord>();
  const retire = new Set<string>();

  // --- opposing_direction: one subject, opposite signs, newest wins --------
  const bySubject = new Map<string, LifecycleReadRow[]>();
  for (const r of reads) {
    const s = subjectOf(r);
    if (!s || !directionOf(r)) continue;
    const list = bySubject.get(s) ?? [];
    list.push(r);
    bySubject.set(s, list);
  }
  for (const [subject, list] of bySubject) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(newerFirst);
    const winner = sorted[0]!;
    if (!isSupported(winner)) continue;
    const wDir = directionOf(winner);
    for (const other of sorted.slice(1)) {
      if (!isSupported(other) || directionOf(other) === wDir) continue;
      retire.add(other.id);
      conflicts.set(other.id, {
        with_insight_id: winner.id,
        kind: 'opposing_direction',
        role: 'retired',
        net_strokes: null,
        resolution: 'newest_wins',
        subject,
        computed_at: nowIso,
      });
      if (!conflicts.has(winner.id)) {
        conflicts.set(winner.id, {
          with_insight_id: other.id,
          kind: 'opposing_direction',
          role: 'winner',
          net_strokes: null,
          resolution: 'newest_wins',
          subject,
          computed_at: nowIso,
        });
      }
    }
  }

  // --- opposing_strategy: driver favoured vs penalties after driver --------
  const tee = reads.find(
    (r) => r.insight_type === 'tee_strategy' && directionOf(r) === 'better' && isSupported(r) && !retire.has(r.id),
  );
  const penalty = reads.find(
    (r) =>
      r.evidence?.metric === 'penalty_rate_per_round' &&
      directionOf(r) === 'worse' &&
      isSupported(r) &&
      !retire.has(r.id),
  );
  const linked =
    !!link &&
    link.penalties > 0 &&
    link.penalties_after_driver >= STRATEGY_LINK_MIN &&
    link.penalties_after_driver / link.penalties >= STRATEGY_LINK_MIN_SHARE;
  if (tee && penalty && linked && !conflicts.has(tee.id) && !conflicts.has(penalty.id)) {
    // Driver's gain a round is not measured on main (the tee-strategy read
    // compares fairway %); a later family may stamp it on the detail. The
    // penalty cost is the read's own strokes estimate when it has one.
    const gain = strokesOf(tee.evidence?.detail?.driver_strokes_gained_per_round);
    const costRaw = strokesOf(penalty.evidence?.strokes_impact);
    const cost = costRaw !== null && costRaw !== 0 ? Math.abs(costRaw) : null;
    const net = gain !== null && cost !== null ? Math.round((gain - cost) * 100) / 100 : null;
    const resolution: ConflictRecord['resolution'] =
      net === null ? 'net_unknown' : net >= 0 ? 'net_favours_driver' : 'net_favours_layback';
    const base = {
      kind: 'opposing_strategy' as const,
      role: 'paired' as const,
      net_strokes: net,
      resolution,
      subject: 'driver_vs_penalties',
      link,
      computed_at: nowIso,
    };
    conflicts.set(tee.id, { ...base, with_insight_id: penalty.id });
    conflicts.set(penalty.id, { ...base, with_insight_id: tee.id });
  }

  return { conflicts, retire };
}

export interface LinkShot {
  round_id: string;
  hole_number: number | null;
  shot_number: number | null;
  shot_type: string | null;
  club_type: string | null;
  is_penalty: boolean | null;
}

/**
 * Count penalties, and penalties whose previous shot on the hole was a
 * driver tee shot. Penalty = `is_penalty` or `shot_type = 'penalty'`.
 */
export function countDriverPenaltyLink(shots: readonly LinkShot[], roundIds: ReadonlySet<string>): StrategyLink {
  const byHole = new Map<string, LinkShot[]>();
  for (const s of shots) {
    if (!roundIds.has(s.round_id) || s.hole_number === null) continue;
    const key = `${s.round_id}|${s.hole_number}`;
    const list = byHole.get(key) ?? [];
    list.push(s);
    byHole.set(key, list);
  }
  let penalties = 0;
  let afterDriver = 0;
  for (const list of byHole.values()) {
    list.sort((a, b) => (a.shot_number ?? 0) - (b.shot_number ?? 0));
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      const isPenalty = s.is_penalty === true || (s.shot_type ?? '').toLowerCase() === 'penalty';
      if (!isPenalty) continue;
      penalties += 1;
      const prev = list[i - 1];
      if (
        prev &&
        (prev.shot_type ?? '').toLowerCase() === 'tee' &&
        (prev.club_type ?? '').toLowerCase() === 'driver'
      ) {
        afterDriver += 1;
      }
    }
  }
  return { penalties, penalties_after_driver: afterDriver, rounds_n: roundIds.size };
}
