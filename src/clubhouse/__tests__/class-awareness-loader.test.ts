import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Class awareness (P-10): the Classes loader asks for `status_enabled` only with the flag on, and repeats the read
 * without it when the column is not there yet (the migration is held), so a page never loses its classes to a column
 * that has not arrived.
 */

vi.mock('server-only', () => ({}));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('../data/home', () => ({ homeClock: async () => ({ tz: 'America/New_York' }) }));
const reads = vi.hoisted(() => ({ columns: [] as string[], missingColumn: false }));
const ROW = { id: 'c1', class_name: 'STAT 201 - Probability', instructor: null, days: ['T'], start_time: '09:00:00', end_time: '10:15:00', building: null, room: null, credits: 3, color: '#fff', notes: null, semester: 'Fall 2026', created_at: '2026-08-21T14:00:00Z' };
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const state = { columns: '' };
      const chain: object = new Proxy(
        {},
        {
          get(_, key: string) {
            if (key === 'then') {
              return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
                if (table === 'golf_player_classes') {
                  if (reads.missingColumn && state.columns.includes('status_enabled')) return Promise.resolve({ data: null, error: { code: '42703', message: 'column does not exist' } }).then(ok, bad);
                  return Promise.resolve({ data: [{ ...ROW, ...(state.columns.includes('status_enabled') ? { status_enabled: false } : {}) }], error: null }).then(ok, bad);
                }
                return Promise.resolve({ data: [], error: null }).then(ok, bad);
              };
            }
            return (...args: unknown[]) => {
              if (key === 'select' && table === 'golf_player_classes') {
                state.columns = String(args[0]);
                reads.columns.push(state.columns);
              }
              return chain;
            };
          },
        },
      );
      return chain;
    },
  }),
}));

import { loadClasses } from '../data/classes';

beforeEach(() => {
  reads.columns = [];
  reads.missingColumn = false;
});

describe('loadClasses and class awareness', () => {
  it('with the flag off the read never mentions the new column', async () => {
    const page = await loadClasses({ playerId: 'p1', teamId: 't1' });
    expect(reads.columns).toHaveLength(1);
    expect(reads.columns[0]).not.toMatch(/status_enabled/);
    expect(page.classes.list[0]!.statusEnabled).toBeUndefined();
  });

  it('with the flag on the read carries the column, and a class switched off says so', async () => {
    const page = await loadClasses({ playerId: 'p1', teamId: 't1', classAwareness: true });
    expect(reads.columns).toHaveLength(1);
    expect(reads.columns[0]).toMatch(/, status_enabled$/);
    expect(page.classes.list[0]!.statusEnabled).toBe(false);
    expect(page.classes.error).toBe(false);
  });

  it('with the flag on and the column missing it reads again without it, and loses nothing', async () => {
    reads.missingColumn = true;
    const page = await loadClasses({ playerId: 'p1', teamId: 't1', classAwareness: true });
    expect(reads.columns).toHaveLength(2);
    expect(reads.columns[1]).not.toMatch(/status_enabled/);
    expect(page.classes.error).toBe(false);
    expect(page.classes.list).toHaveLength(1);
  });
});
