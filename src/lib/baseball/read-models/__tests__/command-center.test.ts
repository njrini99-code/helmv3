// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { assembleCommandCenterClientProps } from '@/lib/baseball/read-models/command-center-adapter';
import type { CommandCenterReadModel } from '@/lib/baseball/read-models/command-center';
import { resolveReadModelLoadState } from '@/lib/product-trust/read-model-state';

function model(overrides: Partial<CommandCenterReadModel>): CommandCenterReadModel {
  return {
    teamId: 'team-1',
    authorized: true,
    riskFeed: [],
    rosterPulse: [],
    rosterPlayers: [],
    todayEvents: [],
    weekEvents: [],
    summary: {
      openRisks: 0,
      criticalRisks: 0,
      rosterSize: 0,
      playersWithData: 0,
      eventsToday: 0,
    },
    error: null,
    ...overrides,
  };
}

describe('assembleCommandCenterClientProps', () => {
  const team = { id: 'team-1', name: 'Helm U', teamType: 'college', inviteCode: 'ABC' };

  it('maps an authorized empty roster to loadState empty', () => {
    const assembled = assembleCommandCenterClientProps({ team, model: model({}) });
    expect(assembled.loadState).toBe('empty');
    expect(assembled.players).toEqual([]);
    expect(assembled.riskFeedError).toBeNull();
  });

  it('maps unauthorized viewers to empty feeds without an error string', () => {
    const assembled = assembleCommandCenterClientProps({
      team,
      model: model({ authorized: false, error: null }),
    });
    expect(assembled.loadState).toBe('unauthorized');
    expect(assembled.players).toEqual([]);
    expect(assembled.riskFeed).toEqual([]);
    expect(assembled.riskFeedError).toBeNull();
  });

  it('maps sub-read failures to loadState error and surfaces the message', () => {
    const assembled = assembleCommandCenterClientProps({
      team,
      model: model({ error: 'Some risk signals could not be loaded.' }),
    });
    expect(assembled.loadState).toBe('error');
    expect(assembled.riskFeedError).toBe('Some risk signals could not be loaded.');
  });

  it('passes roster players and week events from the canonical read model', () => {
    const assembled = assembleCommandCenterClientProps({
      team,
      model: model({
        rosterPlayers: [{ id: 'p1', first_name: 'Alex', last_name: 'Kim' } as never],
        rosterPulse: [
          {
            playerId: 'p1',
            firstName: 'Alex',
            lastName: 'Kim',
            jerseyNumber: 12,
            primaryPosition: 'SS',
            totalSessions: 3,
            recentTrend: 'improving',
            careerAvg: 0.31,
            lastSessionAt: '2026-06-29',
            noData: false,
          },
        ],
        weekEvents: [
          {
            id: 'e1',
            title: 'Practice',
            eventType: 'practice',
            startTime: '2026-06-30T15:00:00Z',
            endTime: null,
            location: null,
            isMandatory: false,
          },
        ],
        summary: {
          openRisks: 2,
          criticalRisks: 1,
          rosterSize: 1,
          playersWithData: 1,
          eventsToday: 1,
        },
      }),
    });

    expect(assembled.loadState).toBe('ready');
    expect(assembled.players).toHaveLength(1);
    expect(assembled.calendarEvents).toHaveLength(1);
    expect(assembled.summary.rosterSize).toBe(1);
  });
});

describe('resolveReadModelLoadState — command center contract', () => {
  it('never treats unauthorized as empty', () => {
    expect(
      resolveReadModelLoadState({ authorized: false, error: null, hasData: false }),
    ).toBe('unauthorized');
  });

  it('never treats load errors as empty', () => {
    expect(
      resolveReadModelLoadState({
        authorized: true,
        error: 'Roster failed',
        hasData: false,
      }),
    ).toBe('error');
  });
});
