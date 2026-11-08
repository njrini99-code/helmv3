import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));

import { inSecondPerson } from '../player-tools';
import { getRecentRounds } from '../read-tools';
import type { ToolEnvelope } from '../provenance';

// Player Ask, staging, 2026-11-08: "What did I shoot in my last round?" drew a table titled "Cole Bennett's last 1 recorded round."
// A player's visuals address the player: "Your last round", never their own name in the third person.

const ctx = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'Team', timezone: 'UTC', roster: [{ id: 'p1', name: 'Cole Bennett' }] } as never;

const oneRound = {
  id: 'r1', round_date: '2026-10-21', course_name: 'Pines', round_type: 'tournament', total_score: 73, score_to_par: 1, total_putts: 30,
  strokes_gained_total: -2.72, holes_played: 18, front_nine: 36, back_nine: 37,
};
function sbWith(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  return { from: () => chain } as never;
}

describe('a read summary says what it read', () => {
  it('one round is "last round", not "last 1 recorded round"', async () => {
    const one = await getRecentRounds(sbWith([oneRound]), ctx, { player_id: 'p1', last_n: 1 });
    expect(one.summary).toBe("Cole Bennett's last round.");
    const three = await getRecentRounds(sbWith([oneRound, oneRound, oneRound]), ctx, { player_id: 'p1', last_n: 3 });
    expect(three.summary).toBe("Cole Bennett's last 3 recorded rounds.");
  });
});

describe('the player’s own reads speak to them', () => {
  const base: ToolEnvelope = { summary: "Cole Bennett's last round.", measurements: [], series: [], detail: { player: { name: 'Cole Bennett', player_id: 'p1' } }, coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z' };

  it('"Your last round."', () => {
    expect(inSecondPerson(base, 'Cole Bennett').summary).toBe('Your last round.');
  });
  it('a name after "for", in a note, and on the entity', () => {
    const e = inSecondPerson(
      {
        ...base,
        summary: '4 metrics for Cole Bennett.',
        coverage_note: 'Cole Bennett has 3 rounds, and the rest of the team has more.',
        measurements: [{ metric_id: 'sg_putting', metric_label: 'Strokes gained putting', unit: 'strokes', value: -1, entity: { kind: 'player', id: 'p1', label: 'Cole Bennett' }, window_start: null, window_end: null, sample_size: 3, sample_unit: 'rounds', as_of: base.as_of, coverage: 'complete', coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: 'higher_better' }],
      },
      'Cole Bennett',
    );
    expect(e.summary).toBe('4 metrics for you.');
    expect(e.coverage_note).toBe('You have 3 rounds, and the rest of the team has more.');
    expect(e.measurements[0]?.entity.label).toBe('You');
    // Ids and the detail the answer's numbers are checked against are untouched.
    expect(e.measurements[0]?.entity.id).toBe('p1');
    expect(e.detail).toEqual(base.detail);
  });
  it('leaves another name, and a name that is only part of a word, alone', () => {
    expect(inSecondPerson({ ...base, summary: 'Cole Bennett and Cole Bennetton.' }, 'Cole Bennett').summary).toBe('You and Cole Bennetton.');
  });
});
