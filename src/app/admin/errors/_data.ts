import { fetchErrorsTab } from '@/lib/admin/data/errors';
// Extracted from `errors/page.tsx` 2026-08-27, same reason as
// _components/ResolutionPanels.tsx: it was exported from a page.tsx only so
// the sibling __tests__ could import it, and admin-gate-coverage.test.ts
// correctly rejects that — every page.tsx export must reach
// requireSuperAdmin(). `_data.ts` is outside the gate rule's scope
// (page.tsx / layout.tsx / actions/*.ts), so the tests keep working and the
// guard stays honest.


import type { ErrorsTabFilters } from '@/lib/admin/data/errors';
import { fetchResolutionArchive } from '@/lib/admin/data/resolutions';
/**
 * The triage read and the archive read, fetched together — pulled out of
 * `Body` as a pure(ish) async function so the wiring itself is directly
 * unit-testable (mock the two fetchers, call this, assert both ran and both
 * results made it through) without needing to render `Body`. `Body` is an
 * async Server Component embedded via `<Suspense>`, which this repo's test
 * harness cannot resolve client-side — React 19 supports async components
 * only on the server — so a full-page render test can prove the shell
 * mounted but not that its resolved content is what this function produced.
 */
export async function loadErrorsPageData(filters: ErrorsTabFilters) {
  // The archive is unfiltered — reference material for the whole table, not
  // scoped to the current window/sport/severity chips — so it is independent
  // of the filtered triage read and safe to fetch in parallel with it.
  const [tab, archiveResult] = await Promise.all([fetchErrorsTab(filters), fetchResolutionArchive()]);
  return { tab, archiveResult };
}
