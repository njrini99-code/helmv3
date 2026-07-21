import { describe, it, expect } from 'vitest';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import {
  resolveTriageView,
  resolveQueueFilter,
  filterGroupSignals,
  countForFilter,
  distinctCategories,
  removeSignalFromGroups,
  findSignalInGroups,
  computeBriefCounts,
  buildBriefVerdict,
  formatRelativeScanTime,
  formatCategoryLabel,
  severityLabel,
  formatAgeDays,
} from '../buildTriageViewModel';

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

function group(overrides: Partial<SignalGroup> = {}): SignalGroup {
  const signals = overrides.signals ?? [signal()];
  return {
    playerId: 'player-1',
    playerName: 'Alex Rivera',
    attentionScore: 10,
    worstSeverity: 'medium',
    signals,
    ...overrides,
  };
}

describe('resolveTriageView', () => {
  it('defaults to signals when absent or unknown', () => {
    expect(resolveTriageView(undefined)).toBe('signals');
    expect(resolveTriageView('bogus')).toBe('signals');
  });

  it('recognizes players and effectiveness', () => {
    expect(resolveTriageView('players')).toBe('players');
    expect(resolveTriageView('effectiveness')).toBe('effectiveness');
  });

  it('takes the first value of an array param', () => {
    expect(resolveTriageView(['players', 'effectiveness'])).toBe('players');
  });
});

describe('resolveQueueFilter', () => {
  it('maps legacy alerts/insights/patterns to the new chip keys', () => {
    expect(resolveQueueFilter('alerts')).toBe('urgent');
    expect(resolveQueueFilter('insights')).toBe('all');
    expect(resolveQueueFilter('patterns')).toBe('patterns');
  });

  it('passes native chip keys through unchanged', () => {
    expect(resolveQueueFilter('all')).toBe('all');
    expect(resolveQueueFilter('urgent')).toBe('urgent');
    expect(resolveQueueFilter('new')).toBe('new');
  });

  it('passes a well-formed category: token through', () => {
    expect(resolveQueueFilter('category:approach')).toBe('category:approach');
  });

  it('falls back to all for absent/unknown/malformed values', () => {
    expect(resolveQueueFilter(undefined)).toBe('all');
    expect(resolveQueueFilter('bogus')).toBe('all');
    expect(resolveQueueFilter('category:')).toBe('all');
  });
});

describe('filterGroupSignals', () => {
  it('"all" keeps every signal untouched', () => {
    const groups = [group()];
    const result = filterGroupSignals(groups, 'all');
    expect(result).toHaveLength(1);
    expect(result[0]!.signals).toEqual(groups[0]!.signals);
    expect(result[0]!.playerId).toBe(groups[0]!.playerId);
  });

  it('"urgent" keeps only urgent-severity signals and drops empty groups', () => {
    const urgent = signal({ id: 'u', severity: 'urgent' });
    const medium = signal({ id: 'm', severity: 'medium' });
    const groups = [
      group({ playerId: 'player-1', playerName: 'Alex', signals: [urgent, medium] }),
      group({ playerId: 'player-2', playerName: 'Sam', signals: [medium] }),
    ];
    const result = filterGroupSignals(groups, 'urgent');
    expect(result).toHaveLength(1);
    expect(result[0]!.signals.map((s) => s.id)).toEqual(['u']);
  });

  it('"new" keeps signals aged 7 days or less', () => {
    const fresh = signal({ id: 'fresh', ageDays: 3 });
    const stale = signal({ id: 'stale', ageDays: 30 });
    const result = filterGroupSignals([group({ signals: [fresh, stale] })], 'new');
    expect(result[0]!.signals.map((s) => s.id)).toEqual(['fresh']);
  });

  it('"patterns" keeps only pattern-kind signals', () => {
    const insight = signal({ id: 'i', kind: 'insight' });
    const pattern = signal({ id: 'p', kind: 'pattern' });
    const result = filterGroupSignals([group({ signals: [insight, pattern] })], 'patterns');
    expect(result[0]!.signals.map((s) => s.id)).toEqual(['p']);
  });

  it('a category: filter keeps only that category', () => {
    const approach = signal({ id: 'a', category: 'approach' });
    const putting = signal({ id: 'p', category: 'putting' });
    const result = filterGroupSignals([group({ signals: [approach, putting] })], 'category:approach');
    expect(result[0]!.signals.map((s) => s.id)).toEqual(['a']);
  });

  it('re-derives worstSeverity from what is actually left after filtering', () => {
    const high = signal({ id: 'h', severity: 'high', ageDays: 30 });
    const low = signal({ id: 'l', severity: 'low', ageDays: 1 });
    const result = filterGroupSignals([group({ worstSeverity: 'high', signals: [high, low] })], 'new');
    expect(result[0]!.signals.map((s) => s.id)).toEqual(['l']);
    expect(result[0]!.worstSeverity).toBe('low');
  });

  it('pins the Team (playerId null) group first after filtering', () => {
    const team = group({ playerId: null, playerName: 'Team', signals: [signal({ id: 't', severity: 'urgent' })] });
    const player = group({ playerId: 'player-1', playerName: 'Alex', signals: [signal({ id: 'p', severity: 'urgent' })] });
    const result = filterGroupSignals([player, team], 'urgent');
    expect(result[0]!.playerId).toBeNull();
  });

  it('returns [] for an empty input', () => {
    expect(filterGroupSignals([], 'all')).toEqual([]);
  });
});

