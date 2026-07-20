import { permanentRedirect } from 'next/navigation';

/**
 * `/golf/dashboard/insights` — LEGACY, permanently redirected (2026-07-19,
 * plan Task 9). Insights is now the `insights` filter of the consolidated
 * Signals drill on the coach Intelligence home (spec §5.4) — the stage IS
 * the nav. `surface-registry.ts`'s `insights` entry is
 * `legacy: true, hidden: true` and points its canonical href here-onward.
 *
 * Forwards every incoming query param (e.g. FocusAreaCard.tsx:315's
 * `?id=<insightId>` coach-facing insight deep-link, or old bookmarks) onto
 * the target URL — same pattern as `development/page.tsx`'s `?player=`
 * forwarding. The target's own `view`/`filter` always win on collision so a
 * stray `?view=`/`?filter=` can never point the shim somewhere other than
 * the Signals/insights drill.
 */
export default async function InsightsRedirect({
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
  params.set('filter', 'insights');
  permanentRedirect(`/golf/dashboard/intelligence?${params.toString()}`);
}
