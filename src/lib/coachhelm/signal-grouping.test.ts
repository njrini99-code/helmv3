import { describe, it, expect } from 'vitest';
import {
  attentionScore,
  ageDaysFromCreatedAt,
  collapseDuplicates,
  groupSignals,
  selectSuperseded,
  severityFromInsightPriority,
  severityFromPatternSeverity,
  type GroupedSignal,
} from './signal-grouping';

function signal(overrides: Partial<GroupedSignal> = {}): GroupedSignal {
  return {
    id: 'sig-1',
    kind: 'insight',
    category: 'putting',
    severity: 'medium',
    title: 'Short putts slipping',
    claim: 'Make rate on 0-3ft putts dropped 12%.',
    ageDays: 2,
    status: 'active',
    strokeImpact: 0.8,
    playerId: 'player-1',
    supersededCount: 0,
    ...overrides,
  };
}

describe('severityFromInsightPriority', () => {
  it('maps urgent and high to their own tiers', () => {
    expect(severityFromInsightPriority('urgent')).toBe('urgent');
    expect(severityFromInsightPriority('high')).toBe('high');
  });

  it('maps medium to medium', () => {
    expect(severityFromInsightPriority('medium')).toBe('medium');
  });

  it('falls back to low for null/unknown priority', () => {
    expect(severityFromInsightPriority(null)).toBe('low');
    expect(severityFromInsightPriority(undefined)).toBe('low');
    expect(severityFromInsightPriority('low')).toBe('low');
    expect(severityFromInsightPriority('something-unexpected')).toBe('low');
  });
});

describe('severityFromPatternSeverity', () => {
  it('maps critical to urgent (pattern-side top tier)', () => {
    expect(severityFromPatternSeverity('critical')).toBe('urgent');
  });

  it('maps high and medium straight across', () => {
    expect(severityFromPatternSeverity('high')).toBe('high');
    expect(severityFromPatternSeverity('medium')).toBe('medium');
  });

  it('falls back to low for null/unknown severity', () => {
    expect(severityFromPatternSeverity(null)).toBe('low');
    expect(severityFromPatternSeverity('low')).toBe('low');
  });
});

describe('ageDaysFromCreatedAt', () => {
  const now = new Date('2026-07-20T12:00:00Z');

  it('computes whole days elapsed', () => {
    expect(ageDaysFromCreatedAt('2026-07-18T12:00:00Z', now)).toBe(2);
  });

  it('floors partial days rather than rounding', () => {
    expect(ageDaysFromCreatedAt('2026-07-19T13:00:00Z', now)).toBe(0);
    expect(ageDaysFromCreatedAt('2026-07-19T11:00:00Z', now)).toBe(1);
  });

  it('clamps a future timestamp to 0, never negative', () => {
    expect(ageDaysFromCreatedAt('2026-07-21T12:00:00Z', now)).toBe(0);
  });

  it('returns 0 for missing or unparseable input instead of NaN', () => {
    expect(ageDaysFromCreatedAt(null, now)).toBe(0);
    expect(ageDaysFromCreatedAt(undefined, now)).toBe(0);
    expect(ageDaysFromCreatedAt('not-a-date', now)).toBe(0);
  });
});

describe('collapseDuplicates', () => {
  it('keeps a single signal untouched', () => {
    const result = collapseDuplicates([signal()]);
    expect(result).toHaveLength(1);
    expect(result[0]!.supersededCount).toBe(0);
  });

  it('collapses same player+category signals to the newest, counting the rest as superseded', () => {
    const older = signal({ id: 'old', ageDays: 10 });
    const newer = signal({ id: 'new', ageDays: 1 });
    const result = collapseDuplicates([older, newer]);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('new');
    expect(result[0]!.supersededCount).toBe(1);
  });

  it('accumulates supersededCount across more than two duplicates', () => {
    const a = signal({ id: 'a', ageDays: 20 });
    const b = signal({ id: 'b', ageDays: 10 });
    const c = signal({ id: 'c', ageDays: 1 });
    const result = collapseDuplicates([a, b, c]);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('c');
    expect(result[0]!.supersededCount).toBe(2);
  });

  it('carries forward an already-nonzero supersededCount when re-collapsing', () => {
    const already = signal({ id: 'already', ageDays: 5, supersededCount: 3 });
    const fresh = signal({ id: 'fresh', ageDays: 1 });
    const result = collapseDuplicates([already, fresh]);

    expect(result[0]!.id).toBe('fresh');
    expect(result[0]!.supersededCount).toBe(4); // 1 (already) + 3 (its own prior count)
  });

  it('does NOT collapse different players even with the same category', () => {
    const p1 = signal({ id: 'p1', playerId: 'player-1' });
    const p2 = signal({ id: 'p2', playerId: 'player-2' });
    expect(collapseDuplicates([p1, p2])).toHaveLength(2);
  });

  it('does NOT collapse different categories for the same player', () => {
    const putting = signal({ id: 'putting-sig', category: 'putting' });
    const approach = signal({ id: 'approach-sig', category: 'approach' });
    expect(collapseDuplicates([putting, approach])).toHaveLength(2);
  });

  it('collapses team-level (playerId null) signals against each other, not against player rows', () => {
    const team = signal({ id: 'team', playerId: null, category: 'roster_alert', ageDays: 3 });
    const teamNewer = signal({ id: 'team-2', playerId: null, category: 'roster_alert', ageDays: 1 });
    const player = signal({ id: 'player', playerId: 'player-1', category: 'roster_alert', ageDays: 1 });
    const result = collapseDuplicates([team, teamNewer, player]);

    expect(result).toHaveLength(2);
    const teamResult = result.find((s) => s.playerId === null);
    expect(teamResult?.id).toBe('team-2');
    expect(teamResult?.supersededCount).toBe(1);
  });
});

