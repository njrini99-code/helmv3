/**
 * ============================================================================
 * buildCoachHomeViewModel — pure adapter for the Coach Intelligence Spine &
 * Stage home (spec §5.4)
 * ----------------------------------------------------------------------------
 * Pure, unit-tested functions that turn the SAME raw payloads
 * `FairwayBrief` already receives (`TeamOverviewResult`,
 * `TeamCategoryInsightsResult`, `getAlertCounts`'s counts) into the shapes the
 * `Spine`/`Bento` modules expect. No Supabase, no React — data in, data out,
 * so every branch is fixture-testable without mounting anything (mirrors
 * `src/components/golf/coachhelm/home/buildPlayerHomeViewModel.ts` and
 * `src/components/golf/stats/spine-stage/buildStatsViewModel.ts`).
 *
 * The category ranking/labeling table (`CATEGORY_ROW`) is deliberately
 * DUPLICATED (not imported) from `FairwayBrief.tsx` — that file is a
 * 'use client' component; this adapter stays framework-import-free per the
 * Task 1 "pure, no React" contract. Keep the two tables in sync by hand if
 * the category taxonomy ever changes.
 * ========================================================================== */

import type { PriorityItem } from '@/components/fairway/modules';
import type { TeamCategory } from '@/app/golf/actions/team-category-insights';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Category ranking — same five categories/labels FairwayBrief's CATEGORY_ROW
 * uses, worst-first once ranked.
 * ────────────────────────────────────────────────────────────────────────── */

export interface CategoryPresentation {
  ratingKey: 'teeGame' | 'approach' | 'shortGame' | 'putting' | 'scoring';
  categoryId: string;
  label: string;
  long: string;
}

export const CATEGORY_ROW: readonly CategoryPresentation[] = [
  { ratingKey: 'teeGame', categoryId: 'driving', label: 'Driving', long: 'Driving' },
  { ratingKey: 'approach', categoryId: 'approach', label: 'Approach', long: 'Approach play' },
  { ratingKey: 'shortGame', categoryId: 'short_game', label: 'Short', long: 'Short game' },
  { ratingKey: 'putting', categoryId: 'putting', label: 'Putting', long: 'Putting' },
  { ratingKey: 'scoring', categoryId: 'scoring', label: 'Scoring', long: 'Scoring' },
];

export interface RankedCoachCategory extends CategoryPresentation {
  rating: number;
  cat?: TeamCategory;
}

export type TeamCategoryRatings = Record<CategoryPresentation['ratingKey'], number>;

/**
 * Rank the five team categories worst-first. Returns `[]` when there's no
 * real stats-cache data yet (`teamCategories` absent) — the honest cold-start
 * case, never a fabricated 50-across ranking.
 */
export function rankCoachCategories(
  teamCategories: TeamCategoryRatings | null | undefined,
  categories: readonly TeamCategory[],
): RankedCoachCategory[] {
  if (!teamCategories) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  return CATEGORY_ROW.map((c) => ({
    ...c,
    rating: Math.round(teamCategories[c.ratingKey]),
    cat: byId.get(c.categoryId),
  })).sort((a, b) => a.rating - b.rating);
}

/* ───────────────────────────────────────────────────────────────────────────
 * Hero + verdict — the spine's composite/health readout + the "work on this
 * first" directive sentence.
 * ────────────────────────────────────────────────────────────────────────── */

export function buildCompositeHero(composite: number | null | undefined): { value: string; unit?: string } {
  const n = finite(composite);
  return n === null ? { value: '—' } : { value: String(Math.round(n)), unit: 'composite' };
}

/**
 * The spine's directive verdict sentence — names the weakest category and its
 * rating, or an honest "still filling in" line when there's no ranked
 * category yet (cold start / no team stats).
 */
