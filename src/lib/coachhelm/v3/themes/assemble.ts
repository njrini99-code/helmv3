/**
 * ============================================================================
 * CoachHelm v3 · THEMES — read-time assembler
 * ----------------------------------------------------------------------------
 * Pure, deterministic function that re-expands the THEME → DIRECT CAUSE →
 * ROOT DRIVER cascade the engine already produces but the flat read path
 * collapses (sibling dedup). NO IO, NO 'use server', NO Date.now / Math.random.
 *
 * Inputs are the SAME `EvidenceInsight[]` rows the delivery fetchers return
 * plus per-category SG (GolfStats.sg*PerRound). The contract shapes
 * (`AssembledThemes`, `ThemeNode`, `CauseNode`, `RootDriver`, `DriverLeaf`,
 * `ThemeState`) and the taxonomy (`THEME_TAXONOMY`) are LOCKED — this file
 * only produces them.
 *
 * Honesty rules (docs/fairway-coachhelm-insight-rebuild.md):
 *   - `evidence.{counterfactual,standing,source_insight_ids,composite_rule_id}`
 *     are injected at RUNTIME and are NOT on the base evidence type, so we read
 *     them via the `AssembledEvidence` cast and null-guard every access.
 *   - A suppressed/absent counterfactual contributes 0 strokes and flips
 *     `counterfactualSuppressed: true` — we NEVER fabricate a stroke number.
 *   - A composite row's `source_insight_ids` leaves are demoted out of the
 *     top level and re-attached as that cause's `drivers` (the parent→child
 *     edges the synthesis already stored).
 * ========================================================================== */

import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import {
  THEME_TAXONOMY,
  getThemeDef,
  themeScaffoldIndex,
} from '@/lib/coachhelm/v3/themes/taxonomy';
import type {
  AssembledEvidence,
  AssembledStanding,
  AssembledThemes,
  CauseNode,
  DriverLeaf,
  RootDriver,
  ThemeNode,
  ThemeState,
  ThemeTrend,
} from '@/lib/coachhelm/v3/themes/types';

/** Strokes-per-round floor below which a theme has no material leak cause. */
const LEAK_FLOOR = 0.3;

/** Below this player↔PGA span the standing has no usable orientation → fall back to the full Tour gap. */
const TEAM_FRACTION_DENOM_EPS = 1e-6;

/**
 * SORT-ONLY ranking floor (PLAY: team-wide-weakness rescue). `realisticTeamGap`
 * collapses to ~0 when the player sits at their team average — which correctly
 * de-prioritises "you're average on your team", but WRONGLY hides a real gap when
 * the whole team is weak at that skill (team_avg far from PGA). A roster backtest
 * found 54% of real Tour gaps were zeroed this way. We floor the SORT key (not the
 * displayed magnitude) at this fraction of the raw Tour gap so a genuine gap keeps
 * a minimum ranking weight and stays visible. Conservative: a real personal leak
 * (large `strokesSavedPerRound`) still outranks a floored team-wide gap; this only
 * rescues gaps that would otherwise rank as exactly 0. At 0.15, a genuine personal
 * leak (realistic ≳ 0.45 strokes) still outranks even a large team-wide gap, so the
 * #1 slot stays a real personal-gain cause when one exists — team-wide gaps surface
 * below it (visible, not buried), rather than topping the list with a 0 display.
 */
const RANK_LEVERAGE_FLOOR = 0.15;

/** SORT-ONLY ranking weight for a cause: its realistic magnitude, floored so a real
 *  Tour gap zeroed by teamFraction never ranks as 0. Display value is untouched. */
function causeRankKey(strokesSavedPerRound: number, tourGapPerRound: number | null): number {
  const floor = tourGapPerRound != null && Number.isFinite(tourGapPerRound) && tourGapPerRound > 0
    ? RANK_LEVERAGE_FLOOR * tourGapPerRound
    : 0;
  return Math.max(strokesSavedPerRound, floor);
}

