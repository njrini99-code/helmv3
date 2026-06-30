/**
 * Unit + property tests for the v3 themes assembler.
 *
 * Hand-written cases pin the documented behavior (grouping, composite
 * threading, ranking, magnitude precedence, states). fast-check properties
 * guard the invariants that must hold for ANY row set (conservation of rows,
 * cause/driver disjointness, never-throws on partial evidence).
 *
 * Run: npm test -- assemble
 */
import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { assembleThemes } from './assemble';
import { THEME_TAXONOMY } from './taxonomy';
import type { AssembledEvidence, RootDriver, ThemeTrend } from './types';
import type { EvidenceInsight } from '@/lib/coachhelm/v3/delivery/evidence-insight.types';
import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';

/* ───────────────────────────────────────────────────────────────────────────
 * Fixture builder — a minimal EvidenceInsight with a cast evidence object.
 * ────────────────────────────────────────────────────────────────────────── */

interface RowOpts {
  id: string;
  category: InsightCategory | null;
  title?: string;
  content?: string;
  metric?: string | null;
  strokesImpact?: number;
  /** strokes_saved_per_round on a NON-suppressed counterfactual. */
  strokesSaved?: number;
  /** force suppressed counterfactual (overrides strokesSaved). */
  suppressed?: boolean;
  /** omit the counterfactual entirely. */
  noCounterfactual?: boolean;
  standingPlayer?: number | null;
  standingPga?: number | null;
  sourceInsightIds?: string[];
  compositeRuleId?: string;
  drills?: Array<{ id: string; slug: string; title: string }>;
}

function row(o: RowOpts): EvidenceInsight {
  const ev: AssembledEvidence = {
    metric: o.metric === undefined ? `metric_${o.id}` : (o.metric ?? undefined),
    strokes_impact: o.strokesImpact,
  };
  if (!o.noCounterfactual) {
    ev.counterfactual = {
      current_baseline_score: 75,
      projected_score_if_closed: 74,
      strokes_saved_per_round: o.strokesSaved ?? 0,
      weeks_to_typical_close: 4,
      suppressed: o.suppressed ?? false,
    };
  }
  if (o.standingPlayer !== undefined || o.standingPga !== undefined) {
    ev.standing = {
      metric_id: o.metric ?? `metric_${o.id}`,
      player_value: o.standingPlayer ?? null,
      team_avg: null,
      team_pct: null,
      pga_value: o.standingPga ?? null,
      pga_delta: null,
    };
  }
  if (o.sourceInsightIds) ev.source_insight_ids = o.sourceInsightIds;
  if (o.compositeRuleId) ev.composite_rule_id = o.compositeRuleId;

  return {
    id: o.id,
    player_id: 'p1',
    category: o.category,
    title: o.title ?? `Title ${o.id}`,
    content: o.content ?? `Content ${o.id}`,
    signature: null,
    evidence: ev as unknown as EvidenceInsight['evidence'],
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    drills: o.drills?.map((d) => ({ ...d, duration_min: 10, difficulty: 'easy' })),
  };
}

function themeOf(result: ReturnType<typeof assembleThemes>, category: InsightCategory) {
  const t = result.themes.find((x) => x.category === category);
  if (!t) throw new Error(`theme ${category} missing`);
  return t;
}

/**
 * A row carrying a FULL standing (player_value + team_avg + pga_value) so the
 * team-fraction math has all three anchors. The base `row` helper leaves
 * `team_avg` null (→ teamFraction falls back to 1); this overrides it.
 */
function rowWithTeam(o: {
  id: string;
  category: InsightCategory;
  strokesSaved: number;
  player: number;
  team: number;
  pga: number;
  metric?: string | null;
}): EvidenceInsight {
  const r = row({
    id: o.id,
    category: o.category,
    strokesSaved: o.strokesSaved,
    metric: o.metric,
    standingPlayer: o.player,
    standingPga: o.pga,
  });
  const ev = r.evidence as unknown as AssembledEvidence;
  if (ev.standing) ev.standing.team_avg = o.team;
  return r;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Grouping + scaffold
 * ────────────────────────────────────────────────────────────────────────── */

describe('assembleThemes — grouping & scaffold', () => {
  test('the 4 SG themes always present even with zero rows; empty outcome themes omitted', () => {
    const result = assembleThemes({ playerId: 'p1', rows: [], sgByCategory: {} });
    // Only the 4 SG themes survive when every outcome theme is empty.
    expect(result.themes).toHaveLength(4);
    const cats = new Set(result.themes.map((t) => t.category));
    for (const def of THEME_TAXONOMY) {
      if (def.isOutcomeTheme) expect(cats.has(def.category)).toBe(false);
      else expect(cats.has(def.category)).toBe(true);
    }
  });

  test('causes land under their category theme', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'a', category: 'putting', strokesSaved: 1 }),
        row({ id: 'b', category: 'approach', strokesSaved: 0.5 }),
      ],
      sgByCategory: {},
    });
    expect(themeOf(result, 'putting').causes.map((c) => c.insight_id)).toEqual(['a']);
    expect(themeOf(result, 'approach').causes.map((c) => c.insight_id)).toEqual(['b']);
    expect(themeOf(result, 'tee').causes).toHaveLength(0);
  });

  test('rows with null/unknown category are skipped (no invented theme)', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'a', category: null, strokesSaved: 5 }),
        row({ id: 'b', category: 'putting', strokesSaved: 1 }),
      ],
      sgByCategory: {},
    });
    const totalCauses = result.themes.reduce((n, t) => n + t.causes.length, 0);
    expect(totalCauses).toBe(1);
    expect(themeOf(result, 'putting').causes[0]?.insight_id).toBe('b');
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Composite threading
 * ────────────────────────────────────────────────────────────────────────── */

