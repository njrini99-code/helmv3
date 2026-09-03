import { describe, it, expect } from 'vitest';
import { computeGoldenPathHealth } from '../golden-path-health';
import type { ErrorBudgetReport, FeatureErrorBudget } from '@/lib/reliability/error-budget';
import { GOLDEN_PATHS } from '../golden-paths.generated';

const NOW = new Date('2026-09-03T12:00:00.000Z');

function budgetRow(overrides: Partial<FeatureErrorBudget> = {}): FeatureErrorBudget {
  return {
    featureId: 'stats_analytics',
    tier: 'high',
    windowsConsidered: 3,
    windowsReadable: 3,
    observedCount: 0,
    observedIsFloor: false,
    allowedCount: 15,
    burnRate: 0,
    state: 'ok',
    ...overrides,
  };
}

function report(features: FeatureErrorBudget[]): ErrorBudgetReport {
  return { generatedAt: NOW.toISOString(), windowsConsidered: 3, windowsReadable: 3, fullyBlind: false, features };
}

describe('computeGoldenPathHealth', () => {
  it('produces one row per journey seeded in golden-paths.yml', () => {
    const health = computeGoldenPathHealth(report([]), NOW);
    expect(health.journeys).toHaveLength(GOLDEN_PATHS.length);
    expect(health.journeys.map((j) => j.journeyId).sort()).toEqual([...GOLDEN_PATHS.map((j) => j.id)].sort());
  });

  it('a journey whose feature_id resolves to a real FeatureKey inherits that feature\'s error-budget state', () => {
    // coach_view_player_stats -> stats_analytics, which IS a real FeatureKey.
    const health = computeGoldenPathHealth(report([budgetRow({ featureId: 'stats_analytics', state: 'red' })]), NOW);
    const journey = health.journeys.find((j) => j.journeyId === 'coach_view_player_stats')!;
    expect(journey.state).toBe('red');
    expect(journey.stages[0]!.resolvedFeatureKey).toBe('stats_analytics');
  });

  it('a journey whose feature_id does NOT resolve to a tracked FeatureKey is unknown, never a fabricated pass', () => {
    // player_start_round -> golf_round_lifecycle, which is a memory/registry.yml
    // feature id but NOT a feature-registry.ts FeatureKey and not in
    // FEATURE_AREA_ALIASES — the real namespace gap this module documents.
    const health = computeGoldenPathHealth(report([]), NOW);
    const journey = health.journeys.find((j) => j.journeyId === 'player_start_round')!;
    expect(journey.state).toBe('unknown');
    for (const stage of journey.stages) {
      expect(stage.resolvedFeatureKey).toBeNull();
      expect(stage.reason).toContain('does not resolve to a tracked FeatureKey');
    }
  });

  it('a journey health is the WORST of its stages, not the first or an average', () => {
    // player_login_hub has two stages: authenticate (auth_onboarding_join,
    // which does not resolve to a tracked FeatureKey -> unknown) and
    // land_on_dashboard (player_hub, which DOES resolve -> ok here). Even
    // with one real 'ok' stage and a real error-budget row backing it, the
    // journey's overall state must still be the worse of the two: unknown
    // outranks ok in STATE_RANK, exactly the same "an unknown never hides
    // behind a healthy sibling" rule error-budget.ts applies per-feature.
    const health = computeGoldenPathHealth(report([budgetRow({ featureId: 'player_hub', state: 'ok' })]), NOW);
    const loginJourney = health.journeys.find((j) => j.journeyId === 'player_login_hub')!;
    expect(loginJourney.stages.find((s) => s.stageId === 'land_on_dashboard')!.state).toBe('ok');
    expect(loginJourney.stages.find((s) => s.stageId === 'authenticate')!.state).toBe('unknown');
    expect(loginJourney.state).toBe('unknown');
  });

  it('sorts worst-first, then by criticality, then id — an operator scanning top-down sees what needs attention first', () => {
    const health = computeGoldenPathHealth(
      report([
        budgetRow({ featureId: 'stats_analytics', state: 'red' }), // coach_view_player_stats, criticality medium
        budgetRow({ featureId: 'calendar_events', state: 'red' }), // coach_create_event AND player_rsvp_event
      ]),
      NOW,
    );
    expect(health.journeys[0]!.state).toBe('red');
    // A later 'ok'/'unknown' journey must never sort before a 'red' one.
    const firstNonRedIndex = health.journeys.findIndex((j) => j.state !== 'red');
    const lastRedIndex = health.journeys.map((j) => j.state).lastIndexOf('red');
    expect(firstNonRedIndex).toBeGreaterThan(lastRedIndex);
  });

  it('preserves the journey\'s own collecting/active status distinctly from its computed health state', () => {
    const health = computeGoldenPathHealth(report([]), NOW);
    const collecting = health.journeys.find((j) => j.status === 'collecting');
    expect(collecting).toBeDefined();
    // A collecting journey's status must never be silently promoted to
    // 'active' just because a health state happened to compute.
    expect(collecting!.status).toBe('collecting');
  });
});
