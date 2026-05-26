/**
 * W33-pt2 — unit coverage for the 7 new dimensions + updated registry.
 *
 * Each dim gets one "fires + labels" test and one "below floor →
 * null" test. The orchestrator is exercised at the integration layer
 * (prod backfill).
 */

import { describe, it, expect } from 'vitest';
import pressureDelta from '@/lib/coachhelm/v3/genome/dimensions/pressure-delta';
import scramblingRate from '@/lib/coachhelm/v3/genome/dimensions/scrambling-rate';
import par3Proficiency from '@/lib/coachhelm/v3/genome/dimensions/par3-proficiency';
import weatherStub from '@/lib/coachhelm/v3/genome/dimensions/weather-sensitivity-stub';
import backNineDelta from '@/lib/coachhelm/v3/genome/dimensions/back-nine-delta';
import scoringTrend from '@/lib/coachhelm/v3/genome/dimensions/scoring-trend';
import driverUsage from '@/lib/coachhelm/v3/genome/dimensions/driver-usage';
import { GENOME_CATEGORIES } from '@/lib/coachhelm/v3/genome/types';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import type {
  GenomeContext,
  GenomeHoleScore,
  GenomeRound,
  GenomeShot,
} from '@/lib/coachhelm/v3/genome/types';

function ctx(overrides: Partial<GenomeContext> = {}): GenomeContext {
  return {
    player_id: 'p-1',
    recent_rounds_count: overrides.recent_rounds_count ?? 10,
    rounds: overrides.rounds ?? [],
    hole_scores: overrides.hole_scores ?? [],
    shots: overrides.shots ?? [],
  };
}

function round(over: Partial<GenomeRound>): GenomeRound {
  return {
    id: over.id ?? `r-${Math.random()}`,
    round_date: over.round_date ?? '2026-05-01',
    round_type: over.round_type ?? 'practice',
    total_score: over.total_score ?? 75,
    score_to_par: over.score_to_par ?? 0,
  };
}

function hole(over: Partial<GenomeHoleScore> & { hole_number: number; par: number; score: number }): GenomeHoleScore {
  return {
    round_id: over.round_id ?? 'r-1',
    hole_number: over.hole_number,
    par: over.par,
    score: over.score,
  };
}

function shot(over: Partial<GenomeShot> = {}): GenomeShot {
  return {
    round_id: over.round_id ?? 'r-1',
    hole_number: over.hole_number ?? 1,
    shot_type: over.shot_type ?? 'approach',
    club_type: over.club_type ?? 'non_driver',
    lie_before: over.lie_before ?? 'fairway',
    lie_after: over.lie_after ?? 'green',
    distance_to_hole_before: over.distance_to_hole_before ?? 150,
    distance_to_hole_after: over.distance_to_hole_after ?? 18,
    miss_direction: over.miss_direction ?? null,
    is_penalty: over.is_penalty ?? false,
  };
}

// ---------------------------------------------------------------------------
// Registry coverage — every category should have ≥1 dim shipped
// ---------------------------------------------------------------------------