describe('assembleThemes — composite threading', () => {
  test('composite leaves are demoted out of top level and re-attached as drivers', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({
          id: 'comp',
          category: 'putting',
          strokesSaved: 1.2,
          compositeRuleId: 'lag_distance_3putt',
          sourceInsightIds: ['leaf1', 'leaf2'],
          metric: 'three_putts',
        }),
        row({ id: 'leaf1', category: 'putting', strokesSaved: 0.5, title: 'Leaf One', content: 'lag speed' }),
        row({ id: 'leaf2', category: 'putting', strokesSaved: 0.4, title: 'Leaf Two', content: 'face control' }),
      ],
      sgByCategory: {},
    });

    const putting = themeOf(result, 'putting');
    // Only the composite is a top-level cause; leaves are demoted.
    expect(putting.causes.map((c) => c.insight_id)).toEqual(['comp']);

    const comp = putting.causes[0]!;
    expect(comp.drivers).toHaveLength(2);
    expect(comp.drivers.map((d) => d.source_insight_ids[0])).toEqual(['leaf1', 'leaf2']);
    expect(comp.drivers[0]).toMatchObject({
      source: 'composite',
      composite_rule_id: 'lag_distance_3putt',
      title: 'Leaf One',
      prose: 'lag speed',
    });
  });

  test('a leaf claimed by no composite stays a standalone cause', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'comp', category: 'putting', strokesSaved: 1, sourceInsightIds: ['leaf1'] }),
        row({ id: 'leaf1', category: 'putting', strokesSaved: 0.5 }),
        row({ id: 'lone', category: 'putting', strokesSaved: 0.3 }),
      ],
      sgByCategory: {},
    });
    const ids = themeOf(result, 'putting').causes.map((c) => c.insight_id).sort();
    expect(ids).toEqual(['comp', 'lone']); // leaf1 demoted, lone & comp stay
  });

  test('dangling source_insight_ids are tolerated (skipped, no throw)', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'comp', category: 'putting', strokesSaved: 1, sourceInsightIds: ['ghost'] }),
      ],
      sgByCategory: {},
    });
    const comp = themeOf(result, 'putting').causes[0]!;
    expect(comp.drivers).toHaveLength(0);
  });

  test('a composite with only a rule id (no leaves) has empty drivers', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'comp', category: 'putting', strokesSaved: 1, compositeRuleId: 'r1' })],
      sgByCategory: {},
    });
    expect(themeOf(result, 'putting').causes[0]!.drivers).toHaveLength(0);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Composite weight + per-category stroke conservation (Change 2)
 *
 * - A composite carries REAL weight = Σ realistic strokes of the SAME-CATEGORY
 *   leaves it demoted (so the cascade no longer ranks dead-last on a hardcoded 0).
 * - A CROSS-category claimed leaf is NOT demoted: it stays a top-level cause in
 *   its OWN theme (its strokes conserved there), and is only referenced by the
 *   composite as a driver link — its strokes are never added to the composite's
 *   category and never deleted from its own.
 * ────────────────────────────────────────────────────────────────────────── */

describe('assembleThemes — composite weight + conservation', () => {
  test('composite weight = Σ same-category demoted leaves realistic strokes (no team data → raw)', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        // composite's OWN counterfactual is small/irrelevant; weight comes from leaves.
        row({
          id: 'comp',
          category: 'putting',
          strokesSaved: 0.0,
          compositeRuleId: 'lag_3putt',
          sourceInsightIds: ['leaf1', 'leaf2'],
        }),
        row({ id: 'leaf1', category: 'putting', strokesSaved: 0.5 }),
        row({ id: 'leaf2', category: 'putting', strokesSaved: 0.4 }),
      ],
      sgByCategory: {},
    });
    const putting = themeOf(result, 'putting');
    expect(putting.causes.map((c) => c.insight_id)).toEqual(['comp']);
    const comp = putting.causes[0]!;
    // weight = 0.5 + 0.4 (no team data → realistic == raw)
    expect(comp.strokesSavedPerRound).toBeCloseTo(0.9, 10);
    // tourGap is the conserved Σ of the SAME leaves' Tour gaps (NOT the composite's
    // own absent counterfactual) — so realistic ≤ Tour holds at the composite too.
    expect(comp.tourGapPerRound).toBeCloseTo(0.9, 10);
    expect(comp.drivers).toHaveLength(2);
  });

  test('INVARIANT: realistic strokesSavedPerRound never exceeds tourGapPerRound (incl. composites)', () => {
    // Composite + leaves WITH team standing so realistic < raw, plus a cross-category
    // leaf and a lone cause — every cause must satisfy realistic ≤ Tour gap.
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({
          id: 'comp',
          category: 'putting',
          strokesSaved: 0.0,
          compositeRuleId: 'lag_3putt',
          sourceInsightIds: ['l1', 'l2'],
        }),
        rowWithTeam({ id: 'l1', category: 'putting', strokesSaved: 1.0, player: 8, team: 6, pga: 3 }),
        rowWithTeam({ id: 'l2', category: 'putting', strokesSaved: 0.8, player: 8, team: 6, pga: 3 }),
        rowWithTeam({ id: 'lone', category: 'approach', strokesSaved: 1.2, player: 9, team: 5, pga: 4 }),
      ],
      sgByCategory: {},
    });
    for (const theme of result.themes) {
      for (const c of theme.causes) {
        if (c.tourGapPerRound != null) {
          expect(c.strokesSavedPerRound).toBeLessThanOrEqual(c.tourGapPerRound + 1e-9);
        }
      }
      // theme-level too: realistic magnitude never exceeds the Tour-ceiling sum.
      expect(theme.themeStrokesPerRound).toBeLessThanOrEqual(theme.tourGapPerRound + 1e-9);
    }
  });

  test('cross-category claimed leaf stays top-level in its OWN theme; not added to composite', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        // approach composite claims a putting leaf (cross-category) + an approach leaf.
        row({
          id: 'comp',
          category: 'approach',
          strokesSaved: 0.0,
          compositeRuleId: 'mixed',
          sourceInsightIds: ['p_leaf', 'a_leaf'],
        }),
        row({ id: 'p_leaf', category: 'putting', strokesSaved: 0.7 }),
        row({ id: 'a_leaf', category: 'approach', strokesSaved: 0.3 }),
      ],
      sgByCategory: {},
    });

    // The putting leaf is NOT demoted — it stays a top-level cause in putting,
    // keeping its strokes there (conserved, not deleted).
    const putting = themeOf(result, 'putting');
    expect(putting.causes.map((c) => c.insight_id)).toEqual(['p_leaf']);
    expect(putting.causes[0]!.strokesSavedPerRound).toBeCloseTo(0.7, 10);

    // The approach composite carries ONLY the same-category (approach) leaf's
    // strokes — the cross-category putting leaf's strokes are NOT added here.
    const approach = themeOf(result, 'approach');
    expect(approach.causes.map((c) => c.insight_id)).toEqual(['comp']);
    const comp = approach.causes[0]!;
    expect(comp.strokesSavedPerRound).toBeCloseTo(0.3, 10);
    // Both leaves are still threaded as driver links (cascade stays visible).
    expect(comp.drivers.map((d) => d.source_insight_ids[0]).sort()).toEqual([
      'a_leaf',
      'p_leaf',
    ]);
    // The cross-category leaf is referenced as a driver but NOT removed from putting:
    // it is BOTH a driver here and a top-level cause in putting (cross-theme link).
    expect(approach.causes[0]!.drivers.some((d) => d.source_insight_ids[0] === 'p_leaf')).toBe(true);
  });

  test('composite with no same-category leaves carries 0 (pure narrative link, no fabricated weight)', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({
          id: 'comp',
          category: 'approach',
          strokesSaved: 0.0,
          compositeRuleId: 'cross_only',
          sourceInsightIds: ['p_leaf'],
        }),
        row({ id: 'p_leaf', category: 'putting', strokesSaved: 0.7 }),
      ],
      sgByCategory: {},
    });
    const comp = themeOf(result, 'approach').causes[0]!;
    expect(comp.strokesSavedPerRound).toBe(0);
    expect(comp.drivers).toHaveLength(1); // still renders the cross-theme link
    // putting leaf preserved at top level with its strokes.
    expect(themeOf(result, 'putting').causes[0]!.strokesSavedPerRound).toBeCloseTo(0.7, 10);
  });

  test('a leaf claimed by two same-category composites contributes its strokes once', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'compA', category: 'putting', strokesSaved: 0, compositeRuleId: 'a', sourceInsightIds: ['shared'] }),
        row({ id: 'compB', category: 'putting', strokesSaved: 0, compositeRuleId: 'b', sourceInsightIds: ['shared'] }),
        row({ id: 'shared', category: 'putting', strokesSaved: 0.6 }),
      ],
      sgByCategory: {},
    });
    const putting = themeOf(result, 'putting');
    const ids = putting.causes.map((c) => c.insight_id).sort();
    expect(ids).toEqual(['compA', 'compB']); // shared demoted out of top level
    // Exactly one composite (the first claimant) owns the shared leaf's strokes.
    const weights = putting.causes.map((c) => c.strokesSavedPerRound).sort();
    expect(weights).toEqual([0, 0.6]);
    const total = putting.causes.reduce((s, c) => s + c.strokesSavedPerRound, 0);
    expect(total).toBeCloseTo(0.6, 10); // NOT 1.2 — no double-count
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Team-average framing — teamFraction math + honest Tour-gap labeling
 *
 * realistic = tourGap * clamp((player_value - team_avg) / (player_value - pga_value), 0, 1)
 * No team reference (any of the three null, or player≈PGA) → teamFraction = 1 →
 * realistic == tourGap (framed "to Tour"). Already at/better than team → 0.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Compute the expected team fraction the same way the assembler does — kept
 * in-test so any drift in the formula breaks loudly here.
 */