describe('attentionScore', () => {
  it('weights urgent severity highest', () => {
    const urgent = attentionScore({ worstSeverity: 'urgent', signals: [signal({ severity: 'urgent', ageDays: 30 })] });
    const low = attentionScore({ worstSeverity: 'low', signals: [signal({ severity: 'low', ageDays: 30 })] });
    expect(urgent).toBeGreaterThan(low);
  });

  it('increases with signal volume', () => {
    const one = attentionScore({ worstSeverity: 'medium', signals: [signal({ ageDays: 30 })] });
    const two = attentionScore({
      worstSeverity: 'medium',
      signals: [signal({ id: 'a', ageDays: 30 }), signal({ id: 'b', ageDays: 30 })],
    });
    expect(two).toBe(one + 1);
  });

  it('rewards recency via the freshest signal in the group', () => {
    const fresh = attentionScore({ worstSeverity: 'medium', signals: [signal({ ageDays: 0 })] });
    const stale = attentionScore({ worstSeverity: 'medium', signals: [signal({ ageDays: 30 })] });
    expect(fresh).toBeGreaterThan(stale);
  });

  it('is deterministic for the same inputs', () => {
    const group = { worstSeverity: 'high' as const, signals: [signal({ ageDays: 2 })] };
    expect(attentionScore(group)).toBe(attentionScore(group));
  });
});

describe('groupSignals', () => {
  it('pins the Team (playerId null) group first regardless of attention score', () => {
    const teamSignal = signal({ id: 'team', playerId: null, severity: 'low', ageDays: 30, category: 'roster' });
    const urgentPlayerSignal = signal({ id: 'urgent', playerId: 'player-1', severity: 'urgent', ageDays: 0, category: 'putting' });
    const groups = groupSignals([teamSignal, urgentPlayerSignal], { 'player-1': 'Alex Rivera' });

    expect(groups[0]!.playerId).toBeNull();
    expect(groups[0]!.playerName).toBe('Team');
    expect(groups[1]!.playerId).toBe('player-1');
    expect(groups[1]!.playerName).toBe('Alex Rivera');
  });

  it('orders player groups by attentionScore descending when no Team group exists', () => {
    const lowSignal = signal({ id: 'low', playerId: 'player-low', severity: 'low', ageDays: 30, category: 'putting' });
    const urgentSignal = signal({ id: 'urgent', playerId: 'player-urgent', severity: 'urgent', ageDays: 0, category: 'approach' });
    const groups = groupSignals([lowSignal, urgentSignal], {
      'player-low': 'Low Priority',
      'player-urgent': 'Urgent Case',
    });

    expect(groups.map((g) => g.playerId)).toEqual(['player-urgent', 'player-low']);
  });

  it('breaks attentionScore ties alphabetically by player name for determinism', () => {
    const zeta = signal({ id: 'z', playerId: 'player-z', category: 'putting', ageDays: 30, severity: 'low' });
    const alpha = signal({ id: 'a', playerId: 'player-a', category: 'putting', ageDays: 30, severity: 'low' });
    const groups = groupSignals([zeta, alpha], { 'player-z': 'Zeta Player', 'player-a': 'Alpha Player' });

    expect(groups.map((g) => g.playerName)).toEqual(['Alpha Player', 'Zeta Player']);
  });

  it('falls back to "Unknown Player" when no name is supplied', () => {
    const groups = groupSignals([signal({ playerId: 'ghost-id' })], {});
    expect(groups[0]!.playerName).toBe('Unknown Player');
  });

  it('collapses duplicates before grouping so supersededCount survives on the kept signal', () => {
    const older = signal({ id: 'old', ageDays: 10 });
    const newer = signal({ id: 'new', ageDays: 1 });
    const groups = groupSignals([older, newer], { 'player-1': 'Alex Rivera' });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.signals).toHaveLength(1);
    expect(groups[0]!.signals[0]!.supersededCount).toBe(1);
  });

  it('orders signals within a group worst-severity-first, then freshest-first', () => {
    const staleHigh = signal({ id: 'stale-high', category: 'putting', severity: 'high', ageDays: 5 });
    const freshUrgent = signal({ id: 'fresh-urgent', category: 'approach', severity: 'urgent', ageDays: 1 });
    const freshLow = signal({ id: 'fresh-low', category: 'scoring', severity: 'low', ageDays: 0 });
    const groups = groupSignals([staleHigh, freshUrgent, freshLow], { 'player-1': 'Alex Rivera' });

    expect(groups[0]!.signals.map((s) => s.id)).toEqual(['fresh-urgent', 'stale-high', 'fresh-low']);
  });

  it('derives worstSeverity as the sharpest severity present in the group', () => {
    const high = signal({ id: 'h', category: 'putting', severity: 'high', ageDays: 1 });
    const low = signal({ id: 'l', category: 'approach', severity: 'low', ageDays: 1 });
    const groups = groupSignals([high, low], { 'player-1': 'Alex Rivera' });

    expect(groups[0]!.worstSeverity).toBe('high');
  });
});

