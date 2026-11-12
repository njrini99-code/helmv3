import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));

import { inSecondPerson } from '../player-reads';
import type { ToolEnvelope } from '../provenance';

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