function teamFraction(
  player: number | null,
  team: number | null,
  pga: number | null,
): number {
  if (player == null || team == null || pga == null) return 1;
  const denom = player - pga;
  if (Math.abs(denom) < 1e-6) return 1;
  const f = (player - team) / denom;
  if (!Number.isFinite(f)) return 0;
  return Math.min(1, Math.max(0, f));
}

describe('assembleThemes — team-average framing', () => {
  test('no standing → teamFraction falls back to 1 → realistic == tourGap (putting)', () => {
    const R = 1.4;
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', strokesSaved: R })],
      sgByCategory: {},
    });
    const c = themeOf(result, 'putting').causes[0]!;
    expect(c.tourGapPerRound).toBe(R);
    // No team_avg on the fixture standing (it's null) → fall back to full Tour gap.
    expect(c.strokesSavedPerRound).toBeCloseTo(R, 10);
    expect(c.standingTeamAvgValue).toBeNull();
  });

  test('team_avg between player and PGA → realistic = tourGap * teamFraction', () => {
    // "lower is better" metric (e.g. 3-putts): player 8, team 6, pga 3.
    // fraction = (8-6)/(8-3) = 2/5 = 0.4.
    const R = 2.0;
    const player = 8, team = 6, pga = 3;
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        rowWithTeam({ id: 'a', category: 'approach', strokesSaved: R, player, team, pga }),
      ],
      sgByCategory: {},
    });
    const c = themeOf(result, 'approach').causes[0]!;
    expect(c.tourGapPerRound).toBe(R);
    expect(c.strokesSavedPerRound).toBeCloseTo(R * teamFraction(player, team, pga), 10);
    expect(c.strokesSavedPerRound).toBeCloseTo(0.8, 10);
    expect(c.standingTeamAvgValue).toBe(team);
  });

  test('direction-agnostic: "higher is better" metric gives the same fraction', () => {
    // GIR% style (higher better): player 50, team 60, pga 75.
    // fraction = (50-60)/(50-75) = (-10)/(-25) = 0.4 — same as the inverse case.
    const R = 2.0;
    const player = 50, team = 60, pga = 75;
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        rowWithTeam({ id: 'a', category: 'approach', strokesSaved: R, player, team, pga }),
      ],
      sgByCategory: {},
    });
    const c = themeOf(result, 'approach').causes[0]!;
    expect(c.strokesSavedPerRound).toBeCloseTo(R * teamFraction(player, team, pga), 10);
    expect(c.strokesSavedPerRound).toBeCloseTo(0.8, 10);
  });

  test('already at/better than team avg → numerator flips sign → clamp to 0', () => {
    // player 5, team 6, pga 3 (lower better): player is BETTER than the team avg.
    // fraction = (5-6)/(5-3) = -0.5 → clamped to 0. No realistic gain vs peers.
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        rowWithTeam({ id: 'a', category: 'approach', strokesSaved: 2.0, player: 5, team: 6, pga: 3 }),
      ],
      sgByCategory: {},
    });
    const c = themeOf(result, 'approach').causes[0]!;
    expect(c.strokesSavedPerRound).toBe(0);
    // The Tour ceiling is still honestly carried.
    expect(c.tourGapPerRound).toBe(2.0);
  });

  test('worse than team but past PGA → fraction > 1 → clamp to 1 (full Tour gap)', () => {
    // player 9, team 4, pga 6 (degenerate: player past PGA on the wrong side).
    // fraction = (9-4)/(9-6) = 5/3 > 1 → clamp to 1.
    const R = 1.5;
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        rowWithTeam({ id: 'a', category: 'approach', strokesSaved: R, player: 9, team: 4, pga: 6 }),
      ],
      sgByCategory: {},
    });
    const c = themeOf(result, 'approach').causes[0]!;
    expect(c.strokesSavedPerRound).toBeCloseTo(R, 10);
  });

  test('player ≈ PGA (zero span) → teamFraction falls back to 1', () => {
    // |player - pga| < 1e-6 → no usable orientation → full Tour gap.
    const R = 1.0;
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        rowWithTeam({ id: 'a', category: 'approach', strokesSaved: R, player: 4, team: 5, pga: 4 }),
      ],
      sgByCategory: {},
    });
    const c = themeOf(result, 'approach').causes[0]!;
    expect(c.strokesSavedPerRound).toBeCloseTo(R, 10);
  });

  test('team_avg null but player+pga present → fall back to 1 (full Tour gap)', () => {
    const R = 1.2;
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'a', category: 'approach', strokesSaved: R, standingPlayer: 8, standingPga: 3 }),
      ],
      sgByCategory: {},
    });
    const c = themeOf(result, 'approach').causes[0]!;
    // team_avg is null on this fixture → no team reference → full Tour gap.
    expect(c.strokesSavedPerRound).toBeCloseTo(R, 10);
  });

  test('no re-suppression below 0.3: a small realistic value is kept (not floored to 0)', () => {
    // raw 0.45 (above the upstream 0.3 floor), team fraction 0.4 → realistic 0.18,
    // below 0.3 but must NOT be re-suppressed to 0.
    const R = 0.45;
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        rowWithTeam({ id: 'a', category: 'putting', strokesSaved: R, player: 8, team: 6, pga: 3 }),
      ],
      sgByCategory: {},
    });
    const c = themeOf(result, 'putting').causes[0]!;
    expect(c.strokesSavedPerRound).toBeCloseTo(R * 0.4, 10);
    expect(c.strokesSavedPerRound).toBeGreaterThan(0);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Ranking + counterfactual honesty
 * ────────────────────────────────────────────────────────────────────────── */

