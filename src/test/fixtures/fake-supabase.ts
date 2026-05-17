// Shared Supabase mock for vitest. Replaces ad-hoc per-test mocks that
// repeatedly broke on missing chain methods (e.g. .rpc, .order.limit.single).
//
// Supports:
//   - from(table).select(cols).eq/neq/in/gte/lte/is(...).order(...).limit(n).range(a,b)
//   - .single() / .maybeSingle() / awaiting the builder for a list result
//   - from(table).insert(payload) / .update / .delete / .upsert(payload, {onConflict})
//     all return a thenable that resolves to { data, error, count } and supports
//     a fluent .select() chain after the write.
//   - rpc(name, args) — handler registry
//   - auth.getUser() / auth.getSession()
//
// Usage:
//   vi.mock('@/lib/supabase/server', () => ({
//     createClient: async () => createFakeSupabase({
//       user: { id: 'u1' },
//       tables: { golf_players: [{ id: 'p1', user_id: 'u1' }] },
//       rpc: { my_fn: async (args) => ({ data: [], error: null }) },
//     }),
//   }));

type Row = Record<string, unknown>;

interface FakeOptions {
  tables?: Record<string, Row[]>;
  rpc?: Record<string, (args: unknown) => Promise<{ data: unknown; error: unknown }>>;
  user?: { id: string; email?: string } | null;
}

interface QueryState {
  table: string;
  filters: Array<(row: Row) => boolean>;
  selectCols: '*' | string[];
  orderBy?: { column: string; ascending: boolean };
  limit?: number;
  rangeFrom?: number;
  rangeTo?: number;
}

function applyState(rows: Row[], state: QueryState): Row[] {
  let result = rows.filter((row) => state.filters.every((f) => f(row)));
  if (state.orderBy) {
    const { column, ascending } = state.orderBy;
    result = [...result].sort((a, b) => {
      const av = a[column];
      const bv = b[column];
      if (av === bv) return 0;
      if (av === null || av === undefined) return ascending ? -1 : 1;
      if (bv === null || bv === undefined) return ascending ? 1 : -1;
      return ascending ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
    });
  }
  if (state.rangeFrom !== undefined && state.rangeTo !== undefined) {
    result = result.slice(state.rangeFrom, state.rangeTo + 1);
  }
  if (state.limit !== undefined) {
    result = result.slice(0, state.limit);
  }
  return result;
}

class QueryBuilder<T = Row> implements PromiseLike<{ data: T[]; error: unknown }> {
  constructor(
    private readonly tables: Record<string, Row[]>,
    private state: QueryState,
  ) {}