describe('registry coverage', () => {
  it('ships at least one dimension per category', () => {
    const covered = new Set(GENOME_DIMENSIONS.map((d) => d.category));
    for (const cat of GENOME_CATEGORIES) {
      expect(covered.has(cat)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// pressure_delta
// ---------------------------------------------------------------------------

describe('pressure_delta', () => {
  it('positive value when tournaments score worse than practice', () => {
    const rounds = [
      ...Array.from({ length: 4 }, () => round({ round_type: 'tournament', score_to_par: 4 })),
      ...Array.from({ length: 4 }, () => round({ round_type: 'practice', score_to_par: 1 })),
    ];
    const r = pressureDelta.compute(ctx({ rounds }));
    expect(r.value).toBeGreaterThan(0);
    expect(r.label).toBe('Tightens up');
  });

  it('null when missing one side', () => {
    const rounds = Array.from({ length: 10 }, () => round({ round_type: 'practice', score_to_par: 0 }));
    expect(pressureDelta.compute(ctx({ rounds })).value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scrambling_rate
// ---------------------------------------------------------------------------

describe('scrambling_rate', () => {
  it('high rate from rough/bunker chips that land close', () => {
    const shots = Array.from({ length: 20 }, () =>
      shot({ shot_type: 'chip', lie_before: 'rough', distance_to_hole_after: 6 }),
    );
    const r = scramblingRate.compute(ctx({ shots }));
    expect(r.value).toBe(1);
    expect(r.label).toBe('Wizard');
  });

  it('null below 15 attempts', () => {
    const shots = Array.from({ length: 5 }, () => shot({ shot_type: 'chip', lie_before: 'rough' }));
    expect(scramblingRate.compute(ctx({ shots })).value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// par3_proficiency
// ---------------------------------------------------------------------------

describe('par3_proficiency', () => {
  it('negative value when par-3 scores beat par on average', () => {
    const holes = Array.from({ length: 20 }, () => hole({ hole_number: 3, par: 3, score: 2 }));
    const r = par3Proficiency.compute(ctx({ hole_scores: holes }));
    expect(r.value).toBe(-1);
    expect(r.label).toBe('Under par');
  });

  it('null below 16 par-3 holes', () => {
    const holes = Array.from({ length: 5 }, () => hole({ hole_number: 3, par: 3, score: 4 }));
    expect(par3Proficiency.compute(ctx({ hole_scores: holes })).value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// weather_sensitivity_stub
// ---------------------------------------------------------------------------

describe('weather_sensitivity_stub', () => {
  it('always returns null with "awaiting weather data" label', () => {
    const r = weatherStub.compute(ctx());
    expect(r.value).toBeNull();
    expect(r.label).toMatch(/weather/i);
  });
});

// ---------------------------------------------------------------------------
// back_nine_delta
// ---------------------------------------------------------------------------

describe('back_nine_delta', () => {
  it('positive when back-9 averages more strokes-to-par than front-9', () => {
    const holes = [
      ...Array.from({ length: 9 }, (_, i) => hole({ hole_number: i + 1, par: 4, score: 4 })),
      ...Array.from({ length: 9 }, (_, i) => hole({ hole_number: i + 10, par: 4, score: 5 })),
    ];
    const r = backNineDelta.compute(ctx({ recent_rounds_count: 8, hole_scores: holes }));
    expect(r.value).toBe(1);
    expect(r.label).toBe('Fades late');
  });

  it('null below 5 rounds', () => {
    const r = backNineDelta.compute(ctx({ recent_rounds_count: 3 }));
    expect(r.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scoring_trend
// ---------------------------------------------------------------------------

describe('scoring_trend', () => {
  it('negative (Improving) when recent rounds average lower than earlier', () => {
    // recent = last 30 days, earlier = 31-90 days
    const today = new Date().toISOString().slice(0, 10);
    const long = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
    const rounds = [
      ...Array.from({ length: 4 }, () => round({ round_date: today, score_to_par: -1 })),
      ...Array.from({ length: 4 }, () => round({ round_date: long, score_to_par: 3 })),
    ];
    const r = scoringTrend.compute(ctx({ rounds }));
    expect(r.value!).toBeLessThan(0);
    expect(r.label).toBe('Improving');
  });

  it('null below 3 per window', () => {
    const rounds = [
      round({ round_date: '2026-05-25', score_to_par: 0 }),
      round({ round_date: '2026-04-01', score_to_par: 0 }),
    ];
    expect(scoringTrend.compute(ctx({ rounds })).value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// driver_usage
// ---------------------------------------------------------------------------

describe('driver_usage', () => {
  it('high rate when most tee shots are driver', () => {
    const shots = [
      ...Array.from({ length: 40 }, () => shot({ shot_type: 'tee', club_type: 'driver' })),
      ...Array.from({ length: 10 }, () => shot({ shot_type: 'tee', club_type: 'non_driver' })),
    ];
    const r = driverUsage.compute(ctx({ shots }));
    expect(r.value).toBe(0.8);
    expect(r.label).toBe('Bomber');
  });

  it('null below 40 tee shots', () => {
    const shots = Array.from({ length: 10 }, () => shot({ shot_type: 'tee', club_type: 'driver' }));
    expect(driverUsage.compute(ctx({ shots })).value).toBeNull();
  });
});