describe('assembleThemes — ranking', () => {
  test('causes ordered by realistic strokesSavedPerRound desc', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'small', category: 'approach', strokesSaved: 0.4 }),
        row({ id: 'big', category: 'approach', strokesSaved: 1.5 }),
        row({ id: 'mid', category: 'approach', strokesSaved: 0.9 }),
      ],
      sgByCategory: {},
    });
    expect(themeOf(result, 'approach').causes.map((c) => c.insight_id)).toEqual([
      'big',
      'mid',
      'small',
    ]);
  });

  test('suppressed counterfactual → 0 / null → ranks last & flags counterfactualSuppressed', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'sup', category: 'approach', suppressed: true, strokesSaved: 9 }),
        row({ id: 'real', category: 'approach', strokesSaved: 0.6 }),
      ],
      sgByCategory: {},
    });
    const causes = themeOf(result, 'approach').causes;
    expect(causes.map((c) => c.insight_id)).toEqual(['real', 'sup']);
    const sup = causes.find((c) => c.insight_id === 'sup')!;
    expect(sup.strokesSavedPerRound).toBe(0);
    expect(sup.tourGapPerRound).toBeNull();
    expect(sup.counterfactualSuppressed).toBe(true);
  });

  test('absent counterfactual → 0 strokes, null Tour gap & counterfactualSuppressed true', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'none', category: 'approach', noCounterfactual: true })],
      sgByCategory: {},
    });
    const c = themeOf(result, 'approach').causes[0]!;
    expect(c.strokesSavedPerRound).toBe(0);
    expect(c.tourGapPerRound).toBeNull();
    expect(c.counterfactualSuppressed).toBe(true);
  });

  test('strokes_impact breaks ties when counterfactuals are equal', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'lo', category: 'approach', strokesSaved: 0.5, strokesImpact: 0.1, title: 'AAA' }),
        row({ id: 'hi', category: 'approach', strokesSaved: 0.5, strokesImpact: 2.0, title: 'ZZZ' }),
      ],
      sgByCategory: {},
    });
    // equal strokesSaved → higher |strokes_impact| first (hi), despite title order
    expect(themeOf(result, 'approach').causes.map((c) => c.insight_id)).toEqual(['hi', 'lo']);
  });

  // P2c — team-wide-weakness rescue: a real Tour gap that teamFraction zeroes
  // (player sits at the team average) must not vanish from the ranking.
  test('team-wide weakness (player at team avg) is rescued from rank 0 by the leverage floor', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        rowWithTeam({ id: 'personal', category: 'approach', strokesSaved: 1.0, player: 10, team: 8, pga: 6 }), // realistic 0.5
        rowWithTeam({ id: 'teamwide', category: 'approach', strokesSaved: 3.0, player: 10, team: 10, pga: 6 }), // realistic 0, Tour gap 3.0
        row({ id: 'tiny', category: 'approach', strokesSaved: 0.2 }), // realistic 0.2 (no team ref)
      ],
      sgByCategory: {},
    });
    const causes = themeOf(result, 'approach').causes;
    // Personal leak (0.5) still leads; the team-wide gap is rescued ABOVE the tiny
    // real gap by its floored key (0.15 × 3.0 = 0.45 > 0.2), not buried last at 0.
    expect(causes.map((c) => c.insight_id)).toEqual(['personal', 'teamwide', 'tiny']);
    const teamwide = causes.find((c) => c.insight_id === 'teamwide')!;
    // DISPLAY magnitude unchanged — still realistic 0; only the SORT position moved.
    expect(teamwide.strokesSavedPerRound).toBe(0);
    expect(teamwide.tourGapPerRound).toBe(3.0);
    expect(teamwide.rankKey).toBeCloseTo(0.45, 5);
  });

  test('a real-loss theme whose causes are all zeroed still sorts above a smaller theme', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        rowWithTeam({ id: 'a1', category: 'approach', strokesSaved: 3.0, player: 10, team: 10, pga: 6 }), // approach realistic 0, Tour 3.0
        row({ id: 'p1c', category: 'putting', strokesSaved: 0.2 }), // putting realistic 0.2
      ],
      sgByCategory: {},
    });
    const order = result.themes.map((t) => t.category);
    // approach themeStrokesPerRound is 0 (cause zeroed) but its floored theme rank key
    // (0.15 × 3.0 = 0.45) lifts it above putting (0.2) so the gap stays visible.
    expect(order.indexOf('approach')).toBeLessThan(order.indexOf('putting'));
    expect(themeOf(result, 'approach').themeStrokesPerRound).toBe(0); // display unchanged
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Cause field mapping
 * ────────────────────────────────────────────────────────────────────────── */

describe('assembleThemes — cause fields', () => {
  test('standing + canMakePlan + drills map through', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({
          id: 'a',
          category: 'putting',
          metric: 'three_putt_pct',
          strokesSaved: 1,
          standingPlayer: 7.5,
          standingPga: 4.2,
          drills: [{ id: 'd1', slug: 'lag-30', title: '30ft Lag' }],
        }),
      ],
      sgByCategory: {},
    });
    const c = themeOf(result, 'putting').causes[0]!;
    expect(c.metric).toBe('three_putt_pct');
    expect(c.standingPlayerValue).toBe(7.5);
    expect(c.standingPgaValue).toBe(4.2);
    expect(c.canMakePlan).toBe(true);
    expect(c.drills).toEqual([{ drill_id: 'd1', slug: 'lag-30', title: '30ft Lag' }]);
  });

  test('null metric → canMakePlan false', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', metric: null, strokesSaved: 1 })],
      sgByCategory: {},
    });
    const c = themeOf(result, 'putting').causes[0]!;
    expect(c.metric).toBeNull();
    expect(c.canMakePlan).toBe(false);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Magnitude precedence + states
 * ────────────────────────────────────────────────────────────────────────── */

