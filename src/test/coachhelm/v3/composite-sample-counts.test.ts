import { describe, it, expect } from 'vitest';
import pdc from '@/lib/coachhelm/v3/composite/rules/pressure-decel-chain';
import lag from '@/lib/coachhelm/v3/composite/rules/lag-distance-3putt';
import type { EvidenceInsight } from '@/lib/coachhelm/v3/composite/types';

function row(over: { type: string; sig: string; val: number; teamPct?: number; sampleN: number }): EvidenceInsight {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidence: any = {
    metric: over.type, your_value: over.val, sample_n: over.sampleN, window_days: 30,
    standing: over.teamPct === undefined ? undefined : {
      metric_id: over.type, player_value: over.val, team_avg: 0, team_n: 5,
      team_pct: over.teamPct, pga_value: 0, pga_delta: null, computed_at: '2026-05-25T00:00:00Z' },
  };
  return { id: `i-${over.sig}`, insight_type: over.type, category: over.type, signature: over.sig,
    player_id: 'p', evidence, engine_version: 'v3', created_at: '2026-05-25T00:00:00Z' };
}

describe('pressure_decel_chain — real sample_n + min gate', () => {
  it('stamps the MIN of its source sample_ns (not a hardcoded 5)', () => {
    const m = pdc.detect([
      row({ type: 'pressure_gap', sig: 'v3:pressure_gap:practice_vs_tournament', val: 1.2, sampleN: 9 }),
      row({ type: 'putt_distance', sig: 'v3:putt_distance:3_5ft', val: 75, teamPct: 30, sampleN: 14 }),
    ])!;
    expect(pdc.compose(m).evidence.sample_n).toBe(9);
  });
  it('does NOT fire when the binding source is below the min-shot gate', () => {
    expect(pdc.detect([
      row({ type: 'pressure_gap', sig: 'v3:pressure_gap:practice_vs_tournament', val: 1.2, sampleN: 2 }),
      row({ type: 'putt_distance', sig: 'v3:putt_distance:3_5ft', val: 75, teamPct: 30, sampleN: 14 }),
    ])).toBeNull();
  });
});

describe('lag_distance_3putt — real sample_n + min gate', () => {
  it('stamps the MIN of its source sample_ns', () => {
    const m = lag.detect([
      row({ type: 'putt_distance', sig: 'v3:putt_distance:25_plus_ft', val: 8, teamPct: 30, sampleN: 11 }),
      row({ type: 'putt_distance', sig: 'v3:putt_distance:3_5ft', val: 75, teamPct: 30, sampleN: 7 }),
    ])!;
    expect(lag.compose(m).evidence.sample_n).toBe(7);
  });
  it('does NOT fire when either putt bucket is below the min-shot gate', () => {
    expect(lag.detect([
      row({ type: 'putt_distance', sig: 'v3:putt_distance:25_plus_ft', val: 8, teamPct: 30, sampleN: 3 }),
      row({ type: 'putt_distance', sig: 'v3:putt_distance:3_5ft', val: 75, teamPct: 30, sampleN: 7 }),
    ])).toBeNull();
  });
});
