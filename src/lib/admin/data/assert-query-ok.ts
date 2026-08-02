import 'server-only';

/**
 * Throw on a Supabase result error instead of rendering fabricated zeros.
 *
 * Every admin data fetcher is wrapped in PanelBoundary, which renders
 * PanelStale on a throw — so an honest error state is strictly better than a
 * confident "0 teams / $0 spend" built from `data ?? []`. Mirrors the checks
 * already written by hand in src/lib/admin/data/baseball.ts:131-139.
 *
 * Narrow result type on purpose: it accepts both `{ data, error }` and
 * `{ count, error }` PostgREST shapes without importing supabase-js.
 */
export function assertQueryOk(
  result: { error: { message: string } | null },
  label: string,
): void {
  if (result.error) {
    throw new Error(`${label} query failed: ${result.error.message}`);
  }
}