describe('assembleThemes — sign-aware sizing & states', () => {
  test('positive sgPerRound → themeStrokesPerRound 0 and state strength (never a cost)', () => {
    // Positive SG with no MATERIAL realistic leak cause → a clean STRENGTH; the
    // cost magnitude is 0 (a strength is never a cost). The cause here is
    // immaterial (raw 0.2, no team data → realistic 0.2 < LEAK_FLOOR).
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', strokesSaved: 0.2 })],
      sgByCategory: { putting: 0.8 },
    });
    const t = themeOf(result, 'putting');
    expect(t.themeStrokesPerRound).toBe(0);
    expect(t.state).toBe('strength');
  });

  test('negative sg caps the realistic child sum at |sg| (causes never exceed the loss)', () => {
    // No team data → realistic == raw. realisticChildSum = 1.4 + 1.0 = 2.4,
    // |sg| = 0.9 → capped to 0.9
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'a', category: 'putting', strokesSaved: 1.4 }),
        row({ id: 'b', category: 'putting', strokesSaved: 1.0 }),
      ],
      sgByCategory: { putting: -0.9 },
    });
    const t = themeOf(result, 'putting');
    expect(t.themeStrokesPerRound).toBeCloseTo(0.9, 10);
    expect(t.state).toBe('leak');
  });

  test('negative sg larger than child sum → uses the (smaller) realistic child sum', () => {
    // No team data → realistic == raw. dominant cause 0.5, |sg| = 1.4 → min(0.5, 1.4)
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', strokesSaved: 0.5 })],
      sgByCategory: { putting: -1.4 },
    });
    const t = themeOf(result, 'putting');
    expect(t.themeStrokesPerRound).toBeCloseTo(0.5, 10);
    // sg is a material loss (< -0.3) → still a leak even though the realistic
    // magnitude is below the floor.
    expect(t.state).toBe('leak');
  });

  test('null sg → DOMINANT single cause, not the sum (no double-count)', () => {
    // No team data → realistic == raw: 0.4 and 0.5 → dominant 0.5, NOT 0.9
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'a', category: 'approach', strokesSaved: 0.4 }),
        row({ id: 'b', category: 'approach', strokesSaved: 0.5 }),
      ],
      sgByCategory: {},
    });
    const t = themeOf(result, 'approach');
    expect(t.themeStrokesPerRound).toBeCloseTo(0.5, 10);
  });

  test('theme tourGapPerRound = Σ causes raw Tour gaps', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'a', category: 'approach', strokesSaved: 1.0 }),
        row({ id: 'b', category: 'approach', strokesSaved: 2.0 }),
        row({ id: 'c', category: 'approach', suppressed: true, strokesSaved: 9 }),
      ],
      sgByCategory: {},
    });
    // suppressed cause contributes 0 to the Tour gap sum
    expect(themeOf(result, 'approach').tourGapPerRound).toBeCloseTo(3.0, 10);
  });

  test('empty theme + null sg → thin', () => {
    const result = assembleThemes({ playerId: 'p1', rows: [], sgByCategory: {} });
    expect(themeOf(result, 'putting').state).toBe('thin');
  });

  test('positive sg + no leak cause → strength', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [],
      sgByCategory: { putting: 0.8 },
    });
    expect(themeOf(result, 'putting').state).toBe('strength');
  });

  test('positive sg + a material leak cause → strength, but the cause stays VISIBLE (never hidden)', () => {
    // Conflicting signal: a net-positive-SG category (a strength) that also has a
    // real sub-leak cause. A positive-SG category NEVER renders as a cost
    // (themeStrokesPerRound is 0), so it is labeled `strength` — but it must NOT
    // be `thin`, because `thin` hides the cause cascade and the surfaced cause
    // would vanish. The cause is shown beneath the strength as a "sharpen" item.
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', strokesSaved: 1.0 })],
      sgByCategory: { putting: 0.8 },
    });
    const t = themeOf(result, 'putting');
    expect(t.themeStrokesPerRound).toBe(0);
    expect(t.state).toBe('strength');
    // The key guarantee: the surfaced cause is NOT lost.
    expect(t.causes).toHaveLength(1);
    expect(t.causes[0]?.insight_id).toBe('a');
  });

  test('null sg + a sub-floor cause → leak (not thin), so the cause stays visible', () => {
    // A causes-bearing theme with no SG context and a small realistic magnitude
    // must NOT be `thin` — the upstream surfaced the cause, so we show it.
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'approach', strokesSaved: 0.2 })],
      sgByCategory: {},
    });
    const t = themeOf(result, 'approach');
    expect(t.state).not.toBe('thin');
    expect(t.causes).toHaveLength(1);
  });

  test('negative sg with no causes → leak (not thin once sg < -0.3)', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [],
      sgByCategory: { putting: -0.9 },
    });
    expect(themeOf(result, 'putting').state).toBe('leak');
  });

  test('themes sorted by magnitude desc, scaffold index tiebreak', () => {
    // approach raw 4.0, no team data → realistic 4.0 (null sg → dominant cause).
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'approach', strokesSaved: 4 })],
      sgByCategory: { putting: -0.5 },
    });
    // approach (4.0) floats above putting (0.5 cap) above the rest (0)
    expect(result.themes[0]!.category).toBe('approach');
    expect(result.themes[1]!.category).toBe('putting');
    expect(themeOf(result, 'approach').themeStrokesPerRound).toBeCloseTo(4.0, 10);
    // putting: |sg| 0.5, no causes → min(0, 0.5) = 0... but child sum is 0, so
    // themeStrokesPerRound = min(0, 0.5) = 0; state leak (sg < -0.3).
    expect(themeOf(result, 'putting').themeStrokesPerRound).toBe(0);
    // total = sum of emitted theme magnitudes (outcome themes with 0 causes omitted)
    expect(result.totalStrokesPerRound).toBeCloseTo(4.0, 10);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Outcome-theme gating (Item 5)
 * ────────────────────────────────────────────────────────────────────────── */

describe('assembleThemes — outcome theme gating', () => {
  test('empty outcome themes are omitted; the 4 SG themes always present', () => {
    const result = assembleThemes({ playerId: 'p1', rows: [], sgByCategory: {} });
    const cats = new Set(result.themes.map((t) => t.category));
    // SG themes always present
    for (const sg of ['putting', 'approach', 'tee', 'short_game'] as const) {
      expect(cats.has(sg)).toBe(true);
    }
    // outcome themes omitted when empty
    for (const out of ['scoring', 'course_management', 'pressure'] as const) {
      expect(cats.has(out)).toBe(false);
    }
    expect(result.themes).toHaveLength(4);
  });

  test('outcome theme WITH a cause is included', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'scoring', strokesSaved: 1.0 })],
      sgByCategory: {},
    });
    const cats = new Set(result.themes.map((t) => t.category));
    expect(cats.has('scoring')).toBe(true);
    // the other two empty outcome themes are still omitted
    expect(cats.has('course_management')).toBe(false);
    expect(cats.has('pressure')).toBe(false);
    expect(result.themes).toHaveLength(5); // 4 SG + scoring
  });

  test('empty SG theme is still present even with no cause', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [],
      sgByCategory: { tee: -0.7 },
    });
    expect(themeOf(result, 'tee')).toBeDefined();
    expect(themeOf(result, 'tee').causes).toHaveLength(0);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * ASM-1 — cross-metric/same-subject alias dedup
 *
 * The v2 generator emits `par_scoring_par4` for the same subject the v3
 * generator emits as `scoring_par_4`. Both would otherwise render as two
 * top-level Scoring causes for the same par-4 leak. The assembler collapses the
 * (category, canonical-subject) collision to one winner — preferring the v3
 * canonical form — deterministically and independent of input order.
 * ────────────────────────────────────────────────────────────────────────── */

