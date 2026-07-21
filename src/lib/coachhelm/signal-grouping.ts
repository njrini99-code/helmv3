/**
 * Pure grouping, scoring, and dedupe logic for the CoachHelm Triage Desk.
 *
 * NO `'use server'` here on purpose — every rule below is a plain function of
 * its inputs (no Supabase, no auth, no Date.now() unless passed explicitly)
 * so it is unit-testable without a DB. `src/app/golf/actions/signal-groups.ts`
 * is the only caller: it fetches `golf_coach_insights` + `golf_patterns_v2`
 * rows, maps them to `GroupedSignal`, and hands the array to `groupSignals`.
 */

export type SignalSeverity = 'urgent' | 'high' | 'medium' | 'low';

export interface GroupedSignal {
  id: string;
  kind: 'insight' | 'pattern';
  category: string;
  severity: SignalSeverity;
  title: string;
  claim: string;
  ageDays: number;
  status: string;
  strokeImpact: number | null;
  playerId: string | null;
  supersededCount: number;
}

export interface SignalGroup {
  playerId: string | null;
  playerName: string;
  attentionScore: number;
  worstSeverity: SignalSeverity;
  signals: GroupedSignal[];
}

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

/** Worst-first order — drives both a group's `worstSeverity` derivation and
 *  the within-group signal sort. */
export const SEVERITY_ORDER: readonly SignalSeverity[] = ['urgent', 'high', 'medium', 'low'];

const SEVERITY_WEIGHT: Record<SignalSeverity, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** `golf_coach_insights.priority` -> `SignalSeverity`. Mirrors
 *  `mapPriorityToLevel` in alerts.ts / getAlertCounts's bucketing so Triage
 *  Desk severity never disagrees with the alert badge: `urgent` and `high`
 *  both read top-tier, unrecognized/null falls to `low`. */
export function severityFromInsightPriority(priority: string | null | undefined): SignalSeverity {
  switch (priority) {
    case 'urgent':
      return 'urgent';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    default:
      return 'low';
  }
}

/** `golf_patterns_v2.severity` -> `SignalSeverity`. Patterns use their own
 *  low/medium/high/critical scale (see `golf_patterns_v2_severity_check`);
 *  `critical` is the pattern-side equivalent of the insight side's `urgent`. */
export function severityFromPatternSeverity(severity: string | null | undefined): SignalSeverity {
  switch (severity) {
    case 'critical':
      return 'urgent';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    default:
      return 'low';
  }
}

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between `createdAt` and `now` (defaults to the real clock).
 *  Clamped to >= 0; an unparseable/missing timestamp falls back to 0 rather
 *  than NaN so a malformed row can never poison a Math.max/sort downstream. */
export function ageDaysFromCreatedAt(createdAt: string | null | undefined, now: Date = new Date()): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((now.getTime() - created) / DAY_MS));
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

/** Same player + same `category` is the same underlying issue restated.
 *  `category` doubles as the "metric" key — callers map it from
 *  `insight.category ?? insight.insight_type` or `pattern.pattern_type`
 *  (see signal-groups.ts). */
function dedupeKey(signal: GroupedSignal): string {
  return `${signal.playerId ?? 'team'}::${signal.category}`;
}

/**
 * Collapses signals that restate the same player+category issue down to a
 * single, newest (smallest `ageDays`) row, folding the rest into
 * `supersededCount`. Starts each collapse from the kept signal's OWN
 * `supersededCount` so re-collapsing an already-collapsed list accumulates
 * instead of resetting.
 */
