import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWaves } from './read-waves';

/**
 * Home's reads (perf, 2026-10-01): how many round trips deep each loader goes, and that the week's events, now asked for before the
 * team's timezone is known, are cut to the same window the database used to cut them to. Figures and states are in home.test.tsx and
 * player-home.test.tsx.
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadCoachHome, weekWindow, wideEventWindow } from '../data/home';
import { loadPlayerHome } from '../data/player-home';

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const round = (i: number, player: string) => ({
  id: `r${i}`, player_id: player, round_date: day(i + 1), total_score: 74 + (i % 5), score_to_par: 2 + (i % 5), front_nine: 37, back_nine: 37 + (i % 5), holes_played: 18, status: 'completed',
  round_type: 'practice', course_name: 'Pines', tees_played: 'White', total_putts: 31, total_gir: 10, total_gir_possible: 18, strokes_gained_total: 0.5,
});
const rounds = Array.from({ length: 24 }, (_, i) => round(i, i % 2 ? 'p1' : 'p2'));
const todayEvent = () => {
  const start = new Date(Date.now() + 3_600_000);
  return { id: 'e1', title: 'Practice', event_type: 'practice', start_time: start.toISOString(), end_time: new Date(start.getTime() + 7_200_000).toISOString(), all_day: false, location: 'Range' };
};

function base(events: unknown[] = [todayEvent()]): import('./supabase-fake').ChFakeTables {
  return {
    golf_team_settings: { data: { timezone: 'America/New_York' } },
    golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Ada', last_name: 'Lin', graduation_year: 2027 } }, { player: { id: 'p2', first_name: 'Bo', last_name: 'Fox', graduation_year: 2028 } }] },
    golf_conversations: { data: [{ id: 'chat' }] },
    golf_events: { data: events },
    golf_event_attendance: { data: [{ id: 'a1', event_id: 'e1', player_id: 'p1', status: 'accepted' }] },
    golf_rounds: { data: rounds },
    golf_holes: { data: [] },
    golf_round_stats_cache: { data: rounds.map((r) => ({ round_id: r.id, greens_hit: 10, greens_total: 18, total_putts: 31, birdies: 2, eagles: 0 })) },
    golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] },
    golf_players: { data: { handicap_index: 3.1, handicap: null } },
    golf_teams: { data: { gender: 'men', created_by: 'c1', organization_id: 'o1' } },
    golf_coaches: { data: [{ id: 'c1', user_id: 'u1' }] },
  };
}

afterEach(() => {
  tables.current = {};
  tables.gate = undefined;
  vi.useRealTimers();
});

describe('Home reads: how deep', () => {
  it('coach: the timezone, roster, team chat and events go together; the rounds follow the roster and the replies run beside them; only the newest rounds’ cards wait for the rounds (three round trips, not five)', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = base();
    const { result, waves: depth } = await waves.run(loadCoachHome({ teamId: 't1', coachName: 'Dana Whitfield' }));
    expect(depth).toEqual([['golf_conversations', 'golf_events', 'golf_team_members', 'golf_team_settings'], ['golf_event_attendance', 'golf_rounds'], ['golf_holes']]);
    expect(result.greeting).toMatch(/Dana\.$/);
    expect(result.week.agenda.length).toBe(1);
    expect(result.leaderboard.rows).toHaveLength(2);
  });

  it('coach: without a roster there are no rounds to read, and the rest of the page still loads', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = { ...base(), golf_team_members: { data: [] } };
    const { result, waves: depth } = await waves.run(loadCoachHome({ teamId: 't1', coachName: 'Dana' }));
    expect(depth).toEqual([['golf_conversations', 'golf_events', 'golf_team_members', 'golf_team_settings'], ['golf_event_attendance']]);
    expect(result.leaderboard.rosterSize).toBe(0);
    expect(result.latestRounds.rounds).toEqual([]);
  });

  it('player: the week, rounds, player and team go together; the cards, the legs, the Tour’s averages and the coach each start when their own read answered (two round trips, not four)', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = base();
    const { result, waves: depth } = await waves.run(loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Ada' }));
    expect(depth).toEqual([
      ['golf_events', 'golf_players', 'golf_rounds', 'golf_team_settings', 'golf_teams'],
      ['golf_coaches', 'golf_event_attendance', 'golf_holes', 'golf_pga_standards', 'golf_round_stats_cache'],
    ]);
    expect(result.coachUserId).toBe('u1');
    expect(result.legs).not.toBeNull();
  });
});

describe('Home reads: the week’s window', () => {
  it('the wide window the events are asked for holds the exact window of every timezone, at every hour of three weeks', () => {
    const zones = ['Etc/GMT+12', 'Pacific/Pago_Pago', 'America/Los_Angeles', 'America/New_York', 'UTC', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Pacific/Auckland', 'Pacific/Kiritimati'];
    const ymd = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    for (const tz of zones) {
      for (let h = 0; h < 21 * 24; h++) {
        const now = new Date(Date.UTC(2026, 8, 20, 0, 0) + h * 3_600_000);
        const exact = weekWindow(ymd(now, tz));
        const wide = wideEventWindow(now);
        expect(Date.parse(wide.from), `${tz} ${now.toISOString()} from`).toBeLessThanOrEqual(exact.from);
        expect(Date.parse(wide.to), `${tz} ${now.toISOString()} to`).toBeGreaterThanOrEqual(exact.to);
      }
    }
  });

  it('an event outside the zone’s own window is cut after the read, as the database used to cut it: only a later one is "up next" if it is inside', async () => {
    // Thursday 1 Oct 2026, noon in New York: the window is 27 Sep to 6 Oct (the week of 28 Sep, a day of slack either side).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T16:00:00Z'));
    const at = (id: string, iso: string) => ({ id, title: id, event_type: 'practice', start_time: iso, end_time: iso, all_day: false, location: null });
    // In the wide read, outside the exact window.
    tables.current = { ...base([at('late', '2026-10-06T01:00:00Z')]), golf_event_attendance: { data: [] } };
    expect((await loadCoachHome({ teamId: 't1', coachName: 'Dana' })).phone.next).toBeNull();
    // Inside it (the Sunday's last hour).
    tables.current = { ...base([at('sunday', '2026-10-05T23:00:00Z')]), golf_event_attendance: { data: [] } };
    expect((await loadCoachHome({ teamId: 't1', coachName: 'Dana' })).phone.next?.id).toBe('sunday');
  });
});
