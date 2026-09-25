/**
 * ============================================================================
 * Team roots extras: "Did the focus work?" slopes and "Needs you"
 * ----------------------------------------------------------------------------
 * PURE. Both lists are shaped from rows the coach page already holds or that
 * the attribution cron already stored:
 *   - slopes: `golf_insight_outcome_attribution` baseline → post for the
 *     insight a focus area came from. No new measurement, no causal claim:
 *     the copy states the stored before/after and the stored method.
 *   - needs you: focus areas whose source evidence changed since approval
 *     (`evidence_revision_status === 'changed'`), the most severe open
 *     insight signals, then open signals whose STORED context narrowing
 *     reached a gated par or shape concentration (one per player; the last
 *     slot is held for one when it exists). The narrowing is read from the
 *     row, never recomputed here.
 * ========================================================================== */

import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';
import { describeMethodVersion, MIN_SUFFICIENT_ROUNDS } from '@/lib/coachhelm/v3/effectiveness/attribution-view-model';
import type { StoredAttributionRow } from './loaders';
import { concentrationLead, concentrationPathText, storedConcentration } from './build-team-roots';

export interface SlopeFocusInput {
  id: string;
  playerId: string;
  title: string;
  fromInsightId: string | null;
}

export type SlopeTone = 'better' | 'worse' | 'flat' | 'neutral';

export interface FocusSlopeRow {
  focusAreaId: string;
  playerId: string;
  playerName: string;
  title: string;
  metricLabel: string;
  unit: string | null;
  baseline: number;
  post: number;
  nBefore: number;
  nAfter: number;
  methodDescription: string;
  /** True only for the clean comparable-opportunity method. */
  isClean: boolean;
  /** Direction-aware tone; 'neutral' when the metric's direction is unknown
   *  (never coloured good/bad without knowing which way is better). */
  tone: SlopeTone;
}

export interface MetricMeta {
  label: string;
  unit: string | null;
  direction: 'higher_better' | 'lower_better' | null;
}

export const SLOPE_MAX_ROWS = 6;
/** Below this absolute change the stored before/after is drawn as flat. */
const FLAT_EPSILON = 1e-6;

/**
 * One slope per focus area that has a stored attribution row with at least
 * MIN_SUFFICIENT_ROUNDS rounds on BOTH sides. Clean-method rows first, then
 * largest sample.
 */