/**
 * REALISTIC team-anchored stroke value for a cause.
 *
 * Product framing: the two honest baselines are PGA (the ceiling) and the
 * player's TEAM AVERAGE (the realistic peer target). The upstream counterfactual
 * (`tourGap`) measures the full gap to the PGA/Tour ceiling. The PRIMARY number
 * we rank/size/display is the realistic gap to TEAM AVERAGE, computed as the
 * fraction of that Tour gap that sits between the player and their team avg:
 *
 *   teamFraction = clamp( (player_value - team_avg) / (player_value - pga_value), 0, 1 )
 *   realistic    = tourGap * teamFraction
 *
 * Why this is correct and direction-agnostic: numerator and denominator share
 * the SAME orientation (both measured from `player_value`), so for a "lower is
 * better" metric (3-putts) and a "higher is better" metric (GIR%) the ratio is
 * the same positive fraction — the signs cancel. The fraction is the share of
 * the player→PGA distance the player has yet to make up just to reach their own
 * team's average.
 *
 * Guards (each → teamFraction = 1, i.e. NO team reference, fall back to the full
 * Tour gap, which the UI labels honestly as "to Tour"):
 *   - team_avg, player_value, or pga_value is null
 *   - |player_value - pga_value| < eps (player already at the ceiling → no span)
 *
 * Already-beating-team case: if the player is at or better than the team average
 * on this metric, the numerator flips sign (player→team-avg points the opposite
 * way from player→PGA), so the ratio is ≤ 0 and clamps to 0 — there is NO
 * realistic gain to be had versus peers, and PGA remains the (separate) ceiling.
 *
 * `tourGap` null/0 (suppressed/absent counterfactual) → 0, regardless of the
 * team math (we never fabricate a stroke number).
 */
function realisticTeamGap(
  tourGap: number | null,
  standing: AssembledStanding | null | undefined,
): number {
  if (tourGap == null || !Number.isFinite(tourGap)) return 0;

  const playerValue = standing?.player_value ?? null;
  const teamAvg = standing?.team_avg ?? null;
  const pgaValue = standing?.pga_value ?? null;

  // No usable team reference → fall back to the full Tour gap (teamFraction = 1).
  if (playerValue == null || teamAvg == null || pgaValue == null) return tourGap;
  const denom = playerValue - pgaValue;
  if (Math.abs(denom) < TEAM_FRACTION_DENOM_EPS) return tourGap;

  const teamFraction = clamp01((playerValue - teamAvg) / denom);
  return tourGap * teamFraction;
}

/** Clamp to [0, 1] (NaN-safe → 0). */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Canonicalize a metric id to its *subject* so cross-version aliases collapse
 * to one cause (ASM-1). The v2 generator emits `par_scoring_par4` for the same
 * subject the v3 generator emits as `scoring_par_4`; without this the two
 * render as two separate scoring causes for the same par-4 leak. Lower-cased,
 * with the legacy `par_scoring_parN` form mapped onto the v3 `scoring_par_N`
 * form. A null/empty metric returns '' (never dedup-collapses with another).
 */
function canonicalMetricSubject(metric: string | null | undefined): string {
  if (!metric) return '';
  const m = metric.toLowerCase();
  const v2Par = m.match(/^par_scoring_par(\d)$/);
  if (v2Par) return `scoring_par_${v2Par[1]}`;
  return m;
}

/**
 * Read-time prose hygiene. The engine generators bake two authoring artifacts
 * into insight copy that must never reach a user:
 *   • internal "(Research doc §N)" / "Per Research doc §N …" citations, and
 *   • a dangling "The standing card below shows …" sentence — the themes UI
 *     renders no standing card, so that reference points at nothing.
 * This strips both from displayed cause content + driver prose. It is the
 * read-time complement to cleaning the generators at the source (which only
 * takes effect after a prod insight re-gen); applied here, the ~hundreds of
 * already-stored rows read cleanly immediately. Pure + idempotent.
 */
export function sanitizeProse(text: string | null | undefined): string {
  if (!text) return '';
  return text
    // parenthetical internal citation: "… (Research doc §9) …"
    .replace(/\s*\([^)]*Research doc[^)]*\)/gi, '')
    // inline citation sentence: "Per Research doc §4 …."
    .replace(/\s*Per Research doc[^.]*\.?/gi, '')
    // dangling standing-card/strip reference sentence (no such card is rendered)
    .replace(/\s*The standing (?:card|strip)[^.]*\.?/gi, '')
    // tidy the seams left behind
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

/**
 * Coaching-grade NLG template (Phase G). Assembles a DATA FACT, a DRIVER (what
 * the number means — the cause, not a restatement), and a specific ACTION into
 * one clean, sanitized passage. Caller supplies the data-derived strings; this
 * helper owns only the joining, terminal-punctuation hygiene, and a final
 * sanitizeProse pass so no authoring artifact can slip through. Empty/omitted
 * clauses drop cleanly. Pure + idempotent.
 */
