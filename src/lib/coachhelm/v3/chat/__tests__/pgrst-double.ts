import { vi } from 'vitest';

type Row = Record<string, unknown>;
export type Tables = Record<string, { rows?: Row[]; error?: { code?: string; message: string } }>;
export interface Call {
  table: string;
  method: string;
  args: unknown[];
}

/**
 * A PostgREST double that actually filters: eq / neq / in / gte / lte / is / not narrow the table's rows, `order` and `limit` shape them,
 * `range` pages them, and a row cap of 1,000 applies as the real server's does. A query that forgets its scope returns other teams' rows,
 * which is the point. A dotted column (`golf_events.team_id`) filters on an embedded row, as an `!inner` embed does on the server.
 * `calls` records every builder call, so a test can assert what a read asked for.
 */
/** A column's value, reading through an embedded row for a dotted name (`golf_events.team_id`). */
const at = (r: Row, c: string): unknown => (c.includes('.') ? c.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Row)[k] : undefined), r) : r[c]);

export function pgrst(tables: Tables, opts: { maxRows?: number } = {}) {
  const calls: Call[] = [];
  const maxRows = opts.maxRows ?? 1000;
  const from = (table: string) => {
    let rows: Row[] = [...(tables[table]?.rows ?? [])];
    const ordering: Array<{ col: string; ascending: boolean }> = [];
    let cap = maxRows;
    let window: [number, number] | null = null;
    let wantCount = false;
    const log = (method: string, ...args: unknown[]) => calls.push({ table, method, args });
    const q: Record<string, unknown> = {
      select: (...a: unknown[]) => (log('select', ...a), (wantCount = (a[1] as { count?: string } | undefined)?.count === 'exact'), q),
      eq: (c: string, v: unknown) => (log('eq', c, v), (rows = rows.filter((r) => at(r, c) === v)), q),
      neq: (c: string, v: unknown) => (log('neq', c, v), (rows = rows.filter((r) => at(r, c) !== v)), q),
      in: (c: string, vs: unknown[]) => (log('in', c, vs), (rows = rows.filter((r) => vs.includes(at(r, c)))), q),
      gte: (c: string, v: unknown) => (log('gte', c, v), (rows = rows.filter((r) => (at(r, c) as never) >= (v as never))), q),
      lte: (c: string, v: unknown) => (log('lte', c, v), (rows = rows.filter((r) => (at(r, c) as never) <= (v as never))), q),
      is: (c: string, v: unknown) => (log('is', c, v), (rows = rows.filter((r) => (v === null ? at(r, c) == null : at(r, c) === v))), q),
      // `not(col, 'is', null)` keeps rows with a value, as the server does; other operators are only recorded.
      not: (c: string, op: string, v: unknown) => (log('not', c, op, v), (rows = op === 'is' ? rows.filter((r) => (v === null ? at(r, c) != null : at(r, c) !== v)) : rows), q),
      or: (...a: unknown[]) => (log('or', ...a), q),
      order: (c: string, o?: { ascending?: boolean }) => (log('order', c, o), ordering.push({ col: c, ascending: o?.ascending !== false }), q),
      limit: (n: number) => (log('limit', n), (cap = Math.min(cap, n)), q),
      range: (a: number, b: number) => (log('range', a, b), (window = [a, b]), q),
      maybeSingle: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      single: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => run().then(ok, bad),
    };
    const run = async () => {
      const t = tables[table];
      if (t?.error) return { data: null as Row[] | null, error: t.error };
      const out = [...rows];
      for (const o of [...ordering].reverse()) out.sort((a, b) => ((a[o.col] as never) < (b[o.col] as never) ? -1 : (a[o.col] as never) > (b[o.col] as never) ? 1 : 0) * (o.ascending ? 1 : -1));
      // `count: 'exact'` is the number of rows that match, before the cap, as the server counts it.
      const page = window ? out.slice(window[0], window[1] + 1) : out;
      return { data: page.slice(0, cap) as Row[] | null, error: null as { code?: string; message: string } | null, ...(wantCount ? { count: out.length } : {}) };
    };
    return q;
  };
  const sb = { from: vi.fn(from) } as never;
  return { sb, calls, of: (table: string) => calls.filter((c) => c.table === table) };
}

export const person = (id: string, name: string) => ({ id, name, first_name: name.split(' ')[0] ?? name, last_name: name.split(' ')[1] ?? null, graduation_year: null });
