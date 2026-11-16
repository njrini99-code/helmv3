import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const Q = '00000000-0000-4000-8000-0000000000a1';
const TEAM = '00000000-0000-4000-8000-000000000001';

/**
 * A stand-in for golf_qualifiers and golf_qualifier_rules as RLS answers the caller: another team's qualifier reads as no
 * row, a write the policies keep returns no row (or 42501), a missing table (the held migration) answers 42P01. No network.
 */
const state = vi.hoisted(() => ({
  user: { id: 'coach-1' } as { id: string } | null,
  qualifier: { id: '', team_id: '' } as { id: string; team_id: string } | null,
  allowed: true,
  error: null as { message: string; code?: string } | null,
  writes: [] as Array<{ table: string; row: Record<string, unknown>; onConflict: string }>,
}));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath: revalidate }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      let row: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        eq: () => q,
        upsert: (r: Record<string, unknown>, o: { onConflict: string }) => {
          row = r;
          state.writes.push({ table, row: r, onConflict: o.onConflict });
          return q;
        },
        maybeSingle: async () => {
          if (table === 'golf_qualifiers') return { data: state.qualifier, error: null };
          if (state.error) return { data: null, error: state.error };
          return { data: state.allowed && row ? { qualifier_id: row.qualifier_id } : null, error: null };
        },
      };
      return q;
    },
  }),
}));

const { saveQualifierRules } = await import('../qualifier-rules');

beforeEach(() => {
  state.user = { id: 'coach-1' };
  state.qualifier = { id: Q, team_id: TEAM };
  state.allowed = true;
  state.error = null;
  state.writes = [];
  revalidate.mockReset();
});

describe('saveQualifierRules (F-04)', () => {
  it('90981 writes one row a qualifier with its team, and refreshes the list and the qualifier', async () => {
    expect(await saveQualifierRules({ qualifierId: Q, rules: { tieRule: 'last_round' } })).toEqual({ success: true });
    expect(state.writes).toEqual([
      {
        table: 'golf_qualifier_rules',
        onConflict: 'qualifier_id',
        row: expect.objectContaining({ qualifier_id: Q, team_id: TEAM, tie_rule: 'last_round', updated_by: 'coach-1' }),
      },
    ]);
    expect(revalidate).toHaveBeenCalledWith('/golf/dashboard/qualifiers');
    expect(revalidate).toHaveBeenCalledWith(`/golf/dashboard/qualifiers/${Q}`);
  });

  it('refuses a rule it does not know, or an address that is not a qualifier id, without asking the database', async () => {
    expect(await saveQualifierRules({ qualifierId: Q, rules: { tieRule: 'playoff' as never } })).toMatchObject({ success: false, code: 'CH-09002' });
    expect(await saveQualifierRules({ qualifierId: 'q1', rules: { tieRule: 'coach' } })).toMatchObject({ success: false, code: 'CH-09002' });
    expect(state.writes).toEqual([]);
  });

  it('another team’s qualifier is not found; a write RLS keeps is refused in words; a missing table answers unavailable', async () => {
    state.qualifier = null;
    expect(await saveQualifierRules({ qualifierId: Q, rules: { tieRule: 'coach' } })).toMatchObject({
      success: false,
      error: 'That qualifier wasn’t found on your team.',
    });
    expect(state.writes).toEqual([]);
    state.qualifier = { id: Q, team_id: TEAM };
    state.allowed = false;
    expect(await saveQualifierRules({ qualifierId: Q, rules: { tieRule: 'coach' } })).toMatchObject({
      success: false,
      error: 'Only a coach of the team can change its tie rule.',
    });
    state.error = { message: 'new row violates row-level security policy', code: '42501' };
    expect(await saveQualifierRules({ qualifierId: Q, rules: { tieRule: 'coach' } })).toMatchObject({
      success: false,
      error: 'Only a coach of the team can change its tie rule.',
    });
    state.error = { message: 'relation "golf_qualifier_rules" does not exist', code: '42P01' };
    expect(await saveQualifierRules({ qualifierId: Q, rules: { tieRule: 'coach' } })).toEqual({
      success: false,
      code: 'CH-09002',
      error: 'Choosing a tie rule arrives with the next update.',
      unavailable: true,
    });
    state.user = null;
    expect(await saveQualifierRules({ qualifierId: Q, rules: { tieRule: 'coach' } })).toMatchObject({
      success: false,
      error: 'Your session ended. Sign in again to save.',
    });
    expect(revalidate).not.toHaveBeenCalled();
  });
});
