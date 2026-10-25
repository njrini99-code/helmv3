import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Class awareness (P-10): the player's writes, the Classes writes' new column, and the Classes loader's fallback. These
 * are the calls the migrations make real, shaped as the policies expect: a player inserts only their own rows, a coach
 * is never asked for, and with the flag off no call mentions a new column.
 */

vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-sync', () => ({ syncClassToCalendar: vi.fn(), removeClassFromCalendar: vi.fn() }));
type Call = { table: string; calls: Array<[string, unknown[]]> };
const client = vi.hoisted(() => ({ log: [] as Call[], answer: (_c: Call): { data: unknown; error: unknown } => ({ data: null, error: null }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const rec: Call = { table, calls: [] };
      client.log.push(rec);
      const chain: object = new Proxy(
        {},
        {
          get(_, key: string) {
            if (key === 'then') return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(client.answer(rec)).then(ok, bad);
            if (key === 'single' || key === 'maybeSingle') return (...args: unknown[]) => (rec.calls.push([key, args]), Promise.resolve(client.answer(rec)));
            return (...args: unknown[]) => {
              rec.calls.push([key, args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  }),
}));

import { createLiveClassStatusWrites } from '../screens/classes/class-status-writes';
import { createLiveClassesWrites } from '../screens/classes/writes';

const last = () => client.log[client.log.length - 1]!;
const call = (rec: Call, name: string) => rec.calls.find(([k]) => k === name)?.[1];

beforeEach(() => {
  client.log = [];
  client.answer = () => ({ data: null, error: null });
});

describe('the player’s class status writes', () => {
  const w = () => createLiveClassStatusWrites({ playerId: 'p1', teamId: 't1' });

  it('the sharing switch upserts the player’s own settings row', async () => {
    expect(await w().setShare(false)).toEqual({ success: true });
    expect(last().table).toBe('golf_player_class_settings');
    const [row, opts] = call(last(), 'upsert') as [Record<string, unknown>, { onConflict: string }];
    expect(row).toMatchObject({ player_id: 'p1', share_status: false });
    expect(opts).toEqual({ onConflict: 'player_id' });
  });

  it('No class today inserts an off row for today for the player’s team, for one class or all', async () => {
    client.answer = () => ({ data: [{ id: 'x1' }], error: null });
    expect(await w().markNoClass({ on: '2026-10-14', classId: null })).toEqual({ success: true, data: { ids: ['x1'] } });
    expect(call(last(), 'insert')![0]).toEqual({ team_id: 't1', player_id: 'p1', class_id: null, kind: 'off', starts_on: '2026-10-14', ends_on: '2026-10-14' });
    await w().markNoClass({ on: '2026-10-14', classId: 'c9' });
    expect(call(last(), 'insert')![0]).toMatchObject({ class_id: 'c9', kind: 'off' });
  });

  it('a write that returns no row is not "saved"', async () => {
    client.answer = () => ({ data: [], error: null });
    expect(await w().markNoClass({ on: '2026-10-14', classId: null })).toMatchObject({ success: false });
  });

  it('a refused write is a failure with the database’s words', async () => {
    client.answer = () => ({ data: null, error: { code: '42501', message: 'permission denied' } });
    expect(await w().setShare(true)).toEqual({ success: false, error: 'permission denied' });
    expect(await w().undoNoClass(['a'])).toMatchObject({ success: false });
  });

  it('Undo deletes only those rows, and only the player’s own', async () => {
    await w().undoNoClass(['a', 'b']);
    expect(last().table).toBe('golf_class_exceptions');
    expect(call(last(), 'in')).toEqual(['id', ['a', 'b']]);
    expect(call(last(), 'eq')).toEqual(['player_id', 'p1']);
    client.log = [];
    expect(await w().undoNoClass([])).toEqual({ success: true });
    expect(client.log).toHaveLength(0);
  });

  it('a class’s status switch updates that class, for this player', async () => {
    await w().setClassStatusEnabled('c1', false);
    expect(last().table).toBe('golf_player_classes');
    expect(call(last(), 'update')![0]).toEqual({ status_enabled: false });
    expect(last().calls.filter(([k]) => k === 'eq').map(([, a]) => a)).toEqual([['id', 'c1'], ['player_id', 'p1']]);
  });

  it('tagging touches only classes with no term at all', async () => {
    await w().tagUntagged('Fall 2026');
    expect(call(last(), 'update')![0]).toEqual({ semester: 'Fall 2026' });
    expect(call(last(), 'is')).toEqual(['semester', null]);
    expect(last().calls.filter(([k]) => k === 'eq').map(([, a]) => a)).toEqual([['player_id', 'p1'], ['team_id', 't1']]);
  });

  it('an exam is an extra row with no class, one day, and its times and label', async () => {
    client.answer = () => ({ data: [{ id: 'e1' }], error: null });
    expect(await w().addExam({ on: '2026-12-14', start: '09:00', end: '11:00', label: 'STAT 201 exam' })).toEqual({ success: true, data: { id: 'e1' } });
    expect(call(last(), 'insert')![0]).toEqual({
      team_id: 't1',
      player_id: 'p1',
      class_id: null,
      kind: 'extra',
      starts_on: '2026-12-14',
      ends_on: '2026-12-14',
      start_time: '09:00',
      end_time: '11:00',
      label: 'STAT 201 exam',
    });
  });

  it('reads the exams ahead, drops rows it cannot read, and answers empty on an error', async () => {
    client.answer = () => ({
      data: [
        { id: 'e1', starts_on: '2026-12-14', start_time: '09:00:00', end_time: '11:00:00', label: 'STAT 201 exam' },
        { id: 'e2', starts_on: null, start_time: '09:00:00', end_time: '11:00:00', label: 'x' },
      ],
      error: null,
    });
    expect(await w().loadExams('2026-10-14')).toEqual([{ id: 'e1', on: '2026-12-14', start: '09:00', end: '11:00', label: 'STAT 201 exam' }]);
    expect(call(last(), 'gte')).toEqual(['starts_on', '2026-10-14']);
    expect(call(last(), 'eq')).toEqual(['player_id', 'p1']);
    client.answer = () => ({ data: null, error: { code: '42P01', message: 'no table' } });
    expect(await w().loadExams('2026-10-14')).toEqual([]);
  });

  it('removing an exam deletes that row for this player', async () => {
    await w().removeExam('e1');
    expect(call(last(), 'in')).toEqual(['id', ['e1']]);
    expect(call(last(), 'eq')).toEqual(['player_id', 'p1']);
  });
});

describe('Classes writes with class awareness', () => {
  const input = (over: Record<string, unknown> = {}) => ({ code: 'ONLN 100', name: 'Online seminar', instructor: '', days: [] as string[], start: '', end: '', building: '', room: '', credits: null, semester: 'Fall 2026', notes: '', ...over });
  const row = { id: 'n1', class_name: 'ONLN 100 - Online seminar', instructor: null, days: [], start_time: null, end_time: null, building: null, room: null, credits: null, color: '#fff', notes: null, semester: 'Fall 2026', created_at: null };

  it('a new flexible class starts off for class status, and rows come back with the column', async () => {
    client.answer = () => ({ data: row, error: null });
    const writes = createLiveClassesWrites({ playerId: 'p1', teamId: 't1', term: 'Fall 2026', classAwareness: true });
    await writes.save(input(), null, 'n1');
    const insert = call(last(), 'insert')![0] as Record<string, unknown>;
    expect(insert.status_enabled).toBe(false);
    expect(call(last(), 'select')![0]).toMatch(/status_enabled/);
  });

  it('a class with days and times is left on', async () => {
    client.answer = () => ({ data: row, error: null });
    const writes = createLiveClassesWrites({ playerId: 'p1', teamId: 't1', term: 'Fall 2026', classAwareness: true });
    await writes.save(input({ days: ['M', 'W'], start: '09:00', end: '10:00' }), null, 'n1');
    expect(call(last(), 'insert')![0]).not.toHaveProperty('status_enabled');
  });

  it('with class awareness off no call mentions the new column', async () => {
    client.answer = () => ({ data: row, error: null });
    const writes = createLiveClassesWrites({ playerId: 'p1', teamId: 't1', term: 'Fall 2026' });
    await writes.save(input(), null, 'n1');
    expect(call(last(), 'insert')![0]).not.toHaveProperty('status_enabled');
    expect(call(last(), 'select')![0]).not.toMatch(/status_enabled/);
  });
});
