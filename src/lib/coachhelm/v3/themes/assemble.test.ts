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
import type { AssembledEvidence } from './types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
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
 * College-realism re-scale + honest Tour-gap labeling
 * ────────────────────────────────────────────────────────────────────────── */

// Mirror of the documented constant in assemble.ts (kept in-test so a drift in
// the factor breaks loudly here).
const REALISM: Record<InsightCategory, number> = {
  putting: 0.55,
  approach: 0.6,
  short_game: 0.6,
  tee: 0.6,
  scoring: 0.6,
  course_management: 0.6,
  pressure: 0.6,
};

describe('assembleThemes — college-realism re-scale', () => {
  test('strokesSavedPerRound = raw × factor; tourGapPerRound = raw (putting)', () => {
    const R = 1.4;
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', strokesSaved: R })],
      sgByCategory: {},
    });
    const c = themeOf(result, 'putting').causes[0]!;
    expect(c.tourGapPerRound).toBe(R);
    expect(c.strokesSavedPerRound).toBeCloseTo(R * REALISM.putting, 10);
  });

  test('strokesSavedPerRound = raw × factor; tourGapPerRound = raw (approach)', () => {
    const R = 2.0;
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'approach', strokesSaved: R })],
      sgByCategory: {},
    });
    const c = themeOf(result, 'approach').causes[0]!;
    expect(c.tourGapPerRound).toBe(R);
    expect(c.strokesSavedPerRound).toBeCloseTo(R * REALISM.approach, 10);
  });

  test('no re-suppression below 0.3: a small realistic value is kept (not floored to 0)', () => {
    // raw 0.45 (above the upstream 0.3 floor) → realistic 0.45*0.55 ≈ 0.2475,
    // which is below 0.3 but must NOT be re-suppressed to 0.
    const R = 0.45;
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', strokesSaved: R })],
      sgByCategory: {},
    });
    const c = themeOf(result, 'putting').causes[0]!;
    expect(c.strokesSavedPerRound).toBeCloseTo(R * REALISM.putting, 10);
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
    // immaterial after re-scale (raw 0.4 → realistic 0.24 < LEAK_FLOOR).
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', strokesSaved: 0.4 })],
      sgByCategory: { putting: 0.8 },
    });
    const t = themeOf(result, 'putting');
    expect(t.themeStrokesPerRound).toBe(0);
    expect(t.state).toBe('strength');
  });

  test('negative sg caps the realistic child sum at |sg| (causes never exceed the loss)', () => {
    // realisticChildSum = (1.4 + 1.0) * 0.55 = 1.32, |sg| = 0.9 → capped to 0.9
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
    // realisticChildSum = 0.5 * 0.55 = 0.275, |sg| = 1.4 → min = 0.275
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'putting', strokesSaved: 0.5 })],
      sgByCategory: { putting: -1.4 },
    });
    const t = themeOf(result, 'putting');
    expect(t.themeStrokesPerRound).toBeCloseTo(0.5 * REALISM.putting, 10);
    // sg is a material loss (< -0.3) → still a leak even though the realistic
    // magnitude is below the floor.
    expect(t.state).toBe('leak');
  });

  test('null sg → DOMINANT single cause, not the sum (no double-count)', () => {
    // realistic values: 0.4*0.6=0.24, 0.5*0.6=0.30 → dominant 0.30, NOT 0.54
    const result = assembleThemes({
      playerId: 'p1',
      rows: [
        row({ id: 'a', category: 'approach', strokesSaved: 0.4 }),
        row({ id: 'b', category: 'approach', strokesSaved: 0.5 }),
      ],
      sgByCategory: {},
    });
    const t = themeOf(result, 'approach');
    expect(t.themeStrokesPerRound).toBeCloseTo(0.5 * REALISM.approach, 10);
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
    // approach raw 4.0 → realistic 4.0*0.6 = 2.4 (null sg → dominant cause).
    const result = assembleThemes({
      playerId: 'p1',
      rows: [row({ id: 'a', category: 'approach', strokesSaved: 4 })],
      sgByCategory: { putting: -0.5 },
    });
    // approach (2.4) floats above putting (0.5 cap) above the rest (0)
    expect(result.themes[0]!.category).toBe('approach');
    expect(result.themes[1]!.category).toBe('putting');
    expect(themeOf(result, 'approach').themeStrokesPerRound).toBeCloseTo(2.4, 10);
    // putting: |sg| 0.5, no causes → min(0, 0.5) = 0... but child sum is 0, so
    // themeStrokesPerRound = min(0, 0.5) = 0; state leak (sg < -0.3).
    expect(themeOf(result, 'putting').themeStrokesPerRound).toBe(0);
    // total = sum of emitted theme magnitudes (outcome themes with 0 causes omitted)
    expect(result.totalStrokesPerRound).toBeCloseTo(2.4, 10);
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

  test('no insight id is both a top-level cause and a driver', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const result = assembleThemes({ playerId: 'p1', rows, sgByCategory: {} });
        const causeIds = new Set<string>();
        const driverIds = new Set<string>();
        for (const t of result.themes) {
          for (const c of t.causes) {
            causeIds.add(c.insight_id);
            for (const d of c.drivers) for (const id of d.source_insight_ids) driverIds.add(id);
          }
        }
        for (const id of driverIds) expect(causeIds.has(id)).toBe(false);
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
