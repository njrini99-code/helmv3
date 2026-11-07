import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { toChTeamLegs } from '../coachhelm-team-legs';
import { lastTenRounds, playerStrokesGained, roundsForFigures } from '../figure-window';
import { filterFor } from '../stats-filter';
import { roundsInFilter } from '../stats-common';
import { summarizeWindow } from '../stats-weight';
import type { ChRound } from '../season';

const src = (file: string) => readFileSync(join(process.cwd(), 'src/clubhouse', file), 'utf8');

/** Cole's rounds as staging holds them: 18-hole, newest first, practice and two rounds with no shots among them. */
const COLE: Array<[string, string, number, number | null, number | null, number | null, number | null, number | null]> = [
  ['2026-10-21', 'tournament', 74, -3.72, -0.6, 1.22, -0.44, -3.9],
  ['2026-10-21', 'tournament', 77, -6.72, -0.2, -1.17, 1.29, -6.64],
  ['2026-10-21', 'tournament', 73, -2.72, -0.73, -1.23, 0.13, -0.9],
  ['2026-10-06', 'practice', 82, -9.78, -1.22, -7.13, 2.33, -3.76],
  ['2026-09-30', 'practice', 75, -5.73, -1.99, -4.79, 0.29, 0.76],
  ['2026-09-26', 'qualifier', 70, null, null, null, null, null],
  ['2026-09-25', 'qualifier', 71, null, null, null, null, null],
  ['2026-09-15', 'qualifier', 77, -5.64, -2.21, -3.82, 1.99, -1.6],
  ['2026-09-13', 'qualifier', 87, -17.05, -1.4, -10.74, -1.68, -3.23],
  ['2026-08-27', 'qualifier', 81, -9.24, -1.36, -5.58, 1.16, -3.47],
  ['2026-08-26', 'qualifier', 77, -7.11, -1.78, -4.53, 1.65, -2.46],
  ['2026-08-25', 'qualifier', 76, -6.3, -0.88, -2.98, -0.03, -2.4],
  ['2026-08-23', 'qualifier', 83, -12.85, -2.35, -8.63, -1.63, -0.25],
  ['2026-08-02', 'practice', 70, 0.47, 2.53, 1.89, 0, -3.94],
];
const round = ([date, type, score, sg, tee, app, arg, putt]: (typeof COLE)[number], i: number) =>
  ({
    id: `r${String(i).padStart(2, '0')}`,
    player_id: 'cole',
    round_date: date,
    round_type: type,
    holes_played: 18,
    total_score: score,
    score_to_par: score - 72,
    status: 'completed',
    front_nine: sg == null ? null : 36,
    back_nine: sg == null ? null : score - 36,
    total_putts: sg == null ? null : 30,
    strokes_gained_total: sg,
    strokes_gained_tee: tee,
    strokes_gained_approach: app,
    strokes_gained_around_green: arg,
    strokes_gained_putting: putt,
  }) as unknown as ChRound;
const rounds = COLE.map(round);

describe('one strokes-gained source (QA-1)', () => {
  const shared = playerStrokesGained(rounds);

  it('reads the newest ten counted rounds, ending on the newest, with practice out', () => {
    const last = lastTenRounds(rounds);
    expect(last).toHaveLength(10);
    expect(last[0]!.round_date).toBe('2026-10-21');
    expect(last.every((r) => r.round_type !== 'practice')).toBe(true);
    expect(shared.total).toBeCloseTo(-7.31, 2);
  });

  it('Team view, Home and Stats draw the same number for one player', () => {
    const team = toChTeamLegs(roundsForFigures(rounds), ['cole']).get('cole')!;
    // Home takes `playerStrokesGained` itself (asserted below); Stats' default is the newest ten through `summarizeWindow`.
    const stats = summarizeWindow(roundsInFilter(roundsForFigures(rounds), filterFor('last10')));
    expect(team.total).toBeCloseTo(shared.total!, 6);
    expect(stats.sgPerRound).toBeCloseTo(shared.total!, 6);
    expect(team.legs.tee.strokes).toBeCloseTo(shared.legs.tee!, 6);
    expect(team.legs.approach.strokes).toBeCloseTo(shared.legs.approach!, 6);
    expect(stats.sgLegs.tee).toBeCloseTo(shared.legs.tee!, 6);
    expect(stats.sgLegs.approach).toBeCloseTo(shared.legs.approach!, 6);
    expect(stats.sgLegs.putting).toBeCloseTo(shared.legs.putting!, 6);
    expect(team.rounds).toBe(10);
  });

  it('each screen’s loader goes through the helper', () => {
    expect(src('data/player-home.ts')).toContain('playerStrokesGained(roundsRes.rounds)');
    expect(src('data/roster.ts')).toContain('playerStrokesGained(wideByPlayer.get(p.id) ?? [])');
    expect(src('data/home.ts')).toContain('playerStrokesGained(wideByPlayer.get(p.id) ?? [])');
    expect(src('data/coachhelm-team-legs.ts')).toContain('lastTenRounds(rounds.filter(');
    expect(src('data/stats-weight.ts')).toContain('const sg = sgOver(holes);');
    expect(src('data/figure-window.ts')).toContain('const sg = sgOver(holes);');
  });

  it('a round in progress never counts, on any screen (the rule for stale practice rounds)', () => {
    const open = { ...rounds[0]!, id: 'open', round_date: '2026-10-25', status: 'in_progress' } as ChRound;
    expect(lastTenRounds([open, ...rounds])[0]!.id).not.toBe('open');
    expect(src('data/season.ts')).toContain(".eq('status', 'completed')");
  });
});
