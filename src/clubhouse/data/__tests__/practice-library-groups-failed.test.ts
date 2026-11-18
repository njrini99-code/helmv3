import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Groups' roster (practice-library.ts `loadGroups`). The membership read used to go through `loadActiveRoster`, which answers a failed
 * read with an empty roster: the Groups page then offered nobody to put in a group. It is now the result form, so a failed read is the
 * page's own "didn't load" (the route's `failed('Groups')`), and it is reported. A stand-in for Supabase, not a database test.
 * Synthetic ids only.
 */
type Row = Record<string, unknown>;
type Failure = { code?: string; message: string };
const tables: Record<string, Row[]> = {};
const failing: Record<string, Failure> = {};
const logged = vi.hoisted(() => vi.fn());

function from(table: string) {
  const answer = () => (failing[table] ? { data: null, error: failing[table] } : { data: tables[table] ?? [], error: null });
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    then: (done: (r: { data: Row[] | null; error: Failure | null }) => unknown) => Promise.resolve(answer()).then(done),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }));
vi.mock('../../lib/track-server', () => ({ chLogServer: logged }));

import { loadGroups } from '../practice-library';

const TIMEOUT: Failure = { code: '57014', message: 'canceling statement due to statement timeout' };

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(failing)) delete failing[k];
  logged.mockClear();
  tables.golf_practice_groups = [{ id: 'g1', name: 'Short game', player_ids: ['p1'] }];
  tables.golf_team_members = [{ player_id: 'p1' }];
  tables.golf_players = [{ id: 'p1', first_name: 'Test', last_name: 'One', graduation_year: 2027, is_test: false }];
});

describe('loadGroups roster', () => {
  it('reads the groups and the roster when both answer', async () => {
    const load = await loadGroups('t1');
    expect(load.status).toBe('ready');
    if (load.status !== 'ready') return;
    expect(load.data.groups.map((g) => g.id)).toEqual(['g1']);
    expect(load.data.roster.map((p) => p.id)).toEqual(['p1']);
    expect(logged).not.toHaveBeenCalled();
  });

  it('a failed membership read is the page failing, reported, never a roster of nobody', async () => {
    failing.golf_team_members = TIMEOUT;
    const load = await loadGroups('t1');
    expect(load.status).toBe('failed');
    expect(logged).toHaveBeenCalledWith('practice.library', 'roster', expect.any(Error), 'practice_plans');
  });

  it('a team with nobody on it is still an empty roster, not a failure', async () => {
    tables.golf_team_members = [];
    const load = await loadGroups('t1');
    expect(load.status).toBe('ready');
    if (load.status !== 'ready') return;
    expect(load.data.roster).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
  });

  it('a failed groups read is reported and fails the page', async () => {
    failing.golf_practice_groups = TIMEOUT;
    const load = await loadGroups('t1');
    expect(load.status).toBe('failed');
    expect(logged).toHaveBeenCalledWith('practice.library', 'groups', TIMEOUT, 'practice_plans');
  });
});
