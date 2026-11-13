import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { loadActiveRosterResult } from '../context';

/** Preview, 12 Nov: a test account was named in Ask's answers and its "Since Monday". A player marked is_test is not on Ask's roster. */
function sbWith(responses: Record<string, { data: unknown }>) {
  const builder = (table: string) => {
    const result = { error: null, ...(responses[table] ?? { data: [] }) };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in']) chain[method] = vi.fn(() => chain);
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };
  return { from: vi.fn((table: string) => builder(table)) } as never;
}

describe('the roster Ask reads', () => {
  it('leaves out a player marked as a test account, and keeps everyone else in order', async () => {
    const sb = sbWith({
      golf_team_members: { data: [{ player_id: 'p1' }, { player_id: 'p2' }, { player_id: 'p3' }] },
      golf_players: { data: [{ id: 'p1', first_name: 'Ava', last_name: 'Stone', graduation_year: 2027, is_test: false }, { id: 'p2', first_name: 'Audit', last_name: 'Account', graduation_year: null, is_test: true }, { id: 'p3', first_name: 'Ben', last_name: 'Cruz', graduation_year: 2028, is_test: false }] },
    });
    const { roster, failed } = await loadActiveRosterResult(sb, 'team-1');
    expect(failed).toBe(false);
    expect(roster.map((p) => p.name)).toEqual(['Ava Stone', 'Ben Cruz']);
  });

  it('a member whose profile did not come back is still kept, by placeholder', async () => {
    const sb = sbWith({ golf_team_members: { data: [{ player_id: 'p1' }] }, golf_players: { data: [] } });
    expect((await loadActiveRosterResult(sb, 'team-1')).roster.map((p) => p.name)).toEqual(['Unnamed player']);
  });
});
