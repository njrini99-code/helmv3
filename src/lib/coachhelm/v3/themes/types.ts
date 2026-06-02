/**
 * ============================================================================
 * CoachHelm v3 · THEMES — the hierarchical insight contract
 * ----------------------------------------------------------------------------
 * THEME → DIRECT CAUSE → ROOT DRIVER → DEVELOPMENT PLAN.
 *
 * This is the read-time assembly target for the saved plan
 * (docs/fairway-coachhelm-insight-rebuild.md). The engine ALREADY produces the
 * cascade — `evidence.counterfactual.strokes_saved_per_round` per cause and the
 * composite rules' `evidence.source_insight_ids[]` (parent→child edges) — and
 * the flat read path collapses it via sibling dedup. The assembler
 * (`assemble.ts`) re-expands that structure from the SAME rows; NO new shot
 * math, NO schema change for Phase 1.
 *
 * IMPORTANT (verified 2026-06-01): `evidence.counterfactual`, `evidence.standing`,
 * `evidence.source_insight_ids`, and `evidence.composite_rule_id` are injected at
 * RUNTIME (`engine/generator-base.ts`, `composite/synthesis.ts`) but are NOT
 * declared on the base `InsightEvidence` type. The assembler therefore declares
 * {@link AssembledEvidence} as its own cast target and null-guards every read.
 * ========================================================================== */

import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { CounterfactualProjection } from '@/lib/coachhelm/v3/counterfactual/types';

/* ───────────────────────────────────────────────────────────────────────────
 * Runtime-real evidence — the fields the engine injects onto the evidence JSON
 * that the base `InsightEvidence` type does not declare. Cast at the read
 * boundary; treat every field as possibly-absent.
 * ────────────────────────────────────────────────────────────────────────── */

/** The standing snapshot the generator injects when a metric has a standing row. */
export interface AssembledStanding {
  metric_id: string;
  player_value: number | null;
  team_avg: number | null;
  team_pct: number | null;
  pga_value: number | null;
  pga_delta: number | null;
}

/** Cast target for `row.evidence` once read from `golf_coach_insights`. */
export interface AssembledEvidence {
  /** canonical metric key (a `MetricId` string in practice). */
  metric?: string;
  metric_label?: string;
  /** base impact — frequently 0; NOT the ranking key (use counterfactual). */
  strokes_impact?: number;
  confidence?: number;
  /** present only when the generator had a standing row (requiresStanding). */
  standing?: AssembledStanding | null;
  /** the real per-cause stroke value — drives theme sizing + cause ranking. */
  counterfactual?: CounterfactualProjection | null;
  /** composite parent→child edges — the leaf insight ids a cascade was built from (may be []). */
  source_insight_ids?: string[];
  /** present on composite rows — identifies the rule that synthesized this row. */
  composite_rule_id?: string;
  /** generator-specific drill-down detail (shot-level driver data). */
  detail?: Record<string, unknown>;
}

/* ───────────────────────────────────────────────────────────────────────────
 * The assembled tree
 * ────────────────────────────────────────────────────────────────────────── */

/** A development-plan leaf — a drill attached to a cause (≤3, from delivery). */
export interface DriverLeaf {
  drill_id: string;
  slug: string;
  title: string;
}

/**
 * A ROOT DRIVER under a direct cause: either a composite synthesis (threaded in
 * via `source_insight_ids`) rendering its prose, or a shot-level detail panel,
 * or a diagnostic-only read (bias metric with counterfactual 0).
 */
export interface RootDriver {
  source: 'composite' | 'shot_detail' | 'diagnostic';
  /** present when `source === 'composite'`. */
  composite_rule_id?: string;
  /** the leaf insight ids this driver was built from (may be []). */
  source_insight_ids: string[];
  title: string;
  /** human prose — the insight's content. */
  prose: string;
  drills: DriverLeaf[];
}

/**
 * A DIRECT CAUSE under a theme — one collapsed sibling group
 * (`player:category:metric`). Carries everything the "Make it a plan" CTA needs.
 */
