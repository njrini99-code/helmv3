import { describe, expect, it } from 'vitest';
import { PLAYER_HIDDEN_EVIDENCE_KEYS, projectInsightForPlayer, projectInsightsForPlayer } from '../player-projection';

describe('player projection of read evidence (Slice 1b, finding 8)', () => {
  it('strips the support pass keys a player never receives', () => {
    const insight = {
      id: 'i1',
      title: 'Short putts',
      evidence: {
        metric: 'putts_made_3_5ft_pct',
        your_value: 60,
        confidence: 0.8,
        support: { q_adj: 0.02 },
        ladder: 'observed',
        what_ladder: 'observed',
        ladder_reasons: ['one_window_only'],
        strokes_shrunk: 0.4,
        shrink: { kappa: 30 },
      },
    };
    const out = projectInsightForPlayer(insight);
    for (const k of PLAYER_HIDDEN_EVIDENCE_KEYS) expect(out.evidence).not.toHaveProperty(k);
    expect(out.evidence).toEqual({ metric: 'putts_made_3_5ft_pct', your_value: 60, confidence: 0.8 });
    expect(out.title).toBe('Short putts');
    // The input is not mutated (exposure still reads the full evidence).
    expect(insight.evidence.ladder).toBe('observed');
  });

  it('returns an unstamped row as the same object (flag off: payload unchanged)', () => {
    const row = { id: 'i2', evidence: { metric: 'm', your_value: 1, stability: { checkpoints_held: 1 } } };
    expect(projectInsightForPlayer(row)).toBe(row);
    const list = [row, { id: 'i3', evidence: null }];
    const out = projectInsightsForPlayer(list);
    expect(out[0]).toBe(list[0]);
    expect(out[1]).toBe(list[1]);
  });
});
