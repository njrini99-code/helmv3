import { describe, expect, it } from 'vitest';
import { toTeamRounds, type ChTeamRoundRow } from '../team-rounds-shape';

const row = (id: string, player_id: string, over: Partial<ChTeamRoundRow> = {}): ChTeamRoundRow =>
  ({ id, player_id, course_name: 'pine lakes', tees_played: 'White', round_date: '2026-10-10', round_type: 'qualifying', total_score: 72, score_to_par: 0, front_nine: 36, back_nine: 36, holes_played: 18, total_putts: null, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null, ...over }) as ChTeamRoundRow;
const names = new Map([['eli', 'Eli Brandt'], ['ana', 'Ana Ruiz']]);
const ids = (rows: ChTeamRoundRow[]) => toTeamRounds(rows, names).list.map((r) => r.id);

describe('toTeamRounds, one day', () => {
  it('keeps one player together, in the order of the qualifier rounds, whatever the ids', () => {
    expect(ids([row('z', 'eli', { qualifier_round_number: 1 }), row('m', 'ana', { qualifier_round_number: 1 }), row('a', 'eli', { qualifier_round_number: 2 })])).toEqual(['m', 'z', 'a']);
  });

  it('falls back to when each round was posted', () => {
    expect(ids([row('a', 'eli', { created_at: '2026-10-10T18:00:00Z' }), row('z', 'eli', { created_at: '2026-10-10T12:00:00Z' })])).toEqual(['z', 'a']);
  });

  it('still lists the newest day first', () => {
    expect(ids([row('old', 'ana', { round_date: '2026-10-01' }), row('new', 'eli', { round_date: '2026-10-11' })])).toEqual(['new', 'old']);
  });

  it('tidies the course name for display', () => {
    expect(toTeamRounds([row('a', 'eli')], names).list[0]!.course).toBe('Pine Lakes');
  });
});
