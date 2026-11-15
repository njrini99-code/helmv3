/**
 * Do the rules fire at the rate they state? Teams of players who are all drawn from ONE distribution have nothing
 * unusual in them: every supported read is a false one. This draws 400 such players with the round-to-round spread
 * production measures and counts.
 *
 * It is what showed that rule (b), with a plain t on teammates − 1 degrees of freedom, fired at about twice its
 * stated rate (a median and a MAD are noisier than a mean and a standard deviation), and that a par's scoring average
 * needs its error taken over rounds, not holes. Both are corrected in the code; this keeps them corrected.
 */
import { describe, expect, it } from 'vitest';
import { runAnalystDryRun } from '../dry-run';
import { ALPHA, FALSE_DISCOVERY_RATE, type Rule } from '../notability';
import { NOW, TEAM_ID, TeamFixture, daysAgo, normal, seeded, type RoundSpec } from './fixtures';

/** Twenty rounds from one distribution: every area the same distance below the Tour, spread as production's is. */
function sameForEveryone(rng: () => number): RoundSpec[] {
  const leg = (sd: number) => Math.round((-1 + sd * normal(rng)) * 100) / 100;
  const made = (p: number) => rng() < p;
  const count = (n: number, p: number) => Array.from({ length: n }, () => made(p)).filter(Boolean).length;
  const feet = (mean: number, sd: number) => Math.max(2, Math.round(mean + sd * normal(rng)));
  return Array.from({ length: 20 }, (_, i) => {
    const greens = count(18, 0.55);
    return {
      date: daysAgo(2 + i * 5),
      score: Math.min(88, Math.max(68, 76 + Math.round(3 * normal(rng)))),
      // src/clubhouse/lib/stats-signal.ts POOLED_LEG_SD: 1.3, 2.5, 1.4, 2.0.
      sg: { tee: leg(1.3), approach: leg(2.5), around: leg(1.4), putting: leg(2.0) },
      putts: [[4, made(0.8)], [4, made(0.8)], [7, made(0.45)], [8, made(0.45)], [9, made(0.45)], [12, made(0.25)], [13, made(0.25)], [20, made(0.1)], [30, made(0.04)]] as const,
      approaches: [
        [100, feet(30, 12), made(0.65)],
        [100, feet(30, 12), made(0.65)],
        [150, feet(45, 18), made(0.5)],
        [150, feet(45, 18), made(0.5)],
        [190, feet(70, 25), made(0.3)],
        [190, feet(70, 25), made(0.3)],
      ] as const,
      cache: {
        greens_hit: greens,
        fairways_hit: count(14, 0.55),
        total_putts: 28 + count(8, 0.5),
        three_putts: count(4, 0.3),
        penalty_strokes: count(3, 0.3),
        scramble_attempts: 18 - greens,
        scrambles_converted: count(18 - greens, 0.45),
        sand_attempts: 2,
        sand_saves: count(2, 0.35),
      },
    };
  });
}

describe('players with nothing unusual about them', () => {
  it('are called at no more than the stated rates', async () => {
    const p: Record<Rule, number[]> = { changed: [], stands_out_in_team: [], biggest_cost: [] };
    let players = 0;
    let withARead = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const fx = new TeamFixture();
      const rng = seeded(seed);
      for (let k = 0; k < 10; k++) fx.player(`player-${k}`, sameForEveryone(rng));
      const run = await runAnalystDryRun(fx.sources(), { teamId: TEAM_ID, now: NOW });
      for (const { notability: n } of run.players) {
        players += 1;
        const supported = [...n.candidates, ...n.candidates.flatMap((c) => c.supporting), ...n.good_news, ...n.beyond_cap, ...n.outcome_context];
        if (supported.length) withARead += 1;
        for (const u of n.unremarkable) for (const t of u.tests) p[t.rule].push(t.p_value);
        for (const s of supported) {
          for (const r of s.reasons) p[r.rule].push(r.test.p_value);
          for (const t of s.also_tested) p[t.rule].push(t.p_value);
        }
      }
    }
    const rate = (rule: Rule, level: number) => p[rule].filter((x) => x < level).length / p[rule].length;
    expect(players).toBe(400);
    expect(p.changed.length).toBeGreaterThan(10_000);
    expect(p.stands_out_in_team.length).toBeGreaterThan(9_000);
    expect(p.biggest_cost.length).toBe(400);

    // Each rule's own test: with no real difference, p < 0.05 about one time in twenty or fewer. The margins are
    // three standard errors of a 5% rate over the tests counted (about 0.6 points on 10,000, 3.3 on 400).
    expect(rate('changed', ALPHA)).toBeLessThan(0.057);
    expect(rate('stands_out_in_team', ALPHA)).toBeLessThan(0.057);
    expect(rate('biggest_cost', ALPHA)).toBeLessThan(0.083);
    // And they are not switched off: the change test sits near its level, not at zero.
    expect(rate('changed', ALPHA)).toBeGreaterThan(0.03);

    // A player's whole run: Benjamini-Hochberg at q holds the share of players given ANY read (candidate or good news)
    // at or under q when nothing is real. Margin: three standard errors of a 10% rate over 400 players is 4.5 points.
    expect(withARead / players).toBeLessThan(FALSE_DISCOVERY_RATE + 0.045);
  });
});
