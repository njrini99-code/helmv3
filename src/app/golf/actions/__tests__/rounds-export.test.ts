import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const R1 = '00000000-0000-0000-0000-0000000000a1';
const R2 = '00000000-0000-0000-0000-0000000000a2';

type Row = { round_id: string; hole_number: number; par: number; score: number | null };
/** A stand-in for golf_holes: what the caller's policies let through, and the filters each read asked for. No network. */
const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  holes: [] as Row[],
  error: null as { message: string; code?: string } | null,
  asked: [] as Array<{ table: string; ids: string[] }>,
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      let ids: string[] = [];
      const q = {
        select: () => q,
        in: (_c: string, v: string[]) => {
          ids = v;
          state.asked.push({ table, ids: v });
          return q;
        },
        order: () => q,
        range: async (from: number, to: number) =>
          state.error ? { data: null, error: state.error } : { data: state.holes.filter((h) => ids.includes(h.round_id)).slice(from, to + 1), error: null },
      };
      return q;
    },
  }),
}));

const { readRoundHolesForExport } = await import('../rounds-export');

beforeEach(() => {
  state.user = { id: 'u1' };
  state.holes = [];
  state.error = null;
  state.asked = [];
});

/** Launch readiness F-02: the holes behind an export of rounds, read with the caller's own client (row-level security decides). */
describe('readRoundHolesForExport', () => {
  it('reads the holes of the rounds asked for, grouped by round', async () => {
    state.holes = [
      { round_id: R1, hole_number: 1, par: 4, score: 5 },
      { round_id: R1, hole_number: 2, par: 3, score: 3 },
      { round_id: R2, hole_number: 1, par: 5, score: null },
    ];
    const res = await readRoundHolesForExport([R1, R2, R1]);
    expect(res).toEqual({
      success: true,
      data: {
        [R1]: [
          { n: 1, par: 4, score: 5 },
          { n: 2, par: 3, score: 3 },
        ],
        [R2]: [{ n: 1, par: 5, score: null }],
      },
    });
    // golf_holes only, each id once.
    expect(state.asked).toEqual([{ table: 'golf_holes', ids: [R1, R2] }]);
  });

  it('a round the caller may not read comes back with no holes, as the policies leave it out', async () => {
    state.holes = [{ round_id: R1, hole_number: 1, par: 4, score: 4 }];
    const res = await readRoundHolesForExport([R1, R2]);
    expect(res.success && res.data[R2]).toBeUndefined();
  });

  it('refuses what isn’t a round id, and a caller who isn’t signed in, before reading anything', async () => {
    await expect(readRoundHolesForExport(['not-an-id'])).resolves.toMatchObject({ success: false, code: 'invalid' });
    await expect(readRoundHolesForExport([])).resolves.toMatchObject({ success: false, code: 'invalid' });
    state.user = null;
    await expect(readRoundHolesForExport([R1])).resolves.toMatchObject({ success: false, code: 'unauthorized' });
    expect(state.asked).toEqual([]);
  });

  it('a failed read is a failure, never an export with holes missing', async () => {
    state.error = { message: 'timeout', code: '57014' };
    await expect(readRoundHolesForExport([R1])).resolves.toMatchObject({ success: false, code: 'failed' });
  });
});
