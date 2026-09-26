import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

import {
  LieApproachGenerator,
  composeLieApproach,
  computeLieApproach,
  toLieAggregate,
} from '../lie-approach';
import { INSIGHT_ANGLES_FLAG } from '../angle-data';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { PLAYER, mkData, mkHole, mkPeerRounds, mkRound, mkShot } from './fixtures';

/**
 * `rounds` rounds; on each, holes 1..9 play an approach from the fairway and
 * holes 10..18 from the rough, both from 140-160 yd. `roughFinish` decides
 * how the rough approaches end.
 */
function build(opts: { rounds?: number; holes?: 9 | 18; roughFinish: 'short_rough' | 'green'; par3Tee?: boolean }) {
  const rounds = Array.from({ length: opts.rounds ?? 6 }, (_, i) => mkRound(i, { holes: opts.holes ?? 18 }));
  const holes = [];
  const shots = [];
  const per = (opts.holes ?? 18) / 2;
  for (const r of rounds) {
    for (let h = 1; h <= per * 2; h++) {
      const rough = h > per;
      holes.push(mkHole(r.id, h, { fairway_hit: !rough }));
      const d = 140 + ((h * 7) % 21);
      if (!rough) {
        shots.push(mkShot(r.id, h, 2, { lie_before: 'fairway', distance_to_hole_before: d, distance_to_hole_after: 10 + (h % 6) }));
      } else if (opts.roughFinish === 'green') {
        shots.push(mkShot(r.id, h, 2, { lie_before: 'rough', distance_to_hole_before: d, distance_to_hole_after: 10 + (h % 6) }));
      } else {
        shots.push(
          mkShot(r.id, h, 2, {
            lie_before: 'rough',
            distance_to_hole_before: d,
            lie_after: 'rough',
            result: 'rough',
            distance_to_hole_after: 18 + (h % 9),
            distance_unit_after: 'yards',
          }),
        );
      }
    }
    if (opts.par3Tee) {
      holes.push(mkHole(r.id, 19, { par: 3 }));
      shots.push(mkShot(r.id, 19, 1, { lie_before: 'tee', distance_to_hole_before: 160 }));
    }
  }
  return mkData(rounds, holes, shots);
}

describe('computeLieApproach', () => {
  it('returns null with no rounds', () => {
    expect(computeLieApproach(mkData([], [], []), null)).toBeNull();
  });

  it('flags rough execution when the rough costs more than the Tour lie penalty', () => {
    const r = computeLieApproach(build({ roughFinish: 'short_rough' }), null)!;
    expect(r.cause).toBe('rough_execution');
    expect(r.rough_excess!).toBeGreaterThan(0.1);
    expect(r.rough_excess_z!).toBeGreaterThan(1.645);
    expect(r.rough_shots).toBe(54);
    expect(r.rough_per_18).toBe(9);
    const band = r.bands.find((b) => b.band === '125_175ft')!;
    expect(band.qualifies).toBe(true);
    expect(band.fairway.gir_pct).toBe(100);
    expect(band.rough.gir_pct).toBe(0);
  });

  it('does not call a rough leak when rough play matches what the lie predicts', () => {
    const r = computeLieApproach(build({ roughFinish: 'green' }), null)!;
    expect(r.rough_excess!).toBeLessThan(0.1);
    expect(r.cause).toBeNull();
  });

  it('gates on rough sample: too few rounds/shots means no cause', () => {
    const r = computeLieApproach(build({ rounds: 2, roughFinish: 'short_rough' }), null)!;
    expect(r.rough_shots).toBe(18);
    expect(r.cause).toBeNull();
  });

  it('names fairway exposure (tee cause) when fairways trail teammates and rough play is normal', () => {
    const peers = [
      ...mkPeerRounds('p1', 8, () => ({ fairways_hit: 12, fairways_total: 14 })),
      ...mkPeerRounds('p2', 8, () => ({ fairways_hit: 11, fairways_total: 14 })),
      ...mkPeerRounds('p3', 8, () => ({ fairways_hit: 12, fairways_total: 14 })),
      // The player's own rounds on the team never count as a peer.
      ...mkPeerRounds(PLAYER, 8, () => ({ fairways_hit: 0, fairways_total: 14 })),
    ];
    const r = computeLieApproach(build({ roughFinish: 'green' }), peers)!;
    expect(r.peer_n).toBe(3);
    expect(r.fairway_pct).toBe(50);
    expect(r.peer_fairway_pct).toBeCloseTo(85.7, 1);
    expect(r.cause).toBe('fairway_exposure');
    expect(r.exposure_cost_per_round).toBeGreaterThan(0.3);
  });

  it('needs at least 3 peers for the fairway benchmark', () => {
    const peers = mkPeerRounds('p1', 8, () => ({ fairways_hit: 13, fairways_total: 14 }));
    const r = computeLieApproach(build({ roughFinish: 'green' }), peers)!;
    expect(r.peer_fairway_pct).toBeNull();
    expect(r.cause).toBeNull();
  });

  it('excludes par-3 tee shots (recorded as approaches from the tee) and counts them', () => {
    const r = computeLieApproach(build({ roughFinish: 'short_rough', par3Tee: true }), null)!;
    expect(r.excluded.par3_tee).toBe(6);
    expect(r.rough_shots).toBe(54);
    expect(r.bands.find((b) => b.band === '125_175ft')!.fairway.n).toBe(54);
  });

  it('scales rough approaches to per 18 on 9-hole rounds', () => {
    const r = computeLieApproach(build({ rounds: 12, holes: 9, roughFinish: 'short_rough' }), null)!;
    // Holes 5-9 are rough: 12 rounds × 5 over 108 holes → 10 per 18 (5 per 9 holes),
    // not the raw per-round count of 5.
    expect(r.rough_shots).toBe(60);
    expect(r.rough_per_18).toBe(10);
  });
});

