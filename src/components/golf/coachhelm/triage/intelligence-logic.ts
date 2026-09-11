/**
 * ============================================================================
 * Intelligence (coach) · pure logic — docs/design/fairway-facelift/screens/intelligence.v3.md
 * ----------------------------------------------------------------------------
 * Every derivation the intelligence field sheet needs, with no JSX and no
 * React, so the arithmetic is unit-testable without a DOM. Nothing here reads
 * a clock: relative scan time is still formatted by `formatRelativeScanTime`
 * from a server-seeded `now`, and no other date is rendered on this screen.
 *
 * This file never re-derives grouping or scoring. It operates on the FROZEN
 * `GroupedSignal` / `SignalGroup` contract (`src/lib/coachhelm/signal-grouping.ts`)
 * exactly as `getSignalGroups` produced it, and only filters, sums and ranks.
 *
 * ── THE team_synthesis EXCLUSION (load-bearing, twice) ──────────────────────
 * `signal-grouping.ts:16-23` is explicit: a `team_synthesis` row is a DERIVED
 * roster roll-up whose `strokeImpact` is the SUM of per-player leaks already
 * present in the same list. Anything that AGGREGATES must skip it. Both the
 * category ranking (the stage) and the ledger's Queue column skip it; the
 * Signals table still lists it, because reading a roll-up is useful even
 * though summing it is not.
 *
 * ── NULL IS NOT ZERO ───────────────────────────────────────────────────────
 * `signal-grouping.ts:80-82`: zero strokes is a real reading, null is "we do
 * not know". A category whose every signal carries a null `strokeImpact`
 * aggregates to `null` — rendered "Not measured" — never to a phantom zero
 * bar indistinguishable from a genuinely-zero leak.
 *
 * ── MAGNITUDE, NOT DIRECTION ───────────────────────────────────────────────
 * `evidence.strokes_impact` is documented as "Magnitude only — sign just
 * indicates direction" (`v3/ranking/score.ts:76-77`), and the codebase's own
 * ranking always takes `Math.abs()` of it (`cappedStrokesImpact`, `:44-49`).
 * This is therefore a one-sided ranking with a true zero at the left edge,
 * never a diverging chart with a green "gained" side.
 * ========================================================================== */

import {
  SEVERITY_ORDER,
  type GroupedSignal,
  type SignalGroup,
  type SignalSeverity,
} from '@/lib/coachhelm/signal-grouping';
import type { VerdictPart } from '@/components/fairway/pages/dashboard/coach-home-logic';
import type { BriefCounts } from './buildTriageViewModel';
import { formatCategoryLabel } from './buildTriageViewModel';

/* ── Caps ─────────────────────────────────────────────────────────────────── */

/** Rows on the leak rail. Nothing is hidden by the cap: every signal in an
 *  overflow category still appears in the Signals table below. */
export const LEAK_ROW_CAP = 8;
export const QUEUE_LIMIT = 6;
export const PLAYER_LIMIT = 6;
export const FOCUS_LIMIT = 6;
export const TABLE_PAGE_SIZE = 10;

/**
 * The smallest percentage a MEASURED, non-zero leak may draw.
 *
 * A visual floor, not a fabricated number: the bar is a ranking cue and the
 * exact figure is printed in mono on the same row, so a 0.04-of-max category
 * that would otherwise render as nothing still shows that it exists. A null
 * (unmeasured) category never gets the floor — it draws no bar at all.
 */
export const MIN_BAR_PCT = 1.5;

/* ── Flattening ───────────────────────────────────────────────────────────── */

export function isRollup(signal: GroupedSignal): boolean {
  return signal.kind === 'team_synthesis';
}

export function flatSignals(groups: readonly SignalGroup[]): GroupedSignal[] {
  return groups.flatMap((group) => group.signals);
}

/** Every open signal, roll-ups included — what the Signals table lists. */
export function openSignalCount(groups: readonly SignalGroup[]): number {
  return groups.reduce((n, g) => n + g.signals.length, 0);
}

/** Roster roll-ups only. Disclosed beside the open count rather than folded
 *  into it silently, because the rail and the Queue column both exclude them
 *  and two visible numbers that disagree must say why. */
export function rollupCount(groups: readonly SignalGroup[]): number {
  return flatSignals(groups).filter(isRollup).length;
}

/** Signals a coach can actually triage one by one — the denominator the rail
 *  and the Queue column share. */
export function queueSignalCount(groups: readonly SignalGroup[]): number {
  return flatSignals(groups).filter((s) => !isRollup(s)).length;
}

