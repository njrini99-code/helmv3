# Clubhouse (cross-page) — Changelog

## 2026-11-28 — Every screen tells the Bridge which screen it is

```text
Design package: none
PR/commit:      agent/bridge-reliability-issues
Contract IDs:   none new
Actions:        none new
Data impact:    clubhouse_signal_hourly gains route (held migration 20261128090000)
Held items:     supabase/migrations/20261128090000_clubhouse_signal_routes.sql (HOLD)
```

### Changed

- The app router has 66 real screens (56 addresses and 10 views reached by a
  query, coach and player, phone and desktop share them). Every one is now a
  route key on its page in the graph: `src/lib/admin/clubhouse/route-key.ts`
  makes the key once, for the app and the server alike. A key never carries
  an id: `/golf/dashboard/rounds/[id]`, `/golf/dashboard/coachhelm?view=ask`.
- P015 lists the team and staff invitations (`/golf/join`,
  `/golf/join/[code]`, `/golf/staff/join/[token]`) as its own routes and
  screens; `other-routes.json` no longer carries them.
- `lib/signal-route.ts`: the address a signal fired on becomes its route key
  (dynamic parts folded to the template, views to their key). An address the
  graph doesn't list sends no route.
- `shell/use-signals.ts`, `lib/signal.ts`: every view, tap, vital (LCP, INP,
  CLS), action, toast and crash carries its route. A held signal keeps its own.
- `api/ch/signal`: keeps a route only where the graph lists it on that
  signal's page, sends the hourly rows to `clubhouse_ingest_signals_v2`, and
  while that function is missing (the held migration) sends the same batch
  without screens to the first function, trying v2 again every ten minutes.
  It does the same on 42883, the code Postgres gives after a rollback drops v2
  and before PostgREST reloads its schema.
- `RouteErrorBoundary`: a route crash goes as a reported signal
  (`chSignalReport`), as a section's crash does. On the front door while
  nobody is signed in, the crash used to wait saying a row carried it, and
  that row never could; it now waits saying it was not reported, so the
  Bridge writes its own row once a sign-in sends it.
- The Bridge reads `route` back (`live.ts`); while the column is missing it
  reads without it and asks again every ten minutes.
- The Pages view counts screens, not only pages: the truth line reads
  "Heard from 2 of 17 pages and 2 of 66 screens", each heard page shows how
  many of its screens reported, and Not heard from lists the silent screens by
  page. A row with no route still names its screen when its role leaves only
  one screen of the page; otherwise it is counted as not known yet and never
  guessed. Copy report carries the same.

### Why

- The Bridge could say only that a page was heard, not which of its screens.
  With 17 pages and 66 screens, a heard page could hide a silent screen.

### Verification

- `signal-route.test.ts`: one key for each screen in the graph (56 paths and
  10 views), every screen found from a real address on its own page, no key
  carries an id, and no redirect or not-found address claims one.
- `ingest.test.ts`: two screens of one page count apart; a route from another
  page or one the graph doesn't list counts under no screen.
- `route.test.ts`: v2 first; on a missing v2, the same batch without screens
  to the first function, and v2 again after ten minutes.
- `every-screen-reports.test.ts`: each of the 66 keys has a page in the app
  router, resolves from a real address on a page that lists it, is drawn under
  the shell or claimed by GateSignals (views, switch time, LCP, INP, CLS), and
  has a Clubhouse route boundary above it (errors).
- `route-error-signal.test.tsx`: a route crash sends one signal inside the
  shell and on the front door, waits signed out and then counts on its own row,
  and sends nothing outside Clubhouse.
- `page-health-screens.test.ts`, `issues.test.ts`, `feed-views.test.tsx`: 66
  screens over the real graph, 2 of 66 for today's traffic, a shared screen
  counted once, untold signals never placed on a screen.
- `live-route.test.ts`: the route is read when the column exists, and the read
  carries on without it while the migration is held.
- `supabase/rollbacks/20261128090000_clubhouse_signal_routes.rollback.sql`:
  rehearsed on the scratch database, folding screens back into their page with
  no count lost.
- `supabase/tests/rls/clubhouse_signal_routes.sql`: 16 assertions, run on a
  scratch Postgres 16 with stub tables (16 of 16; fails without the migration).
