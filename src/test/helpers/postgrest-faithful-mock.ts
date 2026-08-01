/**
 * A Supabase test double that enforces the constraints PRODUCTION enforces.
 *
 * WHY THIS EXISTS. On 2026-07-31 three real defects shipped through 8,657
 * passing tests, 16 CI gates, CodeQL and 11 linters. Two of them were the same
 * shape: code that PostgREST rejects, against a mock that happily accepted it.
 *
 *   - `.in('id', ids)` with a full page of uuids. Production answers
 *     `400 Bad Request` because the filter rides in the query string and the
 *     URI overflows. Every hand-rolled mock accepted the array without
 *     looking at its length, so the test suite was green while the nightly
 *     cron had never once succeeded.
 *
 *   - `.limit(2000)`. PostgREST silently truncates to 1,000; the code then
 *     treated a full page as a "short page" and stopped draining. The mock
 *     honoured the requested 2,000, so the bug was invisible in tests and
 *     capped the job at one batch in production.
 *
 * 91 test files mock `createAdminClient`, each rolling its own double. None of
 * them modelled either limit. A mock that is more permissive than production
 * does not just fail to catch bugs — it actively certifies them.
 *
 * The two ceilings below were MEASURED against this project's own Supabase
 * endpoint, not guessed. See docs in `.claude/rules/database.md`.
 */

/** PostgREST truncates every request to this many rows. `.limit(n)` above it
 *  is silently ignored — it does not raise the cap. */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Largest `.in()` list that survives the request-URI limit.
 *
 * Measured 2026-07-31 with uuid values: 584 ids (~22.8 KB URL) is the last
 * size that reaches PostgREST; 585 comes back `400` with the literal body
 * `Bad Request`; ~1,700+ becomes a `414` with an empty body. Chunk at 200.
 */
export const POSTGREST_MAX_IN_VALUES = 584;

export interface PostgrestError {
  message: string;
  code?: string | null;
  /** Not part of the real payload — a breadcrumb so a failing test says WHY. */
  detail?: string;
}

export interface QueryResult {
  data: Array<Record<string, unknown>> | null;
  error: PostgrestError | null;
  count: number | null;
}

/** The subset of the PostgREST builder this double implements. It is a
 *  PromiseLike<QueryResult>, so `await`ing any point in the chain resolves to a
 *  typed result rather than `unknown`. */
export interface FaithfulChain extends PromiseLike<QueryResult> {
  select: () => FaithfulChain;
  eq: () => FaithfulChain;
  neq: () => FaithfulChain;
  not: () => FaithfulChain;
  is: () => FaithfulChain;
  lt: () => FaithfulChain;
  gte: () => FaithfulChain;
  order: () => FaithfulChain;
  limit: (n: number) => Promise<QueryResult>;
  range: (from: number, to: number) => Promise<QueryResult>;
  in: (col: string, values: string[]) => FaithfulChain;
}

export interface RecordedCall {
  table: string;
  op: 'select' | 'update' | 'delete';
  /** Values passed to `.in()`, if any — so tests can assert chunk sizes. */
  inValues?: string[];
  patch?: Record<string, unknown>;
}

export interface FaithfulMockOptions {
  /** Rows the mocked table holds, keyed by table name. */
  rows?: Record<string, Array<Record<string, unknown>>>;
  /** Override the id-list ceiling, e.g. to prove a regression test fails. */
  maxInValues?: number;
}

/**
 * The error PostgREST's edge actually returns for an over-long URI. Note the
 * message is the literal string `Bad Request` — NOT a descriptive PostgREST
 * error — which is why this failure reads like a query bug in logs.
 */
function uriTooLongError(count: number, limit: number): PostgrestError {
  return {
    message: 'Bad Request',
    code: null,
    detail: `in() list of ${count} exceeds the ~${limit}-value URI ceiling`,
  };
}

/**
 * Build a `createAdminClient`-shaped double that fails the way production
 * fails. Returns the client plus the recorded calls for assertions.
 */
export function createFaithfulAdminClient(opts: FaithfulMockOptions = {}) {
  const rows = opts.rows ?? {};
  const maxIn = opts.maxInValues ?? POSTGREST_MAX_IN_VALUES;
  const calls: RecordedCall[] = [];

  function makeChain(
    table: string,
    op: RecordedCall['op'],
    patch?: Record<string, unknown>,
  ): FaithfulChain {
    let inValues: string[] | undefined;
    let limitN = POSTGREST_MAX_ROWS;
    let overflowed = false;

    const settle = (): Promise<QueryResult> => {
      calls.push({ table, op, inValues, patch });
      if (overflowed) {
        return Promise.resolve({
          data: null,
          error: uriTooLongError(inValues?.length ?? 0, maxIn),
          count: null,
        });
      }
      const all = rows[table] ?? [];
      const matched = inValues
        ? all.filter((r) => inValues!.includes(String((r as { id?: unknown }).id)))
        : all;
      // The cap applies to EVERY request, regardless of what .limit() asked for.
      const served = matched.slice(0, Math.min(limitN, POSTGREST_MAX_ROWS));
      return Promise.resolve({ data: served, error: null, count: served.length });
    };

    const chain: FaithfulChain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      not: () => chain,
      is: () => chain,
      lt: () => chain,
      gte: () => chain,
      order: () => chain,
      limit: (n: number) => {
        limitN = n;
        return settle();
      },
      range: (from: number, to: number) => {
        limitN = to - from + 1;
        return settle();
      },
      in: (_col: string, values: string[]) => {
        inValues = values;
        if (values.length > maxIn) overflowed = true;
        return chain;
      },
      then: <TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => settle().then(onfulfilled, onrejected),
    };
    return chain;
  }

  const client = {
    from: (table: string) => ({
      select: (..._a: unknown[]) => makeChain(table, 'select').select(),
      update: (patch: Record<string, unknown>) => makeChain(table, 'update', patch),
      delete: () => makeChain(table, 'delete'),
    }),
  };

  return { client, calls };
}
