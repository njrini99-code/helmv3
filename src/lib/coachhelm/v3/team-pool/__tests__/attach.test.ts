import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

vi.mock('server-only', () => ({}));
const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => id === 'coachhelm_team_pool_v1' && flag.on }));
vi.mock('../loader', () => ({
  resolvePlayerTeam: vi.fn(),
  loadTeamPoolPlayers: vi.fn(),
}));

import { loadTeamPoolPlayers, resolvePlayerTeam } from '../loader';
import { attachTeamPool } from '../attach';
import type { PoolPlayer, PoolRound } from '../pool';

// Synthetic fixtures only.
function rounds(n: number): PoolRound[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    round_date: `2026-09-${String(10 + i).padStart(2, '0')}`,
    is_test: false,
    holes_played: 18,
    total_score: 72,
    front_nine: 36,
    back_nine: 36,
    total_putts: 36,
    holes: [],
    putts: Array.from({ length: 10 }, (_, k) => ({ feet: 4, made: k < 7 })),
    approaches: [],
  }));
}
const roster: PoolPlayer[] = ['me', 'a', 'b', 'c', 'd', 'e'].map((player_id) => ({ player_id, rounds: rounds(4) }));

const evidence = {
  metric: 'putts_made_3_5ft_pct',
  metric_label: 'Putts Made 3-5 ft',
  unit: 'percent',
  your_value: 61,
  your_value_display: '61%',
  comparison_value: 90.5,
  comparison_label: 'PGA Tour make % avg',
  comparison_source: 'pga_baseline',
  sample_n: 80,
  window_days: 60,
  window_start: '2026-09-01',
  window_end: '2026-10-15',
  strokes_impact: 0.4,
  strokes_impact_method: 'sg_baseline',
  confidence: 0.8,
  confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
} as unknown as InsightEvidence;

const supabase = {} as SupabaseClient;

beforeEach(() => {
  flag.on = false;
  vi.mocked(resolvePlayerTeam).mockReset().mockResolvedValue('team-1');
  vi.mocked(loadTeamPoolPlayers).mockReset().mockResolvedValue(roster);
});

describe('attachTeamPool', () => {
  it('flag off: returns the same evidence object, reads nothing, writes nothing new', async () => {
    const before = JSON.stringify(evidence);
    const out = await attachTeamPool({ supabase, playerId: 'me', insightType: 'putt_distance', evidence });
    expect(out).toBe(evidence);
    expect(JSON.stringify(out)).toBe(before);
    expect(resolvePlayerTeam).not.toHaveBeenCalled();
    expect(loadTeamPoolPlayers).not.toHaveBeenCalled();
  });

  it('flag on: the team line becomes comparison.primary, the Tour a further line', async () => {
    flag.on = true;
    const out = await attachTeamPool({ supabase, playerId: 'me', insightType: 'putt_distance', evidence });
    expect(out.comparison?.primary).toMatchObject({ source: 'team_pool', value: 70, n: 200, players: 5 });
    expect(out.comparison?.lines.map((l) => l.source)).toEqual(['team_pool', 'tour']);
    // The flat fields and the strokes stay on the Tour.
    expect(out.comparison_value).toBe(90.5);
    expect(out.strokes_impact).toBe(0.4);
  });

  it('flag on, a read no pool measures: unchanged and nothing read', async () => {
    flag.on = true;
    const out = await attachTeamPool({ supabase, playerId: 'me', insightType: 'putt_bias', evidence });
    expect(out).toBe(evidence);
    expect(resolvePlayerTeam).not.toHaveBeenCalled();
  });

  it('flag on, no single team or a failed load: unchanged', async () => {
    flag.on = true;
    vi.mocked(resolvePlayerTeam).mockResolvedValueOnce(null);
    expect(await attachTeamPool({ supabase, playerId: 'me', insightType: 'putt_distance', evidence })).toBe(evidence);
    vi.mocked(loadTeamPoolPlayers).mockResolvedValueOnce(null);
    expect(await attachTeamPool({ supabase, playerId: 'me', insightType: 'putt_distance', evidence })).toBe(evidence);
    vi.mocked(loadTeamPoolPlayers).mockRejectedValueOnce(new Error('boom'));
    expect(await attachTeamPool({ supabase, playerId: 'me', insightType: 'putt_distance', evidence })).toBe(evidence);
  });

  it('flag on, a roster under the privacy floor: unchanged', async () => {
    flag.on = true;
    vi.mocked(loadTeamPoolPlayers).mockResolvedValueOnce(roster.slice(0, 4));
    expect(await attachTeamPool({ supabase, playerId: 'me', insightType: 'putt_distance', evidence })).toBe(evidence);
  });

  it("uses a rolling generator's own window, not the stamped one", async () => {
    flag.on = true;
    const out = await attachTeamPool({
      supabase,
      playerId: 'me',
      insightType: 'putt_distance',
      evidence,
      windowSource: { window_start: '2026-10-01', window_end: '2026-10-20', window_days: 19 },
    });
    // No round falls in Oct 1-20.
    expect(out).toBe(evidence);
  });

  describe('a read that composed its own comparison (Slice 5a angle shape)', () => {
    const angleComparison = {
      primary: { source: 'tour', label: 'PGA Tour average', value: 0.9, n: null },
      lines: [
        { source: 'tour', label: 'PGA Tour average', value: 0.9, n: null },
        { source: 'self_other', label: 'Your other holes', value: 0.4, n: 120 },
      ],
    };

    it('an angle family no pool measures: unchanged and nothing read', async () => {
      flag.on = true;
      const angle = {
        ...evidence,
        metric: 'three_putts_per_18',
        comparison: angleComparison,
      } as unknown as InsightEvidence;
      const out = await attachTeamPool({ supabase, playerId: 'me', insightType: 'putting', evidence: angle });
      expect(out).toBe(angle);
      expect(resolvePlayerTeam).not.toHaveBeenCalled();
    });

    it('a pooled family: keeps the primary and every composed line, adds the team line last', async () => {
      flag.on = true;
      const composed = { ...evidence, comparison: angleComparison } as unknown as InsightEvidence;
      const out = await attachTeamPool({ supabase, playerId: 'me', insightType: 'putt_distance', evidence: composed });
      expect(out.comparison?.primary).toEqual(angleComparison.primary);
      expect(out.comparison?.lines.slice(0, 2)).toEqual(angleComparison.lines);
      expect(out.comparison?.lines.map((l) => l.source)).toEqual(['tour', 'self_other', 'team_pool']);
      expect(out.comparison?.lines[2]).toMatchObject({ source: 'team_pool', value: 70, n: 200 });
      // The input is not mutated.
      expect(angleComparison.lines).toHaveLength(2);
    });

    it('never adds a second team line', async () => {
      flag.on = true;
      const once = await attachTeamPool({ supabase, playerId: 'me', insightType: 'putt_distance', evidence });
      const twice = await attachTeamPool({ supabase, playerId: 'me', insightType: 'putt_distance', evidence: once });
      expect(twice).toBe(once);
    });
  });
});
