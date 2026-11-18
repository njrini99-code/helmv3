import { describe, expect, it, vi } from 'vitest';

/*
 * Launch readiness 2026-11-15, DF-C-05: Roster and the player profile counted only eighteen-hole rounds, so a player whose rounds this
 * season were nines read "No rounds this season", and "All N" and Recent rounds left the nines out. The count now reads the rounds that
 * count toward a score, of either length; the average, form and early floor still read the eighteens, as Stats' default does.
 * DF-C-19: the Roster's average is the season's, so its links open Stats on This season, where the hero prints the same figure.
 */

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/teams', () => ({ getTeamJoinRequests: vi.fn(async () => ({ success: true, data: [] })) }));

import { loadRoster } from '../roster';
import { rowNote, roundsPlayed } from '../../screens/roster/format';
import { sortRoster } from '../../screens/roster/sort';

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const base = { status: 'completed', is_test: false, course_name: 'Pines', tees_played: 'White', strokes_gained_total: null, strokes_gained_tee: null, strokes_gained_approach: null, strokes_gained_around_green: null, strokes_gained_putting: null };
const eighteen = (id: string, player: string, d: number, score: number, type = 'tournament') => ({ ...base, id, player_id: player, round_date: day(d), round_type: type, holes_played: 18, total_score: score, score_to_par: score - 72, front_nine: score - 38, back_nine: 38, total_putts: 31 });
const nine = (id: string, player: string, d: number, score: number) => ({ ...base, id, player_id: player, round_date: day(d), round_type: 'tournament', holes_played: 9, total_score: score, score_to_par: score - 36, front_nine: score, back_nine: null, total_putts: 15 });

const member = (id: string, first: string) => ({ status: 'active', jersey_number: null, joined_at: null, availability: null, availability_updated_at: null, player: { id, first_name: first, last_name: 'Lin', graduation_year: 2027, hometown: null, state: null, high_school_name: null, handicap: 2, handicap_index: null } });

async function roster() {
  tables.current = {
    golf_teams: { data: { name: 'Varsity', join_code: 'X', gender: 'men' } },
    golf_team_members: { data: [member('mixed', 'Ada'), member('nines', 'Bo'), member('none', 'Cy')] },
    golf_rounds: {
      data: [
        // Ada: two eighteens, two nines and a practice round this season.
        eighteen('a1', 'mixed', 2, 74),
        nine('a2', 'mixed', 1, 37),
        eighteen('a3', 'mixed', 5, 76),
        nine('a4', 'mixed', 7, 39),
        eighteen('a5', 'mixed', 3, 70, 'practice'),
        // Bo: nines only.
        nine('b1', 'nines', 4, 38),
        nine('b2', 'nines', 6, 40),
      ],
    },
    golf_player_focus_areas: { data: [] },
    golf_goals: { data: [] },
    golf_coach_player_intent: { data: [] },
  };
  return loadRoster({ teamId: 't1', coachId: 'c1' });
}

describe('Roster counts nine-hole rounds (DF-C-05)', () => {
  it('the count reads either length; the average and its floor read the eighteens', async () => {
    const data = await roster();
    const ada = data.players.find((p) => p.id === 'mixed')!;
    const bo = data.players.find((p) => p.id === 'nines')!;
    const cy = data.players.find((p) => p.id === 'none')!;
    // Two eighteens and two nines count; the practice round does not.
    expect([ada.rounds, roundsPlayed(ada)]).toEqual([2, 4]);
    expect(ada.avg).toBe(75);
    expect([bo.rounds, roundsPlayed(bo), bo.avg]).toEqual([0, 2, null]);
    expect(roundsPlayed(cy)).toBe(0);
    // Under the row: never "No rounds this season" for a player who posted nines.
    expect(rowNote(ada, false)?.text).toBe('Early read · 2 rounds and 2 nines');
    expect(rowNote(bo, false)?.text).toBe('Early read · 2 nine-hole rounds');
    expect(rowNote(cy, false)?.text).toBe('No rounds this season');
    // The Rounds order reads the count shown.
    expect(sortRoster(data.players, 'rounds').map((p) => p.id)).toEqual(['mixed', 'nines', 'none']);
  });

  it('Recent rounds lists the newest of either length, and says which is a nine', async () => {
    const data = await roster();
    const ada = data.players.find((p) => p.id === 'mixed')!;
    expect(ada.recent.map((r) => r.id)).toEqual(['a2', 'a1', 'a5']);
    expect(ada.recent[0]!.date).toMatch(/ · 9 holes$/);
    expect(ada.recent[1]!.date).not.toMatch(/9 holes/);
  });
});