export function composeDriverPrescription(parts: {
  fact: string;
  driver?: string;
  action?: string;
}): string {
  const clause = (s: string | undefined): string => {
    const t = (s ?? '').trim();
    if (!t) return '';
    return /[.!?]$/.test(t) ? t : `${t}.`;
  };
  const joined = [clause(parts.fact), clause(parts.driver), clause(parts.action)]
    .filter((c) => c.length > 0)
    .join(' ');
  return sanitizeProse(joined);
}

export interface AssembleThemesInput {
  playerId: string;
  rows: EvidenceInsight[];
  sgByCategory: Partial<Record<InsightCategory, number | null>>;
  /**
   * OPTIONAL shot-level root drivers per category (PLAY C). Built read-time by
   * `buildShotDrivers` from already-fetched raw shot rows. When present, the
   * drivers for a category are appended to the TOP-RANKED cause of that category
   * (after any composite drivers) so a standalone cause's expand surfaces a real
   * shot pattern. Attached ONLY when the category has ≥1 cause — a category with
   * shot drivers but no cause attaches to nothing (we never invent a cause).
   *
   * DEFAULT (omitted) → behavior is identical to before this field existed; the
   * function stays pure and deterministic.
   */
  shotDriversByCategory?: Partial<Record<InsightCategory, RootDriver[]>>;
  /**
   * OPTIONAL per-category SG TREND (PLAY G). Built read-time by `computeSgTrends`
   * from the player's per-round `golf_rounds.strokes_gained_*` series. When a
   * category has a trend AND it matches a theme, the trend is attached to that
   * `ThemeNode.trend`. Only the 4 SG categories ever carry a trend (outcome
   * themes get none). Honest: a category with too-few rounds in either window is
   * absent here, so its theme gets no trend (never a fabricated direction).
   *
   * DEFAULT (omitted) → behavior is identical to before this field existed; the
   * function stays pure, deterministic, and byte-identical in output.
   */
  trendByCategory?: Partial<Record<InsightCategory, ThemeTrend>>;
}

/**
 * Re-expand the hierarchical theme tree from flat insight rows + per-category
 * SG. Pure and deterministic: identical input → identical output.
 */