/* ── The stage: category leak ranking ─────────────────────────────────────── */

export interface CategoryLeak {
  category: string;
  label: string;
  /** Sum of |strokeImpact| over signals that HAVE one. `null` when not one
   *  signal in the bucket carries a measured impact. */
  strokesAtRisk: number | null;
  /** Every signal in the bucket, including the impact-unknown ones. */
  signalCount: number;
}

/**
 * Bucket every per-player signal by its raw `category` string — the same
 * taxonomy `distinctCategories` and the Toolbar's Category filter use, never
 * the five fixed `TeamCategory` buckets, which are a different taxonomy and
 * would disagree with the filter chips.
 */
export function aggregateCategoryLeaks(groups: readonly SignalGroup[]): CategoryLeak[] {
  const buckets = new Map<string, { sum: number; measured: number; count: number }>();
  for (const group of groups) {
    for (const signal of group.signals) {
      if (isRollup(signal)) continue;
      const bucket = buckets.get(signal.category) ?? { sum: 0, measured: 0, count: 0 };
      bucket.count += 1;
      if (signal.strokeImpact !== null && Number.isFinite(signal.strokeImpact)) {
        bucket.sum += Math.abs(signal.strokeImpact);
        bucket.measured += 1;
      }
      buckets.set(signal.category, bucket);
    }
  }
  return Array.from(buckets.entries()).map(([category, bucket]) => ({
    category,
    label: formatCategoryLabel(category),
    strokesAtRisk: bucket.measured > 0 ? bucket.sum : null,
    signalCount: bucket.count,
  }));
}

export interface LeakRow {
  category: string;
  label: string;
  /** 0-100 of the largest measured leak. 0 for an unmeasured category. */
  pct: number;
  /** The mono figure beside the bar. */
  value: string;
  /** The evidence behind it, one step down: how many signals built this row. */
  sample: string;
  measured: boolean;
}

export interface LeakField {
  rows: LeakRow[];
  /** The across-category mean as a percentage of the same max the bars use.
   *  `null` when fewer than two categories carry a measured value — a mean of
   *  one value coincides with that value's own bar tip and says nothing. */
  meanPct: number | null;
  /** The mean itself, for the legend's caption. */
  meanStrokes: number | null;
  /** True when not one category has a measured impact: the rail falls back to
   *  ranking by signal count and says so. */
  allUnmeasured: boolean;
  /** Categories beyond `LEAK_ROW_CAP`, de-prioritized off the rail but still
   *  listed in full in the table below. */
  overflow: number;
}

function strokesText(value: number): string {
  return `${value.toFixed(1)} str/rd`;
}

function signalsText(count: number): string {
  return `${count} ${count === 1 ? 'signal' : 'signals'}`;
}

export function buildLeakField(leaks: readonly CategoryLeak[]): LeakField {
  const measured = leaks.filter((l) => l.strokesAtRisk !== null);
  const allUnmeasured = measured.length === 0;
  const maxKnown = measured.reduce((max, l) => Math.max(max, l.strokesAtRisk ?? 0), 0);

  const sorted = [...leaks].sort((a, b) => {
    if (allUnmeasured) {
      return b.signalCount - a.signalCount || a.label.localeCompare(b.label);
    }
    const aKnown = a.strokesAtRisk !== null;
    const bKnown = b.strokesAtRisk !== null;
    // Measured categories rank first, by magnitude. Unmeasured ones sort after
    // every measured one — they are not "zero", they are unranked.
    if (aKnown && bKnown) return (b.strokesAtRisk ?? 0) - (a.strokesAtRisk ?? 0);
    if (aKnown) return -1;
    if (bKnown) return 1;
    return b.signalCount - a.signalCount || a.label.localeCompare(b.label);
  });

  const rows: LeakRow[] = sorted.slice(0, LEAK_ROW_CAP).map((leak) => {
    const known = leak.strokesAtRisk !== null;
    // maxKnown can only be 0 when every measured category sums to a genuine
    // zero, which is a real reading: the bars are all empty and the numbers
    // beside them say 0.0, which is the truth rather than a divide by zero.
    const raw = known && maxKnown > 0 ? ((leak.strokesAtRisk ?? 0) / maxKnown) * 100 : 0;
    return {
      category: leak.category,
      label: leak.label,
      pct: known && raw > 0 ? Math.max(raw, MIN_BAR_PCT) : 0,
      value: known ? strokesText(leak.strokesAtRisk ?? 0) : 'Not measured',
      sample: signalsText(leak.signalCount),
      measured: known,
    };
  });

  const meanStrokes =
    measured.length >= 2
      ? measured.reduce((sum, l) => sum + (l.strokesAtRisk ?? 0), 0) / measured.length
      : null;

  return {
    rows,
    meanStrokes,
    meanPct: meanStrokes !== null && maxKnown > 0 ? (meanStrokes / maxKnown) * 100 : null,
    allUnmeasured,
    overflow: Math.max(0, sorted.length - rows.length),
  };
}