export function collapseDuplicates(signals: GroupedSignal[]): GroupedSignal[] {
  const newestFirst = [...signals].sort((a, b) => a.ageDays - b.ageDays);
  const byKey = new Map<string, GroupedSignal>();

  for (const signal of newestFirst) {
    const key = dedupeKey(signal);
    const kept = byKey.get(key);
    if (!kept) {
      byKey.set(key, { ...signal });
      continue;
    }
    kept.supersededCount += 1 + signal.supersededCount;
  }

  return Array.from(byKey.values());
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function recencyBonus(ageDays: number): number {
  if (ageDays <= 1) return 3;
  if (ageDays <= 3) return 2;
  if (ageDays <= 7) return 1;
  return 0;
}

/**
 * attentionScore = (worst-severity weight x 3) + signal count + the
 * freshest signal's recency bonus. A pure function of a group's severity +
 * signal list, callable while assembling a `SignalGroup` (as `groupSignals`
 * does) or re-derived later, e.g. to re-rank after a client-side dismiss.
 */
export function attentionScore(group: Pick<SignalGroup, 'worstSeverity' | 'signals'>): number {
  const severityComponent = SEVERITY_WEIGHT[group.worstSeverity] * 3;
  const volumeComponent = group.signals.length;
  const recencyComponent = group.signals.reduce((best, s) => Math.max(best, recencyBonus(s.ageDays)), 0);
  return severityComponent + volumeComponent + recencyComponent;
}

function worstSeverityOf(signals: readonly GroupedSignal[]): SignalSeverity {
  for (const level of SEVERITY_ORDER) {
    if (signals.some((s) => s.severity === level)) return level;
  }
  return 'low';
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Collapses duplicates, buckets by player, and orders the result:
 *  - the `playerId: null` "Team" bucket (signals with no single-player
 *    attribution) is ALWAYS pinned first when present;
 *  - every player group is then ordered by `attentionScore` descending,
 *    ties broken alphabetically by player name so the order is deterministic;
 *  - signals inside a group are ordered worst-severity-first, then
 *    freshest-first.
 */
export function groupSignals(signals: GroupedSignal[], playerNames: Record<string, string>): SignalGroup[] {
  const collapsed = collapseDuplicates(signals);

  const byPlayer = new Map<string, GroupedSignal[]>();
  for (const signal of collapsed) {
    const key = signal.playerId ?? '__team__';
    const bucket = byPlayer.get(key);
    if (bucket) {
      bucket.push(signal);
    } else {
      byPlayer.set(key, [signal]);
    }
  }

  const groups: SignalGroup[] = Array.from(byPlayer.entries()).map(([key, bucketSignals]) => {
    const signalsSorted = [...bucketSignals].sort((a, b) => {
      const severityDelta = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      return severityDelta !== 0 ? severityDelta : a.ageDays - b.ageDays;
    });
    const worstSeverity = worstSeverityOf(signalsSorted);
    const playerId = key === '__team__' ? null : key;
    const playerName = playerId ? playerNames[playerId] ?? 'Unknown Player' : 'Team';

    return {
      playerId,
      playerName,
      worstSeverity,
      signals: signalsSorted,
      attentionScore: attentionScore({ worstSeverity, signals: signalsSorted }),
    };
  });

  return groups.sort((a, b) => {
    if (a.playerId === null) return -1;
    if (b.playerId === null) return 1;
    return b.attentionScore - a.attentionScore || a.playerName.localeCompare(b.playerName);
  });
}

// ---------------------------------------------------------------------------
// Supersede-on-scan selection (used by alerts.ts generateAlerts)
// ---------------------------------------------------------------------------

/** Lifecycle states a fresh scan is allowed to retire. Deliberately excludes
 *  `resolved` (the coach already closed it out — a fresh scan restating the
 *  same category is a NEW occurrence, not a re-detection to fold silently
 *  into history) and `archived` (already retired). Matches the dual-axis
 *  contract in `src/lib/coachhelm/v3/insight-visibility.ts`: superseding only
 *  ever moves `lifecycle_state`, never the coach's `status` axis. */
const OPEN_LIFECYCLE_STATES = new Set(['tentative', 'detected', 'matured', 'addressed']);

export interface SupersedeCandidate {
  id: string;
  playerId: string | null;
  category: string | null;
  lifecycleState: string | null;
}

export interface FreshScanSignal {
  playerId: string | null;
  category: string | null;
}

/**
 * Selects which prior, still-open insights a batch of freshly-generated scan
 * rows makes stale: same player, same category, and not already
 * resolved/archived. Pure — the caller (`generateAlerts` in alerts.ts)
 * fetches the candidates and the fresh rows, calls this, and archives
 * whatever ids come back.
 */
export function selectSuperseded(
  priorInsights: readonly SupersedeCandidate[],
  freshSignals: readonly FreshScanSignal[],
): string[] {
  const freshKeys = new Set(
    freshSignals
      .filter((s) => !!s.playerId && !!s.category)
      .map((s) => `${s.playerId}::${s.category}`),
  );
  if (freshKeys.size === 0) return [];

  return priorInsights
    .filter((prior) => {
      if (!prior.playerId || !prior.category) return false;
      if (!OPEN_LIFECYCLE_STATES.has(prior.lifecycleState ?? 'detected')) return false;
      return freshKeys.has(`${prior.playerId}::${prior.category}`);
    })
    .map((prior) => prior.id);
}
