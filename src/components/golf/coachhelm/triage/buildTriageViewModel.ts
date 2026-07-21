/**
 * ============================================================================
 * buildTriageViewModel — pure adapter for the CoachHelm Triage Desk
 * ----------------------------------------------------------------------------
 * Everything here is a plain function of its inputs (no Supabase, no React,
 * no `Date.now()` unless passed explicitly) so the Brief band's counts/verdict,
 * the Signals queue's filter chips, and the queue↔dossier lookups are all
 * unit-testable without mounting anything. Operates on the FROZEN
 * `GroupedSignal` / `SignalGroup` contract from
 * `src/lib/coachhelm/signal-grouping.ts` — this file never re-derives
 * grouping/scoring, only filters, counts, and formats what
 * `getSignalGroups` already produced.
 * ========================================================================== */

import {
  SEVERITY_ORDER,
  attentionScore,
  type GroupedSignal,
  type SignalGroup,
  type SignalSeverity,
} from '@/lib/coachhelm/signal-grouping';

/* ───────────────────────────────────────────────────────────────────────────
 * View + filter param resolution — `?view=` / `?filter=` (spec §2/§3). Legacy
 * shim redirects (alerts/insights/patterns/development/analytics/coachhelm
 * pages) still write `?view=signals&filter=alerts` etc. — these resolvers are
 * the ONLY place those values get decoded, so every legacy bookmark keeps
 * landing on the right tab + preset.
 * ────────────────────────────────────────────────────────────────────────── */

export type TriageView = 'signals' | 'players' | 'effectiveness';

/** Unknown/absent `?view=` -> 'signals' — the Triage Desk IS the landing
 *  surface now (there is no separate "home" bento to fall back to). */
export function resolveTriageView(raw: string | string[] | null | undefined): TriageView {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'players' || v === 'effectiveness' ? v : 'signals';
}

export type QueueFilterKey = 'all' | 'urgent' | 'new' | 'patterns' | `category:${string}`;

/** Legacy `alerts`/`insights`/`patterns` (the three retired routes' filter
 *  values, still forwarded by their permanent-redirect shims) map onto the
 *  new queue chips. A direct Intelligence landing defaults to `all`; the
 *  retired /alerts shim still explicitly passes `alerts` and opens Urgent. */
export function resolveQueueFilter(raw: string | string[] | null | undefined): QueueFilterKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  switch (v) {
    case 'alerts':
      return 'urgent';
    case 'insights':
      return 'all';
    case 'patterns':
    case 'urgent':
    case 'new':
    case 'all':
      return v;
    default:
      if (typeof v === 'string' && v.startsWith('category:') && v.length > 'category:'.length) {
        return v as QueueFilterKey;
      }
      return 'all';
  }
}

export const BASE_QUEUE_FILTERS: ReadonlyArray<{ key: QueueFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'new', label: 'New' },
  { key: 'patterns', label: 'Patterns' },
];

/* ───────────────────────────────────────────────────────────────────────────
 * Filtering + dedupe-safe re-scoring
 * ────────────────────────────────────────────────────────────────────────── */

function worstSeverityOf(signals: readonly GroupedSignal[]): SignalSeverity {
  for (const level of SEVERITY_ORDER) {
    if (signals.some((s) => s.severity === level)) return level;
  }
  return 'low';
}

function matchesFilter(signal: GroupedSignal, filter: QueueFilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'urgent') return signal.severity === 'urgent';
  if (filter === 'new') return signal.ageDays <= 7;
  if (filter === 'patterns') return signal.kind === 'pattern';
  return signal.category === filter.slice('category:'.length);
}

/**
 * Filters every group's signals by the active queue chip, drops groups left
 * with none, and re-derives `worstSeverity`/`attentionScore` from what's
 * actually visible (a group filtered down to its one `low` signal should no
 * longer wear a stale `urgent` chip). The Team-group-first pin + attention
 * ordering is re-applied so the visible list stays worst-first even after
 * filtering changes which signals qualify.
 */
export function filterGroupSignals(groups: readonly SignalGroup[], filter: QueueFilterKey): SignalGroup[] {
  const rescored = groups
    .map((group) => {
      const signals = group.signals.filter((s) => matchesFilter(s, filter));
      if (signals.length === 0) return null;
      const worstSeverity = worstSeverityOf(signals);
      return { ...group, signals, worstSeverity, attentionScore: attentionScore({ worstSeverity, signals }) };
    })
    .filter((g): g is SignalGroup => g !== null);

  return rescored.sort((a, b) => {
    if (a.playerId === null) return -1;
    if (b.playerId === null) return 1;
    return b.attentionScore - a.attentionScore || a.playerName.localeCompare(b.playerName);
  });
}

/** Total visible-signal count for a filter chip's trailing count badge —
 *  computed against the FULL group list (not whatever's currently filtered),
 *  so switching filters never shows a stale count from a prior selection. */
