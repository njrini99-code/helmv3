/**
 * ============================================================================
 * Fairway · primitive group "cards-insight" — public surface
 * ----------------------------------------------------------------------------
 * MetricCard  — single-metric tile: Fragment Mono numeric with Number Flow
 *               animate-on-change, up/down delta chip, optional sparkline slot.
 * InsightCard — the CoachHelm/dashboard signal surface in a hero|default|compact
 *               vocabulary; `hero` is the one Liquid-Glass card per view.
 * InsightPanel — the expanded/docked READ of the SAME signal (Sheet on narrow,
 *               docked column on wide). Shares InsightCard's priority/action
 *               vocabulary verbatim, so a signal looks identical scanned vs read.
 *
 * ADDITIVE ONLY — nothing here is imported by the live app. Components render
 * correctly inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ============================================================================
 */

export { MetricCard } from './MetricCard';
export type {
  MetricCardProps,
  MetricCardVariant,
  MetricDelta,
  MetricDeltaDirection,
  MetricGoodDirection,
} from './MetricCard';

export { InsightCard, PRIORITY as INSIGHT_PRIORITY } from './InsightCard';
export type {
  InsightCardProps,
  InsightVariant,
  InsightPriority,
  PriorityTone,
} from './InsightCard';

export { InsightPanel } from './InsightPanel';
export type {
  InsightPanelProps,
  InsightPanelMode,
  InsightPanelAction,
} from './InsightPanel';