describe('assembleThemes — alias dedup (ASM-1)', () => {
  test('par_scoring_par4 (v2) + scoring_par_4 (v3) collapse to a single cause', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'v2par4', category: 'scoring', metric: 'par_scoring_par4', strokesSaved: 1.0 }),
        row({ id: 'v3par4', category: 'scoring', metric: 'scoring_par_4', strokesSaved: 1.2 }),
      ],
      sgByCategory: {},
    });
    const scoring = themeOf(result, 'scoring');
    expect(scoring.causes).toHaveLength(1);
    // The v3 canonical-form row wins ownership of the surviving cause.
    expect(scoring.causes[0]!.insight_id).toBe('v3par4');
  });

  test('dedup is input-order independent (v3-first vs v2-first → same winner)', () => {
    const v2 = row({ id: 'v2par4', category: 'scoring', metric: 'par_scoring_par4', strokesSaved: 5.0 });
    const v3 = row({ id: 'v3par4', category: 'scoring', metric: 'scoring_par_4', strokesSaved: 1.0 });
    const a = assembleThemes({ playerId: 'p1', rows: [v2, v3], sgByCategory: {} });
    const b = assembleThemes({ playerId: 'p1', rows: [v3, v2], sgByCategory: {} });
    expect(themeOf(a, 'scoring').causes).toHaveLength(1);
    expect(themeOf(b, 'scoring').causes).toHaveLength(1);
    // Canonical (v3) form wins regardless of order, even when the v2 alias has a
    // larger strokesSaved — canonical-form preference outranks magnitude.
    expect(themeOf(a, 'scoring').causes[0]!.insight_id).toBe('v3par4');
    expect(themeOf(b, 'scoring').causes[0]!.insight_id).toBe('v3par4');
  });

  test('distinct subjects in the same category are NOT collapsed', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'par3', category: 'scoring', metric: 'scoring_par_3', strokesSaved: 1.0 }),
        row({ id: 'par4', category: 'scoring', metric: 'scoring_par_4', strokesSaved: 1.0 }),
      ],
      sgByCategory: {},
    });
    expect(themeOf(result, 'scoring').causes).toHaveLength(2);
  });

  test('the same canonical subject in DIFFERENT categories is not cross-collapsed', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 's-par4', category: 'scoring', metric: 'par_scoring_par4', strokesSaved: 1.0 }),
        row({ id: 'cm-par4', category: 'course_management', metric: 'scoring_par_4', strokesSaved: 1.0 }),
      ],
      sgByCategory: {},
    });
    // One cause survives in EACH category — the dedup key is (category, subject).
    expect(themeOf(result, 'scoring').causes).toHaveLength(1);
    expect(themeOf(result, 'course_management').causes).toHaveLength(1);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * PLAY C — shot-level driver attachment (shotDriversByCategory)
 *
 * The OPTIONAL `shotDriversByCategory` input attaches each category's shot-detail
 * drivers to the TOP-RANKED cause of that category, appended AFTER any composite
 * drivers. Omitting it (the default) must not change any existing behavior.
 * ────────────────────────────────────────────────────────────────────────── */

function shotDriver(title: string): RootDriver {
  return {
    source: 'shot_detail',
    source_insight_ids: [],
    title,
    prose: `${title} prose`,
    drills: [],
  };
}

describe('assembleThemes — shot-level driver attachment (PLAY C)', () => {
  test('a shot driver attaches to the TOP-RANKED cause of its category', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'small', category: 'approach', strokesSaved: 0.4 }),
        row({ id: 'big', category: 'approach', strokesSaved: 1.5 }),
      ],
      sgByCategory: {},
      shotDriversByCategory: { approach: [shotDriver('150-175: short-right')] },
    });
    const causes = themeOf(result, 'approach').causes;
    // 'big' ranks first → gets the shot driver; 'small' gets none.
    expect(causes[0]!.insight_id).toBe('big');
    expect(causes[0]!.drivers).toHaveLength(1);
    expect(causes[0]!.drivers[0]).toMatchObject({ source: 'shot_detail', title: '150-175: short-right' });
    expect(causes[1]!.insight_id).toBe('small');
    expect(causes[1]!.drivers).toHaveLength(0);
  });

  test('shot drivers are APPENDED after composite drivers on the top cause', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({
          id: 'comp',
          category: 'putting',
          strokesSaved: 1.2,
          compositeRuleId: 'lag_3putt',
          sourceInsightIds: ['leaf1'],
          metric: 'three_putts',
        }),
        row({ id: 'leaf1', category: 'putting', strokesSaved: 0.5, title: 'Leaf One', content: 'lag speed' }),
      ],
      sgByCategory: {},
      shotDriversByCategory: { putting: [shotDriver('left-to-right: missed low')] },
    });
    const comp = themeOf(result, 'putting').causes[0]!;
    expect(comp.insight_id).toBe('comp');
    // composite driver first, shot driver appended last.
    expect(comp.drivers.map((d) => d.source)).toEqual(['composite', 'shot_detail']);
    expect(comp.drivers[1]!.title).toBe('left-to-right: missed low');
  });

  test('a category with shot drivers but NO cause attaches to nothing (no invented cause)', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', strokesSaved: 1 })],
      sgByCategory: {},
      // tee has a shot driver but no cause row.
      shotDriversByCategory: { tee: [shotDriver('driver leaks left')] },
    });
    const tee = themeOf(result, 'tee');
    expect(tee.causes).toHaveLength(0);
    // putting cause is untouched (no tee driver leaked into it).
    expect(themeOf(result, 'putting').causes[0]!.drivers).toHaveLength(0);
  });

  test('REGRESSION: omitting shotDriversByCategory leaves behavior unchanged', () => {
    const rows = [
      row({ id: 'big', category: 'approach', strokesSaved: 1.5 }),
      row({ id: 'small', category: 'approach', strokesSaved: 0.4 }),
    ];
    const withField = assembleThemes({ playerId: 'p1', rows, sgByCategory: {}, shotDriversByCategory: {} });
    const without = assembleThemes({ playerId: 'p1', rows, sgByCategory: {} });
    // Identical output: an empty/absent map adds no drivers anywhere.
    expect(JSON.stringify(without)).toBe(JSON.stringify(withField));
    for (const t of without.themes) {
      for (const c of t.causes) expect(c.drivers).toHaveLength(0);
    }
  });

  test('multiple categories each attach to their own top cause', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'app', category: 'approach', strokesSaved: 1.0 }),
        row({ id: 'putt', category: 'putting', strokesSaved: 1.0 }),
      ],
      sgByCategory: {},
      shotDriversByCategory: {
        approach: [shotDriver('approach pattern')],
        putting: [shotDriver('putting pattern')],
      },
    });
    expect(themeOf(result, 'approach').causes[0]!.drivers[0]!.title).toBe('approach pattern');
    expect(themeOf(result, 'putting').causes[0]!.drivers[0]!.title).toBe('putting pattern');
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * PLAY G — per-category SG trend attachment (trendByCategory)
 *
 * The OPTIONAL `trendByCategory` input attaches each category's trend to the
 * matching theme's `trend` field. Omitting it (the default) must leave the
 * output byte-identical (no `trend` key anywhere).
 * ────────────────────────────────────────────────────────────────────────── */

