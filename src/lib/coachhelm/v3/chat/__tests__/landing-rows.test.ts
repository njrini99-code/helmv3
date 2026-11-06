import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { landingRows } from '../landing-rows';

const ctx = { team_id: 'team-1' } as never;
function sb(data: unknown, boom = false) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'not', 'gte', 'order']) chain[m] = (...a: unknown[]) => (calls.push([m, a]), chain);
  chain.limit = async () => {
    if (boom) throw new Error('down');
    return { data, error: null };
  };
  return { client: { from: () => chain } as never, calls };
}

/** FID-ASK-9: the new row slots in between what's already on that screen; a failed read costs the card nothing. */
describe('the rows a draft lands between', () => {
  it('reads this team only, and at most two', async () => {
    const { client, calls } = sb([{ title: 'Putting block', due_date: '2026-11-09' }]);
    expect(await landingRows(client, ctx, 'create_task', {})).toEqual([{ title: 'Putting block', sub: 'Due Nov 9' }]);
    expect(calls).toContainEqual(['eq', ['team_id', 'team-1']]);
  });
  it('a goal needs its player, and only that player’s goals are read', async () => {
    const { client, calls } = sb([]);
    await landingRows(client, ctx, 'create_goal', { player_id: 'p1' });
    expect(calls).toContainEqual(['eq', ['player_id', 'p1']]);
    expect(await landingRows(sb([]).client, ctx, 'create_goal', {})).toEqual([]);
  });
  it('a failed read or an unknown flow draws the new row alone', async () => {
    expect(await landingRows(sb(null, true).client, ctx, 'create_trip', {})).toEqual([]);
    expect(await landingRows(sb([]).client, ctx, 'add_round_note', {})).toEqual([]);
  });
});
