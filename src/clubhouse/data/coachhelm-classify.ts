import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightComparisonSource, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { deriveTone, isNegativePolarityMetric } from '@/components/golf/coachhelm/insight-card/tone-derivation';
import type { ChKind, ChTourBaseline } from './coachhelm-shape';

/**
 * What a CoachHelm card states and whether it is current (Clubhouse P013). Pure, over the fields both the delivery shape
 * (`EvidenceInsight`) and the visible-rows read (`RankableEvidenceInsight`) carry, so the card that is drawn, the count of open
 * signals and the order of the players are all decided by the one rule.
 */
export type ClassifiableInsight = Pick<EvidenceInsight, 'category' | 'priority' | 'lifecycle_state' | 'status' | 'signature' | 'evidence' | 'metadata'>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The generators' "looked and found nothing" cards, by signature (stored with a `v3:` prefix): tee-strategy.ts `sharp` ("Driver is
 * performing") and `inconclusive` ("no clear preference"), putt-bias.ts `balanced` ("no directional bias detected"). The titles are
 * not matched: the stored wording differs from the source's (an em dash for its colon).
 */
const NOTE_SIGNATURE = /(?:^|:)(?:tee_strategy:(?:sharp|inconclusive)|putt_bias:balanced)$/;

/**
 * A card that states no finding: the generators' own "nothing to fix" rows, and every row stamped `feed_exempt`, which is how a
 * generator marks a purely descriptive card (par-type.ts's "Scoring by par type", warmup-hole.ts). Phase A keeps those out of the
 * actionable feed; the board does not offer to assign them, count them as signals, or draw their numbers.
 */
export function isNote(ins: Pick<ClassifiableInsight, 'signature' | 'evidence'>): boolean {
  if (ins.evidence?.feed_exempt === true) return true;
  return !!ins.signature && NOTE_SIGNATURE.test(ins.signature);
}

/**
 * Comparisons that are a college population, which the page does not draw (Q-88: the Tour is the only benchmark). `cohort_avg` is
 * the only one the generators write (course-mgmt.ts and pressure-gap.ts, whose value is the same metric, in the same unit, as the
 * `golf_pga_standards` row of that metric id); the division sources are listed so none can slip in later as a D1 or D2 benchmark.
 */
export const COLLEGE_SOURCES: ReadonlySet<InsightComparisonSource> = new Set<InsightComparisonSource>(['cohort_avg']);

/**
 * College figures that have no like-for-like Tour row, so no gauge is drawn at all: the division targets (13 live `d2_avg` rows
 * are a "miss severity", not the metric's own quantity) and the old women's-college green-hit estimate (`estimated_target`, a
 * percent stored under a proximity-in-feet metric id). Substituting the Tour row there would print feet on a percent card.
 */
export const COLLEGE_NO_TOUR: ReadonlySet<InsightComparisonSource> = new Set<InsightComparisonSource>(['d1_avg', 'd2_avg', 'd3_avg', 'naia_avg', 'juco_avg', 'estimated_target']);

/**
 * The comparison the card draws for its number: the Tour's value for the metric where the generator carried a college comparison
 * (the LPGA's for a women's team), the generator's own comparison otherwise, and none where the page draws none (a college figure
 * with no Tour value to stand for it, or one that is not like-for-like). A missing comparison is none, never zero.
 */
export function drawnComparison(ev: InsightEvidence, tour: ChTourBaseline | null): number | null {
  if (COLLEGE_NO_TOUR.has(ev.comparison_source)) return null;
  if (COLLEGE_SOURCES.has(ev.comparison_source)) return tour?.values.get(ev.metric ?? '') ?? null;
  return num(ev.comparison_value);
}

/**
 * Whether the card is working: resolved, or better than the comparison it draws (in the metric's own direction, so a lower rate
 * above a lower Tour value is not "ahead") at low priority or with an encouraging tone. The generator's own call about its
 * priority stands, but not against what the card shows: a stored positive gap to a college cohort that sits behind the Tour
 * value drawn beside it is not a strength.
 */
