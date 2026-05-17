import { describe, expect, it } from 'vitest';
import { toInsightInput } from '@/lib/coachhelm/v2/insights/to-insight-input';

describe('toInsightInput', () => {
  it('builds evidence and a stable signature for V2 player insights', () => {
    const input = toInsightInput({
      coach_id: 'coach-1',
      team_id: 'team-1',
      player_id: 'player-1',
      insight_type: 'recurring_weakness',
      title: 'Approach misses are costing shots',
      content: 'Approach misses from the rough are driving recent scoring.',
      metadata: {
        v2_engine: true,
        confidence: 0.72,
        support: 12,
        stroke_impact: 1.4,
        pattern_id: 'pattern-1',
      },
    });

    expect(input).not.toBeNull();
    if (!input) throw new Error('expected non-null InsightInput');
    expect(input.player_id).toBe('player-1');
    expect(input.coach_id).toBe('coach-1');
    expect(input.team_id).toBe('team-1');
    expect(input.insight_type).toBe('recurring_weakness');
    expect(input.signature).toBe('player-1:recurring_weakness:approach:pattern-1');
    expect(input.evidence.sample_n).toBe(12);
    expect(input.evidence.confidence_factors).toEqual({
      sample_adequacy: 0.6,
      recency: 1,
      variance: 0.72,
    });
  });

  it('keeps team trends as player_id=null and still satisfies the evidence floor', () => {
    const input = toInsightInput({
      coach_id: 'coach-1',
      team_id: 'team-1',
      player_id: null,
      insight_type: 'team_trend',
      title: 'Team scoring trend',
      content: 'The roster is trending toward stronger closing stretches.',
      metadata: {
        v2_engine: true,
        cross_player: true,
        confidence: 0.66,
        // 2026-05-17: must now supply real sample_n. The old behavior clamped
        // it up to MIN_SAMPLE_N (=5) when missing — see audit Q-NEW-1.
        sample_n: 8,
        comparison_value: 0.62,
        comparison_label: 'Team baseline',
        comparison_source: 'team_avg',
      },
    });

    expect(input).not.toBeNull();
    if (!input) throw new Error('expected non-null InsightInput');
    expect(input.player_id).toBeNull();
    expect(input.coach_id).toBe('coach-1');
    expect(input.team_id).toBe('team-1');
    expect(input.insight_type).toBe('team_trend');
    expect(input.signature).toBe('team_team-1:team_trend:scoring:team_scoring_trend');
    expect(input.evidence.sample_n).toBe(8);
    expect(input.evidence.comparison_source).toBe('team_avg');
  });

  it('returns null when legacy record lacks sample_n / support (audit Q-NEW-1)', () => {
    // The pre-2026-05-17 behavior would have clamped sample_n UP to 5 and
    // fabricated comparison_value = confidence * 0.9. Plan 03 refuses to emit.
    const input = toInsightInput({
      coach_id: 'coach-1',
      team_id: 'team-1',
      player_id: 'player-1',
      insight_type: 'recurring_weakness',
      title: 'Approach misses',
      content: 'Test',
      metadata: {
        v2_engine: true,
        confidence: 0.72,
        // no sample_n / sampleSize / occurrence_count / support
      },
    });
    expect(input).toBeNull();
  });

  it('returns null when sample_n is below MIN_SAMPLE_N (=5)', () => {
    const input = toInsightInput({
      coach_id: 'coach-1',
      team_id: 'team-1',
      player_id: 'player-1',
      insight_type: 'recurring_weakness',
      title: 'Approach misses',
      content: 'Test',
      metadata: { v2_engine: true, sample_n: 3, confidence: 0.72 },
    });
    expect(input).toBeNull();
  });

  it('does not fabricate comparison fields when metadata lacks them', () => {
    // Pre-2026-05-17 would have invented comparison_value = confidence * 0.9
    // and labeled it 'Recent baseline'. New behavior emits 'No baseline available'
    // + comparison_value = your_value so the UI shows a 0-gap, not a fake one.
    const input = toInsightInput({
      coach_id: 'coach-1',
      team_id: 'team-1',
      player_id: 'player-1',
      insight_type: 'recurring_weakness',
      title: 'Approach misses',
      content: 'Test',
      metadata: { v2_engine: true, sample_n: 10, confidence: 0.7 },
    });
    expect(input).not.toBeNull();
    if (!input) throw new Error('expected non-null');
    expect(input.evidence.comparison_label).toBe('No baseline available');
    expect(input.evidence.comparison_source).toBe('your_baseline');
    expect(input.evidence.comparison_value).toBe(input.evidence.your_value);
  });
});