export function buildDirectiveVerdict(weakest: RankedCoachCategory | null): string {
  if (!weakest) {
    return 'The team directive fills in once players log rounds with shot detail.';
  }
  return `${weakest.long} needs the most work right now — ${weakest.rating} of 100.`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Trajectory — the spine's `children` row (module kit has no dedicated field
 * for this; `Spine`'s `children` escape hatch is the documented place for
 * surface-specific rows like this one, per Task 1's types.ts contract).
 * ────────────────────────────────────────────────────────────────────────── */

export interface CategoryTrendCounts {
  improving: number;
  stable: number;
  declining: number;
}

export function buildTrajectoryCounts(categories: readonly TeamCategory[]): CategoryTrendCounts {
  const counts: CategoryTrendCounts = { improving: 0, stable: 0, declining: 0 };
  for (const c of categories) {
    if (c.trend === 'improving') counts.improving += 1;
    else if (c.trend === 'declining') counts.declining += 1;
    else counts.stable += 1;
  }
  return counts;
}

/** One-line trajectory summary, e.g. "2 improving · 2 steady · 1 declining". */
export function buildTrajectorySentence(counts: CategoryTrendCounts): string {
  const total = counts.improving + counts.stable + counts.declining;
  if (total === 0) return 'Trajectory fills in once category trends are computed.';
  return `${counts.improving} improving · ${counts.stable} steady · ${counts.declining} declining`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Priorities — the spine's top-3 flagged players, ranked by how many
 * categories they're flagged in (a player dragging 2 categories outranks one
 * dragging a single category); ties break alphabetically for determinism.
 * ────────────────────────────────────────────────────────────────────────── */

interface FlaggedPlayerAgg {
  playerId: string;
  playerName: string;
  categoryLabels: string[];
}

export function buildFlaggedPlayerPriorities(
  categories: readonly TeamCategory[],
  categoryLabelById: ReadonlyMap<string, string>,
  max = 3,
): PriorityItem[] {
  const byPlayer = new Map<string, FlaggedPlayerAgg>();
  for (const cat of categories) {
    const label = categoryLabelById.get(cat.id) ?? cat.label;
    for (const p of cat.players) {
      if (!p.needsAttention) continue;
      const existing = byPlayer.get(p.playerId);
      if (existing) existing.categoryLabels.push(label);
      else byPlayer.set(p.playerId, { playerId: p.playerId, playerName: p.playerName, categoryLabels: [label] });
    }
  }
  const scored = Array.from(byPlayer.values())
    .sort(
      (a, b) => b.categoryLabels.length - a.categoryLabels.length || a.playerName.localeCompare(b.playerName),
    )
    .slice(0, max);

  return scored.map((p, i) => ({
    rank: i + 1,
    title: p.playerName,
    value: p.categoryLabels.length > 1 ? `${p.categoryLabels.length} areas` : (p.categoryLabels[0] ?? ''),
  }));
}

/** Distinct players flagged across ANY category — a union, never a sum (a
 *  player can be flagged in 2+ categories, so summing per-category counts
 *  can exceed the roster size; see FairwayBrief's identical fix). */
export function countDistinctAttentionPlayers(categories: readonly TeamCategory[]): number {
  const ids = new Set<string>();
  for (const c of categories) {
    for (const p of c.players) {
      if (p.needsAttention) ids.add(p.playerId);
    }
  }
  return ids.size;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Ledger — players / attention / last analyzed.
 * ────────────────────────────────────────────────────────────────────────── */

export interface CoachLedgerInput {
  playerCount: number;
  attentionCount: number;
  /** Already date-formatted (see `formatAnalyzedDate`), or '' when unknown. */
  lastAnalyzed: string;
}

export function buildCoachLedger(input: CoachLedgerInput): Array<{ label: string; value: string }> {
  return [
    { label: 'Players', value: String(input.playerCount) },
    { label: 'Attention', value: String(input.attentionCount) },
    { label: 'Last analyzed', value: input.lastAnalyzed || '—' },
  ];
}

/**
 * Date-only formatter — DUPLICATED (not imported) from FairwayBrief's
 * `formatAnalyzed` so this adapter stays React-import-free. `dateOnly` is a
 * plain 'YYYY-MM-DD' calendar date (`golf_rounds.round_date`, no time-of-day
 * component) — parsed and formatted in UTC so every viewer sees the SAME
 * calendar day, never a fabricated clock time or a timezone-shifted date.
 */
export function formatAnalyzedDate(dateOnly: string): string {
  if (!dateOnly) return '';
  const d = new Date(`${dateOnly}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/* ───────────────────────────────────────────────────────────────────────────
 * Bento — signals summary (3-segment critical/warning/info bar), roster heat
 * teaser sentence, and effectiveness accuracy readout.
 * ────────────────────────────────────────────────────────────────────────── */

export interface AlertCountsInput {
  critical: number;
  warning: number;
  info: number;
  total: number;
}

export interface SignalsSummary {
  criticalPct: number;
  warningPct: number;
  infoPct: number;
  total: number;
}

/** Percentage breakdown for the signals-summary bento cell's 3-segment bar.
 *  Honest all-zero when there's nothing to show (never a fabricated split). */
export function buildSignalsSummary(counts: AlertCountsInput | null | undefined): SignalsSummary {
  if (!counts || counts.total <= 0) {
    return { criticalPct: 0, warningPct: 0, infoPct: 0, total: 0 };
  }
  const { critical, warning, info, total } = counts;
  return {
    criticalPct: Math.round((critical / total) * 100),
    warningPct: Math.round((warning / total) * 100),
    infoPct: Math.round((info / total) * 100),
    total,
  };
}

export function buildRosterHeatSentence(playerCount: number, attentionCount: number): string {
  if (playerCount === 0) return 'No active players yet.';
  const playerWord = playerCount === 1 ? 'player' : 'players';
  if (attentionCount === 0) return `${playerCount} ${playerWord} ranked — nobody flagged right now.`;
  return `${attentionCount} of ${playerCount} ${playerWord} flagged across categories.`;
}

/** predictionAccuracy (from getCoachHelmOverview) is a 0..1 fraction — see
 *  coachhelm-analytics.ts's `getInsightEffectiveness`/`getPredictionPerformance`
 *  (its 0.5 "coin flip" benchmark only makes sense on a 0..1 scale). */
export function formatAccuracyReadout(accuracy: number | null | undefined): string {
  const n = finite(accuracy);
  if (n === null) return '—';
  return `${Math.round(n * 100)}%`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Signals filter — `?filter=` on the `signals` stage view.
 * ────────────────────────────────────────────────────────────────────────── */

export type SignalsFilterKey = 'alerts' | 'insights' | 'patterns';

/** Unknown/absent `?filter=` → 'alerts' (the historical default landing for
 *  the coach Signals workspace — same default the old /alerts route was). */
export function resolveSignalsFilter(raw: string | string[] | undefined): SignalsFilterKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'insights' || v === 'patterns' ? v : 'alerts';
}
