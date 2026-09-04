<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# calendar events test ledger

## 2026-09-04 — contract tests follow the events read behind Suspense (PR #1828)

- `src/test/golf/calendar-page.test.tsx` — MOVED, not weakened. The events read
  now lives in `CalendarEventsSection`, an async child behind the page's
  interior `<Suspense>`, so awaiting the default export would have asserted
  nothing about it — silently. The section is exported for this reason and the
  tests drive it directly. Every guarantee is unchanged: a failed events read
  still THROWS to the route error boundary (Suspense is not an error boundary),
  the select still carries `parent_event_id` / `recurrence_rule` / `status`,
  cancelled events are still not filtered out, and the window + `.range()`
  pagination still apply.
- `src/test/golf/pages/calendar-secondary-reads-logged.test.ts` — its
  `renderPage` helper now drives BOTH phases, since the roster and
  team-settings reads moved into the streamed section. Without that it would
  have passed while observing neither.
