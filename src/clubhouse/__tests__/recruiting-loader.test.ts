import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P014 C1 and C2 in the loader: whether the next-step columns exist (absent until their migration is applied, and then the
 * whole feature is off), and the program the recruiting calendar reads. Neither can fail the page.
 */
vi.mock('server-only', () => ({}));
const getRecruits = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/recruiting', () => ({ getRecruits }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const resolveTeam = vi.hoisted(() => vi.fn());
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: resolveTeam }));

type Res = { data?: unknown; error?: unknown };
const db = vi.hoisted(() => ({
  probe: { error: null } as Res,
  coach: { data: { id: 'c1', organization_id: 'o1' }, error: null } as Res,
  team: { data: { gender: 'womens', organization: { division: 'NCAA D1' } }, error: null } as Res,
  user: { id: 'u1' } as { id: string } | null,
  selects: [] as Array<{ table: string; cols: string; opts?: unknown }>,
  throwOnCreate: false,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    if (db.throwOnCreate) throw new Error('no request scope');
    const chain = (res: Res) => {
      const c: Record<string, unknown> = {};
      for (const k of ['eq', 'limit', 'order']) c[k] = () => c;
      c.maybeSingle = () => Promise.resolve(res);
      c.then = (ok: (v: Res) => unknown, no: (e: unknown) => unknown) => Promise.resolve(res).then(ok, no);
      return c;
    };
    return {
      auth: { getUser: async () => ({ data: { user: db.user } }) },
      from: (table: string) => ({
        select: (cols: string, opts?: unknown) => {
          db.selects.push({ table, cols, opts });
          if (table === 'golf_recruits') return chain(db.probe);
          if (table === 'golf_coaches') return chain(db.coach);
          return chain(db.team);
        },
      }),
    };
  },
}));

import { loadRecruiting } from '../data/recruiting';

const row = { id: 'r1', team_id: 't1', first_name: 'Ada', last_name: null, hs_class: 2027, email: null, phone: null, hometown: null, state: null, notes: null, status: 'offered', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z' };

beforeEach(() => {
  getRecruits.mockReset();
  resolveTeam.mockReset().mockResolvedValue('t1');
  db.probe = { error: null };
  db.coach = { data: { id: 'c1', organization_id: 'o1' }, error: null };
  db.team = { data: { gender: 'womens', organization: { division: 'NCAA D1' } }, error: null };
  db.user = { id: 'u1' };
  db.selects = [];
  db.throwOnCreate = false;
});

describe('Recruiting loader · next step and the program', () => {
  it('columns absent (the probe fails with 42703): the feature is off and the rows carry no next-step fields', async () => {
    db.probe = { error: { code: '42703', message: 'column golf_recruits.next_step_date does not exist' } };
    getRecruits.mockResolvedValue({ success: true, data: [row] });
    const load = await loadRecruiting(new Date('2026-10-08T12:00:00Z'));
    if (load.kind !== 'ready') throw new Error('expected ready');
    expect(load.data.nextStep).toBeUndefined();
    expect('nextStepLabel' in load.data.prospects[0]!).toBe(false);
    // The probe is a zero-row head request, and the list itself never names the columns (it is getRecruits' select('*')).
    expect(db.selects.find((s) => s.table === 'golf_recruits')).toEqual({ table: 'golf_recruits', cols: 'next_step_date', opts: { head: true } });
  });

  it('columns present: the feature is on and each row’s step is read', async () => {
    getRecruits.mockResolvedValue({ success: true, data: [{ ...row, next_step_label: 'Official visit', next_step_date: '2026-10-12' }] });
    const load = await loadRecruiting(new Date('2026-10-08T12:00:00Z'));
    if (load.kind !== 'ready') throw new Error('expected ready');
    expect(load.data.nextStep).toBe(true);
    expect(load.data.prospects[0]).toMatchObject({ nextStepLabel: 'Official visit', nextStepDate: '2026-10-12' });
  });

  it('the program: the team’s gender and its organization’s division, read conservatively', async () => {
    getRecruits.mockResolvedValue({ success: true, data: [] });
    let load = await loadRecruiting();
    expect(load).toMatchObject({ kind: 'ready', data: { program: { division: 'ncaa-d1', gender: 'womens' } } });
    db.team = { data: { gender: 'mens', organization: { division: 'Big Sky' } }, error: null };
    load = await loadRecruiting();
    expect(load).toMatchObject({ kind: 'ready', data: { program: { division: null, gender: 'mens' } } });
  });

  it('no team, a failed read or no request scope: no program and no feature, and the page still loads', async () => {
    getRecruits.mockResolvedValue({ success: true, data: [row] });
    resolveTeam.mockResolvedValue(null);
    let load = await loadRecruiting();
    expect(load.kind === 'ready' && load.data.program).toBeUndefined();
    db.throwOnCreate = true;
    load = await loadRecruiting();
    expect(load).toMatchObject({ kind: 'ready', data: { prospects: [expect.objectContaining({ id: 'r1' })], error: false } });
    expect(load.kind === 'ready' && (load.data.nextStep ?? load.data.program)).toBeUndefined();
  });
});
