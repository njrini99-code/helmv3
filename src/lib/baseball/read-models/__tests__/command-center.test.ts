// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

import { assembleCommandCenterClientProps } from '@/lib/baseball/read-models/command-center-adapter';
import type { CommandCenterReadModel } from '@/lib/baseball/read-models/command-center';
import { resolveReadModelLoadState } from '@/lib/product-trust/read-model-state';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// Imported AFTER the mock registration above so getCommandCenter resolves the
// mocked createClient, not the real Supabase server client.
const { getCommandCenter } = await import('@/lib/baseball/read-models/command-center');

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

describe('getCommandCenter — team-local week window (includeWeekEvents)', () => {
  const TEAM_ID = 'team-tz-1';

  function baseTables() {
    return {
      baseball_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
      baseball_team_coach_staff: [
        { id: 'staff-1', team_id: TEAM_ID, coach_id: 'coach-1' },
      ],
      // PDT (UTC-7) in July — a non-UTC team, per the D2 bug being fixed:
      // the old week window used the SERVER's wall-clock day/hours, not the
      // team's, so events near team-local Sunday midnight landed in the
      // wrong week for any non-UTC team.
      baseball_teams: [{ id: TEAM_ID, timezone: 'America/Los_Angeles' }],
      baseball_coach_insights: [] as Array<Record<string, unknown>>,
      baseball_team_members: [] as Array<Record<string, unknown>>,
      baseball_player_aggregates: [] as Array<Record<string, unknown>>,
      baseball_events: [
        // Saturday 23:59:59.999 PDT — the instant BEFORE team-local week
        // start. Must be excluded.
        {
          id: 'ev-before',
          team_id: TEAM_ID,
          title: 'Before week',
          event_type: 'practice',
          start_time: '2026-07-05T06:59:59.999Z',
          end_time: null,
          location: null,
          is_mandatory: false,
        },
        // Sunday 00:00:00 PDT — exactly team-local week start. Must be
        // included.
        {
          id: 'ev-week-start',
          team_id: TEAM_ID,
          title: 'Week start boundary',
          event_type: 'practice',
          start_time: '2026-07-05T07:00:00.000Z',
          end_time: null,
          location: null,
          is_mandatory: false,
        },
        // Saturday 23:59:59.999 PDT the following week — the last instant
        // still inside the window. Must be included.
        {
          id: 'ev-week-end-inside',
          team_id: TEAM_ID,
          title: 'Last instant of the week',
          event_type: 'game',
          start_time: '2026-07-12T06:59:59.999Z',
          end_time: null,
          location: null,
          is_mandatory: true,
        },
        // Next Sunday 00:00:00 PDT — the instant the window ends
        // (exclusive). Must be excluded.
        {
          id: 'ev-after',
          team_id: TEAM_ID,
          title: 'After week',
          event_type: 'practice',
          start_time: '2026-07-12T07:00:00.000Z',
          end_time: null,
          location: null,
          is_mandatory: false,
        },
      ] as Array<Record<string, unknown>>,
    };
  }

  it('resolves Sunday–Saturday using the TEAM timezone, not the server clock', async () => {
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables: baseTables() });

    // 2026-07-08 is a Wednesday: team-local week is Sun 2026-07-05 through
    // Sat 2026-07-11 (America/Los_Angeles).
    const result = await getCommandCenter(TEAM_ID, {
      forDate: '2026-07-08',
      includeWeekEvents: true,
    });

    expect(result.authorized).toBe(true);
    expect(result.error).toBeNull();
    expect(result.weekEvents.map((e) => e.id)).toEqual([
      'ev-week-start',
      'ev-week-end-inside',
    ]);
  });

  it('omits weekEvents entirely when includeWeekEvents is false', async () => {
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables: baseTables() });

    const result = await getCommandCenter(TEAM_ID, { forDate: '2026-07-08' });

    expect(result.weekEvents).toEqual([]);
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