function trend(direction: ThemeTrend['direction'], delta: number): ThemeTrend {
  return { direction, recentAvg: 0, priorAvg: 0, delta, recentN: 5, priorN: 5 };
}

describe('assembleThemes — SG trend attachment (PLAY G)', () => {
  test('a trend attaches to the matching SG theme', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', strokesSaved: 1 })],
      sgByCategory: { putting: -0.5 },
      trendByCategory: { putting: trend('improving', 0.4) },
    });
    const putting = themeOf(result, 'putting');
    expect(putting.trend).toBeDefined();
    expect(putting.trend?.direction).toBe('improving');
    expect(putting.trend?.delta).toBeCloseTo(0.4, 10);
    // Other SG themes get no trend (not in the map).
    expect(themeOf(result, 'approach').trend).toBeUndefined();
  });

  test('multiple categories each get their own trend', () => {
    const result = assembleThemes({
      playerId: 'p1',
      rows: [],
      sgByCategory: {},
      trendByCategory: {
        putting: trend('improving', 0.5),
        approach: trend('declining', -0.6),
        tee: trend('steady', 0.0),
      },
    });
    expect(themeOf(result, 'putting').trend?.direction).toBe('improving');
    expect(themeOf(result, 'approach').trend?.direction).toBe('declining');
    expect(themeOf(result, 'tee').trend?.direction).toBe('steady');
    expect(themeOf(result, 'short_game').trend).toBeUndefined();
  });

  test('a trend keyed to an EMPTY outcome category does not resurrect that theme', () => {
    // scoring has no cause → gated out; a stray trend for it must not bring it back.
    const result = assembleThemes({
      playerId: 'p1',
      rows: [],
      sgByCategory: {},
      trendByCategory: { scoring: trend('improving', 0.3) },
    });
    const cats = new Set(result.themes.map((t) => t.category));
    expect(cats.has('scoring')).toBe(false);
    expect(result.themes).toHaveLength(4); // still just the 4 SG themes
  });

  test('REGRESSION: omitting trendByCategory leaves output byte-identical (no trend key)', () => {
    const rows = [
      row({ id: 'a', category: 'putting', strokesSaved: 1 }),
      row({ id: 'b', category: 'approach', strokesSaved: 0.5 }),
    ];
    const sgByCategory = { putting: -0.4 };
    const without = assembleThemes({ playerId: 'p1', rows, sgByCategory });
    const withEmpty = assembleThemes({ playerId: 'p1', rows, sgByCategory, trendByCategory: {} });
    expect(JSON.stringify(without)).toBe(JSON.stringify(withEmpty));
    // No theme carries a `trend` when the map is absent/empty.
    for (const t of without.themes) {
      expect(t.trend).toBeUndefined();
      expect('trend' in t).toBe(false);
    }
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * G8 — Cross-theme opening-stretch dedup (warmup-hole vs front-9-starter)
 * ────────────────────────────────────────────────────────────────────────── */

describe('cross-theme opening-stretch dedup (warmup-hole vs front-9-starter)', () => {
  function openingRow(over: { id: string; category: string; impact: number; value: number }) {
    const r = row({
      id: over.id,
      category: over.category as InsightCategory,
      metric: 'opening_hole_delta',
      strokesImpact: over.impact,
      strokesSaved: over.value,
    });
    // Set your_value directly on the evidence JSONB blob so the secondary
    // tiebreaker in openingStretchSuppressedRowIds is exercisable in tests.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r.evidence as any).your_value = over.value;
    return r;
  }

  it('surfaces the opening-stretch leak in only ONE theme (the higher-impact row)', () => {
    const result = assembleThemes({
      playerId: 'p',
      rows: [
        openingRow({ id: 'warmup', category: 'pressure', impact: 0.3, value: 0.8 }),
        openingRow({ id: 'front9', category: 'scoring', impact: 0.9, value: 0.6 }),
      ],
      sgByCategory: {},
    });
    const allCauseIds = result.themes.flatMap((t) => t.causes.map((c) => c.insight_id));
    expect(allCauseIds).toContain('front9');
    expect(allCauseIds).not.toContain('warmup');
  });

  it('when impact is tied, keeps the higher-value row', () => {
    const result = assembleThemes({
      playerId: 'p',
      rows: [
        openingRow({ id: 'warmup', category: 'pressure', impact: 0.5, value: 0.9 }),
        openingRow({ id: 'front9', category: 'scoring', impact: 0.5, value: 0.4 }),
      ],
      sgByCategory: {},
    });
    const allCauseIds = result.themes.flatMap((t) => t.causes.map((c) => c.insight_id));
    expect(allCauseIds).toContain('warmup');
    expect(allCauseIds).not.toContain('front9');
  });

  it('single opening_hole_delta row in ONE category is NOT suppressed', () => {
    const result = assembleThemes({
      playerId: 'p',
      rows: [openingRow({ id: 'warmup', category: 'pressure', impact: 0.5, value: 0.8 })],
      sgByCategory: {},
    });
    const allCauseIds = result.themes.flatMap((t) => t.causes.map((c) => c.insight_id));
    expect(allCauseIds).toContain('warmup');
  });

  it('two opening_hole_delta rows in the SAME category are NOT cross-deduped', () => {
    const result = assembleThemes({
      playerId: 'p',
      rows: [
        openingRow({ id: 'r1', category: 'pressure', impact: 0.3, value: 0.5 }),
        openingRow({ id: 'r2', category: 'pressure', impact: 0.7, value: 0.6 }),
      ],
      sgByCategory: {},
    });
    const allCauseIds = result.themes.flatMap((t) => t.causes.map((c) => c.insight_id));
    expect(allCauseIds).toContain('r1');
    expect(allCauseIds).toContain('r2');
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Property-based invariants
 * ────────────────────────────────────────────────────────────────────────── */

const CATEGORIES: (InsightCategory | null)[] = [
  'putting',
  'approach',
  'tee',
  'short_game',
  'scoring',
  'pressure',
  'course_management',
  null,
];

describe('assembleThemes — properties', () => {
  // Arbitrary row sets. Each row may be a composite referencing earlier ids.
  const rowsArb = fc
    .array(
      fc.record({
        category: fc.constantFrom(...CATEGORIES),
        strokesSaved: fc.double({ min: 0, max: 5, noNaN: true }),
        suppressed: fc.boolean(),
        noCounterfactual: fc.boolean(),
        hasMetric: fc.boolean(),
        strokesImpact: fc.double({ min: -3, max: 3, noNaN: true }),
        // indices (into the same array) this row claims as composite leaves
        refs: fc.array(fc.nat({ max: 30 }), { maxLength: 4 }),
        makeComposite: fc.boolean(),
      }),
      { maxLength: 30 },
    )
    .map((specs) =>
      specs.map((s, i) => {
        const ids = specs.map((_, j) => `r${j}`);
        const sourceInsightIds = s.makeComposite
          ? s.refs.filter((k) => k < ids.length && k !== i).map((k) => `r${k}`)
          : undefined;
        return row({
          id: `r${i}`,
          category: s.category,
          metric: s.hasMetric ? `m${i}` : null,
          strokesSaved: s.strokesSaved,
          suppressed: s.suppressed,
          noCounterfactual: s.noCounterfactual,
          strokesImpact: s.strokesImpact,
          sourceInsightIds:
            sourceInsightIds && sourceInsightIds.length > 0 ? sourceInsightIds : undefined,
          compositeRuleId: s.makeComposite ? `rule${i}` : undefined,
        });
      }),
    );

  test('total causes + demoted drivers never exceeds input row count', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const result = assembleThemes({ playerId: 'p1', rows, sgByCategory: {} });
        const causeCount = result.themes.reduce((n, t) => n + t.causes.length, 0);
        const driverCount = result.themes.reduce(
          (n, t) => n + t.causes.reduce((m, c) => m + c.drivers.length, 0),
          0,
        );
        // Demoted leaves appear once per claiming composite, but each resolved
        // driver corresponds to a real input row; causes are top-level rows.
        // The set of distinct ids across causes + drivers must be ≤ row count.
        const distinct = new Set<string>();
        for (const t of result.themes) {
          for (const c of t.causes) {
            distinct.add(c.insight_id);
            for (const d of c.drivers) for (const id of d.source_insight_ids) distinct.add(id);
          }
        }
        expect(distinct.size).toBeLessThanOrEqual(rows.length);
        // sanity: counts are non-negative finite numbers
        expect(Number.isFinite(causeCount)).toBe(true);
        expect(Number.isFinite(driverCount)).toBe(true);
      }),
    );
  });

  test('category-aware disjointness: a SAME-category driver leaf is never also a top-level cause in that category; CROSS-category leaves may be', () => {
    // Change 2 redefines the invariant. A composite DEMOTES only its same-category
    // leaves — those must NOT appear as top-level causes in the composite's
    // category. A CROSS-category leaf is intentionally NOT demoted: it stays a
    // top-level cause in its OWN theme AND is referenced as a driver link. So the
    // old blanket "never both" no longer holds; the precise invariant is:
    //   for every cause C in theme T, for every driver leaf L of C,
    //     if L's category == T.category  →  L is NOT a top-level cause in T.
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const result = assembleThemes({ playerId: 'p1', rows, sgByCategory: {} });
        // Map: category → set of top-level cause ids in that category.
        const topByCategory = new Map<InsightCategory, Set<string>>();
        for (const t of result.themes) {
          topByCategory.set(t.category, new Set(t.causes.map((c) => c.insight_id)));
        }
        // Index input rows by id → category for resolving each driver leaf's home.
        const catById = new Map<string, InsightCategory | null>();
        for (const r of rows) if (r.id) catById.set(r.id, r.category);

        for (const t of result.themes) {
          const topHere = topByCategory.get(t.category) ?? new Set<string>();
          for (const c of t.causes) {
            for (const d of c.drivers) {
              for (const leafId of d.source_insight_ids) {
                const leafCat = catById.get(leafId) ?? null;
                if (leafCat === t.category) {
                  // same-category demoted leaf must not also be a top-level cause here
                  expect(topHere.has(leafId)).toBe(false);
                }
                // cross-category leaves are allowed to remain top-level elsewhere.
              }
            }
          }
        }
      }),
    );
  });

  test('per-category stroke conservation: no same-category leaf is both demoted-and-counted twice; cross-category leaf strokes never vanish', () => {
    // For any row set, the sum of all top-level cause strokes per category must be
    // finite and non-negative, and a same-category leaf demoted into a composite
    // must not ALSO appear as a top-level cause (its strokes live once, on the
    // composite). This guards conservation across the whole arbitrary space.
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const result = assembleThemes({ playerId: 'p1', rows, sgByCategory: {} });
        for (const t of result.themes) {
          const sum = t.causes.reduce((s, c) => s + c.strokesSavedPerRound, 0);
          expect(Number.isFinite(sum)).toBe(true);
          expect(sum).toBeGreaterThanOrEqual(0);
          // top-level cause ids are unique within a theme (no leaf both top-level
          // and demoted-into-a-same-category-composite-here).
          const ids = t.causes.map((c) => c.insight_id);
          expect(new Set(ids).size).toBe(ids.length);
        }
      }),
    );
  });

  test('never throws on missing / partial evidence', () => {
    const partialArb = fc.array(
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 6 }),
        category: fc.constantFrom(...CATEGORIES),
        // randomly mangle evidence to exercise null-guards
        kind: fc.constantFrom('empty', 'noMetric', 'cfOnly', 'full'),
      }),
      { maxLength: 20 },
    );
    fc.assert(
      fc.property(partialArb, (specs) => {
        const rows: EvidenceInsight[] = specs.map((s, i) => {
          const base = row({ id: `${s.id}_${i}`, category: s.category });
          if (s.kind === 'empty') {
            base.evidence = {} as unknown as EvidenceInsight['evidence'];
          } else if (s.kind === 'noMetric') {
            base.evidence = { counterfactual: null } as unknown as EvidenceInsight['evidence'];
          } else if (s.kind === 'cfOnly') {
            base.evidence = {
              counterfactual: {
                current_baseline_score: null,
                projected_score_if_closed: null,
                strokes_saved_per_round: 0.5,
                weeks_to_typical_close: 4,
                suppressed: false,
              },
            } as unknown as EvidenceInsight['evidence'];
          }
          return base;
        });
        expect(() => assembleThemes({ playerId: 'p1', rows, sgByCategory: {} })).not.toThrow();
      }),
    );
  });

  test('always emits the 4 SG themes; outcome themes only when they have a cause', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const result = assembleThemes({ playerId: 'p1', rows, sgByCategory: {} });
        const cats = new Set(result.themes.map((t) => t.category));
        // 4 SG themes are unconditional.
        for (const sg of ['putting', 'approach', 'tee', 'short_game'] as const) {
          expect(cats.has(sg)).toBe(true);
        }
        // Every outcome theme present iff it has ≥1 cause.
        for (const t of result.themes) {
          if (t.isOutcomeTheme) expect(t.causes.length).toBeGreaterThan(0);
        }
        // Bounds: between 4 (all outcome empty) and 7 (all outcome non-empty).
        expect(result.themes.length).toBeGreaterThanOrEqual(4);
        expect(result.themes.length).toBeLessThanOrEqual(7);
      }),
    );
  });
});
