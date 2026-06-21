import { describe, it, expect } from 'vitest';

import {
  samplePerPlayerRounds,
  computeTeamHealth,
} from '../team-category-insights-helpers';

// ---------------------------------------------------------------------------
// Per-player round sampling (P448 / P2-17)
// ---------------------------------------------------------------------------

describe('samplePerPlayerRounds', () => {
  function rounds(playerId: string, count: number) {
    return Array.from({ length: count }, (_, i) => ({
      player_id: playerId,
      id: `${playerId}-${i}`,
    }));
  }

  it('Player A cannot consume Player B\'s ten-round quota', () => {
    // A is hyper-active (50 rounds), B is sparse (3 rounds). The combined list
    // is ordered most-recent-first across the whole team, with A's rounds
    // arriving first (as a global query would return them).
    const all = [...rounds('A', 50), ...rounds('B', 3)];

    const kept = samplePerPlayerRounds(all, 10);

    const aKept = kept.filter((r) => r.player_id === 'A');
    const bKept = kept.filter((r) => r.player_id === 'B');

    // A is capped at its 10-round quota — it cannot bleed into B's slots.
    expect(aKept).toHaveLength(10);
    // B keeps ALL of its rounds (fewer than the cap), not zero.
    expect(bKept).toHaveLength(3);
  });

  it('keeps the most-recent rounds per player (input is desc-ordered)', () => {
    // Most-recent-first: A-0 is newest, A-19 is oldest.
    const all = rounds('A', 20);
    const kept = samplePerPlayerRounds(all, 10);
    expect(kept.map((r) => r.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `A-${i}`),
    );
  });

  it('caps every player independently with interleaved input', () => {
    const all: Array<{ player_id: string; id: string }> = [];
    // Interleave so neither player is front-loaded.
    for (let i = 0; i < 30; i++) {
      all.push({ player_id: 'A', id: `A-${i}` });
      all.push({ player_id: 'B', id: `B-${i}` });
    }
    const kept = samplePerPlayerRounds(all, 10);
    expect(kept.filter((r) => r.player_id === 'A')).toHaveLength(10);
    expect(kept.filter((r) => r.player_id === 'B')).toHaveLength(10);
  });

  it('returns nothing when the per-player cap is zero or negative', () => {
    expect(samplePerPlayerRounds(rounds('A', 5), 0)).toEqual([]);
    expect(samplePerPlayerRounds(rounds('A', 5), -3)).toEqual([]);
  });

  it('handles an empty input list', () => {
    expect(samplePerPlayerRounds([], 10)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Team health: empty category = insufficient data, not healthy (P2-17)
// ---------------------------------------------------------------------------

describe('computeTeamHealth', () => {
  it('Empty category is "insufficient data", not healthy', () => {
    // One scorable category with every player flagged (0% healthy) plus an
    // empty category. If the empty one counted as a perfect 1.0, health would
    // average to 50; instead the empty category is excluded and health is 0.
    const teamHealth = computeTeamHealth([
      { players: { length: 4 }, attentionCount: 4 }, // 0% healthy
      { players: { length: 0 }, attentionCount: 0 }, // empty — must NOT count
    ]);
    expect(teamHealth).toBe(0);
  });

  it('a single empty category yields 0 (no signal), not 100', () => {
    expect(
      computeTeamHealth([{ players: { length: 0 }, attentionCount: 0 }]),
    ).toBe(0);
  });

  it('averages only the categories that have player data', () => {
    const teamHealth = computeTeamHealth([
      { players: { length: 4 }, attentionCount: 0 }, // 100% healthy
      { players: { length: 4 }, attentionCount: 2 }, // 50% healthy
      { players: { length: 0 }, attentionCount: 0 }, // excluded
    ]);
    // (1.0 + 0.5) / 2 = 0.75 -> 75, NOT (1.0 + 0.5 + 1.0)/3 = 83.
    expect(teamHealth).toBe(75);
  });

  it('returns 0 when there are no categories at all', () => {
    expect(computeTeamHealth([])).toBe(0);
  });
});