export interface CauseNode {
  insight_id: string;
  /** `evidence.metric` → `target_metric` for `createFocusAreaFromInsight`. */
  metric: string | null;
  title: string;
  content: string;
  /**
   * REALISTIC per-round strokes to gain — the PRIMARY ranking/sizing/display
   * value. This is the gap to the player's TEAM AVERAGE (the realistic peer
   * target), NOT the full Tour gap. Computed as `tourGapPerRound * teamFraction`
   * where
   *   teamFraction = clamp((player_value - team_avg) / (player_value - pga_value), 0, 1)
   * i.e. the fraction of the player→PGA distance that lies between the player and
   * their team average. When there is no usable team reference (any of team_avg /
   * player_value / pga_value null, or player≈PGA), `teamFraction` falls back to 1
   * and this equals the full `tourGapPerRound` (framed honestly as "to Tour"). If
   * the player is already at/better than the team average on this metric the
   * numerator goes ≤ 0 and clamps to 0 (no realistic gain vs peers — PGA stays the
   * ceiling). 0 when the counterfactual is suppressed/absent (diagnostic-only).
   * NEVER re-floors below the upstream 0.3 stat-noise threshold.
   */
  strokesSavedPerRound: number;
  /**
   * SORT-ONLY ranking key (never displayed). Equals `strokesSavedPerRound` EXCEPT
   * when a real Tour gap has been zeroed by `teamFraction` (the player sits at their
   * team average on a skill the whole team is weak at). Without a floor those real,
   * coachable gaps rank as 0 and vanish from the cockpit — a roster backtest found
   * this hid 54% of real gaps. The floor is `RANK_LEVERAGE_FLOOR * tourGapPerRound`,
   * so a genuine gap keeps a minimum ranking weight while `strokesSavedPerRound`
   * (the realistic team-anchored magnitude) remains the DISPLAYED number unchanged.
   * Optional: a node without it falls back to `strokesSavedPerRound` for sorting.
   */
  rankKey?: number;
  /**
   * The RAW gap to the PGA/Tour CEILING (the un-discounted upstream
   * `counterfactual.strokes_saved_per_round`), for honest "gap to Tour ceiling"
   * labeling. null when no counterfactual. NEVER framed as "strokes you're losing."
   */
  tourGapPerRound: number | null;
  /** counterfactual suppressed (stat noise / no baseline / bias metric) → diagnostic-only, no headline number. */
  counterfactualSuppressed: boolean;
  /** `standing.player_value` → `current_value` for the focus-area CTA. */
  standingPlayerValue: number | null;
  /** `standing.pga_value` → `computeTargetValue({ playerValue, pgaValue })`. */
  standingPgaValue: number | null;
  /** `standing.team_avg` — the realistic peer target the primary number aims at; null when absent. UI labeling only. */
  standingTeamAvgValue: number | null;
  /** root drivers (composites threaded here; may be []). */
  drivers: RootDriver[];
  /** leaf-level drills when there is no driver layer. */
  drills: DriverLeaf[];
  /** false → render "no drill yet — talk to your coach" instead of a live CTA (Practice-Rx hard-errors with no matching drill). */
  canMakePlan: boolean;
}

/** A theme's data state — drives honest, never-blank scaffold rendering. */
export type ThemeState = 'leak' | 'strength' | 'thin';

/**
 * PLAY G — an HONEST per-category SG TREND, computed read-time by
 * `computeSgTrends` from the player's per-round `golf_rounds.strokes_gained_*`
 * series. Attached only to the 4 SG themes (putting / approach / tee /
 * short_game), and only when there were enough rounds in BOTH the recent and
 * prior windows (see `trend.ts` MIN_WINDOW); otherwise the theme carries no
 * trend at all (never a fabricated direction).
 *
 * SG SIGN CONVENTION: higher SG is better, so `improving` = the recent SG
 * average is HIGHER than the prior window (`delta > 0`). This is the OPPOSITE
 * sign of the lower-is-better scoring trend.
 */
export interface ThemeTrend {
  /** `improving` = recent SG avg up vs prior (higher is better); `declining` = down. */
  direction: 'improving' | 'declining' | 'steady';
  /** mean per-round SG over the most-recent window. */
  recentAvg: number;
  /** mean per-round SG over the window before the recent one. */
  priorAvg: number;
  /** `recentAvg − priorAvg` (signed; > 0 means improving). */
  delta: number;
  /** number of real (non-null) SG samples in the recent window (≥ MIN_WINDOW). */
  recentN: number;
  /** number of real (non-null) SG samples in the prior window (≥ MIN_WINDOW). */
  priorN: number;
}

/**
 * A THEME — one SG-aligned (or outcome) category bucket, anchored on its SG
 * headline metric and sized by per-round SG cross-checked against the SUM of
 * child counterfactual values. The scaffold ALWAYS renders all themes (honest
 * degradation), so a starved category shows a `thin` stub, never a blank.
 */
export interface ThemeNode {
  category: InsightCategory;
  /** SG metric id for the 4 SG themes; null for outcome themes (scoring/course_mgmt/pressure). */
  sgMetricId: MetricId | null;
  displayLabel: string;
  isOutcomeTheme: boolean;
  /**
   * REALISTIC theme magnitude (sign-aware): the realistically-closable
   * strokes/round (gap to TEAM AVERAGE) for a LEAK theme, and 0 for a strength
   * (positive SG never renders as a "cost"). SG/round, when known, is the
   * authoritative category ceiling — identified causes enumerate within it and
   * never exceed it. Drives card order. Built from the causes' team-anchored
   * `strokesSavedPerRound`, NOT the raw Tour gap.
   */
  themeStrokesPerRound: number;
  /** Sum of the causes' raw vs-Tour (PGA ceiling) gaps, for the "gap to Tour ceiling" label. */
  tourGapPerRound: number;
  /** raw SG/round when known (GolfStats.sg*PerRound or golf_rounds.strokes_gained_*); null when unknown. */
  sgPerRound: number | null;
  /** direct causes, ranked by `strokesSavedPerRound` desc. */
  causes: CauseNode[];
  state: ThemeState;
  /**
   * OPTIONAL per-category SG trend (PLAY G). Present only on the 4 SG themes
   * when there were enough rounds in both windows; `null`/omitted otherwise.
   * READ-TIME only — built by `computeSgTrends` and attached by the assembler
   * via `AssembleThemesInput.trendByCategory`. Default (omitted) → no trend.
   */
  trend?: ThemeTrend | null;
}

/** The assembler output — the full scaffold for one player (always all themes). */
export interface AssembledThemes {
  playerId: string;
  themes: ThemeNode[];
  /** total addressable strokes/round across themes (sum of themeStrokesPerRound). */
  totalStrokesPerRound: number;
}
