import { describe, expect, it } from 'vitest';
import { toChTeamLegs } from '../coachhelm-team-legs';
import { figuresOver, roundsForFigures, windowWords } from '../figure-window';
import { summarizePlayer, type ChRound } from '../season';
import { filterFor } from '../stats-filter';
import { teamGrid } from '../stats-team';

const round = (id: string, over: Partial<ChRound> = {}): ChRound =>
  ({
    id,
    player_id: 'cole',
    round_date: `2026-10-${id.padStart(2, '0')}T12:00:00Z`,
    round_type: 'tournament',
    status: 'completed',
    recorded_holes: 18,
    is_complete: true,
    holes_played: 18,
    total_only: false,
    total_score: 72,
    score_to_par: 0,
    strokes_gained_total: 0.5,
    strokes_gained_tee: 2.5,
    strokes_gained_approach: 1.9,
    strokes_gained_around_green: 0,
    strokes_gained_putting: -3.9,
    ...over,
  }) as unknown as ChRound;

/** The demo team's shape: real rounds, a practice round, a total-only round. */
const POSTED = [round('1'), round('2'), round('3'), round('4', { round_type: 'practice', strokes_gained_tee: -9 }), round('5', { total_only: true, strokes_gained_total: null, strokes_gained_tee: null, strokes_gained_approach: null, strokes_gained_around_green: null, strokes_gained_putting: null })];
const PLAYERS = [{ id: 'cole', first_name: 'Cole', last_name: 'Bennett' }];

describe('one figure across pages (QA-1)', () => {
  const counted = roundsForFigures(POSTED);

  it('leaves practice out of every figure', () => {
    expect(counted.map((r) => r.id)).toEqual(['1', '2', '3', '5']);
  });

  it('Team view, Roster and Stats read the same round count and legs for the same window', () => {
    const f = figuresOver(counted);
    const team = toChTeamLegs(counted, ['cole']).get('cole')!;
    const stats = teamGrid(PLAYERS, counted, filterFor('season'))[0]!;
    const roster = summarizePlayer(counted);

    expect(team.rounds).toBe(f.rounds);
    expect(stats.rounds).toBe(f.rounds);
    expect(roster.rounds).toBe(f.rounds);

    expect(team.legs.tee.strokes).toBeCloseTo(f.legs.tee!, 6);
    expect(team.legs.putting.strokes).toBeCloseTo(f.legs.putting!, 6);
    expect(stats.legs[0]).toBeCloseTo(f.legs.tee!, 6);
    expect(stats.legs[3]).toBeCloseTo(f.legs.putting!, 6);
    expect(team.total).toBeCloseTo(f.total!, 6);
    expect(stats.total).toBeCloseTo(f.total!, 6);
  });

  it('every figure names its window and the rounds it rests on', () => {
    expect(windowWords('season', 4)).toBe('This season · 4 rounds');
    expect(windowWords('last10', 1)).toBe('Last 10 · 1 round');
  });

  it('holds strokes gained back under the floor rather than print it from one round', () => {
    expect(figuresOver([round('1'), round('2')]).total).toBeNull();
    expect(figuresOver([round('1'), round('2')]).rounds).toBe(2);
  });
});
