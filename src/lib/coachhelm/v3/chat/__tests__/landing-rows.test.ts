import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const logged = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: logged }));
import { landingRows } from '../landing-rows';

const ctx = { team_id: 'team-1', user_id: 'user-1' } as never;
/** `boom`: the read throws (the network). `error`: PostgREST answers `{ data: null, error }`, which supabase-js resolves and does not throw. */
function sb(data: unknown, opts: { boom?: boolean; error?: { code?: string; message: string } } = {}) {
  const calls: Array<[string, unknown[]]> = [];
  const tables: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'not', 'gte', 'order']) chain[m] = (...a: unknown[]) => (calls.push([m, a]), chain);
  chain.limit = async () => {
    if (opts.boom) throw new Error('down');
    return opts.error ? { data: null, error: opts.error } : { data, error: null };
  };
  return { client: { from: (t: string) => (tables.push(t), chain) } as never, calls, tables };
}

beforeEach(() => logged.mockClear());

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
  it('a screen with nothing on it yet, and a flow with no neighbours, are an empty list: the read worked', async () => {
    expect(await landingRows(sb([]).client, ctx, 'create_trip', {})).toEqual([]);
    expect(await landingRows(sb([]).client, ctx, 'add_round_note', {})).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
  });

  // The contract changed on purpose (2026-11-10): a failed read used to come back as [], the same value as "nothing there".
  it('a read that threw is null, not an empty list, and is logged', async () => {
    expect(await landingRows(sb(null, { boom: true }).client, ctx, 'create_trip', {})).toBeNull();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]![0])).toContain('landingRows create_trip failed: down');
  });
  it.each([
    ['create_goal', 'golf_goals', 'goals', { player_id: 'p1' }],
    ['create_task', 'golf_tasks', 'tasks', {}],
    ['create_team_announcement', 'golf_announcements', 'announcements', {}],
    ['create_announcement', 'golf_announcements', 'announcements', {}],
    ['create_trip', 'golf_travel_itineraries', 'trips', {}],
    ['create_qualifier', 'golf_qualifiers', 'qualifiers', {}],
    ['create_recruit', 'golf_recruits', 'recruits', {}],
  ])('%s: an error PostgREST returns (it does not throw) is null and logged, never "nothing on that screen"', async (tool, table, what, input) => {
    const { client, tables } = sb(null, { error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    expect(await landingRows(client, ctx, tool, input)).toBeNull();
    expect(tables).toEqual([table]);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]![0])).toContain(`landingRows ${what} failed`);
    expect(logged.mock.calls[0]![1]).toMatchObject({ action: 'coachhelm.ask.landing_rows', userId: 'user-1', errorCode: '57014', handled: true });
  });
});
