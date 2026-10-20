/**
 * CoachHelm reads at delivery (Slice 0, flag `coachhelm_reads_v1_copy`):
 * fold overlapping reads into one, then hold each player to 3 open reads and
 * 1 strength. Pure: ranked rows in, rows out, no fetch and no Supabase.
 *
 * Design: /mnt/project-files/coachhelm/supercharge 00-overview decision 5,
 * 03 section 2.3 (S5, S6, S7, S8) and 2.4, 04 section 2 (Caps) and example 7.
 *
 * Both functions keep the ranked order they are given. The fold removes a
 * player's first row only when it is a strength or a note that a lower-ranked
 * finding of the same story stands for; the cap removes it only when it
 * states no finding (a note) or is a measured zero, neither of which is a
 * read. Every surface that picks a head (the Hub card, the round-review
 * takeaway, the feeds, the coach chat tool) runs the same `deliverReads`, so
 * they keep agreeing on it with the flag on.
 */
import { deriveTone, isNegativePolarityMetric } from '@/components/golf/coachhelm/insight-card/tone-derivation';
import type { InsightComparisonSource, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { RankableEvidenceInsight } from './insight-delivery-ranking';

/** The Slice 0 flag (config/feature-flags.yml). Off: delivery is unchanged. */
export const READS_V1_FLAG = 'coachhelm_reads_v1_copy';

/** 3 open reads per player (03 S7; open question 2, default taken). */
export const READS_OPEN_MAX = 3;
/** 1 strength per player (03 S8). */
export const READS_STRENGTH_MAX = 1;

/** How a read that folded into another relates to it. */
export type FoldRelation = 'overlap' | 'opposing';

/** A read folded into the one that is shown ("also:" in 03 S5). */
export interface FoldedRead {
  id: string;
  title: string;
  relation: FoldRelation;
}

/** What delivery does to a ranked list. Both off is the list unchanged. */
export interface ReadsDeliveryPlan {
  /** Fold overlapping reads into one (03 S6, 04 ex. 7). */
  fold: boolean;
  /** Hold each player to 3 open reads + 1 strength (03 S7, S8). */
  cap: boolean;
  /**
   * Ids of reads a live focus area came from (`golf_player_focus_areas`
   * `from_insight_id`, status proposed, active, in progress or paused). They
   * are never folded away: someone already acted on them.
   */
  pinned?: ReadonlySet<string>;
}

export type ReadKind = 'finding' | 'strength' | 'note';

type KindInput = Pick<RankableEvidenceInsight, 'lifecycle_state' | 'priority' | 'category' | 'evidence' | 'signature'>;

/**
 * The generators' "looked and found nothing" cards, by signature (stored with
 * a `v3:` prefix): tee-strategy.ts `sharp` and `inconclusive`, putt-bias.ts
 * `balanced`. The same rule the Clubhouse board uses (coachhelm-classify.ts
 * `isNote`), so the two caps count the same rows.
 */
const NOTE_SIGNATURE = /(?:^|:)(?:tee_strategy:(?:sharp|inconclusive)|putt_bias:balanced)$/;

/** Cards that state no finding at all: never folded into another read. */
const NO_FINDING_SIGNATURE = /(?:^|:)(?:tee_strategy:inconclusive|putt_bias:balanced)$/;

/** tee-strategy.ts `sharp`: "Driver is performing" (the driver-gains read of 04 example 7). */
const DRIVER_SHARP_SIGNATURE = /(?:^|:)tee_strategy:sharp$/;

/**
 * Comparisons that are not a like-for-like benchmark the delivery layer can
 * judge a strength against: college populations and the old estimated
 * target. The Clubhouse board swaps the Tour value in for these
 * (coachhelm-classify.ts `drawnComparison`); the server has no Tour row here,
 * so it calls none of them a strength. Production on 2026-10-20 had no live
 * read with a college source and two with `estimated_target`.
 */
const NO_STRENGTH_COMPARISON: ReadonlySet<InsightComparisonSource> = new Set<InsightComparisonSource>([
  'cohort_avg',
  'd1_avg',
  'd2_avg',
  'd3_avg',
  'naia_avg',
  'juco_avg',
  'estimated_target',
]);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * A measured zero: a strokes-gained baseline whose value prints as 0.0. It is
 * not an open read (09 reality check, "Hide zero-stroke rows"); every other
 * zero only says no estimate was made, and that read stays. Same rule as the
 * Clubhouse board's `isMeasuredZero` (coachhelm-strokes.ts, PR #2215).
 */
export function isMeasuredZeroRead(ev: Pick<InsightEvidence, 'strokes_impact' | 'strokes_impact_method'> | null | undefined): boolean {
  if (ev?.strokes_impact_method !== 'sg_baseline') return false;
  const v = num(ev.strokes_impact);
  // Prints as 0.0 at one decimal: |v| rounds to zero tenths.
  return v != null && Math.round(Math.abs(v) * 10) === 0;
}

/** A card that states no finding (it is never one of the open reads). */
export function isNoteRead(ins: Pick<KindInput, 'signature' | 'evidence'>): boolean {
  if (ins.evidence?.feed_exempt === true) return true;
  return !!ins.signature && NOTE_SIGNATURE.test(ins.signature);
}

/**
 * Finding, strength or note, by the rule the Clubhouse board uses
 * (coachhelm-classify.ts `kindOf`): resolved, or better than its comparison
 * in the metric's own direction at low priority or with an encouraging tone.
 */
export function readKind(ins: KindInput): ReadKind {
  if (isNoteRead(ins)) return 'note';
  const tone = deriveTone(ins);
  if (tone === 'celebratory') return 'strength';
  const ev = ins.evidence;
  if (!ev || NO_STRENGTH_COMPARISON.has(ev.comparison_source)) return 'finding';
  const you = num(ev.your_value);
  const cmp = num(ev.comparison_value);
  if (you == null || cmp == null) return 'finding';
  const better = isNegativePolarityMetric(ev.metric ?? '', ev) ? you < cmp : you > cmp;
  return better && (tone === 'encouraging' || ins.priority === 'low') ? 'strength' : 'finding';
}

/**
 * Reads that tell one story (03 S6 and 04 example 7), as pairs of metric
 * subjects. A pair folds only when both reads are open for the same player;
 * pairs chain (driver, penalties and big numbers are one read when all three
 * are open). Two reads on the same metric in different categories fold too
 * (03 S5, "any context": the warmup-hole and front-9-starter reads both carry
 * `opening_hole_delta`). Reads on the same metric in the same category never
 * reach here: `dedupeBySubject` already kept one.
 *
 * Not folded, because no live metric carries the read: the bunker amplifier
 * and sand scrambling share `scrambling_pct_sand` and `short_game`, so
 * `dedupeBySubject` already keeps one of them.
 */
export const FOLD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  // 04 example 7: a tee-strategy read and a penalties read are one story.
  ['sg_ott', 'penalty_rate_per_round'],
  // 03 S6: penalty rate and big-number rate.
  ['penalty_rate_per_round', 'big_number_rate'],
  // 03 S6: three-putts and the 25+ ft make rate.
  ['three_putt_chain', 'putts_made_25_plus_ft_pct'],
];

