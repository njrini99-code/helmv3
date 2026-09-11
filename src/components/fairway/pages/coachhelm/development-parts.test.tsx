// @vitest-environment jsdom
/**
 * development-parts — player development v2 (player-development.v2.md):
 * the lead-area pick, the ladder order, the plan bar's gate, the stage's
 * readout and verdict.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FocusAreaCardData } from './FocusAreaCard';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';

vi.mock('@/app/golf/actions/development', () => ({
  updateFocusAreaProgress: vi.fn(),
}));
vi.mock('@/lib/fairway/haptics', () => ({ fwHaptic: vi.fn() }));

import { ladderOrder, pickLeadArea } from './development-parts';

function area(overrides: Partial<FocusAreaCardData> = {}): FocusAreaCardData {
  return {
    id: 'fa-1',
    title: 'Greens in regulation',
    area_type: 'approach',
    status: 'active',
    target_metric: 'gir_pct',
    baseline_value: 50,
    current_value: 56,
    target_value: 65,
    target_kind: 'date',
    target_date: '2026-10-01',
    started_at: '2026-08-01T00:00:00.000Z',
    progressHistory: [],
    snapshots: [
      { date: '2026-08-01', value: 50 },
      { date: '2026-08-20', value: 53 },
      { date: '2026-08-31', value: 56 },
    ],
    ...overrides,
  } as FocusAreaCardData;
}

function rel(causeMetric: string, potential: number): CausalRelationshipRow {
  return {
    id: `${causeMetric}-scoring`,
    player_id: 'p1',
    cause: causeMetric,
    cause_metric: causeMetric,
    effect: 'scoring',
    effect_metric: 'score_to_par',
    relationship_type: 'direct',
    strength: 0.6,
    confidence: 0.7,
    mechanism: '',
    dose_response: false,
    intervention_potential: potential,
    created_at: null,
    updated_at: null,
  };
}

describe('pickLeadArea', () => {
  it('returns null with no active areas', () => {
    expect(pickLeadArea([], [])).toBeNull();
  });

  it('prefers the area whose metric has the highest intervention potential as a cause', () => {
    const greens = area({ id: 'a', target_metric: 'gir_pct', current_value: 64 });
    const putts = area({
      id: 'b',
      target_metric: 'putts_made_3_5ft_pct',
      baseline_value: 40,
      current_value: 42,
      target_value: 60,
    });
    const lead = pickLeadArea([greens, putts], [rel('gir_pct', 0.9), rel('putts_made_3_5ft_pct', 0.4)]);
    expect(lead?.id).toBe('a');
  });

  it('falls back to the least progressed area, then the oldest', () => {
    const far = area({ id: 'far', current_value: 63, started_at: '2026-07-01T00:00:00.000Z' });
    const near = area({ id: 'near', current_value: 51, started_at: '2026-08-15T00:00:00.000Z' });
    expect(pickLeadArea([far, near], [])?.id).toBe('near');
    const twinA = area({ id: 'twin-a', started_at: '2026-08-15T00:00:00.000Z' });
    const twinB = area({ id: 'twin-b', started_at: '2026-06-01T00:00:00.000Z' });
    expect(pickLeadArea([twinA, twinB], [])?.id).toBe('twin-b');
  });
});

describe('ladderOrder', () => {
  it('sorts ascending by progress with no-target areas last', () => {
    const done = area({ id: 'done', current_value: 65 });
    const mid = area({ id: 'mid', current_value: 56 });
    const none = area({ id: 'none', target_value: null, current_value: null, baseline_value: null });
    const fresh = area({ id: 'fresh', current_value: 50 });
    expect(ladderOrder([done, none, mid, fresh]).map((fa) => fa.id)).toEqual(['fresh', 'mid', 'done', 'none']);
  });
});
