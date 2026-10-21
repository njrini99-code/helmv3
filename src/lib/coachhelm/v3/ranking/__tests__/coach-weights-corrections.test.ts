/**
 * Slice 6a: the coach weight W from corrections enters ranking in exactly one
 * place, `loadCoachWeightsForPlayer`. Flag off: no corrections read and the
 * weights (and so every rank score) are exactly what they were. Flag on: W
 * per insight_type, with a calibrated outcome weight still winning.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  flagsOn: new Set<string>(),
  loadCorrectionWeightsForPlayer: vi.fn(),
  loadCorrectionWeightsForPlayers: vi.fn(),
}));

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => h.flagsOn.has(id) }));
vi.mock('@/lib/coachhelm/v3/corrections/load-weights', () => ({
  loadCorrectionWeightsForPlayer: h.loadCorrectionWeightsForPlayer,
  loadCorrectionWeightsForPlayers: h.loadCorrectionWeightsForPlayers,
}));

import {
  loadCoachWeightsForPlayer,
  loadCoachWeightsForPlayers,
  rankInsights,
  scoreInsight,
  type RankableInsight,
} from '../score';

const PLAYER_ID = 'player-1';

function chain(result: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b,
    eq: () => b,
    gte: async () => result,
    limit: () => b,
    maybeSingle: async () => result,
  };
  return b;
}

/** A client whose outcome-weight table holds one calibrated row. */
function outcomeClient(fromSpy = vi.fn()) {
  fromSpy.mockImplementation((table: string) => {
    if (table === 'golf_team_members') return chain({ data: { team_id: 'team-1' }, error: null });
    if (table === 'golf_team_coach_staff') return chain({ data: { coach_id: 'coach-1' }, error: null });
    if (table === 'golf_coachhelm_coach_weights') {
      return chain({ data: [{ insight_type: 'approach_miss', weight: 1.3, sample_n: 12 }], error: null });
    }
    throw new Error(`unexpected table ${table}`);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: fromSpy } as any;
}

const insights: RankableInsight[] = [
  { insight_type: 'putt_distance', strokes_impact: 1.0, confidence: 0.8, priority: 'medium' },
  { insight_type: 'approach_miss', strokes_impact: 0.9, confidence: 0.8, priority: 'medium' },
  { insight_type: 'tee_strategy', strokes_impact: 0.8, confidence: 0.8, priority: 'medium' },
];

beforeEach(() => {
  h.flagsOn.clear();
  h.loadCorrectionWeightsForPlayer.mockReset();
  h.loadCorrectionWeightsForPlayer.mockResolvedValue({ putt_distance: 0.5, tee_strategy: 1.2 });
  h.loadCorrectionWeightsForPlayers.mockReset();
  h.loadCorrectionWeightsForPlayers.mockResolvedValue(
    new Map([
      ['player-1', { coachId: 'coach-1', coachUserId: 'u-1', weights: { approach_miss: 0.6, putt_distance: 0.5 } }],
      ['player-2', { coachId: 'coach-2', coachUserId: 'u-2', weights: {} }],
    ]),
  );
});

describe('loadCoachWeightsForPlayer with coachhelm_corrections_v1 OFF', () => {
  it('both flags off: {} with no database read and no corrections read', async () => {
    const fromSpy = vi.fn();
    expect(await loadCoachWeightsForPlayer({ from: fromSpy } as never, PLAYER_ID)).toEqual({});
    expect(fromSpy).not.toHaveBeenCalled();
    expect(h.loadCorrectionWeightsForPlayer).not.toHaveBeenCalled();
  });

  it('outcome flag on: exactly the outcome weights, corrections never read', async () => {
    h.flagsOn.add('coachhelm_learned_personalization');
    const weights = await loadCoachWeightsForPlayer(outcomeClient(), PLAYER_ID);
    expect(weights).toEqual({ approach_miss: 1.3 });
    expect(h.loadCorrectionWeightsForPlayer).not.toHaveBeenCalled();
  });

  it('ranking is byte-identical to the neutral ranking', async () => {
    const weights = await loadCoachWeightsForPlayer({ from: vi.fn() } as never, PLAYER_ID);
    expect(insights.map((i) => scoreInsight(i, weights))).toEqual(insights.map((i) => scoreInsight(i, {})));
    expect(rankInsights(insights, weights)).toEqual(rankInsights(insights, {}));
  });
});

describe('loadCoachWeightsForPlayer with coachhelm_corrections_v1 ON', () => {
  it('applies W from corrections when the outcome flag is off', async () => {
    h.flagsOn.add('coachhelm_corrections_v1');
    const fromSpy = vi.fn();
    const weights = await loadCoachWeightsForPlayer({ from: fromSpy } as never, PLAYER_ID);
    expect(weights).toEqual({ putt_distance: 0.5, tee_strategy: 1.2 });
    expect(h.loadCorrectionWeightsForPlayer).toHaveBeenCalledWith(expect.anything(), PLAYER_ID);
    // W reorders: putt_distance (1.0 x 0.5) drops below the other two.
    expect(rankInsights(insights, weights).map((i) => i.insight_type)).toEqual([
      'tee_strategy',
      'approach_miss',
      'putt_distance',
    ]);
  });

  it('a calibrated outcome weight wins for its family (>= 10 verdicts hand-off)', async () => {
    h.flagsOn.add('coachhelm_corrections_v1');
    h.flagsOn.add('coachhelm_learned_personalization');
    h.loadCorrectionWeightsForPlayer.mockResolvedValue({ approach_miss: 0.6, putt_distance: 0.9 });
    const weights = await loadCoachWeightsForPlayer(outcomeClient(), PLAYER_ID);
    expect(weights).toEqual({ approach_miss: 1.3, putt_distance: 0.9 });
  });
});

/** A thenable builder for the batched outcome-weight read. */
function batchClient(rows: unknown[], fromSpy = vi.fn()) {
  fromSpy.mockImplementation((table: string) => {
    if (table !== 'golf_coachhelm_coach_weights') throw new Error(`unexpected table ${table}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    for (const m of ['select', 'in', 'eq', 'gte', 'order', 'range']) b[m] = () => b;
    b.then = (resolve: (v: unknown) => void) => Promise.resolve(resolve({ data: rows, error: null }));
    return b;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: fromSpy } as any;
}

describe('loadCoachWeightsForPlayers (team feed and roster batch)', () => {
  it('flag off: an empty map with no read at all', async () => {
    const fromSpy = vi.fn();
    const out = await loadCoachWeightsForPlayers({ from: fromSpy } as never, ['player-1', 'player-2']);
    expect(out.size).toBe(0);
    expect(fromSpy).not.toHaveBeenCalled();
    expect(h.loadCorrectionWeightsForPlayers).not.toHaveBeenCalled();
  });

  it('flag on: W per player from one batched load; neutral players are absent', async () => {
    h.flagsOn.add('coachhelm_corrections_v1');
    const fromSpy = vi.fn();
    const out = await loadCoachWeightsForPlayers({ from: fromSpy } as never, ['player-1', 'player-2']);
    expect(Object.fromEntries(out)).toEqual({ 'player-1': { approach_miss: 0.6, putt_distance: 0.5 } });
    expect(h.loadCorrectionWeightsForPlayers).toHaveBeenCalledTimes(1);
    // Outcome flag off: the outcome table is not read.
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('flag on with the outcome flag: a calibrated outcome weight still wins, per coach', async () => {
    h.flagsOn.add('coachhelm_corrections_v1');
    h.flagsOn.add('coachhelm_learned_personalization');
    const out = await loadCoachWeightsForPlayers(
      batchClient([
        { coach_id: 'coach-1', insight_type: 'approach_miss', weight: 1.3, sample_n: 12 },
        { coach_id: 'coach-2', insight_type: 'tee_strategy', weight: 0.9, sample_n: 15 },
      ]),
      ['player-1', 'player-2'],
    );
    expect(Object.fromEntries(out)).toEqual({
      'player-1': { approach_miss: 1.3, putt_distance: 0.5 },
      'player-2': { tee_strategy: 0.9 },
    });
  });
});