function isStrength(ins: ClassifiableInsight, tour: ChTourBaseline | null): boolean {
  const tone = deriveTone(ins);
  if (tone === 'celebratory') return true;
  const ev = ins.evidence;
  const you = num(ev.your_value);
  const cmp = drawnComparison(ev, tour);
  if (you == null || cmp == null) return false;
  const better = isNegativePolarityMetric(ev.metric ?? '', ev) ? you < cmp : you > cmp;
  return better && (tone === 'encouraging' || ins.priority === 'low');
}

/** Finding, strength or note. */
export function kindOf(ins: ClassifiableInsight, tour: ChTourBaseline | null): ChKind {
  if (isNote(ins)) return 'note';
  return isStrength(ins, tour) ? 'strength' : 'finding';
}

// ── Freshness ──────────────────────────────────────────────────────────────

const DAY = /^\d{4}-\d{2}-\d{2}/;

/** The `YYYY-MM-DD` of an ISO date or timestamp (the UTC day of one ending in Z), or null when it is not one. */
export function dayOf(v: unknown): string | null {
  if (typeof v !== 'string' || !DAY.test(v)) return null;
  const day = v.slice(0, 10);
  return Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? null : day;
}

function addDays(day: string, days: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The day this read was last refreshed (`metadata.last_refreshed_at`), UTC. */
export function refreshedDay(ins: Pick<ClassifiableInsight, 'metadata'>): string | null {
  return dayOf(ins.metadata?.last_refreshed_at);
}

/** The window of rolling evidence, in days; 0 for a lifetime value, which is not windowed (its `window_days` is only a span). */
function windowDays(ev: InsightEvidence | undefined): number {
  if (!ev || ev.window_basis === 'lifetime') return 0;
  const days = num(ev.window_days);
  return days != null && days > 0 ? days : 0;
}

/** The day rolling evidence stops covering anything newer: the end of its window plus the window; null when it has no end or no window. */
function coveredThrough(ev: InsightEvidence | undefined): string | null {
  const end = dayOf(ev?.window_end);
  const days = windowDays(ev);
  return end && days > 0 ? addDays(end, days) : null;
}

/**
 * The first day a completed round must reach to make this read out of date, or null when the row says neither when it was
 * refreshed nor where its window ended (it cannot then be told out of date). The loader reads rounds from this day on.
 */
export function staleFloor(ins: Pick<ClassifiableInsight, 'evidence' | 'metadata'>): string | null {
  const days = [refreshedDay(ins), coveredThrough(ins.evidence)].filter((d): d is string => !!d).sort();
  return days[0] ?? null;
}

/**
 * The day of the newest completed round, when the read does not include it; null when it does (or cannot be told). Out of date is:
 *   - last refreshed on an earlier day than that round (the round was played after the generators last ran for this row); or
 *   - its evidence window ended more than the generator's own window before that round (the evidence is of another period).
 * A round has a play date and no finer time, so a refresh on the same day reads as current. Never a write: the row is untouched.
 */
export function staleSince(ins: Pick<ClassifiableInsight, 'evidence' | 'metadata'>, newestRound: string | null): string | null {
  const newest = dayOf(newestRound);
  if (!newest) return null;
  const refreshed = refreshedDay(ins);
  if (refreshed && refreshed < newest) return newest;
  const through = coveredThrough(ins.evidence);
  if (through && through < newest) return newest;
  return null;
}

/** An open signal: a finding whose read is current. A strength, a note and an out-of-date read are not. */
export function isOpenFinding(ins: ClassifiableInsight, tour: ChTourBaseline | null, newestRound: string | null): boolean {
  return kindOf(ins, tour) === 'finding' && staleSince(ins, newestRound) === null;
}
