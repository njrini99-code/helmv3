/**
 * Unit tests for the Team Brief engine-sentence assembler (Fixes #922, Phase 1).
 *
 * Pins the documented honesty rules:
 *   - `driving` maps to the engine's `tee` category (the Brief alias).
 *   - The FIRST row matching a category (rows arrive pre-ranked) wins — no
 *     re-ranking happens inside this module.
 *   - A live, non-suppressed, positive counterfactual produces a strokes-saved
 *     sentence + `negative` tone + a real `strokesSavedPerRound`.
 *   - A suppressed/absent/non-positive counterfactual produces a diagnostic
 *     "top signal" sentence + `neutral` tone + `strokesSavedPerRound: null` —
 *     NEVER a fabricated number.
 *   - A category with no matching visible row is absent from the returned map
 *     (graceful fallback lives in the caller).
 *   - Prose is sanitized (authoring artifacts stripped) via the shared
 *     `sanitizeProse` from the v3 themes module.
 *
 * Run: npm test -- coachhelm/v3/brief/assemble
 */
import { describe, test, expect } from 'vitest';
import {
  assembleBriefEngineInsights,
  BRIEF_CATEGORY_TO_ENGINE_CATEGORY,
  briefEngineCategories,
  type BriefCategoryDef,
} from './assemble';
import type { AssembledEvidence } from '@/lib/coachhelm/v3/themes/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';

const CATEGORIES: BriefCategoryDef[] = [
  { id: 'driving', label: 'Driving' },
  { id: 'approach', label: 'Approach' },
  { id: 'short_game', label: 'Short Game' },
  { id: 'putting', label: 'Putting' },
  { id: 'scoring', label: 'Scoring' },
];

interface RowOpts {
  id: string;
  category: InsightCategory | null;
  content?: string;
  metric?: string | null;
  strokesSaved?: number;
  suppressed?: boolean;
  noCounterfactual?: boolean;
  playerId?: string;
}