describe('countForFilter', () => {
  it('counts visible signals across all groups for a given filter', () => {
    const groups = [
      group({ playerId: 'p1', playerName: 'A', signals: [signal({ id: '1', severity: 'urgent' }), signal({ id: '2', severity: 'low' })] }),
      group({ playerId: 'p2', playerName: 'B', signals: [signal({ id: '3', severity: 'urgent' })] }),
    ];
    expect(countForFilter(groups, 'urgent')).toBe(2);
    expect(countForFilter(groups, 'all')).toBe(3);
  });
});

describe('distinctCategories', () => {
  it('returns the sorted, deduped set of categories across every signal', () => {
    const groups = [
      group({ signals: [signal({ id: '1', category: 'putting' }), signal({ id: '2', category: 'approach' })] }),
      group({ signals: [signal({ id: '3', category: 'approach' })] }),
    ];
    expect(distinctCategories(groups)).toEqual(['approach', 'putting']);
  });

  it('returns [] for no groups', () => {
    expect(distinctCategories([])).toEqual([]);
  });
});

describe('removeSignalFromGroups', () => {
  it('removes a signal and drops the group when it was the last one', () => {
    const groups = [group({ signals: [signal({ id: 'only' })] })];
    expect(removeSignalFromGroups(groups, 'only')).toEqual([]);
  });

  it('keeps the group and re-derives worstSeverity when other signals remain', () => {
    const high = signal({ id: 'h', severity: 'high' });
    const low = signal({ id: 'l', severity: 'low' });
    const result = removeSignalFromGroups([group({ worstSeverity: 'high', signals: [high, low] })], 'h');
    expect(result).toHaveLength(1);
    expect(result[0]!.signals.map((s) => s.id)).toEqual(['l']);
    expect(result[0]!.worstSeverity).toBe('low');
  });

  it('is a no-op (same shape) when the id is not present', () => {
    const groups = [group({ signals: [signal({ id: 'a' })] })];
    const result = removeSignalFromGroups(groups, 'nonexistent');
    expect(result).toEqual(groups);
  });
});

describe('findSignalInGroups', () => {
  it('finds a signal and its owning group', () => {
    const target = signal({ id: 'target' });
    const groups = [group({ signals: [target] })];
    const found = findSignalInGroups(groups, 'target');
    expect(found?.signal.id).toBe('target');
    expect(found?.group.playerId).toBe('player-1');
  });

  it('returns null for a null id', () => {
    expect(findSignalInGroups([group()], null)).toBeNull();
  });

  it('returns null when the id is not present in any group', () => {
    expect(findSignalInGroups([group()], 'missing')).toBeNull();
  });
});

