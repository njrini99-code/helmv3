/**
 * `approach_miss` throws away a real cohort benchmark that already exists.
 *
 * Measured against production 2026-08-18:
 *
 *     approach_miss insights, active            123
 *     ...carrying a `standing` block              0
 *     golf_player_standing rows, approach_*     106  (38 players, refreshed today)
 *
 * The data is there and fresh; the generator never asks for it. `run()` loads
 * standing ONLY when `requiresStanding` is true (generator-base.ts:489), and
 * ApproachMissGenerator sets that false — correctly, because no sourced PGA
 * on-green-proximity benchmark exists for these buckets. But false also means
 * "never load", so the card shows an approximate Tour figure instead of the
 * player's real cohort position, and the whole `if (standing)` block — which
 * is where the COUNTERFACTUAL and its `strokes_impact` come from — is skipped.
 *
 * WHY NOT JUST FLIP IT TO TRUE. Because `requiresStanding` also GATES: no
 * standing → no insight at all (`status: 'standing_lag'`). Joining the two
 * tables on (player_id, metric_id):
 *
 *     insight/metric pairs           123
 *     ...that have a standing row    105
 *     ...that do NOT                  18
 *
 * So a naive flip buys a better benchmark for 105 and DELETES the approach
 * card outright for 18. The two questions — "may I emit without standing?"
 * and "should I load standing if it happens to exist?" — are not the same
 * question and need separating.
 */
import { describe, it, expect } from 'vitest';
import { resolveStandingPolicy } from '@/lib/coachhelm/v3/engine/generator-base';

describe('resolveStandingPolicy', () => {
  it('loads and gates for a benchmark-backed generator (today’s default)', () => {
    expect(
      resolveStandingPolicy({ requiresStanding: true, attachStandingWhenAvailable: false }),
    ).toEqual({ load: true, gateOnMissing: true });
  });

  it('neither loads nor gates for a pure player-vs-self diagnostic', () => {
    // e.g. putt miss bias — no public benchmark, and none is wanted.
    expect(
      resolveStandingPolicy({ requiresStanding: false, attachStandingWhenAvailable: false }),
    ).toEqual({ load: false, gateOnMissing: false });
  });

  it('loads WITHOUT gating when standing is welcome but not required', () => {
    // The case approach_miss needs: attach a real cohort position for the 105
    // pairs that have one, and still emit for the 18 that do not.
    expect(
      resolveStandingPolicy({ requiresStanding: false, attachStandingWhenAvailable: true }),
    ).toEqual({ load: true, gateOnMissing: false });
  });

  it('never gates on missing standing unless it is genuinely required', () => {
    // requiresStanding is the ONLY thing that may suppress an insight.
    for (const attach of [true, false]) {
      expect(
        resolveStandingPolicy({ requiresStanding: false, attachStandingWhenAvailable: attach })
          .gateOnMissing,
      ).toBe(false);
    }
  });
});

/**
 * ApproachMissGenerator is the generator this was built for: no sourced PGA
 * on-green-proximity benchmark exists for its buckets (so it must never be
 * gated), but a real cohort position does exist for 105 of its 123 live
 * (player, metric) pairs.
 */
describe('ApproachMissGenerator standing policy', () => {
  it('loads standing without ever gating on it', async () => {
    const { ApproachMissGenerator } = await import(
      '@/lib/coachhelm/v3/generators/approach-miss'
    );
    const g = new ApproachMissGenerator('p1', '175_plus_ft');

    // Both flags are protected; read them through the instance the same way
    // run() does. This is the contract, not an implementation detail: gating
    // here would delete the card for the 18 pairs with no standing row.
    const policy = resolveStandingPolicy({
      requiresStanding: (g as unknown as { requiresStanding: boolean }).requiresStanding,
      attachStandingWhenAvailable: (g as unknown as { attachStandingWhenAvailable: boolean })
        .attachStandingWhenAvailable,
    });

    expect(policy).toEqual({ load: true, gateOnMissing: false });
  });
});