/* ── The stage legend: severity mix ───────────────────────────────────────── */

export interface SeveritySegment {
  severity: SignalSeverity;
  label: string;
  count: number;
  /** Share of the queue-eligible signals, 0-100. */
  pct: number;
}

const SEVERITY_TEXT: Record<SignalSeverity, string> = {
  urgent: 'urgent',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

/**
 * The mix across the SAME signals the rail ranks (roll-ups excluded), so the
 * legend and the instrument above it never describe different populations.
 */
export function severityMix(groups: readonly SignalGroup[]): SeveritySegment[] {
  const signals = flatSignals(groups).filter((s) => !isRollup(s));
  const total = signals.length;
  return SEVERITY_ORDER.map((severity) => {
    const count = signals.filter((s) => s.severity === severity).length;
    return {
      severity,
      label: SEVERITY_TEXT[severity],
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
    };
  });
}

/* ── The ledger ───────────────────────────────────────────────────────────── */

export interface QueueEntry {
  signal: GroupedSignal;
  group: SignalGroup;
}

/**
 * The top N triageable signals across every group, in the worst-first,
 * most-recoverable-first order `groupSignals` already produced — filtered,
 * never re-sorted, so the Queue column agrees with the table beneath it.
 */
export function queueEntries(groups: readonly SignalGroup[], limit = QUEUE_LIMIT): QueueEntry[] {
  const out: QueueEntry[] = [];
  for (const group of groups) {
    for (const signal of group.signals) {
      if (isRollup(signal)) continue;
      out.push({ signal, group });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Every entry, roll-ups included, in the same order — what the table lists. */
export function tableEntries(groups: readonly SignalGroup[]): QueueEntry[] {
  const out: QueueEntry[] = [];
  for (const group of groups) {
    for (const signal of group.signals) out.push({ signal, group });
  }
  return out;
}

export interface PlayerRow {
  playerId: string;
  playerName: string;
  severity: SignalSeverity;
  signalCount: number;
}

/** Flagged players, already attention-ordered by `groupSignals`. The team
 *  bucket (`playerId === null`) is excluded by definition: it is not a player. */
export function playerRows(groups: readonly SignalGroup[], limit = PLAYER_LIMIT): PlayerRow[] {
  return groups
    .filter((g): g is SignalGroup & { playerId: string } => g.playerId !== null)
    .slice(0, limit)
    .map((g) => ({
      playerId: g.playerId,
      playerName: g.playerName,
      severity: g.worstSeverity,
      signalCount: g.signals.length,
    }));
}

export interface FocusRow {
  id: string;
  playerId: string;
  playerName: string;
  title: string;
}

export interface FocusAreaInput {
  id: string;
  player_id: string;
  status?: string | null;
  title?: string | null;
  area_type?: string | null;
  player?: { first_name?: string | null; last_name?: string | null } | null;
}

export function focusRows(
  areas: readonly FocusAreaInput[],
  playerNameById: Record<string, string> | undefined,
  limit = FOCUS_LIMIT,
): FocusRow[] {
  return areas
    .filter((fa) => fa.status === 'active' || fa.status === 'in_progress')
    .slice(0, limit)
    .map((fa) => {
      const fromMap = playerNameById?.[fa.player_id];
      const fromRow = `${fa.player?.first_name ?? ''} ${fa.player?.last_name ?? ''}`.trim();
      return {
        id: fa.id,
        playerId: fa.player_id,
        playerName: fromMap || fromRow || 'Player',
        title: fa.title?.trim() || formatCategoryLabel(fa.area_type ?? '') || 'Focus area',
      };
    });
}

export function activeFocusCount(areas: readonly FocusAreaInput[]): number {
  return areas.filter((fa) => fa.status === 'active' || fa.status === 'in_progress').length;
}

/* ── The masthead verdict ─────────────────────────────────────────────────── */

export interface IntelligenceVerdictInput {
  /** Non-null when `getSignalGroups` itself failed. Checked FIRST: `groups`
   *  is `[]` on that path, the identical shape an all-clear queue has, so
   *  "All clear" would be a lie about a read we never made. */
  groupsError: string | null;
  groups: readonly SignalGroup[];
  counts: BriefCounts;
  outcomesAwaiting: number;
  filterHref: (filter: string) => string;
  playerHref: (playerId: string) => string;
  effectivenessHref: string;
}

/**
 * The masthead sentence. Branches mirror `buildBriefVerdict`'s own cascade
 * (`buildTriageViewModel.ts:203-222`) verbatim except for the added links,
 * with the load-failure branch in front of all of them.
 */
export function buildIntelligenceVerdict(input: IntelligenceVerdictInput): VerdictPart[] {
  const { groupsError, groups, counts, outcomesAwaiting, filterHref, playerHref } = input;
  const parts: VerdictPart[] = [];
  const topPlayerGroup = groups.find((g) => g.playerId !== null) ?? null;

  if (groupsError) {
    // Neither `counts` nor `topPlayerGroup` is trustworthy here — both derive
    // from a `groups` array that is empty for a reason unrelated to how many
    // signals exist. Nothing gets printed that was read from it.
    parts.push({ text: 'Couldn’t load signals. Try again.' });
  } else if (groups.length === 0) {
    parts.push({ text: 'All clear. No open signals right now.' });
    // Nothing to link to, and nothing to append: an all-clear queue with
    // outcomes pending is still an all-clear queue.
    return parts;
  } else if (counts.urgent > 0) {
    const playerWord = counts.playersFlagged === 1 ? 'player' : 'players';
    const signalWord = counts.urgent === 1 ? 'signal needs' : 'signals need';
    parts.push({ text: `${counts.urgent} urgent`, href: filterHref('urgent') });
    parts.push({ text: ` ${signalWord} review across ${counts.playersFlagged} ${playerWord}.` });
    if (topPlayerGroup?.playerId) {
      parts.push({ text: ' ' });
      parts.push({ text: topPlayerGroup.playerName, href: playerHref(topPlayerGroup.playerId) });
      parts.push({ text: ' needs the most attention right now.' });
    }
  } else if (topPlayerGroup?.playerId) {
    parts.push({ text: 'Nothing urgent. ' });
    parts.push({ text: topPlayerGroup.playerName, href: playerHref(topPlayerGroup.playerId) });
    parts.push({ text: ' has the highest-priority open signal.' });
  } else {
    const total = openSignalCount(groups);
    parts.push({ text: `${total} open`, href: filterHref('all') });
    parts.push({ text: ` ${total === 1 ? 'signal' : 'signals'} to review. Nothing urgent right now.` });
  }

  if (outcomesAwaiting > 0) {
    parts.push({ text: ' ' });
    parts.push({ text: String(outcomesAwaiting), href: input.effectivenessHref });
    parts.push({
      text: ` ${outcomesAwaiting === 1 ? 'outcome' : 'outcomes'} awaiting a resolved result.`,
    });
  }
  return parts;
}

/* ── Display helpers ──────────────────────────────────────────────────────── */

/** The table's Strokes cell. Magnitude only — see the file header. */
export function formatSignalStrokes(strokeImpact: number | null): string | null {
  if (strokeImpact === null || !Number.isFinite(strokeImpact)) return null;
  return `${Math.abs(strokeImpact).toFixed(2)} str`;
}

/** How many times this signal has been re-detected. `SignalDossier.tsx:201-205`
 *  is the precedent: the superseded rows plus the live one. */
export function occurrencesOf(signal: GroupedSignal): number | null {
  return signal.supersededCount > 0 ? signal.supersededCount + 1 : null;
}

/** The active filter, said in words, so the table's heading never carries the
 *  same caption as an unfiltered count elsewhere on the page. */
export function filterLabel(filter: string): string | null {
  if (filter === 'all') return null;
  if (filter === 'urgent') return 'Urgent';
  if (filter === 'patterns') return 'Patterns';
  if (filter.startsWith('category:')) return formatCategoryLabel(filter.slice('category:'.length));
  return null;
}

/**
 * The Last-scan readout's compact restatement of `formatRelativeScanTime`'s
 * label. Derived from that function's OWN output rather than recomputed from
 * `scannedAt`, so the masthead eyebrow and the readout can never drift apart
 * into two different answers about the same timestamp.
 */
export function compactScanAge(label: string): string {
  if (label === 'No scans yet') return 'Never';
  return label.replace(/^Last scan /, '');
}
