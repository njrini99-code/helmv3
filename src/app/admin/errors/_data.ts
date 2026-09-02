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
import { fetchIncidentBoard } from '@/lib/admin/incidents/fetch';
/**
 * The triage read, the archive read and the unified incident board, fetched
 * together — pulled out of `Body` as a pure(ish) async function so the wiring
 * itself is directly unit-testable (mock the fetchers, call this, assert each
 * ran and each result made it through) without needing to render `Body`.
 * `Body` is an async Server Component embedded via `<Suspense>`, which this
 * repo's test harness cannot resolve client-side — React 19 supports async
 * components only on the server — so a full-page render test can prove the
 * shell mounted but not that its resolved content is what this function
 * produced.
 *
 * The board is fetched ALONGSIDE the legacy tab read rather than replacing it,
 * and the three run in parallel. They are not redundant: the board is the
 * canonical incident list, while `fetchErrorsTab` still backs the deliberately
 * un-windowed "Sentry unresolved (org-wide)" source panel, the hourly series,
 * the deploy markers and the filter-chip counts. Both ultimately read
 * `fetchIncidentFeed`, whose default-window call is memoised per request.
 */
export async function loadErrorsPageData(filters: ErrorsTabFilters) {
  // The archive is unfiltered — reference material for the whole table, not
  // scoped to the current window/sport/severity chips — so it is independent
  // of the filtered triage read and safe to fetch in parallel with it.
  const [tab, archiveResult, board] = await Promise.all([
    fetchErrorsTab(filters),
    fetchResolutionArchive(),
    // Same filter object the tab read uses, so a filter chip and a lens narrow
    // the SAME population. Two queries that can disagree is the split this
    // whole read model exists to close.
    fetchIncidentBoard(filters),
  ]);
  return { tab, archiveResult, board };
}
