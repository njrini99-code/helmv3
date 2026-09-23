import { describe, it, expect } from 'vitest';
import {
  mapRowToRankable,
  type RawInsightRowForRanking,
} from '@/app/golf/actions/insight-delivery-ranking';

function makeRawRow(overrides: Partial<RawInsightRowForRanking> = {}): RawInsightRowForRanking {
  return {
    id: 'i-1',
    player_id: 'p-1',
    category: 'putting',
    insight_type: 'trend',
    title: 'Title',
    content: 'Content',
    signature: 'sig-1',
    evidence: {
      metric: 'putt_make_rate_6_10ft',
      strokes_impact: 2.1,
      confidence: 0.78,
    },
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
    ...overrides,
  };
}

describe('mapRowToRankable', () => {
  it('sanitizes content the same way mapRowToEvidenceInsight does, stripping authoring artifacts', () => {
    const row = makeRawRow({
      content:
        'Your lag putting has improved (Research doc §9). The standing card below shows your trend.',
    });

    const mapped = mapRowToRankable(row);
    expect(mapped?.content).toBe('Your lag putting has improved.');
  });

  it('returns null for a row missing the required id/player_id/title', () => {
    expect(mapRowToRankable(makeRawRow({ id: null }))).toBeNull();
    expect(mapRowToRankable(makeRawRow({ player_id: null }))).toBeNull();
    expect(mapRowToRankable(makeRawRow({ title: null }))).toBeNull();
  });

  it('returns null when evidence is missing the required numeric/string scalars', () => {
    expect(
      mapRowToRankable(makeRawRow({ evidence: { metric: 'x', confidence: 0.5 } })),
    ).toBeNull();
  });
});