function subjectOf(ins: Pick<RankableEvidenceInsight, 'evidence'>): string {
  return (ins.evidence?.metric ?? '').toLowerCase();
}

function linked(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return FOLD_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * Whether a person already acted on the read: the coach acknowledged or
 * addressed it, the player rated it (`player_feedback`, attached on the
 * player's own feed), or a live focus area came from it (`pinned`). Folding
 * such a read away would hide the thing they acted on, so it never folds:
 * it stays its own card, and a related read stays its own card next to it.
 */
export function carriesUserState(
  ins: RankableEvidenceInsight & { player_feedback?: unknown },
  pinned?: ReadonlySet<string>,
): boolean {
  if (pinned?.has(ins.id)) return true;
  if (ins.acknowledged_at || ins.status === 'acknowledged') return true;
  if (ins.lifecycle_state === 'addressed') return true;
  return ins.player_feedback != null;
}

function canFold(ins: RankableEvidenceInsight, pinned?: ReadonlySet<string>): boolean {
  if (isMeasuredZeroRead(ins.evidence)) return false;
  if (carriesUserState(ins, pinned)) return false;
  return !(ins.signature && NO_FINDING_SIGNATURE.test(ins.signature));
}

/** Which read of a fold group stays: a finding before a strength before a note. */
const LEAD_ORDER: Record<ReadKind, number> = { finding: 0, strength: 1, note: 2 };

/** Whether the read says the player is doing well (a strength, or driver performing). */
function saysWell(ins: RankableEvidenceInsight): boolean {
  if (ins.signature && DRIVER_SHARP_SIGNATURE.test(ins.signature)) return true;
  return readKind(ins) === 'strength';
}

/** The sentence a fold adds to the shown read's text, so every surface draws it. */
export function foldSentence(folded: readonly FoldedRead[]): string {
  const quote = (r: FoldedRead) => `“${r.title.trim().replace(/[.:;]+$/, '')}”`;
  const overlap = folded.filter((r) => r.relation === 'overlap');
  const opposing = folded.filter((r) => r.relation === 'opposing');
  const parts: string[] = [];
  if (overlap.length > 0) parts.push(`Also in this read: ${overlap.map(quote).join('; ')}.`);
  if (opposing.length > 0) parts.push(`Pulls the other way: ${opposing.map(quote).join('; ')}.`);
  return parts.join(' ');
}

/**
 * Fold overlapping reads into one (03 S6, 04 example 7). Within one player,
 * reads linked by {@link FOLD_PAIRS} (or sharing a metric across categories)
 * become one read. The one that stays is the group's highest-ranked finding,
 * else its highest-ranked strength, else its highest-ranked note, so a fold
 * never hides a finding behind a card the cap would then hold back (a note is
 * never an open read; a second strength loses to the player's first). It
 * stays at its own position; the others leave the list and are named on it
 * (`also`, and one sentence at the end of its text). A folded read that points
 * the other way (one says the player is doing well, the other that they are
 * not) is `opposing`, which is the Contradicted pair of 04 example 7; the net
 * and the hole attribution that example prints need the PR #2073 root-cause
 * slice and are not drawn here. A read someone acted on
 * ({@link carriesUserState}) never folds.
 */
export function foldOverlappingReads<T extends RankableEvidenceInsight>(
  ranked: readonly T[],
  pinned?: ReadonlySet<string>,
): T[] {
  // Union-find over the foldable rows, by index in rank order.
  const parent = ranked.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i]!;
    return i;
  };
  const foldable = ranked.map((ins) => canFold(ins, pinned));
  for (let i = 0; i < ranked.length; i += 1) {
    if (!foldable[i]) continue;
    for (let j = 0; j < i; j += 1) {
      if (!foldable[j] || ranked[j]!.player_id !== ranked[i]!.player_id) continue;
      if (!linked(subjectOf(ranked[j]!), subjectOf(ranked[i]!))) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  // Each group's leader: by kind first, then by rank (index) within a kind.
  const leaderOf = new Map<number, number>();
  ranked.forEach((ins, i) => {
    if (!foldable[i]) return;
    const root = find(i);
    const current = leaderOf.get(root);
    if (current === undefined || LEAD_ORDER[readKind(ins)] < LEAD_ORDER[readKind(ranked[current]!)]) {
      leaderOf.set(root, i);
    }
  });
  // The read each row folds into (its group's leader).
  const into = new Map<T, T>();
  ranked.forEach((ins, i) => {
    if (!foldable[i]) return;
    const leader = leaderOf.get(find(i))!;
    if (leader !== i) into.set(ins, ranked[leader]!);
  });
  if (into.size === 0) return [...ranked];

  const alsoOf = new Map<T, FoldedRead[]>();
  for (const [member, leader] of into) {
    const list = alsoOf.get(leader) ?? [];
    list.push({
      id: member.id,
      title: member.title,
      relation: saysWell(member) === saysWell(leader) ? 'overlap' : 'opposing',
    });
    alsoOf.set(leader, list);
  }

  const out: T[] = [];
  for (const ins of ranked) {
    if (into.has(ins)) continue;
    const also = alsoOf.get(ins);
    if (!also) {
      out.push(ins);
      continue;
    }
    const sentence = foldSentence(also);
    out.push({
      ...ins,
      content: ins.content ? `${ins.content.trimEnd()} ${sentence}` : sentence,
      also: [...(ins.also ?? []), ...also],
    });
  }
  return out;
}

/** The slot a read takes at delivery. */
export type ReadSlot = 'open' | 'strength' | 'more';

/**
 * Hold each player to 3 open reads and 1 strength (03 S7, S8; 04 section 2,
 * Caps), in the ranked order given, so the 3 + 1 are the player's
 * highest-ranked. A note (a card that states no finding) and a measured zero
 * are never open reads. Everything else is `more`: the feed never shows it,
 * an audit list can (03 S7, "More reads"). Players are counted separately and
 * keep their places in a mixed list (the coach team sweep).
 */
export function capReadsPerPlayer<T extends RankableEvidenceInsight>(
  ranked: readonly T[],
): { shown: T[]; more: T[]; slotOf: Map<string, ReadSlot> } {
  const counts = new Map<string, { open: number; strength: number }>();
  const shown: T[] = [];
  const more: T[] = [];
  const slotOf = new Map<string, ReadSlot>();
  for (const ins of ranked) {
    const c = counts.get(ins.player_id) ?? { open: 0, strength: 0 };
    counts.set(ins.player_id, c);
    let slot: ReadSlot = 'more';
    if (!isMeasuredZeroRead(ins.evidence)) {
      const kind = readKind(ins);
      if (kind === 'finding' && c.open < READS_OPEN_MAX) {
        c.open += 1;
        slot = 'open';
      } else if (kind === 'strength' && c.strength < READS_STRENGTH_MAX) {
        c.strength += 1;
        slot = 'strength';
      }
    }
    slotOf.set(ins.id, slot);
    (slot === 'more' ? more : shown).push(ins);
  }
  return { shown, more, slotOf };
}

/**
 * The delivery step every surface runs after rank, collapse, dedupe and (for
 * a player's own view) their dismissals: fold, then cap, as the plan says.
 */
export function deliverReads<T extends RankableEvidenceInsight>(ranked: readonly T[], plan: ReadsDeliveryPlan): T[] {
  const folded = plan.fold ? foldOverlappingReads(ranked, plan.pinned) : [...ranked];
  return plan.cap ? capReadsPerPlayer(folded).shown : folded;
}