export function countForFilter(groups: readonly SignalGroup[], filter: QueueFilterKey): number {
  return filterGroupSignals(groups, filter).reduce((n, g) => n + g.signals.length, 0);
}

/** Distinct categories across every signal, alphabetical — feeds the
 *  per-category filter chips appended after the four base chips. */
export function distinctCategories(groups: readonly SignalGroup[]): string[] {
  const set = new Set<string>();
  for (const group of groups) {
    for (const signal of group.signals) set.add(signal.category);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/* ───────────────────────────────────────────────────────────────────────────
 * Optimistic removal (Mark reviewed / Dismiss / Prescribe all remove the
 * acted-on signal from the visible queue immediately, reverted on failure).
 * ────────────────────────────────────────────────────────────────────────── */

export function removeSignalFromGroups(groups: readonly SignalGroup[], signalId: string): SignalGroup[] {
  return groups
    .map((group) => {
      if (!group.signals.some((s) => s.id === signalId)) return group;
      const signals = group.signals.filter((s) => s.id !== signalId);
      if (signals.length === 0) return null;
      const worstSeverity = worstSeverityOf(signals);
      return { ...group, signals, worstSeverity, attentionScore: attentionScore({ worstSeverity, signals }) };
    })
    .filter((g): g is SignalGroup => g !== null);
}

/** Locates a signal (+ its group) by id across every group — powers the
 *  `?signal=` deep link and the dossier's own lookup. `null` id or a miss
 *  (already reviewed/dismissed elsewhere) both return `null`, an honest
 *  "nothing selected" the dossier renders as its empty prompt. */
export function findSignalInGroups(
  groups: readonly SignalGroup[],
  id: string | null,
): { signal: GroupedSignal; group: SignalGroup } | null {
  if (!id) return null;
  for (const group of groups) {
    const signal = group.signals.find((s) => s.id === id);
    if (signal) return { signal, group };
  }
  return null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Brief band — counts + plain-language verdict + relative scan time.
 * ────────────────────────────────────────────────────────────────────────── */

export interface BriefCounts {
  urgent: number;
  newThisWeek: number;
  playersFlagged: number;
}

export function computeBriefCounts(groups: readonly SignalGroup[]): BriefCounts {
  let urgent = 0;
  let newThisWeek = 0;
  const flagged = new Set<string>();
  for (const group of groups) {
    if (group.playerId && group.signals.length > 0) flagged.add(group.playerId);
    for (const signal of group.signals) {
      if (signal.severity === 'urgent') urgent += 1;
      if (signal.ageDays <= 7) newThisWeek += 1;
    }
  }
  return { urgent, newThisWeek, playersFlagged: flagged.size };
}

/** The Brief's 1-2 sentence verdict — names what needs attention today, or
 *  an honest "all clear" when the queue is empty. Never fabricates urgency:
 *  a team with only low-priority signals gets a calm sentence, not a padded
 *  count. */
export function buildBriefVerdict(groups: readonly SignalGroup[], counts: BriefCounts): string {
  if (groups.length === 0) {
    return 'All clear — no open signals right now.';
  }
  const topPlayerGroup = groups.find((g) => g.playerId !== null) ?? null;

  if (counts.urgent > 0) {
    const playerWord = counts.playersFlagged === 1 ? 'player' : 'players';
    const who = topPlayerGroup ? ` ${topPlayerGroup.playerName} needs the most attention right now.` : '';
    const signalWord = counts.urgent === 1 ? 'signal needs' : 'signals need';
    return `${counts.urgent} urgent ${signalWord} review across ${counts.playersFlagged} ${playerWord}.${who}`;
  }

  const totalSignals = groups.reduce((n, g) => n + g.signals.length, 0);
  if (topPlayerGroup) {
    return `Nothing urgent — ${topPlayerGroup.playerName} has the highest-priority open signal.`;
  }
  const signalWord = totalSignals === 1 ? 'signal' : 'signals';
  return `${totalSignals} open ${signalWord} to review — nothing urgent right now.`;
}

/** Relative "last scan" caption. `null` (no scan on record) reads as an
 *  honest "No scans yet" rather than a fabricated duration. */
export function formatRelativeScanTime(scannedAt: string | null, now: Date = new Date()): string {
  if (!scannedAt) return 'No scans yet';
  const then = new Date(scannedAt).getTime();
  if (!Number.isFinite(then)) return 'No scans yet';
  const diffMs = Math.max(0, now.getTime() - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Last scan just now';
  if (minutes < 60) return `Last scan ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last scan ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Last scan ${days}d ago`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Display formatting — category labels, severity labels, age.
 * ────────────────────────────────────────────────────────────────────────── */

export function formatCategoryLabel(category: string): string {
  return category
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function severityLabel(severity: SignalSeverity): string {
  switch (severity) {
    case 'urgent':
      return 'Urgent';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    default:
      return 'Low';
  }
}

export function formatAgeDays(ageDays: number): string {
  if (ageDays <= 0) return 'Today';
  if (ageDays === 1) return '1d ago';
  return `${ageDays}d ago`;
}
