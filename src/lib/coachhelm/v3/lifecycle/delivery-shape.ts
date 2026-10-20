/**
 * Delivery shaping for the lifecycle fields (CoachHelm Slice 3; 04 §4, 03 §9,
 * 04 Examples 5 and 7). Pure functions that turn `evidence.recheck`,
 * `evidence.conflict` and `evidence.under_review` into what a surface shows:
 *
 *   - a Cleared read leaves the open list and becomes one Cleared line
 *     (shown until the step archives it, two checkpoints later);
 *   - a driver-vs-penalties pair becomes ONE Contradicted item with the net,
 *     in place of the higher-ranked of the two (never two cards);
 *   - the winner of an opposing pair carries the Contradicted word and line;
 *   - Under review hides nothing; it marks the read with its word and line;
 *   - Contradicted reaches the coach first: the player sees it one day after
 *     it was computed (00-overview Q5 default).
 *
 * No surface calls this yet (a later PR renders it in Clubhouse). Copy uses
 * the 03 §9 wording with the read's own numbers; no mechanism words.
 */
import type { ConflictRecord, LifecycleEvidence, RecheckRecord, UnderReviewRecord } from './types';

export type Voice = 'coach' | 'player';
export type LifecycleWord = 'Cleared' | 'Contradicted' | 'Under review';

/** One day: how long Contradicted is coach-only (03 §9 rule 4). */
export const COACH_FIRST_MS = 24 * 60 * 60 * 1000;

export interface ShapeableRead {
  id: string;
  title: string | null;
  lifecycle_state?: string | null;
  evidence: LifecycleEvidence | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 12" from an ISO timestamp or date (UTC). */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function subjectLabel(read: ShapeableRead): string {
  return read.evidence?.metric_label || read.title || 'This read';
}

function fmt(n: number, unit: RecheckRecord['recent_unit']): string {
  return unit === 'holes' ? n.toFixed(2) : `${Math.round(n)}%`;
}

/** The lifecycle word a read carries (Cleared beats Contradicted beats Under review). */
export function lifecycleWordOf(evidence: LifecycleEvidence | null | undefined): LifecycleWord | null {
  if (!evidence) return null;
  if (evidence.recheck?.outcome === 'cleared') return 'Cleared';
  if (evidence.conflict) return 'Contradicted';
  if (evidence.under_review) return 'Under review';
  return null;
}

/**
 * "4–6 ft putts · Cleared Oct 12 — 22 of the last 29 (76%), past the
 * benchmark's 72%. Was 62% over 95." (04 Example 5). Null unless cleared.
 */
export function clearedLine(read: ShapeableRead, voice: Voice): string | null {
  const r = read.evidence?.recheck;
  if (!r || r.outcome !== 'cleared' || r.recent_value === null) return null;
  const label = subjectLabel(read);
  const when = shortDate(r.computed_at);
  if (r.recent_unit === 'putts') {
    const made = Math.round((r.recent_value / 100) * r.recent_n);
    if (voice === 'player') {
      return `${label} · Cleared — ${made} of your last ${r.recent_n} (${fmt(r.recent_value, 'putts')}). That one's fixed. It stays here for two more checks so we're sure.`;
    }
    return (
      `${label} · Cleared${when ? ` ${when}` : ''} — ${made} of the last ${r.recent_n} (${fmt(r.recent_value, 'putts')}), ` +
      `at or past the benchmark's ${fmt(r.benchmark, 'putts')}. Was ${fmt(r.old_value, 'putts')} over ${r.old_n}. ` +
      `Stays here two more checks, then moves to history.`
    );
  }
  if (voice === 'player') {
    return `${label} · Cleared — ${fmt(r.recent_value, 'holes')} a hole over your last ${r.rounds_n} rounds. That one's fixed. It stays here for two more checks so we're sure.`;
  }
  return (
    `${label} · Cleared${when ? ` ${when}` : ''} — ${fmt(r.recent_value, 'holes')} a hole over the last ${r.recent_n} holes ` +
    `(${r.rounds_n} rounds), at or under ${fmt(r.benchmark, 'holes')}. Was ${fmt(r.old_value, 'holes')}. ` +
    `Stays here two more checks, then moves to history.`
  );
}

/** The Under review line (03 §9). The read itself is never hidden. */
export function underReviewLine(review: UnderReviewRecord, voice: Voice): string {
  const when = shortDate(review.since);
  if (review.reason === 'integrity') {
    const n = review.round_ids?.length ?? 1;
    if (voice === 'player') {
      return `Under review — ${n === 1 ? 'one of your rounds has' : `${n} of your rounds have`} hole scores that don't add up to the scorecard total. Fix the scorecard or the holes and we'll recheck.`;
    }
    return `Under review — ${n === 1 ? '1 round' : `${n} rounds`} in this read ${n === 1 ? 'has' : 'have'} hole scores that do not add up to the scorecard total. The read is rechecked at the next checkpoint.`;
  }
  if (voice === 'player') {
    return `Under review — your coach is checking the why. The numbers haven't changed.`;
  }
  const what = review.reason === 'wrong_cause' ? 'the cause was marked wrong' : 'the read was marked "Not this: wrong"';
  return `Under review — ${what}${when ? ` on ${when}` : ''}. The numbers stand; the why is being rechecked at the next checkpoint.`;
}