export function buildFocusSlopes(input: {
  focusAreas: SlopeFocusInput[];
  attribution: StoredAttributionRow[];
  playerNameById: Record<string, string>;
  metricMeta: (metricId: string) => MetricMeta;
  max?: number;
}): FocusSlopeRow[] {
  const byInsight = new Map<string, StoredAttributionRow>();
  for (const row of input.attribution) {
    if (row.nBefore < MIN_SUFFICIENT_ROUNDS || row.nAfter < MIN_SUFFICIENT_ROUNDS) continue;
    const held = byInsight.get(row.insightId);
    if (!held || row.nBefore + row.nAfter > held.nBefore + held.nAfter) byInsight.set(row.insightId, row);
  }
  const rows: FocusSlopeRow[] = [];
  for (const fa of input.focusAreas) {
    if (!fa.fromInsightId) continue;
    const a = byInsight.get(fa.fromInsightId);
    if (!a) continue;
    const meta = input.metricMeta(a.targetMetricId);
    const method = describeMethodVersion(a.methodVersion);
    const diff = a.post - a.baseline;
    let tone: SlopeTone = 'neutral';
    if (Math.abs(diff) <= FLAT_EPSILON) tone = 'flat';
    else if (meta.direction === 'higher_better') tone = diff > 0 ? 'better' : 'worse';
    else if (meta.direction === 'lower_better') tone = diff < 0 ? 'better' : 'worse';
    rows.push({
      focusAreaId: fa.id,
      playerId: fa.playerId,
      playerName: input.playerNameById[fa.playerId] ?? 'Player',
      title: fa.title,
      metricLabel: meta.label,
      unit: meta.unit,
      baseline: a.baseline,
      post: a.post,
      nBefore: a.nBefore,
      nAfter: a.nAfter,
      methodDescription: method.description,
      isClean: method.isClean,
      tone,
    });
  }
  return rows
    .sort((x, y) => Number(y.isClean) - Number(x.isClean) || y.nBefore + y.nAfter - (x.nBefore + x.nAfter))
    .slice(0, input.max ?? SLOPE_MAX_ROWS);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Needs you
 * ──────────────────────────────────────────────────────────────────────── */

export interface NeedsYouFocusInput {
  id: string;
  playerId: string;
  title: string;
  status: string | null;
  evidenceRevisionStatus: 'match' | 'changed' | 'unknown' | undefined;
}

export interface NeedsYouItem {
  key: string;
  kind: 'focus_changed' | 'signal' | 'concentration';
  playerId: string;
  playerName: string;
  title: string;
  detail: string;
  /** Signal id for signal items (opens the dossier); null for focus areas. */
  signalId: string | null;
}

export const NEEDS_YOU_MAX = 4;
const OPEN_FOCUS_STATUSES = new Set(['active', 'in_progress', 'paused']);

export function buildNeedsYou(input: {
  focusAreas: NeedsYouFocusInput[];
  signals: GroupedSignal[];
  playerNameById: Record<string, string>;
  max?: number;
}): NeedsYouItem[] {
  const max = input.max ?? NEEDS_YOU_MAX;
  const items: NeedsYouItem[] = [];
  for (const fa of input.focusAreas) {
    if (fa.evidenceRevisionStatus !== 'changed') continue;
    if (fa.status !== null && !OPEN_FOCUS_STATUSES.has(fa.status)) continue;
    items.push({
      key: `fa:${fa.id}`,
      kind: 'focus_changed',
      playerId: fa.playerId,
      playerName: input.playerNameById[fa.playerId] ?? 'Player',
      title: fa.title,
      detail: 'The read behind this focus changed since you set it',
      signalId: null,
    });
  }
  const severe = input.signals
    .filter(
      (s) =>
        s.kind === 'insight' &&
        s.playerId !== null &&
        (s.severity === 'urgent' || s.severity === 'high') &&
        s.status !== 'dismissed' &&
        s.status !== 'reviewed',
    )
    .sort((a, b) => (a.severity === b.severity ? a.ageDays - b.ageDays : a.severity === 'urgent' ? -1 : 1));
  const severeItem = (s: GroupedSignal): NeedsYouItem => ({
    key: `sig:${s.id}`,
    kind: 'signal',
    playerId: s.playerId as string,
    playerName: input.playerNameById[s.playerId as string] ?? 'Player',
    title: s.title,
    detail: s.severity === 'urgent' ? 'Urgent signal' : 'High-priority signal',
    signalId: s.id,
  });
  // Severe signals take all but the last slot: production teams routinely
  // hold 4+ open high/urgent rows (6 of 7 on 2026-09-25), which would
  // otherwise starve the concentration row entirely. The slot goes back to
  // severe signals when no gated concentration exists.
  let severeAt = 0;
  while (severeAt < severe.length && items.length < max - 1) items.push(severeItem(severe[severeAt++]!));

  // Gated miss concentrations: a shape step outranks a par-only one, then the
  // larger stored size. One per player, and never a signal already listed.
  const listed = new Set(items.map((i) => i.signalId).filter((id): id is string => id !== null));
  const concentrations = input.signals
    .filter((s) => s.kind === 'insight' && s.playerId !== null && s.status !== 'dismissed' && s.status !== 'reviewed' && !listed.has(s.id))
    .map((s) => ({ s, n: storedConcentration(s) }))
    .filter((x): x is { s: GroupedSignal; n: NonNullable<ReturnType<typeof storedConcentration>> } => x.n !== null)
    .sort((a, b) => {
      const shapeA = a.n.steps.some((st) => st.level === 'shape' && st.passed) ? 1 : 0;
      const shapeB = b.n.steps.some((st) => st.level === 'shape' && st.passed) ? 1 : 0;
      return shapeB - shapeA || (b.s.strokeImpact ?? 0) - (a.s.strokeImpact ?? 0) || a.s.ageDays - b.s.ageDays;
    });
  const concentrationPlayers = new Set<string>();
  for (const { s, n } of concentrations) {
    if (items.length >= max) break;
    const playerId = s.playerId as string;
    if (concentrationPlayers.has(playerId)) continue;
    concentrationPlayers.add(playerId);
    const last = [...n.steps].reverse().find((st) => st.passed);
    items.push({
      key: `conc:${s.id}`,
      kind: 'concentration',
      playerId,
      playerName: input.playerNameById[playerId] ?? 'Player',
      title: s.title,
      detail: `${concentrationLead(n)}: ${concentrationPathText(n)}${last ? ` — ${last.statement}` : ''}. Observed, not a cause.`,
      signalId: s.id,
    });
  }
  while (severeAt < severe.length && items.length < max) items.push(severeItem(severe[severeAt++]!));
  return items.slice(0, max);
}
