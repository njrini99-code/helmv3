import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { toChTeamLegs } from '../coachhelm-team-legs';
import { playerScoringAverage, playerStrokesGained, roundsForFigures } from '../figure-window';
import { filterFor } from '../stats-filter';
import { roundsInFilter } from '../stats-common';
import { summarizeWindow } from '../stats-weight';
import type { ChRound } from '../season';

/**
 * Dashboard cuts: one home per number. Anywhere a figure is drawn outside its home, it is the same value over the same window. Homes: a
 * player's strokes gained and scoring average are My stats (Stats > Players for a coach), over the newest ten counted 18-hole rounds.
 * Every other surface reads the shared source, checked here by value over one player's rounds and by which function each loader calls.
 */
const src = (file: string) => readFileSync(join(process.cwd(), 'src/clubhouse', file), 'utf8');

let i = 0;
const r = (date: string, type: string, score: number, sg: number | null, holes = 18): ChRound =>
  ({
    id: `r${String(i++).padStart(2, '0')}`,
    player_id: 'p1',
    round_date: date,
    round_type: type,
    holes_played: holes,
    total_score: score,
    score_to_par: score - (holes === 9 ? 36 : 72),
    status: 'completed',
    front_nine: sg == null ? null : 36,
    back_nine: sg == null ? null : score - 36,
    total_putts: sg == null ? null : 30,
    strokes_gained_total: sg,
    strokes_gained_tee: sg == null ? null : sg / 4,
    strokes_gained_approach: sg == null ? null : sg / 4,
    strokes_gained_around_green: sg == null ? null : sg / 4,
    strokes_gained_putting: sg == null ? null : sg / 4,
  }) as unknown as ChRound;

/** Newest first: a nine, practice, rounds with no shots, and more than ten counted 18s, so every rule of the window is in play. */
const rounds = [
  r('2026-11-02', 'tournament', 39, -1, 9),
  r('2026-10-30', 'practice', 70, 2),
  r('2026-10-21', 'tournament', 74, -3.7),
  r('2026-10-21', 'tournament', 77, -6.7),
  r('2026-10-20', 'qualifier', 73, null),
  r('2026-10-14', 'qualifier', 75, -2.1),
  r('2026-10-10', 'tournament', 79, -8.2),
  r('2026-10-02', 'qualifier', 72, -1.0),
  r('2026-09-28', 'qualifier', 76, -4.4),
  r('2026-09-20', 'tournament', 81, -9.9),
  r('2026-09-14', 'qualifier', 74, -3.0),
  r('2026-09-07', 'qualifier', 71, 0.4),
  r('2026-09-01', 'qualifier', 90, -20),
  r('2026-08-28', 'qualifier', 88, -18),
];
const home = summarizeWindow(roundsInFilter(roundsForFigures(rounds), filterFor('last10')));

describe('each figure matches its home, for one player over one window', () => {
  it('strokes gained: Team view, player Home, coach Home, Roster and Stats print one value', () => {
    const shared = playerStrokesGained(rounds);
    expect(home.sgPerRound).not.toBeNull();
    expect(shared.total).toBeCloseTo(home.sgPerRound!, 6);
    const team = toChTeamLegs(roundsForFigures(rounds), ['p1']).get('p1')!;
    expect(team.total).toBeCloseTo(home.sgPerRound!, 6);
    for (const leg of ['tee', 'approach', 'putting'] as const) expect(shared.legs[leg]).toBeCloseTo(home.sgLegs[leg]!, 6);
  });

  it('scoring average: player Home prints the value My stats does', () => {
    const shared = playerScoringAverage(rounds);
    expect(shared.n).toBe(10);
    expect(shared.avg).toBeCloseTo(home.avg!, 6);
  });

  it('every loader takes the shared source, and Home draws the loader’s figures without working them out again', () => {
    for (const file of ['data/player-home.ts', 'data/home.ts', 'data/roster.ts']) expect(src(file)).toMatch(/playerStrokesGained\(/);
    expect(src('data/player-home.ts')).toMatch(/scoringLast10: [^\n]*playerScoringAverage\(/);
    expect(src('data/coachhelm-team-legs.ts')).toMatch(/lastTenRounds\(/);
  });
});
