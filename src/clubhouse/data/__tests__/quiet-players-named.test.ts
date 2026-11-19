import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Launch readiness 2026-11-15, DF-C-04: the quietest players were never named. Roster flagged quiet days only from a round this
 * season, and Home counted only the season's rounds, so a player with no round since the season started, or whose last was a nine
 * or before August, sat unflagged on both. The loaders now read Home's one count (`quietOf`) from the year's counted rounds.
 */

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/teams', () => ({ getTeamJoinRequests: vi.fn(async () => ({ success: true, data: [] })) }));

import { loadRoster } from '../roster';
import { loadCoachHome } from '../home';

// Sunday 15 November 2026, midday in New York. The season started 1 August: 106 days ago.
const NOW = new Date('2026-11-15T17:00:00Z');
const base = { status: 'completed', is_test: false, course_name: 'Pines', tees_played: 'White', strokes_gained_total: null, strokes_gained_tee: null, strokes_gained_approach: null, strokes_gained_around_green: null, strokes_gained_putting: null, total_putts: 31, total_gir: 10, total_gir_possible: 18 };
const eighteen = (id: string, player: string, date: string, score = 74) => ({ ...base, id, player_id: player, round_date: date, round_type: 'tournament', holes_played: 18, total_score: score, score_to_par: score - 72, front_nine: score - 37, back_nine: 37 });
const nine = (id: string, player: string, date: string) => ({ ...base, id, player_id: player, round_date: date, round_type: 'tournament', holes_played: 9, total_score: 38, score_to_par: 2, front_nine: 38, back_nine: null, total_putts: 15 });

const PLAYERS = [
  { id: 'on', first: 'Theo', joined: null },
  { id: 'none', first: 'Ava', joined: null },
  { id: 'old', first: 'Ben', joined: null },
  { id: 'nines', first: 'Cy', joined: null },
  { id: 'new', first: 'Dev', joined: '2026-11-12T15:00:00Z' },
];
const ROUNDS = [
  // Theo: this week, four eighteens.
  ...['2026-11-14', '2026-11-12', '2026-11-10', '2026-11-08'].map((d, i) => eighteen(`t${i}`, 'on', d)),
  // Ben: his last round was in May, before the season.
  eighteen('b1', 'old', '2026-05-20'),
  // Cy: nines only, the last 30 days ago.
  nine('c1', 'nines', '2026-10-16'),
];

function setTables() {
  const member = (p: (typeof PLAYERS)[number]) => ({
    status: 'active', jersey_number: null, joined_at: p.joined, availability: null, availability_updated_at: null,
    player: { id: p.id, first_name: p.first, last_name: 'Lin', graduation_year: 2027, hometown: null, state: null, high_school_name: null, handicap: 2, handicap_index: null },
  });
  tables.current = {
    golf_team_settings: { data: { timezone: 'America/New_York' } },
    golf_teams: { data: { name: 'Varsity', join_code: 'X', gender: 'men', created_by: 'c1', organization_id: 'o1' } },
    golf_team_members: { data: PLAYERS.map(member) },
    golf_rounds: { data: ROUNDS },
    golf_round_stats_cache: { data: [] },
    golf_holes: { data: [] },
    golf_events: { data: [] },
    golf_conversations: { data: [] },
    golf_player_focus_areas: { data: [] },
    golf_goals: { data: [] },
    golf_coach_player_intent: { data: [] },
    golf_coaches: { data: [{ id: 'c1', user_id: 'u1' }] },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  setTables();
});
afterEach(() => {
  vi.useRealTimers();
  tables.current = {};
});

describe('the quietest players are named (DF-C-04)', () => {
  it('Roster: Needs a look flags a player with no round this season, one whose last was before it, and one with only nines', async () => {
    const data = await loadRoster({ teamId: 't1', coachId: 'c1' });
    const flag = (id: string) => data.players.find((p) => p.id === id)!.attention;
    expect(flag('none')).toEqual({ tone: 'warning', text: 'No rounds this season' });
    expect(flag('old')).toEqual({ tone: 'warning', text: 'No rounds in 179 days' });
    expect(flag('nines')).toEqual({ tone: 'warning', text: 'No rounds in 30 days' });
    // Joined three days ago, or posting this week: nothing to look at.
    expect(flag('new')).toBeNull();
    expect(flag('on')).toBeNull();
  });

  it('Home: the brief names them as Roster does', async () => {
    const home = await loadCoachHome({ teamId: 't1', coachName: 'Dana Whitfield' });
    expect(home.subline).toBe('2 players haven’t posted a round in 30+ days. Ava hasn’t posted one this season. The others with enough rounds are on track.');
  });
});
