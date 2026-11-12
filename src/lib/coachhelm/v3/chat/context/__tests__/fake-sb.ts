import { vi } from 'vitest';

type Row = Record<string, unknown>;
export interface FakeTable {
  rows?: Row[];
  /** Every call on this table answers this error (a missing table is `{ code: '42P01' }`). */
  error?: { code?: string; message: string };
}
export interface Write {
  table: string;
  op: 'insert' | 'update' | 'delete' | 'upsert';
  values?: unknown;
  filters: Array<[string, unknown]>;
}

/**
 * A PostgREST double that filters and records writes. Reads narrow the table's rows by `eq` / `in` / `gte` / `lte` /
 * `is` / `match`, so a query that forgets its scope returns another team's rows, which is the point of the tests that
 * use it. `writes` is every insert, update, delete and upsert in order: "plan writes nothing" is `writes` staying empty.
 * An insert adds the row (with an id) and a delete removes the matching rows, so a read back sees what a write did.
 */
export function fakeSb(tables: Record<string, FakeTable>, opts: { userId?: string } = {}) {
  const writes: Write[] = [];
  const reads: string[] = [];
  let seq = 0;
  const from = (table: string) => {
    const t = (tables[table] ??= { rows: [] });
    let op: Write['op'] | 'select' = 'select';
    let values: unknown;
    const filters: Array<[string, unknown]> = [];
    const preds: Array<(r: Row) => boolean> = [];
    let cap = 1000;
    const where = (col: string, v: unknown, test: (r: Row) => boolean) => (filters.push([col, v]), preds.push(test), q);
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (v: unknown) => ((op = 'insert'), (values = v), q),
      upsert: (v: unknown) => ((op = 'upsert'), (values = v), q),
      update: (v: unknown) => ((op = 'update'), (values = v), q),
      delete: () => ((op = 'delete'), q),
      eq: (c: string, v: unknown) => where(c, v, (r) => r[c] === v),
      neq: (c: string, v: unknown) => where(c, v, (r) => r[c] !== v),
      in: (c: string, vs: unknown[]) => where(c, vs, (r) => vs.includes(r[c])),
      gte: (c: string, v: unknown) => where(c, v, (r) => (r[c] as never) >= (v as never)),
      lte: (c: string, v: unknown) => where(c, v, (r) => (r[c] as never) <= (v as never)),
      is: (c: string, v: unknown) => where(c, v, (r) => (v === null ? r[c] == null : r[c] === v)),
      ilike: (c: string, v: string) => where(c, v, (r) => String(r[c] ?? '').toLowerCase() === v.toLowerCase()),
      match: (m: Row) => (Object.entries(m).forEach(([c, v]) => where(c, v, (r) => r[c] === v)), q),
      order: () => q,
      limit: (n: number) => ((cap = n), q),
      maybeSingle: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      single: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => run().then(ok, bad),
    };
    const run = async (): Promise<{ data: Row[] | null; error: FakeTable['error'] | null }> => {
      if (op !== 'select') writes.push({ table, op, values, filters: [...filters] });
      else reads.push(table);
      if (t.error) return { data: null, error: t.error };
      const all = (t.rows ??= []);
      if (op === 'insert' || op === 'upsert') {
        const added = (Array.isArray(values) ? values : [values]).map((v) => ({ id: `new-${++seq}`, created_at: new Date().toISOString(), ...(v as Row) }));
        all.push(...added);
        return { data: added, error: null };
      }
      const hit = all.filter((r) => preds.every((p) => p(r)));
      if (op === 'delete') {
        t.rows = all.filter((r) => !hit.includes(r));
        return { data: hit, error: null };
      }
      if (op === 'update') {
        hit.forEach((r) => Object.assign(r, values as Row));
        return { data: hit, error: null };
      }
      return { data: hit.slice(0, cap), error: null };
    };
    return q;
  };
  const sb = { from: vi.fn(from), auth: { getUser: async () => ({ data: { user: opts.userId ? { id: opts.userId } : null } }) } } as never;
  return { sb, writes, reads, tables };
}

export const TEAM = '11111111-1111-4111-8111-111111111111';
export const OTHER_TEAM = '22222222-2222-4222-8222-222222222222';
export const AVERY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const BLAKE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const COACH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const COACH_USER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const person = (id: string, name: string) => ({ id, name, first_name: name.split(' ')[0] ?? name, last_name: name.split(' ')[1] ?? null, graduation_year: null });

export const coachWho = () => ({ coach_id: COACH_ID, user_id: COACH_USER, team_id: TEAM, team_name: 'Lakeside', timezone: 'America/New_York', roster: [person(AVERY, 'Avery Lane'), person(BLAKE, 'Blake Ortiz')] });
/** A player's context as `resolvePlayerChatContext` builds it: the roster is the player alone. */
export const playerWho = () => ({ coach_id: '', user_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', team_id: TEAM, team_name: 'Lakeside', timezone: 'America/New_York', roster: [person(AVERY, 'Avery Lane')], player_id: AVERY });

export const toolCtx = (sb: unknown, who: unknown, surface = 'ask') => ({ sb, who, conversationId: 'conv-1', surface, loaders: {}, signal: new AbortController().signal, reads: new Map() }) as never;
