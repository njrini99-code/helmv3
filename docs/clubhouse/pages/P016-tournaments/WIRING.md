# P016 — Tournaments: wiring

Nothing is wired yet. The plan's sections 11 to 14 are the target: the held tables and RLS (section 11, the SQL lane),
the loaders and pure models (section 12), the writes (section 13) and the routes, navigation and page registration
(section 14). Until Phase 7:

- **Routes.** None. The nine routes of plan 14.1 are `plannedRoutes` in `config/clubhouse/pages/P016-tournaments.json`
  and move to `routes` as each `page.tsx` lands behind `golf_tournaments_v1` (off).
- **Data.** The preview's `tourFixture(state)` (`src/clubhouse/preview/fixtures-tournaments.ts`) returns every view's
  data in the shapes of `screens/tournaments/types.ts`, with the team math precomputed as the engine will return it.
- **Actions.** None registered. Plan 14.4's `ACT-P016-*` actions are added to the manifest with their server actions
  (`src/app/golf/actions/tournaments.ts`), which `clubhouse:check` requires to exist.
