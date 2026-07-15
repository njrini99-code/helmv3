// =============================================================================
// src/test/fixtures/fake-supabase-fail-select.ts
//
// A small, NEW test helper (created rather than editing the shared
// `createFakeSupabase` fixture) that makes every SELECT against one table on
// a `createFakeSupabase()` client fail with a given error message. Mirrors the
// monkey-patched-`fake.from` idiom already used ad hoc in
// src/app/golf/actions/__tests__/recurring-events.test.ts (`makeFailingBuilder`
// / `failUpdates`), generalized for read-model "honest error vs honest empty"
// contract tests (#377) that need to prove a sub-read failure is
// distinguishable from a genuinely empty table — never conflated into a
// silent, healthy-looking empty result.
//
// Usage:
//   const fake = createFakeSupabase({ user: { id: 'u1' }, tables: { ... } });
//   failSelect(fake, 'baseball_actions', 'boom');
//   // any `supabase.from('baseball_actions').select(...)...` now resolves to
//   // { data: null, error: { message: 'boom' } } no matter the chain called
//   // on it (eq/in/order/limit/single/maybeSingle/await-as-list all work).
// =============================================================================

import type { FakeSupabase } from './fake-supabase';

/**
 * Replace `client.from(table)` with a builder whose every chain method is a
 * no-op passthrough and whose terminal forms (`single`, `maybeSingle`,
 * awaiting the builder directly) all resolve to `{ data: null, error: {
 * message } }`. Other tables are unaffected (delegates to the original
 * `client.from`).
 */
export function failSelect(client: FakeSupabase, table: string, message: string): void {
  const origFrom = client.from.bind(client);
  const failingResult = { data: null, error: { message } };
  client.from = ((t: string) => {
    if (t !== table) return origFrom(t);
    const failingBuilder: Record<string, unknown> = {};
    const chainableMethods = [
      'select',
      'eq',
      'neq',
      'in',
      'not',
      'is',
      'gt',
      'lt',
      'gte',
      'lte',
      'or',
      'order',
      'limit',
      'range',
    ];
    for (const m of chainableMethods) failingBuilder[m] = () => failingBuilder;
    failingBuilder.single = async () => failingResult;
    failingBuilder.maybeSingle = async () => failingResult;
    failingBuilder.then = (
      onfulfilled?: (v: unknown) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(failingResult).then(onfulfilled, onrejected);
    return failingBuilder;
  }) as typeof client.from;
}
