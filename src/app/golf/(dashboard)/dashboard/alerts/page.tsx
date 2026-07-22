import { permanentRedirect } from 'next/navigation';

/**
 * Coach alerts page — retired (2026-07-19, plan Task 9). The Alerts triage
 * workspace is now the `alerts` filter of the consolidated Signals drill on
 * the coach Intelligence home. Several action files (`alerts.ts`,
 * `insight-management.ts`, `intelligence-dashboard.ts`, `development.ts`,
 * `coaching-philosophy.ts`) still call `revalidatePath('/golf/dashboard/alerts')`,
 * so this route stays live as a permanent-redirect shim (never a 404) — same
 * pattern as `/my-insights` (surface-registry.ts: `legacy: true, hidden: true`).
 *
 * Forwards every incoming query param (e.g. FocusAreaCard.tsx's `?id=`
 * insight deep-link, or old bookmarks) onto the target URL — same pattern as
 * `development/page.tsx`'s `?player=` forwarding. The target's own
 * `view`/`filter` always win on collision so a stray `?view=`/`?filter=`
 * can never point the shim somewhere other than the Signals/alerts drill.
 *
 * BELT-AND-BRACES (2026-07-22): next.config.mjs `redirects()` now intercepts
 * `/golf/dashboard/alerts` at the framework routing layer, before this page
 * ever renders — the fix for the React #310 "rendered more hooks" crash on
 * client-navigation into bare redirect() shims (this file's own hand-rolled
 * query forwarding above is reproduced there by Next's automatic
 * query-merge). This component stays only as a fallback for anything the
 * config layer misses (and because `alerts.ts`, `insight-management.ts`,
 * `intelligence-dashboard.ts`, `coaching-philosophy.ts` still call
 * `revalidatePath('/golf/dashboard/alerts')`); it should no longer actually
 * execute in normal operation.
 */
export default async function AlertsPage({
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
  params.set('filter', 'alerts');
  permanentRedirect(`/golf/dashboard/intelligence?${params.toString()}`);
}