export function assembleThemes(input: AssembleThemesInput): AssembledThemes {
  const { playerId, rows, sgByCategory } = input;
  const shotDriversByCategory = input.shotDriversByCategory ?? {};
  const trendByCategory = input.trendByCategory ?? {};

  // 1. Index every row by id.
  const byId = new Map<string, EvidenceInsight>();
  for (const row of rows) {
    if (row?.id) byId.set(row.id, row);
  }

  // 2. Classify composites + decide which claimed leaves get DEMOTED.
  //    PER-CATEGORY STROKE CONSERVATION (Change 2): a composite only OWNS (demotes
  //    and absorbs the strokes of) the leaves whose category EQUALS the composite's
  //    own category. A claimed leaf in a DIFFERENT category is NOT demoted — it
  //    stays a top-level cause in its OWN theme (its strokes stay there, never
  //    deleted, never double-counted) and is merely REFERENCED by the composite as
  //    a cross-theme driver link. This is what keeps strokes conserved per category
  //    and stops a cross-category composite from silently deleting a leaf's strokes.
  //
  //    `demotedLeafOwner` maps a demoted leaf id → the FIRST composite id that
  //    claimed it (same-category). A leaf is demoted at most once, and its strokes
  //    are absorbed by exactly that one owning composite — so even if two
  //    same-category composites both claim a leaf, its strokes are NOT double-counted.
  //    `claimedLeafIds` = every leaf any composite references (for driver threading).
  const demotedLeafOwner = new Map<string, string>();
  const claimedLeafIds = new Set<string>();
  for (const row of rows) {
    if (!row?.id) continue;
    const ev = readEvidence(row);
    if (!isComposite(ev)) continue;
    const compositeCategory = row.category ?? null;
    for (const leafId of ev.source_insight_ids ?? []) {
      if (typeof leafId !== 'string' || leafId.length === 0) continue;
      claimedLeafIds.add(leafId);
      const leaf = byId.get(leafId);
      // Demote ONLY a same-category leaf (a real, resolvable row). A dangling or
      // cross-category leaf is never demoted. First claimant wins ownership.
      if (
        leaf &&
        leaf.category != null &&
        leaf.category === compositeCategory &&
        !demotedLeafOwner.has(leafId)
      ) {
        demotedLeafOwner.set(leafId, row.id);
      }
    }
  }
  const demotedLeafIds: ReadonlySet<string> = new Set(demotedLeafOwner.keys());

  // 3. Top-level rows = rows NOT demoted into a composite. Build a CauseNode for
  //    each; resolve composite drivers (same- AND cross-category) via byId. The
  //    realistic team-anchored strokes are computed inside buildCause; a composite
  //    additionally sums the realistic strokes of its DEMOTED (same-category) leaves
  //    so the cascade carries real weight without double-counting (those leaves are
  //    no longer top-level, so their strokes live only on the composite now).
  // 2b. ASM-1 — cross-metric/same-subject dedup. The v2 generator emits
  //     `par_scoring_par4` for the SAME subject the v3 generator emits as
  //     `scoring_par_4`; both would otherwise render as two top-level causes in
  //     the Scoring theme. Collapse a (category, canonicalSubject) collision to
  //     ONE winner: prefer the row whose raw metric already IS the canonical
  //     (v3) form, then larger |strokes_impact|, then lexically-smaller id —
  //     fully deterministic and pure (input-order-independent). Only rows whose
  //     RAW metrics actually DIFFER but share a canonical subject are deduped
  //     (a real alias collision); two rows with the same raw metric are left to
  //     the existing path. Losers are suppressed from the top level (their
  //     strokes are NOT re-homed — they are duplicates of the kept row).
  const aliasSuppressedRowIds = new Set<string>();
  const subjectGroups = new Map<string, EvidenceInsight[]>();
  for (const row of rows) {
    if (!row?.id) continue;
    if (demotedLeafIds.has(row.id)) continue;
    if (!row.category) continue;
    const ev = readEvidence(row);
    const metric = typeof ev.metric === 'string' ? ev.metric : null;
    const subject = canonicalMetricSubject(metric);
    if (!subject) continue; // no metric → never an alias collision
    const key = `${row.category} ${subject}`;
    const g = subjectGroups.get(key);
    if (g) g.push(row);
    else subjectGroups.set(key, [row]);
  }
  for (const group of subjectGroups.values()) {
    if (group.length < 2) continue;
    // Only a genuine alias collision (≥2 distinct RAW metric strings) is deduped.
    const rawMetrics = new Set(
      group.map((r) => (readEvidence(r).metric as string | undefined) ?? ''),
    );
    if (rawMetrics.size < 2) continue;
    const winner = group.slice().sort((a, b) => {
      const aEv = readEvidence(a);
      const bEv = readEvidence(b);
      const aCanonical = ((aEv.metric as string | undefined) ?? '').toLowerCase() ===
        canonicalMetricSubject(aEv.metric as string | undefined);
      const bCanonical = ((bEv.metric as string | undefined) ?? '').toLowerCase() ===
        canonicalMetricSubject(bEv.metric as string | undefined);
      if (aCanonical !== bCanonical) return aCanonical ? -1 : 1;
      const aImpact = Math.abs(Number(aEv.strokes_impact ?? 0));
      const bImpact = Math.abs(Number(bEv.strokes_impact ?? 0));
      if (bImpact !== aImpact) return bImpact - aImpact;
      return a.id.localeCompare(b.id);
    })[0];
    if (!winner) continue;
    for (const r of group) {
      if (r.id !== winner.id) aliasSuppressedRowIds.add(r.id);
    }
  }

  const causesByCategory = new Map<InsightCategory, CauseNode[]>();
  for (const row of rows) {
    if (!row?.id) continue;
    if (demotedLeafIds.has(row.id)) continue; // demoted same-category leaf — not top level
    if (aliasSuppressedRowIds.has(row.id)) continue; // ASM-1 alias duplicate — keep the winner only
    if (!row.category) continue; // null/unknown category → skip (don't invent a theme)
    if (!getThemeDef(row.category)) continue; // unknown category → skip

    const cause = buildCause(row, byId, row.category, demotedLeafOwner);
    const bucket = causesByCategory.get(row.category);
    if (bucket) bucket.push(cause);
    else causesByCategory.set(row.category, [cause]);
  }

  // Per-cause |strokes_impact| for the ranking tiebreak (kept off the contract
  // CauseNode shape, so we capture it here from the source row's evidence).
  const impactById = new Map<string, number>();
  for (const row of rows) {
    if (!row?.id) continue;
    const ev = readEvidence(row);
    impactById.set(row.id, Math.abs(Number(ev.strokes_impact ?? 0)));
  }

  // 4-7. Build one ThemeNode per taxonomy entry, then gate empty outcome themes.
  // SORT-ONLY rank keys (never displayed) live here so a real-loss/outcome theme
  // whose causes were all zeroed by teamFraction still sorts into visibility.
  const themeRankKeys = new Map<ThemeNode, number>();
  const themes: ThemeNode[] = THEME_TAXONOMY.flatMap((def): ThemeNode[] => {
    const causes = (causesByCategory.get(def.category) ?? []).slice();

    // 5. Rank causes: strokesSavedPerRound (realistic) desc → |strokes_impact| desc → title.
    causes.sort((a, b) => rankCauses(a, b, impactById));

    // 5b. PLAY C — attach shot-level drivers to the MOST RELEVANT cause (the
    //     now top-ranked cause), APPENDED after any composite drivers. Only when
    //     the category actually has a cause to anchor on (we never invent one).
    //     Pure: the input shot-drivers are precomputed deterministically upstream.
    const shotDrivers = shotDriversByCategory[def.category];
    const topCause = causes[0];
    if (shotDrivers && shotDrivers.length > 0 && topCause) {
      topCause.drivers = [...topCause.drivers, ...shotDrivers];
    }

    // 6. SIGN-AWARE, SINGLE-SOURCE theme sizing on the REALISTIC cause values.
    //    `themeStrokesPerRound` is a college-realistic LEAK magnitude — 0 for a
    //    strength (positive SG is never a "cost"); when SG is a real loss it is
    //    the authoritative ceiling causes enumerate WITHIN (never exceed); when
    //    SG is unknown we take the DOMINANT single cause rather than free-summing
    //    overlapping sub-metric counterfactuals (which double-counts).
    const sgPerRound = sgByCategory[def.category] ?? null;
    const realisticChildSum = causes.reduce((acc, c) => acc + c.strokesSavedPerRound, 0);
    const dominantCause = causes.reduce((max, c) => Math.max(max, c.strokesSavedPerRound), 0);

    let themeStrokesPerRound: number;
    if (sgPerRound != null && sgPerRound > 0) {
      // STRENGTH — gaining vs baseline; never a cost.
      themeStrokesPerRound = 0;
    } else if (sgPerRound != null) {
      // Real category loss (sg ≤ 0): SG/round is the authoritative ceiling.
      themeStrokesPerRound = Math.min(realisticChildSum, Math.abs(sgPerRound));
    } else {
      // SG unknown (outcome themes, or SG theme with no SG data): the dominant
      // single cause, not the sum, to avoid over-summing overlapping metrics.
      themeStrokesPerRound = dominantCause;
    }

    // Theme-level honest "gap to Tour ceiling" = Σ causes' raw Tour gaps.
    const tourGapPerRound = causes.reduce((acc, c) => acc + (c.tourGapPerRound ?? 0), 0);

    // 7. Theme state (reconciled to the same realistic basis).
    const state = deriveState(causes, sgPerRound);

    const theme: ThemeNode = {
      category: def.category,
      sgMetricId: def.sgMetricId,
      displayLabel: def.displayLabel,
      isOutcomeTheme: def.isOutcomeTheme,
      themeStrokesPerRound,
      tourGapPerRound,
      sgPerRound,
      causes,
      state,
    };

    // PLAY G — attach the per-category SG trend when one was supplied for this
    // category. We only SET the key when a trend exists, so the default
    // (omitted input) leaves the output object byte-identical to before. Only
    // the 4 SG categories ever appear in `trendByCategory`; outcome themes get
    // none. Honest: a category absent from the map (too-few rounds) gets no trend.
    const trend = trendByCategory[def.category];
    if (trend) theme.trend = trend;

    // SORT-ONLY theme rank key: a strength (positive SG) is never a leak (0); any
    // other theme is floored at RANK_LEVERAGE_FLOOR × its biggest cause's Tour gap
    // so a real-loss/outcome theme whose causes were all zeroed by teamFraction
    // still sorts into visibility. themeStrokesPerRound (the displayed magnitude)
    // is untouched.
    const isStrength = sgPerRound != null && sgPerRound > 0;
    const dominantCauseTourGap = causes.reduce((m, c) => Math.max(m, c.tourGapPerRound ?? 0), 0);
    themeRankKeys.set(
      theme,
      isStrength ? 0 : Math.max(themeStrokesPerRound, RANK_LEVERAGE_FLOOR * dominantCauseTourGap),
    );

    // ITEM 5 — gate empty outcome themes. The 3 outcome themes (scoring /
    // course_management / pressure) have no SG metric and would otherwise be
    // permanent thin stubs; only emit them when they carry ≥1 cause. The 4 SG
    // themes are ALWAYS emitted (they carry SG context even with no causes).
    if (def.isOutcomeTheme && causes.length === 0) return [];
    return [theme];
  });

  // 8. Sort themes by the SORT-ONLY rank key desc (floors zeroed-but-real themes
  //    into visibility), tiebreak on the displayed magnitude, then stable scaffold
  //    index asc. The displayed themeStrokesPerRound is unchanged.
  themes.sort((a, b) => {
    const aKey = themeRankKeys.get(a) ?? a.themeStrokesPerRound;
    const bKey = themeRankKeys.get(b) ?? b.themeStrokesPerRound;
    if (bKey !== aKey) return bKey - aKey;
    if (b.themeStrokesPerRound !== a.themeStrokesPerRound) {
      return b.themeStrokesPerRound - a.themeStrokesPerRound;
    }
    return themeScaffoldIndex(a.category) - themeScaffoldIndex(b.category);
  });

  // Sum ONLY the 4 SG themes. The outcome themes (Big Numbers, Pressure) are
  // re-cuts of the same strokes the SG themes already count, so including them
  // double-counts the player's total leak. SG categories partition strokes-
  // gained, so their sum is the honest per-round total.
  const totalStrokesPerRound = themes.reduce(
    (acc, t) => acc + (t.isOutcomeTheme ? 0 : t.themeStrokesPerRound),
    0,
  );

  return { playerId, themes, totalStrokesPerRound };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Private helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** Cast `row.evidence` to the runtime-real shape; null-safe. */
function readEvidence(row: EvidenceInsight | undefined): AssembledEvidence {
  const ev = row?.evidence as unknown as AssembledEvidence | null | undefined;
  return ev && typeof ev === 'object' ? ev : {};
}

/** A row is a composite when it claims leaves OR carries a composite rule id. */
function isComposite(ev: AssembledEvidence): boolean {
  const ids = ev.source_insight_ids;
  const hasLeaves = Array.isArray(ids) && ids.length > 0;
  const hasRule = typeof ev.composite_rule_id === 'string' && ev.composite_rule_id.length > 0;
  return hasLeaves || hasRule;
}

/**
 * RAW vs-Tour gap for a cause: the un-discounted upstream
 * `counterfactual.strokes_saved_per_round` (gap to the PGA-Tour ceiling), or
 * null when there is no usable counterfactual (suppressed / absent / NaN). This
 * is the honest "gap to Tour ceiling" number — NEVER framed as strokes lost.
 */
function tourGapOf(ev: AssembledEvidence): number | null {
  const cf = ev.counterfactual;
  if (cf && cf.suppressed !== true) {
    const v = cf.strokes_saved_per_round;
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/** Map an insight's attached drills to plan-leaf shape (already ≤3 from delivery). */
function toDriverLeaves(row: EvidenceInsight | undefined): DriverLeaf[] {
  const drills = row?.drills ?? [];
  return drills.map((d) => ({ drill_id: d.id, slug: d.slug, title: d.title }));
}

/**
 * Build a CauseNode (with composite drivers threaded in) from a top-level row.
 *
 * `demotedLeafOwner` maps each demoted (same-category) leaf id → the id of the
 * single composite that OWNS it. It is used here to size a composite's realistic
 * weight: a composite's `strokesSavedPerRound` = Σ realistic strokes of the
 * leaves IT owns — see Change 2 in the file header. Ownership is unique, so a
 * leaf claimed by two composites contributes its strokes only once. A
 * non-composite cause sizes to its own team-anchored realistic gap.
 */
function buildCause(
  row: EvidenceInsight,
  byId: Map<string, EvidenceInsight>,
  category: InsightCategory,
  demotedLeafOwner: ReadonlyMap<string, string>,
): CauseNode {
  const ev = readEvidence(row);
  const metric = typeof ev.metric === 'string' ? ev.metric : null;
  const standing = ev.standing ?? null;

  const ownCounterfactualSuppressed = !ev.counterfactual || ev.counterfactual.suppressed === true;
  // Honest raw gap to the PGA/Tour ceiling (null when suppressed/absent), and the
  // REALISTIC gap to TEAM AVERAGE used for ranking/sizing/display. We do NOT
  // re-apply the 0.3 stat-noise floor here — upstream already applied it on the
  // raw Tour value; re-suppressing the (smaller) realistic value would over-thin.
  const tourGapPerRound = tourGapOf(ev);
  const ownRealistic = realisticTeamGap(tourGapPerRound, standing);

  // Composite drivers: resolve each CLAIMED leaf via byId; tolerate dangling refs.
  // Both same-category (demoted) and cross-category (still top-level elsewhere)
  // leaves render as driver links so the THEME→CAUSE→DRIVER cascade stays visible.
  const composite = isComposite(ev);
  let drivers: RootDriver[] = [];
  // Composite weight: sum the realistic strokes of the SAME-CATEGORY leaves THIS
  // composite demoted. Those leaves are no longer top-level, so their strokes are
  // conserved here with no double-count. Cross-category leaves are excluded — they
  // keep their strokes in their own theme. If a composite has no same-category
  // leaves this stays 0 and the composite renders as a pure narrative link.
  let compositeSameCategoryStrokes = 0;
  let compositeSameCategoryTourGap = 0;
  let compositeOwnedLeafCount = 0;
  if (composite) {
    const ruleId = typeof ev.composite_rule_id === 'string' ? ev.composite_rule_id : undefined;
    drivers = (ev.source_insight_ids ?? [])
      .map((leafId): RootDriver | null => {
        const leaf = byId.get(leafId);
        if (!leaf) return null; // dangling ref — skip honestly
        // Accrue weight only from the leaves THIS composite OWNS (same category and
        // this row is the unique owner). Ownership is unique per leaf, so a leaf
        // claimed by two composites is counted exactly once, on its owner. We sum
        // BOTH the realistic team-gap AND the raw Tour gap from the SAME leaves, so
        // the composite's "to Tour ceiling" is the conserved sum of its leaves'
        // Tour gaps — never its own (usually absent) counterfactual. This keeps the
        // realistic ≤ Tour invariant intact (each leaf's realistic ≤ its Tour gap).
        if (leaf.category === category && demotedLeafOwner.get(leaf.id) === row.id) {
          const leafEv = readEvidence(leaf);
          const leafTourGap = tourGapOf(leafEv);
          compositeSameCategoryStrokes += realisticTeamGap(leafTourGap, leafEv.standing ?? null);
          compositeSameCategoryTourGap += leafTourGap ?? 0;
          compositeOwnedLeafCount += 1;
        }
        return {
          source: 'composite',
          composite_rule_id: ruleId,
          source_insight_ids: [leaf.id],
          title: leaf.title,
          prose: sanitizeProse(leaf.content),
          drills: toDriverLeaves(leaf),
        };
      })
      .filter((d): d is RootDriver => d !== null);
  }

  // A composite's display/ranking weight AND its Tour-ceiling number are the
  // conserved sums of its demoted same-category leaves (NOT its own often-absent
  // counterfactual), so the realistic ≤ Tour invariant holds. A normal cause uses
  // its own realistic team gap + own Tour gap. A composite that owns no
  // same-category leaves falls back to its own values (both typically 0/null).
  const ownsLeaves = composite && compositeOwnedLeafCount > 0;

  // Ctx-driven composite (closing-hole-fatigue, doubles-after-bogey,
  // front-9-starter): no source-insight leaves to absorb AND no own
  // counterfactual, but the rule computed a real per-round `strokes_impact`.
  // Fall back to that so the cause carries a number + "Make it a plan" CTA
  // instead of collapsing to a numberless "Tendency" chip (and so its theme,
  // e.g. Scoring, is sized to a real magnitude rather than 0).
  const ownImpactPerRound = Math.abs(Number(ev.strokes_impact ?? 0));
  const ctxFallbackStrokes =
    composite && !ownsLeaves && tourGapPerRound == null && ownImpactPerRound > 0
      ? ownImpactPerRound
      : 0;

  const strokesSavedPerRound = ownsLeaves
    ? compositeSameCategoryStrokes
    : ctxFallbackStrokes > 0
      ? ctxFallbackStrokes
      : ownRealistic;
  const finalTourGapPerRound = ownsLeaves
    ? compositeSameCategoryTourGap
    : ctxFallbackStrokes > 0
      ? ctxFallbackStrokes
      : tourGapPerRound;

  return {
    insight_id: row.id,
    metric,
    title: row.title,
    content: sanitizeProse(row.content),
    strokesSavedPerRound,
    rankKey: causeRankKey(strokesSavedPerRound, finalTourGapPerRound),
    tourGapPerRound: finalTourGapPerRound,
    // A composite that OWNS leaves (or a ctx composite with its own computed
    // per-round strokes) carries a real magnitude and must NOT read as
    // suppressed, even though the parent row has no own counterfactual.
    counterfactualSuppressed:
      (ownsLeaves && strokesSavedPerRound > 0) || ctxFallbackStrokes > 0
        ? false
        : ownCounterfactualSuppressed,
    standingPlayerValue: standing?.player_value ?? null,
    standingPgaValue: standing?.pga_value ?? null,
    standingTeamAvgValue: standing?.team_avg ?? null,
    drivers,
    drills: toDriverLeaves(row),
    canMakePlan: metric != null,
  };
}

/** Cause comparator: floored rank key desc → realistic magnitude desc → |strokes_impact|
 *  desc → title asc. The rank key floors a real Tour gap zeroed by teamFraction so a
 *  team-wide weakness stays visible; the realistic magnitude (display value) is the
 *  next tiebreak so genuine personal leaks still order correctly among themselves. */
function rankCauses(
  a: CauseNode,
  b: CauseNode,
  impactById: Map<string, number>,
): number {
  const aKey = a.rankKey ?? a.strokesSavedPerRound;
  const bKey = b.rankKey ?? b.strokesSavedPerRound;
  if (bKey !== aKey) return bKey - aKey;
  if (b.strokesSavedPerRound !== a.strokesSavedPerRound) {
    return b.strokesSavedPerRound - a.strokesSavedPerRound;
  }
  // tiebreak on the (frequently-zero) base impact magnitude
  const aImpact = impactById.get(a.insight_id) ?? 0;
  const bImpact = impactById.get(b.insight_id) ?? 0;
  if (bImpact !== aImpact) return bImpact - aImpact;
  // final stability tiebreak
  return a.title.localeCompare(b.title);
}

/**
 * Theme state (honest, never-blank), reconciled to the SAME realistic basis as
 * `themeStrokesPerRound`. `LEAK_FLOOR` (0.3 strokes/round) is the materiality
 * threshold throughout: signals below it are real-but-immaterial, so we don't
 * shout about them, but we also don't mislabel them as a strength.
 *
 *   - `strength` : positive SG (> LEAK_FLOOR, a real gain vs baseline) AND no
 *                  realistic leak cause. A positive-SG category NEVER reads as a
 *                  leak. (`themeStrokesPerRound` is 0 in this branch.)
 *   - `leak`     : a material realistic magnitude (`themeStrokesPerRound >=
 *                  LEAK_FLOOR`) OR a material SG loss (`sgPerRound < -LEAK_FLOOR`).
 *   - `thin`     : everything else — no material signal either way (incl. a
 *                  small-but-real <LEAK_FLOOR signal, which is shown as a stub
 *                  rather than over-claimed as a strength or a leak).
 */
function deriveState(causes: CauseNode[], sgPerRound: number | null): ThemeState {
  const hasCauses = causes.length > 0;

  // `thin` ONLY when there is genuinely nothing to show: NO surfaced cause AND no
  // material SG signal. A theme that HAS causes is NEVER thin — the thin branch
  // hides the cause cascade, so a surfaced cause must never be routed here. (This
  // was the conflicting-signal bug: a net-positive-SG category with a real
  // sub-leak cause, and any causes-bearing theme whose realistic magnitude fell
  // below the floor, dropped to `thin` and its causes vanished.)
  if (!hasCauses && (sgPerRound == null || Math.abs(sgPerRound) < LEAK_FLOOR)) {
    return 'thin';
  }
  // A material net gain → `strength`. Positive SG never renders as a cost; any
  // causes still render beneath as "sharpen-further" items (ThemeCard shows the
  // cascade in EVERY non-thin state) — they are simply not framed as leaks.
  if (sgPerRound != null && sgPerRound > LEAK_FLOOR) {
    return 'strength';
  }
  // Otherwise — a material SG loss, or a surfaced cause to address → `leak`.
  // Causes are always visible; the ThemeCard headline stays neutral (no "to
  // gain" claim) when themeStrokesPerRound is 0.
  return 'leak';
}
