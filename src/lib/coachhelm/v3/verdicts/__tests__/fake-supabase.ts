/**
 * A small chainable stand-in for the Supabase client used by the verdict
 * tests. Every query method records itself and returns the builder; awaiting
 * the builder asks `respond(table, call)` for `{ data, error }`.
 */
export interface FakeCall {
  table: string;
  op: 'select' | 'update' | 'insert';
  steps: Array<[string, unknown[]]>;
  payload?: unknown;
}

export type FakeResponse = { data: unknown; error: { code?: string; message: string } | null };

const METHODS = ['select', 'eq', 'is', 'not', 'in', 'ilike', 'gte', 'order', 'range', 'limit', 'maybeSingle', 'single'] as const;

export function fakeSupabase(respond: (call: FakeCall) => FakeResponse) {
  const calls: FakeCall[] = [];
  const from = (table: string) => {
    const call: FakeCall = { table, op: 'select', steps: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const m of METHODS) {
      builder[m] = (...args: unknown[]) => {
        call.steps.push([m, args]);
        return builder;
      };
    }
    // postgrest-js's overrideTypes() is a type-only cast that returns the
    // builder unchanged at runtime; it adds nothing to the query.
    builder.overrideTypes = () => builder;
    builder.update = (payload: unknown) => {
      call.op = 'update';
      call.payload = payload;
      return builder;
    };
    builder.insert = (payload: unknown) => {
      call.op = 'insert';
      call.payload = payload;
      return builder;
    };
    builder.then = (resolve: (v: FakeResponse) => unknown, reject: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(respond(call)).then(resolve, reject);
      } catch (err) {
        return Promise.reject(err).then(resolve, reject);
      }
    };
    return builder;
  };
  return { client: { from } as never, calls };
}