function row(o: RowOpts): EvidenceInsight {
  const ev: AssembledEvidence = {
    metric: o.metric === undefined ? `metric_${o.id}` : (o.metric ?? undefined),
    strokes_impact: 0.5,
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

  return {
    id: o.id,
    player_id: o.playerId ?? 'p1',
    category: o.category,
    title: `Title ${o.id}`,
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
  };
}

describe('BRIEF_CATEGORY_TO_ENGINE_CATEGORY', () => {
  test('driving aliases to the engine tee category; the rest match verbatim', () => {
    expect(BRIEF_CATEGORY_TO_ENGINE_CATEGORY.driving).toBe('tee');
    expect(BRIEF_CATEGORY_TO_ENGINE_CATEGORY.approach).toBe('approach');
    expect(BRIEF_CATEGORY_TO_ENGINE_CATEGORY.short_game).toBe('short_game');
    expect(BRIEF_CATEGORY_TO_ENGINE_CATEGORY.putting).toBe('putting');
    expect(BRIEF_CATEGORY_TO_ENGINE_CATEGORY.scoring).toBe('scoring');
  });

  test('briefEngineCategories returns the distinct engine-side categories', () => {
    const cats = briefEngineCategories();
    expect(new Set(cats)).toEqual(
      new Set(['tee', 'approach', 'short_game', 'putting', 'scoring']),
    );
  });
});

describe('assembleBriefEngineInsights', () => {
  test('a live, positive counterfactual yields a strokes-saved sentence + negative tone', () => {
    const rows = [
      row({ id: 'a1', category: 'tee', strokesSaved: 0.82, content: 'Missing right on 70% of drives.' }),
    ];
    const out = assembleBriefEngineInsights(rows, CATEGORIES);
    const driving = out.get('driving');
    expect(driving).toBeDefined();
    expect(driving?.engineBacked).toBe(true);
    expect(driving?.strokesSavedPerRound).toBe(0.82);
    expect(driving?.tone).toBe('negative');
    expect(driving?.message).toContain('0.8 strokes/round');
    expect(driving?.message).toContain('driving');
    expect(driving?.message).toContain('Missing right on 70% of drives.');
    expect(driving?.id).toBe('engine-a1');
  });

  test('a suppressed counterfactual falls back to a diagnostic "top signal" sentence, no number', () => {
    const rows = [row({ id: 'p1', category: 'putting', strokesSaved: 1.2, suppressed: true })];
    const out = assembleBriefEngineInsights(rows, CATEGORIES);
    const putting = out.get('putting');
    expect(putting).toBeDefined();
    expect(putting?.strokesSavedPerRound).toBeNull();
    expect(putting?.tone).toBe('neutral');
    expect(putting?.message.startsWith('Top signal in putting:')).toBe(true);
    expect(putting?.message).not.toMatch(/strokes\/round on the table/);
  });

  test('an absent counterfactual also falls back to diagnostic framing', () => {
    const rows = [row({ id: 's1', category: 'short_game', noCounterfactual: true })];
    const out = assembleBriefEngineInsights(rows, CATEGORIES);
    expect(out.get('short_game')?.strokesSavedPerRound).toBeNull();
    expect(out.get('short_game')?.tone).toBe('neutral');
  });

  test('a zero/non-positive counterfactual is treated as diagnostic-only (never a 0.0 headline)', () => {
    const rows = [row({ id: 'z1', category: 'approach', strokesSaved: 0 })];
    const out = assembleBriefEngineInsights(rows, CATEGORIES);
    expect(out.get('approach')?.strokesSavedPerRound).toBeNull();
    expect(out.get('approach')?.message.startsWith('Top signal in approach:')).toBe(true);
  });

  test('rows arrive pre-ranked — the FIRST matching row per category wins, not the largest', () => {
    const rows = [
      row({ id: 'first', category: 'scoring', strokesSaved: 0.3, content: 'First (top-ranked).' }),
      row({ id: 'second', category: 'scoring', strokesSaved: 5.0, content: 'Second (larger number, ranked lower).' }),
    ];
    const out = assembleBriefEngineInsights(rows, CATEGORIES);
    expect(out.get('scoring')?.id).toBe('engine-first');
    expect(out.get('scoring')?.message).toContain('First (top-ranked).');
  });

  test('a category with no visible engine row is absent from the map (graceful fallback)', () => {
    const rows = [row({ id: 'a1', category: 'tee', strokesSaved: 1 })];
    const out = assembleBriefEngineInsights(rows, CATEGORIES);
    expect(out.has('putting')).toBe(false);
    expect(out.has('approach')).toBe(false);
    expect(out.has('short_game')).toBe(false);
    expect(out.has('scoring')).toBe(false);
    expect(out.size).toBe(1);
  });

  test('pressure/course_management rows never match a Brief category (unmapped engine categories)', () => {
    const rows = [row({ id: 'x1', category: 'pressure', strokesSaved: 2 })];
    const out = assembleBriefEngineInsights(rows, CATEGORIES);
    expect(out.size).toBe(0);
  });

  test('prose is sanitized — authoring artifacts are stripped before rendering', () => {
    const rows = [
      row({
        id: 'c1',
        category: 'putting',
        strokesSaved: 0.5,
        content: 'Three-putt rate is high (Research doc §9). The standing card below shows the gap.',
      }),
    ];
    const out = assembleBriefEngineInsights(rows, CATEGORIES);
    const msg = out.get('putting')?.message ?? '';
    expect(msg).not.toContain('Research doc');
    expect(msg).not.toContain('standing card');
    expect(msg).toContain('Three-putt rate is high.');
  });

  test('an empty row set returns an empty map for every category', () => {
    const out = assembleBriefEngineInsights([], CATEGORIES);
    expect(out.size).toBe(0);
  });
});
