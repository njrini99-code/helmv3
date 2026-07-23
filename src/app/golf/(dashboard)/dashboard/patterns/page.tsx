import { permanentRedirect } from 'next/navigation';

/**
 * `/golf/dashboard/patterns` — LEGACY, permanently redirected (2026-07-19,
 * plan Task 9). Patterns is now the `patterns` filter of the consolidated
 * Signals drill on the coach Intelligence home (spec §5.4) — the stage IS
 * the nav. `surface-registry.ts`'s `patterns` entry is
 * `legacy: true, hidden: true` and points its canonical href here-onward.
 *
 * Forwards every incoming query param (old bookmarks, deep-links) onto the
 * target URL — same pattern as `development/page.tsx`'s `?player=`
 * forwarding. The target's own `view`/`filter` always win on collision so a
 * stray `?view=`/`?filter=` can never point the shim somewhere other than
 * the Signals/patterns drill.
 *
 * BELT-AND-BRACES (2026-07-22): next.config.mjs `redirects()` now intercepts
 * `/golf/dashboard/patterns` at the framework routing layer, before this page
 * ever renders — the fix for the React #310 "rendered more hooks" crash on
 * client-navigation into bare redirect() shims (this file's own hand-rolled
 * query forwarding above is reproduced there by Next's automatic
 * query-merge). This component stays only as a fallback for anything the
 * config layer misses (and because `pattern-management.ts`,
 * `coaching-philosophy.ts` still call `revalidatePath('/golf/dashboard/patterns')`);
 * it should no longer actually execute in normal operation.
 */
export default async function PatternsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  params.set('view', 'signals');
  params.set('filter', 'patterns');
  permanentRedirect(`/golf/dashboard/intelligence?${params.toString()}`);
}
