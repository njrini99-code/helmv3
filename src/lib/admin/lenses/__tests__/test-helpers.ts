/**
 * Shared Supabase admin-client mock for lens read-model tests.
 *
 * Every lens module chains `.from(table).select(...).eq(...).in(...).gte(...)`
 * in different shapes per call, and several modules call `.from('admin_events')`
 * multiple times in one Promise.all with different filters expecting
 * different canned results. Pinning an exact chain per call (the pattern
 * ai-availability.test.ts uses) does not scale to that. Instead: a Proxy
 * that accepts ANY chained method call and resolves to the next queued
 * result for that table, in call order — call order is deterministic
 * because `.from(table)` executes synchronously as each Promise.all array
 * entry is constructed, before any `await` yields.
 *
 * A table with no queue left falls back to `{ data: [], error: null, count: 0 }`
 * — an honest empty result, not a thrown error (a module that queries a
 * table more times than a test anticipated should degrade to "no data",
 * not crash the test with a confusing stack).
 */
export interface MockResult {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

/** One recorded chained-method call — `{ method: 'gte', args: ['created_at', '2026-...'] }`. */
export interface RecordedCall {
  method: string;
  args: unknown[];
}

function chainable(getResult: () => MockResult, calls?: RecordedCall[]): unknown {
  const resolved: MockResult = { data: [], error: null, count: null, ...getResult() };
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: MockResult) => void) => Promise.resolve(resolved).then(resolve);
      }
      if (prop === 'catch' || prop === 'finally') return undefined;
      // Any other property access (.eq, .in, .gte, .not, .order, .limit,
      // .maybeSingle, .select, ...) returns a function that keeps the SAME
      // chain alive — the terminal `await` is what actually resolves it.
      // Recorded (method name + args) when a caller passed a `calls` sink,
      // so a test can assert on the real range/gte/order arguments a query
      // chain used, not just its final resolved data.
      return (...args: unknown[]) => {
        calls?.push({ method: String(prop), args });
        return proxy;
      };
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

/**
 * USAGE — call inside the `createAdminClient` mock factory, closing over a
 * `const perTable = {}` object declared in the test file (same pattern as
 * ai-availability.test.ts's mutable `windowResult`). `vi.mock` factories are
 * hoisted but run lazily, so the closure only needs `perTable` to be
 * initialized by the time a test actually calls the module under test —
 * true for every test here, since `const perTable = {}` executes during
 * module load, before any `it()` body runs:
 *
 *   const perTable: Record<string, Array<() => MockResult>> = {};
 *   vi.mock('@/lib/supabase/admin', () => ({
 *     createAdminClient: () => queueMockAdminClient(perTable),
 *   }));
 *   import { fetchGolfJourneyLens } from '../golf-journey';
 *
 *   beforeEach(() => { for (const k of Object.keys(perTable)) delete perTable[k]; });
 *
 * `callLog` (optional) — pass a `Record<string, RecordedCall[][]>` to also
 * capture the exact chained calls each `.from(table)` invocation made (one
 * `RecordedCall[]` per invocation, in order), so a test can assert on the
 * real `.range()`/`.gte()`/`.order()` arguments a pagination loop used —
 * not just the data it resolved to:
 *
 *   const callLog: Record<string, RecordedCall[][]> = {};
 *   createAdminClient: () => queueMockAdminClient(perTable, callLog),
 *   ...
 *   const [page1Calls, page2Calls] = callLog['golf_rounds'];
 *   expect(page1Calls).toContainEqual({ method: 'range', args: [0, 999] });
 *   expect(page2Calls).toContainEqual({ method: 'range', args: [1000, 1999] });
 */
export function queueMockAdminClient(
  perTable: Record<string, Array<() => MockResult>>,
  callLog?: Record<string, RecordedCall[][]>,
) {
  const cursors: Record<string, number> = {};
  return {
    from: (table: string) => {
      const queue = perTable[table] ?? [];
      const i = cursors[table] ?? 0;
      cursors[table] = i + 1;
      const next = queue[i];
      let calls: RecordedCall[] | undefined;
      if (callLog) {
        calls = [];
        (callLog[table] ??= []).push(calls);
      }
      return chainable(next ?? (() => ({ data: [], error: null, count: 0 })), calls);
    },
  };
}