describe('composeLieApproach', () => {
  it('sizes the projection with the player\'s own rough attempts and ships honest evidence', () => {
    const r = computeLieApproach(build({ roughFinish: 'short_rough' }), null)!;
    const agg = toLieAggregate(r, 74)!;
    const c = composeLieApproach(agg);
    const ev = c.evidence as typeof c.evidence & { counterfactual: { strokes_saved_per_round: number; attempts_used: number; clamped?: boolean } };
    expect(c.category).toBe('approach');
    expect(c.framing).toBe('leak');
    expect(c.signature).toBe('lie_approach:rough_execution');
    expect(ev.metric).toBe('approach_rough_lie_penalty');
    expect(ev.comparison_source).toBe('pga_baseline');
    expect(ev.comparison_value).toBe(0);
    expect(ev.window_start).toBe('2026-01-01');
    expect(ev.counterfactual.attempts_used).toBe(9);
    expect(ev.counterfactual.strokes_saved_per_round).toBe(Math.min(2.5, Math.round(9 * r.rough_excess! * 100) / 100));
    expect(ev.diagnosis?.causality_level).toBe('inferred_hypothesis');
    expect(c.content).toContain('Par-3 tee shots');
    expect(c.category).not.toBe('course_management');
    expect(c.content).not.toMatch(/contact|swing|nerves/i);
    const receipts = (ev.detail as { receipts: { examples: { note: string }[]; exclusions: Record<string, number> } }).receipts;
    expect(receipts.examples).toHaveLength(5);
    expect(receipts.examples[0]!.note).toContain('approach from the rough');
    expect(receipts.exclusions.par3_tee_shots).toBe(0);
    expect(receipts.exclusions).toHaveProperty('approaches_without_computable_sg');
  });

  it('the tee-cause row goes under the tee area with a team_avg comparison', () => {
    const peers = [1, 2, 3].flatMap((p) => mkPeerRounds(`p${p}`, 8, () => ({ fairways_hit: 12, fairways_total: 14 })));
    const r = computeLieApproach(build({ roughFinish: 'green' }), peers)!;
    const c = composeLieApproach(toLieAggregate(r, null)!);
    expect(c.category).toBe('tee');
    expect(c.signature).toBe('lie_approach:fairway_exposure');
    expect(c.evidence.comparison_source).toBe('team_avg');
    expect((c.evidence.detail as { linked_area: string }).linked_area).toBe('approach');
    // No scoring baseline → projection is sized but not rendered as a score.
    const cf = (c.evidence as unknown as { counterfactual: { suppressed: boolean; suppress_reason: string } }).counterfactual;
    expect(cf.suppressed).toBe(true);
    expect(cf.suppress_reason).toBe('no_baseline');
  });

  it('toLieAggregate is null when no cause qualified', () => {
    expect(toLieAggregate(computeLieApproach(build({ roughFinish: 'green' }), null), 74)).toBeNull();
  });
});

describe('LieApproachGenerator', () => {
  it('is gated by the insight-angles flag (default off)', async () => {
    const gen = new LieApproachGenerator(PLAYER);
    await expect((gen as unknown as { isEnabled(): Promise<boolean> }).isEnabled()).resolves.toBe(false);
    expect(isFlagEnabled).toHaveBeenCalledWith(INSIGHT_ANGLES_FLAG);
  });

  it('takes its category from the composed cause', () => {
    const gen = new LieApproachGenerator(PLAYER);
    const peers = [1, 2, 3].flatMap((p) => mkPeerRounds(`p${p}`, 8, () => ({ fairways_hit: 12, fairways_total: 14 })));
    gen.composeContent(toLieAggregate(computeLieApproach(build({ roughFinish: 'green' }), peers), 74)!);
    expect(gen.category).toBe('tee');
  });
});
