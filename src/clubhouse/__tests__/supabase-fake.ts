/**
 * A table-level fake of the Supabase server client for loader tests. Each
 * table answers with one `{ data, error, count }`, whatever the query chain;
 * a function answer sees the filters, for tables read more than one way.
 * An RPC answers from `rpc:<name>` (the function answer sees `[['args', [args]]]`);
 * one with no answer is "function not found" (PGRST202), as PostgREST says.
 *
 *   const tables = vi.hoisted(() => ({ current: {} as ChFakeTables }));
 *   vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
 */
export type ChFakeAnswer = { data?: unknown; error?: unknown; count?: number | null };
export type ChFakeTables = Record<string, ChFakeAnswer | ((filters: Array<[string, unknown[]]>) => ChFakeAnswer)>;

function query(table: string, tables: { current: ChFakeTables }) {
  const filters: Array<[string, unknown[]]> = [];
  const answer = () => {
    const a = tables.current[table];
    const res = typeof a === 'function' ? a(filters) : a;
    return { data: null, error: null, count: null, ...res };
  };
  const chain: object = new Proxy(
    {},
    {
      get(_, key: string) {
        if (key === 'then') return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer()).then(ok, bad);
        if (key === 'maybeSingle' || key === 'single') return () => Promise.resolve(answer());
        return (...args: unknown[]) => {
          filters.push([key, args]);
          return chain;
        };
      },
    },
  );
  return chain;
}

function rpc(name: string, args: unknown, tables: { current: ChFakeTables }) {
  const a = tables.current[`rpc:${name}`];
  if (!a) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } });
  const res = typeof a === 'function' ? a([['args', [args]]]) : a;
  return Promise.resolve({ data: null, error: null, ...res });
}

export function fakeServer(tables: { current: ChFakeTables }) {
  return { createClient: async () => ({ from: (table: string) => query(table, tables), rpc: (name: string, args: unknown) => rpc(name, args, tables) }) };
}
