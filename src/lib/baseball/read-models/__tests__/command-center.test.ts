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
            sourceLayer: 'box-score',
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
      // getCommandCenter now also calls getStatsCenter() internally (#379) for
      // the canonical box-score/season game-context — stats-center.ts reads
      // these tables too, empty by default for this timezone-focused suite.
      baseball_player_season_stats: [] as Array<Record<string, unknown>>,
      baseball_games: [] as Array<Record<string, unknown>>,
      baseball_box_score_batting: [] as Array<Record<string, unknown>>,
      baseball_box_score_pitching: [] as Array<Record<string, unknown>>,
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

// =============================================================================
// #379 Phase 1 — game-context now resolves via legacy-stat-adapters.ts's
// shared precedence rule (box-score > legacy-fallback > no-data) instead of
// joining baseball_player_aggregates ad hoc. These pin the three tiers
// directly against getCommandCenter() (the box-score-precedence tier is also
// covered end-to-end, via the real seed script, by
// src/contracts/baseball/stats/command-center-stats-center-drift.test.ts).
// =============================================================================
describe('getCommandCenter — game-context via the #379 shared legacy adapter', () => {
  const TEAM_ID = 'team-adapter-1';
  // getCommandCenter has no season-year override — it always uses the current
  // calendar year, so the box-score fixture's game_date must track it too
  // (mirrors how a fixed constant would drift at a year boundary otherwise).
  const SEASON_YEAR = new Date().getFullYear();

  function authTables(overrides: Record<string, unknown[]> = {}) {
    return {
      baseball_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
      baseball_team_coach_staff: [{ id: 'staff-1', team_id: TEAM_ID, coach_id: 'coach-1' }],
      baseball_coach_insights: [] as Array<Record<string, unknown>>,
      baseball_events: [] as Array<Record<string, unknown>>,
      baseball_team_members: [
        {
          team_id: TEAM_ID,
          player_id: 'p1',
          jersey_number: 7,
          position: null,
          status: 'active',
          joined_at: null,
          baseball_players: {
            id: 'p1',
            first_name: 'Sam',
            last_name: 'Rivera',
            avatar_url: null,
            primary_position: 'SS',
            secondary_position: null,
            grad_year: null,
            bats: null,
            throws: null,
            height_feet: null,
            height_inches: null,
            weight_lbs: null,
            gpa: null,
            city: null,
            state: null,
          },
        },
      ],
      baseball_games: [] as Array<Record<string, unknown>>,
      baseball_player_season_stats: [] as Array<Record<string, unknown>>,
      baseball_box_score_batting: [] as Array<Record<string, unknown>>,
      baseball_box_score_pitching: [] as Array<Record<string, unknown>>,
      baseball_player_aggregates: [] as Array<Record<string, unknown>>,
      ...overrides,
    };
  }

  it('legacy-fallback: a player with no box-score-era data still shows their real legacy average (no regression)', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: authTables({
        baseball_player_aggregates: [
          {
            player_id: 'p1',
            team_id: TEAM_ID,
            total_sessions: 12,
            career_avg: 0.318,
            recent_trend: 'improving',
            last_session_at: '2026-05-01',
          },
        ],
      }),
    });

    const result = await getCommandCenter(TEAM_ID);
    const pulse = result.rosterPulse.find((r) => r.playerId === 'p1');
    expect(pulse).toBeTruthy();
    expect(pulse!.noData).toBe(false);
    expect(pulse!.careerAvg).toBeCloseTo(0.318, 3);
    expect(pulse!.recentTrend).toBe('improving');
    expect(pulse!.totalSessions).toBe(12);
    // "On the Record" (summary.playersWithData) is the OFFICIAL-record count
    // (Stats Center's definition), not the broader box-score+practice
    // `rosterPulse` — this player has legacy/practice sessions only (no
    // box-score games), so `pulse.noData` is false but the KPI is honestly
    // 0. Before this fix, summary.playersWithData was derived from
    // rosterPulse and would have read 1 here, drifting from Stats Center's
    // own "0 players with data" for the identical roster.
    expect(result.summary.playersWithData).toBe(0);
  });

  it('no-data: a player with neither legacy nor box-score rows is honestly no-data, never a fabricated average', async () => {
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables: authTables() });

    const result = await getCommandCenter(TEAM_ID);
    const pulse = result.rosterPulse.find((r) => r.playerId === 'p1');
    expect(pulse).toBeTruthy();
    expect(pulse!.noData).toBe(true);
    expect(pulse!.careerAvg).toBeNull();
    expect(pulse!.totalSessions).toBe(0);
  });

  it('box-score precedence: a player with box-score-era data shows the CANONICAL average, not the stale legacy blend — closing the #379 divergence', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: authTables({
        baseball_games: [
          { id: 'g1', team_id: TEAM_ID, game_type: 'game', game_date: `${SEASON_YEAR}-06-01` },
        ],
        baseball_box_score_batting: [
          { id: 'bb1', game_id: 'g1', team_id: TEAM_ID, player_id: 'p1', ab: 4, h: 2 },
        ],
        // Legacy row deliberately carries a DIFFERENT (stale/blended) average
        // than the box-score-derived .500 below — proves box-score wins.
        baseball_player_aggregates: [
          {
            player_id: 'p1',
            team_id: TEAM_ID,
            total_sessions: 20,
            career_avg: 0.25,
            recent_trend: 'stable',
            last_session_at: '2026-04-01',
          },
        ],
      }),
    });

    const result = await getCommandCenter(TEAM_ID);
    const pulse = result.rosterPulse.find((r) => r.playerId === 'p1');
    expect(pulse).toBeTruthy();
    expect(pulse!.noData).toBe(false);
    // 2-for-4 = .500 — the box-score-derived figure, not the legacy .250 blend.
    expect(pulse!.careerAvg).toBeCloseTo(0.5, 3);
    expect(pulse!.careerAvg).not.toBeCloseTo(0.25, 3);
    // recentTrend has no canonical replacement yet — the permanent legacy
    // carve-out still surfaces it even for a box-score-sourced player.
    expect(pulse!.recentTrend).toBe('stable');
    // This player DOES have an official box-score game, so "On the Record"
    // agrees with Stats Center's own count for the identical roster.
    expect(result.summary.playersWithData).toBe(1);
  });

  it('pitching-only box-score data this season must NOT mask a real legacy career_avg fallback', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: authTables({
        baseball_games: [
          { id: 'g1', team_id: TEAM_ID, game_type: 'game', game_date: `${SEASON_YEAR}-06-01` },
        ],
        // p1 has real box-score-era data this season, but ONLY on the
        // pitching side — zero batting box-score rows. statsCenterModel's
        // `noData` is therefore false (pitchingAll.g > 0), yet
        // `battingAll.g === 0` / `battingAll.avg === null`. Command Center
        // must not feed this in as an authoritative (null-avg) "box-score"
        // row for career_avg purposes — it must fall through to the real
        // legacy career_avg below instead.
        baseball_box_score_pitching: [
          { id: 'bp1', game_id: 'g1', team_id: TEAM_ID, player_id: 'p1', ip: 6 },
        ],
        baseball_player_aggregates: [
          {
            player_id: 'p1',
            team_id: TEAM_ID,
            total_sessions: 15,
            career_avg: 0.284,
            recent_trend: 'stable',
            last_session_at: '2026-05-15',
          },
        ],
      }),
    });

    const result = await getCommandCenter(TEAM_ID);
    const pulse = result.rosterPulse.find((r) => r.playerId === 'p1');
    expect(pulse).toBeTruthy();
    // noData must stay false — the player DOES have real activity this
    // season (pitching), so this is not an honest "no data" state either.
    expect(pulse!.noData).toBe(false);
    // The legacy career_avg must still display, not be silently masked to
    // null by the pitching-only (batting-empty) box-score row.
    expect(pulse!.careerAvg).toBeCloseTo(0.284, 3);
    expect(pulse!.careerAvg).not.toBeNull();
    expect(pulse!.sourceLayer).toBe('legacy-fallback');
  });
});
