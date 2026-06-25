// =============================================================================
// Unit tests for the STAT-VISUALS orchestrator's PURE shaping logic.
//
// The DB-bound getStatVisualsPayload is integration-tested via RLS; here we
// exercise the pure, deterministic family-shapers that turn read-model output
// into the chart contracts: the readiness band->status map, the Player DNA
// normalization (gap, not fake 0, on a starved/insufficient dimension), and the
// DNA role selection (hitter vs pitcher by dominant sample).
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  readinessStatusFromBand,
  normalizeDna,
  buildPlayerDna,
} from '../stat-visuals';
import type {
  EliteStatEventsReadModel,
  HitterEliteMetrics,
  PitcherEliteMetrics,
  DerivedMetric,
} from '../elite-stat-events';

function dm(p: Partial<DerivedMetric>): DerivedMetric {
  return {
    metricKey: 'x',
    metricGroup: 'hitting',
    label: 'X',
    value: 0.5,
    unit: 'rate',
    higherIsBetter: true,
    sampleSize: 100,
    confidence: 'high',
    trustTier: 'official',
    dataContext: 'official_game',
    sourceId: null,
    ...p,
  };
}

function hitter(p: Partial<HitterEliteMetrics>): HitterEliteMetrics {
  return {
    playerId: 'h1',
    metrics: [],
    visuals: { evLaPoints: [], sprayPoints: [], chaseZone: [], damageZone: [], countLadder: [] },
    ...p,
  };
}

function pitcher(p: Partial<PitcherEliteMetrics>): PitcherEliteMetrics {
  return {
    playerId: 'h1',
    metrics: [],
    visuals: { pitchShape: [], commandZone: [], commandVectors: [], commandTotalPitches: 0, release: [], veloDecay: [], pitchMix: [] },
    ...p,
  };
}

function model(p: Partial<EliteStatEventsReadModel>): EliteStatEventsReadModel {
  return {
    teamId: 't',
    authorized: true,
    contexts: ['official_game'],
    hitters: [],
    pitchers: [],
    summary: { pitchEvents: 0, battedBallEvents: 0, swingEvents: 0, plateAppearances: 0, playersWithEventData: 0 },
    error: null,
    ...p,
  };
}

describe('readinessStatusFromBand', () => {
  it('maps green -> ready, red -> high_soreness', () => {
    expect(readinessStatusFromBand('green')).toBe('ready');
    expect(readinessStatusFromBand('red')).toBe('high_soreness');
  });
  it('maps yellow/orange/blue -> limited', () => {
    expect(readinessStatusFromBand('yellow')).toBe('limited');
    expect(readinessStatusFromBand('orange_lower')).toBe('limited');
    expect(readinessStatusFromBand('orange_upper')).toBe('limited');
    expect(readinessStatusFromBand('blue')).toBe('limited');
  });
  it('maps null / unknown -> missing (honest gap, never a fake "ready")', () => {
    expect(readinessStatusFromBand(null)).toBe('missing');
    expect(readinessStatusFromBand(undefined)).toBe('missing');
    expect(readinessStatusFromBand('purple')).toBe('missing');
  });
});

describe('normalizeDna', () => {
  it('returns null for a null value (never a fabricated 0)', () => {
    expect(normalizeDna('avg_exit_velocity', null)).toBeNull();
  });
  it('inverts lower-is-better metrics (chase/whiff)', () => {
    // low chase rate -> high DNA score; high chase rate -> low DNA score
    expect(normalizeDna('chase_rate', 0)).toBeGreaterThan(normalizeDna('chase_rate', 0.4)!);
  });
  it('clamps into [0,1]', () => {
    expect(normalizeDna('avg_exit_velocity', 200)).toBe(1);
    expect(normalizeDna('avg_exit_velocity', 0)).toBe(0);
  });
});

describe('buildPlayerDna', () => {
  it('selects the hitter profile when hitter sample dominates', () => {
    const m = model({
      hitters: [hitter({ playerId: 'p1', metrics: [dm({ metricKey: 'avg_exit_velocity', value: 92, unit: 'mph', sampleSize: 200 })] })],
      pitchers: [pitcher({ playerId: 'p1', metrics: [dm({ metricKey: 'avg_velocity', value: 88, unit: 'mph', sampleSize: 10 })] })],
    });
    const dna = buildPlayerDna(m, 'p1');
    expect(dna.role).toBe('Hitter');
    expect(dna.dimensions.some((d) => d.key === 'avg_exit_velocity')).toBe(true);
  });

  it('selects the pitcher profile when pitcher sample dominates', () => {
    const m = model({
      hitters: [hitter({ playerId: 'p1', metrics: [dm({ metricKey: 'avg_exit_velocity', value: 92, sampleSize: 5 })] })],
      pitchers: [pitcher({ playerId: 'p1', metrics: [dm({ metricKey: 'avg_velocity', value: 88, unit: 'mph', sampleSize: 300 })] })],
    });
    const dna = buildPlayerDna(m, 'p1');
    expect(dna.role).toBe('Pitcher');
  });

  it('renders a starved/insufficient dimension as a gap (null), not a fake 0', () => {
    const m = model({
      hitters: [hitter({
        playerId: 'p1',
        metrics: [dm({ metricKey: 'avg_exit_velocity', value: 92, unit: 'mph', sampleSize: 1, confidence: 'insufficient' })],
      })],
    });
    const dna = buildPlayerDna(m, 'p1');
    const ev = dna.dimensions.find((d) => d.key === 'avg_exit_velocity')!;
    expect(ev.value).toBeNull(); // insufficient -> gap on the radar
    expect(ev.sample).toBe(1);
    expect(ev.confidence).toBe('insufficient');
    expect(ev.rawLabel).toBe('92.0 mph'); // raw still shown honestly in the tooltip
  });

  it('returns an empty profile when the player has no elite metrics', () => {
    const dna = buildPlayerDna(model({}), 'ghost');
    expect(dna.dimensions).toHaveLength(0);
    expect(dna.role).toBeNull();
  });
});