/** The line on the winner of an opposing_direction pair (03 §9). */
export function contradictedWinnerLine(read: ShapeableRead, voice: Voice): string | null {
  const c = read.evidence?.conflict;
  if (!c || c.kind !== 'opposing_direction' || c.role !== 'winner') return null;
  const r = read.evidence;
  const recentSays =
    typeof r?.your_value === 'number' && typeof r?.comparison_value === 'number'
      ? `${r.your_value_display ?? r.your_value} against ${r.comparison_value}`
      : null;
  if (voice === 'player') {
    return `Your recent rounds and the longer record disagreed on this one. We're going with the recent ones.`;
  }
  return `Contradicted — the newer read${recentSays ? ` (${recentSays})` : ''} and an older one on the same subject pointed opposite ways. Going with the newer read; the older one is retired.`;
}

function strokes(n: number): string {
  return `${Math.abs(n).toFixed(1)} strokes a round`;
}

/**
 * One Contradicted item for a driver-vs-penalties pair (04 Example 7): the
 * two reads' own lines are not printed separately.
 */
export function strategyPairLines(conflict: ConflictRecord, voice: Voice): string[] {
  const link = conflict.link;
  const counted = link
    ? `${link.penalties_after_driver} of ${link.penalties} penalties in the last ${link.rounds_n} rounds came right after a driver tee shot.`
    : null;
  const net =
    conflict.net_strokes === null
      ? null
      : conflict.net_strokes >= 0
        ? `Net still favours driver, by about ${strokes(conflict.net_strokes)}.`
        : `Net favours the layback club, by about ${strokes(conflict.net_strokes)}.`;
  if (voice === 'player') {
    return [
      `Driver is working for you off the tee, but most of your penalties come right after it.`,
      ...(counted ? [counted] : []),
      net ?? `Talk to your coach about where to take less club.`,
    ];
  }
  return [
    `These pull in opposite directions: driver is the stronger tee club, but penalties follow it.`,
    ...(counted ? [counted] : []),
    net ?? `No net yet: driver's gain is not measured in strokes, so pick the holes where the layback is worth it.`,
  ];
}

export type LifecycleItem<T extends ShapeableRead> =
  | {
      kind: 'read';
      read: T;
      word: LifecycleWord | null;
      /** The WHEN line replacement, when a lifecycle word applies. */
      line: string | null;
    }
  | {
      kind: 'contradicted';
      title: 'Driver vs penalties';
      word: 'Contradicted';
      reads: [T, T];
      net_strokes: number | null;
      lines: string[];
    };

export interface LifecycleDelivery<T extends ShapeableRead> {
  items: LifecycleItem<T>[];
  cleared: Array<{ read: T; line: string }>;
}

function coachFirstHidden(conflict: ConflictRecord, voice: Voice, nowIso: string): boolean {
  if (voice === 'coach') return false;
  const at = Date.parse(conflict.computed_at);
  const now = Date.parse(nowIso);
  return Number.isFinite(at) && Number.isFinite(now) && now - at < COACH_FIRST_MS;
}

/**
 * Shape an already ranked list. Order is kept: a pair takes the slot of its
 * higher-ranked member; Cleared reads move to `cleared`.
 */
export function shapeLifecycle<T extends ShapeableRead>(ranked: readonly T[], voice: Voice, nowIso: string): LifecycleDelivery<T> {
  const items: LifecycleItem<T>[] = [];
  const cleared: Array<{ read: T; line: string }> = [];
  const byId = new Map(ranked.map((r) => [r.id, r]));
  const used = new Set<string>();

  for (const read of ranked) {
    if (used.has(read.id)) continue;
    const ev = read.evidence;
    if (read.lifecycle_state === 'archived') continue;

    const line = clearedLine(read, voice);
    if (line) {
      used.add(read.id);
      cleared.push({ read, line });
      continue;
    }

    const c = ev?.conflict;
    if (c?.kind === 'opposing_strategy') {
      const partner = byId.get(c.with_insight_id);
      if (partner && !used.has(partner.id) && partner.evidence?.conflict?.with_insight_id === read.id) {
        used.add(read.id);
        used.add(partner.id);
        if (coachFirstHidden(c, voice, nowIso)) {
          // Player view before the coach-first day: the two reads as they
          // were, without the pairing.
          items.push({ kind: 'read', read, word: null, line: null }, { kind: 'read', read: partner, word: null, line: null });
          continue;
        }
        items.push({
          kind: 'contradicted',
          title: 'Driver vs penalties',
          word: 'Contradicted',
          reads: [read, partner],
          net_strokes: c.net_strokes,
          lines: strategyPairLines(c, voice),
        });
        continue;
      }
    }
    if (c?.kind === 'opposing_direction' && c.role === 'retired') {
      // The step archives the older read; never show it beside the winner.
      used.add(read.id);
      continue;
    }

    used.add(read.id);
    if (c?.kind === 'opposing_direction' && c.role === 'winner' && !coachFirstHidden(c, voice, nowIso)) {
      items.push({ kind: 'read', read, word: 'Contradicted', line: contradictedWinnerLine(read, voice) });
      continue;
    }
    if (ev?.under_review) {
      items.push({ kind: 'read', read, word: 'Under review', line: underReviewLine(ev.under_review, voice) });
      continue;
    }
    items.push({ kind: 'read', read, word: null, line: null });
  }
  return { items, cleared };
}
