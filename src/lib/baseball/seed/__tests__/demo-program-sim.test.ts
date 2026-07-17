import { describe, it, expect } from 'vitest';
import {
  simulateGame,
  seedFromString,
  mulberry32,
  type HitterSkill,
  type PitcherSkill,
  type SimulateGameParams,
} from '../demo-program-sim';

const HITTER: HitterSkill = {
  avg: 0.3,
  hrPct: 0.12,
  xbhPct: 0.35,
  bbPct: 0.1,
  kPct: 0.18,
  speed: 0.3,
};

const FAST_HITTER: HitterSkill = { ...HITTER, speed: 0.8, avg: 0.34 };
const WEAK_HITTER: HitterSkill = { ...HITTER, avg: 0.21, hrPct: 0.03, speed: 0.05 };

const STARTER: PitcherSkill = { h9: 7.8, k9: 9.4, bb9: 2.7, eraTarget: 3.1 };
const RELIEVER: PitcherSkill = { h9: 8.3, k9: 8.0, bb9: 3.3, eraTarget: 3.9 };

function buildParams(gameKey: string): SimulateGameParams {
  return {
    gameKey,
    hitters: [
      { key: 'p1', skill: FAST_HITTER },
      { key: 'p2', skill: HITTER },
      { key: 'p3', skill: FAST_HITTER },
      { key: 'p5', skill: HITTER },
      { key: 'p6', skill: HITTER },
      { key: 'p8', skill: WEAK_HITTER },
    ],
    starter: { key: 'p4', skill: STARTER },
    reliever: { key: 'p7', skill: RELIEVER },
  };
}

describe('mulberry32 / seedFromString', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(seedFromString('game:2026-03-14'));
    const b = mulberry32(seedFromString('game:2026-03-14'));
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(seedFromString('game:2026-03-14'));
    const b = mulberry32(seedFromString('game:2026-03-21'));
    expect(a()).not.toEqual(b());
  });
});

describe('simulateGame', () => {
  it('is a pure function of its inputs (idempotent across repeated calls)', () => {
    const params = buildParams('demo-team:2026-03-14');
    const first = simulateGame(params);
    const second = simulateGame(params);
    expect(second).toEqual(first);
  });

  it('produces a different game for a different gameKey', () => {
    const g1 = simulateGame(buildParams('demo-team:2026-03-14'));
    const g2 = simulateGame(buildParams('demo-team:2026-03-21'));
    expect(g1).not.toEqual(g2);
  });

  it('never ends in a tie', () => {
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      const sim = simulateGame(buildParams(`tie-check:${key}`));
      expect(sim.ourScore).not.toBe(sim.opponentScore);
    }
  });

  it('batting R sums to ourScore (invariant, not just spot-checked)', () => {
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      const sim = simulateGame(buildParams(`sum-check:${key}`));
      const battingRuns = sim.batting.reduce((sum, b) => sum + b.r, 0);
      expect(battingRuns).toBe(sim.ourScore);
    }
  });

  it('pitching R sums to opponentScore (invariant)', () => {
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      const sim = simulateGame(buildParams(`sum-check-pitch:${key}`));
      const pitchingRuns = sim.pitching.reduce((sum, p) => sum + p.r, 0);
      expect(pitchingRuns).toBe(sim.opponentScore);
    }
  });

  it('IP always sums to exactly 9 across the two pitchers', () => {
    const sim = simulateGame(buildParams('ip-check'));
    const totalIp = sim.pitching.reduce((sum, p) => sum + p.ip, 0);
    expect(totalIp).toBe(9);
  });

  it('every batting line is internally consistent (h <= ab, extra bases <= h - hr)', () => {
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const sim = simulateGame(buildParams(`consistency:${key}`));
      for (const b of sim.batting) {
        expect(b.h).toBeLessThanOrEqual(b.ab);
        expect(b.doubles + b.triples + b.hr).toBeLessThanOrEqual(b.h);
        expect(b.hr).toBeLessThanOrEqual(b.h);
        expect(b.ab).toBeGreaterThanOrEqual(3);
        expect(b.ab).toBeLessThanOrEqual(5);
      }
    }
  });

  it('every pitching line has er <= r (unearned runs never exceed total runs)', () => {
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      const sim = simulateGame(buildParams(`er-check:${key}`));
      for (const p of sim.pitching) {
        expect(p.er).toBeLessThanOrEqual(p.r);
      }
    }
  });

  it('exactly one pitcher is marked as starter and gs/gf-style roles are distinct', () => {
    const sim = simulateGame(buildParams('roles'));
    const starters = sim.pitching.filter((p) => p.isStarter);
    expect(starters).toHaveLength(1);
    expect(sim.pitching).toHaveLength(2);
  });

  it('assigns the win to the pitcher on the winning side and a save only to a non-losing reliever', () => {
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      const sim = simulateGame(buildParams(`decision:${key}`));
      const starterLine = sim.pitching.find((p) => p.isStarter);
      const relieverLine = sim.pitching.find((p) => !p.isStarter);
      expect(starterLine).toBeDefined();
      expect(relieverLine).toBeDefined();
      const won = sim.ourScore > sim.opponentScore;
      expect(starterLine?.result).toBe(won ? 'W' : 'L');
      if (relieverLine?.result === 'S') {
        expect(won).toBe(true);
        expect(sim.ourScore - sim.opponentScore).toBeLessThanOrEqual(3);
      }
    }
  });
});
