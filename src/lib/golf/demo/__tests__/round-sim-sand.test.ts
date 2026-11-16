import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { playHole, type DaySkill, type SimHole } from '../round-sim';

const skill: DaySkill = { drive: 270, fairway: 0.55, approach: -0.5, shortGame: -0.5, putting: 0, penaltyRate: 0.08, volatility: 0.3, wild: 0.05 };

function holes(): SimHole[] {
  const out: SimHole[] = [];
  for (let i = 0; i < 4000; i++) out.push(playHole(new Rng('sand-save', String(i)), { par: (3 + (i % 3)) as 3 | 4 | 5, yards: 180 + (i % 3) * 150 }, 1, skill));
  return out;
}

describe('demo sand saves follow the Tour definition', () => {
  const all = holes();

  it('counts only greenside bunker shots as attempts, and a save is holing out in two from the first of them', () => {
    let attempts = 0;
    for (const h of all) {
      const first = h.shots.findIndex((x) => x.shot_type === 'around_green' && x.lie_before === 'sand');
      if (first < 0) {
        expect(h.sand_save).toBeNull();
        continue;
      }
      attempts += 1;
      expect(h.sand_save).toBe(h.shots.length - first <= 2);
    }
    expect(attempts).toBeGreaterThan(0);
  });

  it('does not tie a save to the score', () => {
    expect(all.some((h) => h.sand_save === true && h.score > h.par)).toBe(true);
  });
});
