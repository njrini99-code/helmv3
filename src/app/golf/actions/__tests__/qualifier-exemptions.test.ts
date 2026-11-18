import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const Q = '00000000-0000-4000-8000-0000000000a1';
const TEAM = '00000000-0000-4000-8000-000000000001';
const ANN = '00000000-0000-4000-8000-0000000000b1';
const BEA = '00000000-0000-4000-8000-0000000000b2';

/**
 * F-06 exemptions: a stand-in for golf_qualifiers and golf_qualifier_exemptions as RLS answers the caller. The stored rows,
 * the qualifier's status and picks, a missing table (42P01, the held migration) and a policy refusal. No network.
 */
const state = vi.hoisted(() => ({
  user: { id: 'coach-1' } as { id: string } | null,
  qualifier: null as { id: string; team_id: string; status: string; selection_slots_coach_pick: number } | null,
  stored: [] as Array<{ player_id: string; reason: string }>,
  missing: false,
  refuse: false,
  deletes: 0,
  upserts: [] as Array<Array<Record<string, unknown>>>,
}));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath: revalidate }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      let mode: 'read' | 'delete' | 'upsert' = 'read';
      let rows: Array<Record<string, unknown>> = [];
      const result = () => {
        if (table === 'golf_qualifier_exemptions' && state.missing) return { data: null, error: { code: '42P01', message: 'missing' } };
        if (mode === 'delete') return { data: null, error: null };
        if (mode === 'upsert') return state.refuse ? { data: null, error: { code: '42501', message: 'rls' } } : { data: rows.map((r) => ({ player_id: r.player_id })), error: null };
        return { data: state.stored, error: null };
      };
      const q = {
        select: () => q,
        eq: () => q,
        not: () => q,
        delete: () => {
          mode = 'delete';
          state.deletes += 1;
          return q;
        },
        upsert: (r: Array<Record<string, unknown>>) => {
          mode = 'upsert';
          rows = r;
          state.upserts.push(r);
          return q;
        },
        maybeSingle: async () => ({ data: table === 'golf_qualifiers' ? state.qualifier : null, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok),
      };
      return q;
    },
  }),
}));

const { saveQualifierExemptions } = await import('../qualifier-exemptions');

beforeEach(() => {
  state.user = { id: 'coach-1' };
  state.qualifier = { id: Q, team_id: TEAM, status: 'upcoming', selection_slots_coach_pick: 2 };
  state.stored = [];
  state.missing = false;
  state.refuse = false;
  state.deletes = 0;
  state.upserts = [];
  revalidate.mockReset();
});

describe('saveQualifierExemptions (F-06)', () => {
  it('90982 replaces the list before the qualifier starts, with each reason, and refreshes the qualifier', async () => {
    state.stored = [{ player_id: BEA, reason: 'old' }];
    expect(await saveQualifierExemptions({ qualifierId: Q, exemptions: [{ playerId: ANN, reason: '  Conference champion ' }] })).toEqual({ success: true });
    expect(state.deletes).toBe(1);
    expect(state.upserts).toEqual([[{ qualifier_id: Q, team_id: TEAM, player_id: ANN, reason: 'Conference champion', created_by: 'coach-1' }]]);
    expect(revalidate).toHaveBeenCalledWith(`/golf/dashboard/qualifiers/${Q}`);
  });

  it('never more exempt than the coach’s picks, and only before the qualifier starts', async () => {
    const three = [ANN, BEA, '00000000-0000-4000-8000-0000000000b3'].map((playerId) => ({ playerId, reason: 'r' }));
    expect(await saveQualifierExemptions({ qualifierId: Q, exemptions: three })).toMatchObject({ success: false, code: 'CH-09002', error: 'An exempt player takes a coach’s pick, and this qualifier has 2.' });
    state.qualifier!.status = 'in_progress';
    expect(await saveQualifierExemptions({ qualifierId: Q, exemptions: [{ playerId: ANN, reason: 'r' }] })).toMatchObject({ success: false, error: 'Exemptions are set before the qualifier starts. Use a coach’s pick now.' });
    // Saving what is already stored is not a change, so it passes once the qualifier has started.
    state.stored = [{ player_id: ANN, reason: 'r' }];
    expect(await saveQualifierExemptions({ qualifierId: Q, exemptions: [{ playerId: ANN, reason: 'r' }] })).toEqual({ success: true });
    expect(state.upserts).toEqual([]);
  });

  it('refuses a missing reason, a bad id or a duplicate without writing; says when the store is not there yet or RLS keeps it', async () => {
    expect(await saveQualifierExemptions({ qualifierId: Q, exemptions: [{ playerId: ANN, reason: '  ' }] })).toMatchObject({ success: false, error: 'Give each exempt player a reason.' });
    expect(await saveQualifierExemptions({ qualifierId: 'q1', exemptions: [] })).toMatchObject({ success: false });
    expect(await saveQualifierExemptions({ qualifierId: Q, exemptions: [{ playerId: ANN, reason: 'a' }, { playerId: ANN, reason: 'b' }] })).toMatchObject({ success: false });
    expect(state.upserts).toEqual([]);
    state.missing = true;
    expect(await saveQualifierExemptions({ qualifierId: Q, exemptions: [{ playerId: ANN, reason: 'r' }] })).toMatchObject({
      success: false,
      unavailable: true,
      error: 'Exempting a player arrives with the next update.',
    });
    state.missing = false;
    state.refuse = true;
    expect(await saveQualifierExemptions({ qualifierId: Q, exemptions: [{ playerId: ANN, reason: 'r' }] })).toMatchObject({
      success: false,
      error: 'Only a coach of the team can exempt a player, and only one who is entered.',
    });
  });
});
