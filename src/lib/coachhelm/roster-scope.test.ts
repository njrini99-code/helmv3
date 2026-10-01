import { describe, expect, it } from 'vitest';
import { rosterScopedRows } from './roster-scope';

describe('rosterScopedRows (audit row 5)', () => {
  it('drops rows for players no longer on the active roster and keeps team rows', () => {
    const rows = [
      { id: 1, player_id: 'a' },
      { id: 2, player_id: 'gone' },
      { id: 3, player_id: null },
    ];
    expect(rosterScopedRows(rows, ['a', 'b']).map((r) => r.id)).toEqual([1, 3]);
  });
});
