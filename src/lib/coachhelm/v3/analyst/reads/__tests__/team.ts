/** A team of fixture players for the reads tests: varied strokes gained, approaches with miss sides, courses named. */
import { TeamFixture, normal, seeded, tenRounds, type Legs, type RoundSpec } from '../../__tests__/fixtures';

const SIDES = ['short', 'long', 'left', 'right'] as const;

/** Approaches for one round: twelve, from 60 to 200 yards, a share finding the green. */
function approaches(rng: () => number, greenShare: number): RoundSpec['approaches'] {
  return Array.from({ length: 12 }, (_, i) => {
    const yards = 60 + i * 12;
    const green = rng() < greenShare;
    return [yards, green ? 15 + Math.round(rng() * 25) : 30 + Math.round(rng() * 60), green] as const;
  });
}

export function readsTeam(opts: { players?: number; seed?: number; rounds?: number } = {}): TeamFixture {
  const rng = seeded(opts.seed ?? 11);
  const fx = new TeamFixture();
  const n = opts.players ?? 7;
  for (let p = 0; p < n; p++) {
    const means: Legs = { tee: -0.5 + normal(rng) * 0.6, approach: -1.5 + normal(rng) * 0.8, around: -0.4 + normal(rng) * 0.5, putting: -0.6 + normal(rng) * 0.6 };
    const greenShare = 0.35 + rng() * 0.4;
    const specs = tenRounds(2 + p, means, () => ({ approaches: approaches(rng, greenShare) }));
    fx.player(`player-${p}`, (opts.rounds ?? 10) < 10 ? specs.slice(0, opts.rounds) : specs);
  }
  // Courses named on every round, and a miss side on every missed approach (skewed per player).
  fx.rounds.forEach((r, i) => {
    r.course_name = i % 2 ? 'Pine Hollow' : 'River Bend';
  });
  for (const s of fx.shots) {
    if (s.shot_type === 'approach' && s.result !== 'green') {
      const p = Number(s.round_id.split('-')[1]);
      s.miss_direction = rng() < 0.4 + (p % 3) * 0.15 ? 'short' : SIDES[Math.floor(rng() * 4)]!;
    }
  }
  return fx;
}
