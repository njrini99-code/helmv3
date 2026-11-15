import { describe, expect, it } from 'vitest';
import type { ChRound } from '../season';
import { mostImproved, seasonBests } from '../stats-team';

/** Only the fields Season bests reads; the rest of a round never matters here. */
let seq = 0;
const rd = (playerId: string, date: string, score: number): ChRound =>
  ({ id: `r${String(++seq).padStart(4, '0')}`, player_id: playerId, round_date: date, total_score: score, score_to_par: score - 72, course_name: 'The Cardinal', strokes_gained_total: null }) as unknown as ChRound;

const series = (playerId: string, scores: number[]) => scores.map((s, i) => rd(playerId, `2026-08-${String(10 + i).padStart(2, '0')}`, s));

// Larsen Gallimore's real 2026–27 season, oldest first: first five 74.2, latest five 78.4 (he got worse).
const larsen = series('larsen', [80, 74, 68, 76, 73, 74, 76, 74, 78, 73, 73, 76, 81, 82, 80]);
// A player who really improved: 80s, then 75s, then 70s.
const improver = series('improver', [80, 80, 80, 80, 80, 75, 75, 75, 75, 75, 70, 70, 70, 70, 70]);

describe('mostImproved', () => {
  it('never names a player whose latest five are worse than their first five', () => {
    expect(mostImproved(larsen)).toBeNull();
  });

  it('names the player who improved, with a negative change in strokes', () => {
    expect(mostImproved([...larsen, ...improver])).toEqual({ id: 'improver', change: -10 });
  });

  it('needs ten rounds from a player', () => {
    expect(mostImproved(series('short', [90, 90, 90, 90, 70, 70, 70, 70, 70]))).toBeNull();
  });
});

describe('seasonBests', () => {
  const players = [
    { id: 'braeden', first_name: 'Braeden', last_name: 'Gillen' },
    { id: 'holden', first_name: 'Holden', last_name: 'Yakola' },
    { id: 'improver', first_name: 'Ima', last_name: 'Prover' },
  ];

  it('keeps the earliest round on a tie for Low round', () => {
    const rounds = [rd('holden', '2026-10-19', 67), rd('braeden', '2026-09-29', 67), rd('holden', '2026-10-20', 74)];
    const low = seasonBests(rounds, players, new Map(), null).find((b) => b.label === 'Low round');
    expect(low).toMatchObject({ label: 'Low round', playerId: 'braeden' });
  });

  it('labels Most improved with how many strokes the player came down', () => {
    const bests = seasonBests(improver, players, new Map(), null);
    expect(bests.find((b) => b.label === 'Most improved')).toMatchObject({ playerId: 'improver', value: '−10.0' });
  });
});
