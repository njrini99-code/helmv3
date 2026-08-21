import { describe, it, expect } from 'vitest';
import { generateAlerts } from '../tracer-utils';
import type { TracerData, StuckRound } from '../tracer-types';

function makeTracerData(): TracerData {
  return {
    playerSummaries: [],
    roundDetails: {},
    statsAccuracy: [],
    recentErrors: [],
    activityFeed: [],
    errorStats: { total7d: 0, critical7d: 0, warnings7d: 0 },
    rawTraces: [],
    truncated: false,
  };
}

function makeStuckRound(id: string): StuckRound {
  return {
    round_id: id,
    player_id: `player-${id}`,
    player_name: `Player ${id}`,
    course_name: 'Test Course',
    current_hole: 5,
    expected_holes: 18,
    updated_at: new Date().toISOString(),
    hours_stuck: 2,
  };
}

describe('generateAlerts — stuck rounds rollup', () => {
  it('renders one alert per stuck round when there are few', () => {
    const stuckRounds = [makeStuckRound('a'), makeStuckRound('b')];
    const alerts = generateAlerts(makeTracerData(), stuckRounds);
    const stuckAlerts = alerts.filter((a) => a.id.startsWith('stuck-'));
    expect(stuckAlerts).toHaveLength(2);
  });

  it('collapses many stuck rounds into a single rollup alert', () => {
    const stuckRounds = Array.from({ length: 10 }, (_, i) => makeStuckRound(String(i)));
    const alerts = generateAlerts(makeTracerData(), stuckRounds);
    const stuckAlerts = alerts.filter((a) => a.id === 'stuck-rounds-rollup' || a.id.startsWith('stuck-'));
    expect(stuckAlerts).toHaveLength(1);
    expect(stuckAlerts[0]?.id).toBe('stuck-rounds-rollup');
    expect(stuckAlerts[0]?.detail).toContain('10 rounds idle');
  });
});