describe('selectSuperseded', () => {
  it('selects a prior open insight matching a fresh signal on player+category', () => {
    const priors = [{ id: 'prior-1', playerId: 'player-1', category: 'putting', lifecycleState: 'detected' }];
    const fresh = [{ playerId: 'player-1', category: 'putting' }];
    expect(selectSuperseded(priors, fresh)).toEqual(['prior-1']);
  });

  it('does not select priors for a different player', () => {
    const priors = [{ id: 'prior-1', playerId: 'player-2', category: 'putting', lifecycleState: 'detected' }];
    const fresh = [{ playerId: 'player-1', category: 'putting' }];
    expect(selectSuperseded(priors, fresh)).toEqual([]);
  });

  it('does not select priors for a different category', () => {
    const priors = [{ id: 'prior-1', playerId: 'player-1', category: 'approach', lifecycleState: 'detected' }];
    const fresh = [{ playerId: 'player-1', category: 'putting' }];
    expect(selectSuperseded(priors, fresh)).toEqual([]);
  });

  it('never selects an already-resolved prior insight', () => {
    const priors = [{ id: 'prior-1', playerId: 'player-1', category: 'putting', lifecycleState: 'resolved' }];
    const fresh = [{ playerId: 'player-1', category: 'putting' }];
    expect(selectSuperseded(priors, fresh)).toEqual([]);
  });

  it('never selects an already-archived prior insight', () => {
    const priors = [{ id: 'prior-1', playerId: 'player-1', category: 'putting', lifecycleState: 'archived' }];
    const fresh = [{ playerId: 'player-1', category: 'putting' }];
    expect(selectSuperseded(priors, fresh)).toEqual([]);
  });

  it('selects tentative/detected/matured/addressed priors (every open state)', () => {
    const openStates = ['tentative', 'detected', 'matured', 'addressed'];
    const priors = openStates.map((lifecycleState, i) => ({
      id: `prior-${i}`,
      playerId: 'player-1',
      category: 'putting',
      lifecycleState,
    }));
    const fresh = [{ playerId: 'player-1', category: 'putting' }];
    expect(selectSuperseded(priors, fresh)).toEqual(priors.map((p) => p.id));
  });

  it('treats a null lifecycleState as the open "detected" default', () => {
    const priors = [{ id: 'prior-1', playerId: 'player-1', category: 'putting', lifecycleState: null }];
    const fresh = [{ playerId: 'player-1', category: 'putting' }];
    expect(selectSuperseded(priors, fresh)).toEqual(['prior-1']);
  });

  it('returns [] when there are no fresh signals', () => {
    const priors = [{ id: 'prior-1', playerId: 'player-1', category: 'putting', lifecycleState: 'detected' }];
    expect(selectSuperseded(priors, [])).toEqual([]);
  });

  it('ignores priors with no player or category', () => {
    const priors = [
      { id: 'prior-1', playerId: null, category: 'putting', lifecycleState: 'detected' },
      { id: 'prior-2', playerId: 'player-1', category: null, lifecycleState: 'detected' },
    ];
    const fresh = [{ playerId: 'player-1', category: 'putting' }];
    expect(selectSuperseded(priors, fresh)).toEqual([]);
  });
});