describe('computeBriefCounts', () => {
  it('counts urgent signals, signals aged <=7 days, and distinct flagged players', () => {
    const groups = [
      group({
        playerId: 'p1',
        playerName: 'A',
        signals: [signal({ id: '1', severity: 'urgent', ageDays: 1 }), signal({ id: '2', severity: 'low', ageDays: 30 })],
      }),
      group({ playerId: 'p2', playerName: 'B', signals: [signal({ id: '3', severity: 'urgent', ageDays: 40 })] }),
      group({ playerId: null, playerName: 'Team', signals: [signal({ id: '4', severity: 'high', ageDays: 2, playerId: null })] }),
    ];
    const counts = computeBriefCounts(groups);
    expect(counts.urgent).toBe(2);
    expect(counts.newThisWeek).toBe(2);
    expect(counts.playersFlagged).toBe(2); // Team (playerId null) never counts as a "player"
  });

  it('returns all zeros for an empty queue', () => {
    expect(computeBriefCounts([])).toEqual({ urgent: 0, newThisWeek: 0, playersFlagged: 0 });
  });
});

describe('buildBriefVerdict', () => {
  it('reports an honest all-clear when there are no groups', () => {
    expect(buildBriefVerdict([], { urgent: 0, newThisWeek: 0, playersFlagged: 0 })).toBe(
      'All clear — no open signals right now.',
    );
  });

  it('names the top flagged player when urgent signals exist', () => {
    const groups = [group({ playerId: 'p1', playerName: 'Alex Rivera', signals: [signal({ severity: 'urgent' })] })];
    const verdict = buildBriefVerdict(groups, { urgent: 1, newThisWeek: 1, playersFlagged: 1 });
    expect(verdict).toContain('1 urgent signal needs review');
    expect(verdict).toContain('Alex Rivera needs the most attention right now.');
  });

  it('reports a calm sentence when nothing is urgent but signals exist', () => {
    const groups = [group({ playerId: 'p1', playerName: 'Alex Rivera', signals: [signal({ severity: 'low' })] })];
    const verdict = buildBriefVerdict(groups, { urgent: 0, newThisWeek: 0, playersFlagged: 1 });
    expect(verdict).toBe('Nothing urgent — Alex Rivera has the highest-priority open signal.');
  });
});

describe('formatRelativeScanTime', () => {
  const now = new Date('2026-07-20T12:00:00Z');

  it('reports "No scans yet" for null/unparseable input', () => {
    expect(formatRelativeScanTime(null, now)).toBe('No scans yet');
    expect(formatRelativeScanTime('not-a-date', now)).toBe('No scans yet');
  });

  it('formats minutes/hours/days ago', () => {
    expect(formatRelativeScanTime('2026-07-20T11:59:30Z', now)).toBe('Last scan just now');
    expect(formatRelativeScanTime('2026-07-20T11:30:00Z', now)).toBe('Last scan 30m ago');
    expect(formatRelativeScanTime('2026-07-20T09:00:00Z', now)).toBe('Last scan 3h ago');
    expect(formatRelativeScanTime('2026-07-18T12:00:00Z', now)).toBe('Last scan 2d ago');
  });
});

describe('formatCategoryLabel', () => {
  it('title-cases a snake_case category', () => {
    expect(formatCategoryLabel('short_game')).toBe('Short Game');
    expect(formatCategoryLabel('putting')).toBe('Putting');
  });
});

describe('severityLabel', () => {
  it('labels every severity tier', () => {
    expect(severityLabel('urgent')).toBe('Urgent');
    expect(severityLabel('high')).toBe('High');
    expect(severityLabel('medium')).toBe('Medium');
    expect(severityLabel('low')).toBe('Low');
  });
});

describe('formatAgeDays', () => {
  it('formats today/1d/Nd', () => {
    expect(formatAgeDays(0)).toBe('Today');
    expect(formatAgeDays(1)).toBe('1d ago');
    expect(formatAgeDays(5)).toBe('5d ago');
  });
});
