import { describe, expect, it } from 'vitest';
import { readPlayerPrivateFields } from '../player-private-fields';

type Res = { data: unknown; error: { code?: string; message: string } | null };

function client(rpc: Res, table: Res = { data: [], error: null }) {
  const calls: string[] = [];
  const sb = {
    rpc: async (name: string, args: unknown) => {
      calls.push(`rpc ${name} ${JSON.stringify(args)}`);
      return rpc;
    },
    from: (t: string) => ({
      select: (cols: string) => ({
        in: async (_c: string, ids: string[]) => {
          calls.push(`from ${t} ${cols} ${ids.join(',')}`);
          return table;
        },
      }),
    }),
  };
  return { sb: sb as never, calls };
}

describe('readPlayerPrivateFields', () => {
  it('reads through golf_player_private_fields, once, for the distinct ids', async () => {
    const { sb, calls } = client({ data: [{ id: 'p1', email: 'a@x.test', phone: '1', gpa: '3.40' }], error: null });
    const res = await readPlayerPrivateFields(sb, ['p1', 'p1', 'p2', '']);
    expect(calls).toEqual(['rpc golf_player_private_fields {"p_player_ids":["p1","p2"]}']);
    expect(res.error).toBeNull();
    expect(res.data.get('p1')).toEqual({ email: 'a@x.test', phone: '1', gpa: 3.4 });
    expect(res.data.has('p2')).toBe(false);
  });

  it('before the migration (no function) it reads the two columns from the table', async () => {
    const { sb, calls } = client({ data: null, error: { code: 'PGRST202', message: 'not found' } }, { data: [{ id: 'p1', email: null, phone: '2', gpa: null }], error: null });
    const res = await readPlayerPrivateFields(sb, ['p1']);
    expect(calls[1]).toBe('from golf_players id, email, phone, gpa p1');
    expect(res.data.get('p1')).toEqual({ email: null, phone: '2', gpa: null });
    expect(res.error).toBeNull();
  });

  it('any other failure is returned, with no table read and nothing guessed', async () => {
    const { sb, calls } = client({ data: null, error: { code: '42501', message: 'permission denied' } });
    const res = await readPlayerPrivateFields(sb, ['p1']);
    expect(calls).toHaveLength(1);
    expect(res.error).toMatchObject({ code: '42501' });
    expect(res.data.size).toBe(0);
  });

  it('no ids, no read', async () => {
    const { sb, calls } = client({ data: [], error: null });
    const res = await readPlayerPrivateFields(sb, []);
    expect(calls).toEqual([]);
    expect(res.data.size).toBe(0);
  });
});