  select(cols: string = '*'): this {
    this.state.selectCols =
      cols === '*' ? '*' : cols.split(',').map((c) => c.trim());
    return this;
  }
  eq(col: string, value: unknown): this {
    this.state.filters.push((row) => row[col] === value);
    return this;
  }
  neq(col: string, value: unknown): this {
    this.state.filters.push((row) => row[col] !== value);
    return this;
  }
  in(col: string, values: unknown[]): this {
    this.state.filters.push((row) => values.includes(row[col]));
    return this;
  }
  gt(col: string, value: unknown): this {
    this.state.filters.push((row) => (row[col] as never) > (value as never));
    return this;
  }
  lt(col: string, value: unknown): this {
    this.state.filters.push((row) => (row[col] as never) < (value as never));
    return this;
  }
  gte(col: string, value: unknown): this {
    this.state.filters.push((row) => (row[col] as never) >= (value as never));
    return this;
  }
  lte(col: string, value: unknown): this {
    this.state.filters.push((row) => (row[col] as never) <= (value as never));
    return this;
  }
  is(col: string, value: unknown): this {
    this.state.filters.push((row) => row[col] === value);
    return this;
  }
  not(col: string, _op: string, value: unknown): this {
    this.state.filters.push((row) => row[col] !== value);
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }): this {
    this.state.orderBy = { column, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number): this {
    this.state.limit = n;
    return this;
  }
  range(from: number, to: number): this {
    this.state.rangeFrom = from;
    this.state.rangeTo = to;
    return this;
  }
  async single(): Promise<{ data: T | null; error: unknown }> {
    const rows = applyState(this.tables[this.state.table] ?? [], this.state);
    if (rows.length === 0) {
      return { data: null, error: { code: 'PGRST116', message: 'No rows' } };
    }
    if (rows.length > 1) {
      return { data: null, error: { code: 'PGRST117', message: 'Multiple rows' } };
    }
    return { data: rows[0] as T, error: null };
  }
  async maybeSingle(): Promise<{ data: T | null; error: unknown }> {
    const rows = applyState(this.tables[this.state.table] ?? [], this.state);
    return { data: (rows[0] as T) ?? null, error: null };
  }
  then<R1 = { data: T[]; error: unknown }, R2 = never>(
    onfulfilled?: ((v: { data: T[]; error: unknown }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const rows = applyState(this.tables[this.state.table] ?? [], this.state);
    return Promise.resolve({ data: rows as T[], error: null }).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    );
  }
}

class WriteBuilder implements PromiseLike<{ data: Row[] | null; error: unknown; count?: number }> {
  private filters: Array<(row: Row) => boolean> = [];

  constructor(
    private readonly tables: Record<string, Row[]>,
    private readonly table: string,
    private readonly op: 'insert' | 'update' | 'upsert' | 'delete',
    private readonly payload: unknown,
    private readonly opts?: { onConflict?: string },
  ) {}

  eq(col: string, value: unknown): this {
    this.filters.push((row) => row[col] === value);
    return this;
  }
  in(col: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[col]));
    return this;
  }
  is(col: string, value: unknown): this {
    this.filters.push((row) => row[col] === value);
    return this;
  }
  select(_cols: string = '*'): this {
    return this;
  }
  async single(): Promise<{ data: Row | null; error: unknown }> {
    const { data, error } = await this.run();
    if (error) return { data: null, error };
    const list = data ?? [];
    return { data: list[0] ?? null, error: null };
  }

  private async run(): Promise<{ data: Row[] | null; error: unknown; count: number }> {
    const list = (this.tables[this.table] ??= []);
    const result: Row[] = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      const incoming = Array.isArray(this.payload) ? (this.payload as Row[]) : [this.payload as Row];
      for (const row of incoming) {
        if (this.op === 'upsert' && this.opts?.onConflict) {
          const conflictCols = this.opts.onConflict.split(',').map((s) => s.trim());
          const existingIdx = list.findIndex((r) => conflictCols.every((c) => r[c] === row[c]));
          if (existingIdx >= 0) {
            list[existingIdx] = { ...list[existingIdx], ...row };
            result.push(list[existingIdx]);
            continue;
          }
        }
        list.push(row);
        result.push(row);
      }
    } else if (this.op === 'update') {
      for (const row of list) {
        if (this.filters.every((f) => f(row))) {
          Object.assign(row, this.payload as Row);
          result.push(row);
        }
      }
    } else if (this.op === 'delete') {
      for (let i = list.length - 1; i >= 0; i--) {
        if (this.filters.every((f) => f(list[i]))) {
          result.push(list[i]);
          list.splice(i, 1);
        }
      }
    }
    return { data: result, error: null, count: result.length };
  }

  then<R1 = { data: Row[] | null; error: unknown; count?: number }, R2 = never>(
    onfulfilled?: ((v: { data: Row[] | null; error: unknown; count?: number }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

export function createFakeSupabase(opts: FakeOptions = {}) {
  const tables = opts.tables ?? {};
  const rpcHandlers = opts.rpc ?? {};
  const user = opts.user ?? null;
  return {
    from(table: string) {
      return {
        select: (cols?: string) =>
          new QueryBuilder(tables, {
            table,
            filters: [],
            selectCols: cols && cols !== '*' ? cols.split(',').map((c) => c.trim()) : '*',
          }),
        insert: (payload: unknown) => new WriteBuilder(tables, table, 'insert', payload),
        update: (payload: unknown) => new WriteBuilder(tables, table, 'update', payload),
        upsert: (payload: unknown, options?: { onConflict?: string }) =>
          new WriteBuilder(tables, table, 'upsert', payload, options),
        delete: () => new WriteBuilder(tables, table, 'delete', null),
      };
    },
    rpc(name: string, args: unknown) {
      const handler = rpcHandlers[name];
      if (!handler) {
        return Promise.resolve({
          data: null,
          error: { message: `rpc ${name} not registered in fake-supabase` },
        });
      }
      return handler(args);
    },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({
        data: { session: user ? { user, access_token: 'fake-token' } : null },
        error: null,
      }),
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
