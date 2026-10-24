# Tournaments views (P016)

The coach's tournament workspace and the player's event view. Page docs: `docs/clubhouse/pages/P016-tournaments/`;
catalog: `docs/clubhouse/catalog/tournaments.md`; boards: `design/handoff/Coach - Tournaments.html`, its phone board,
`tour.jsx`, `tour-m.jsx`, `tour-compare.jsx` (v3, `design/handoff/VERSIONS.md`).

The base set the views up for parallel lanes; one session (round 6, the Tournaments screens session) now builds all
ten. The split it kept still holds, so the files stay separable:

| View | File | Sheet | Class prefix | Catalog serials |
| --- | --- | --- | --- | --- |
| shared pieces | `parts.tsx`, `paths.tsx`, `format.ts`, `SeasonLedger.tsx` (Home and History) | `tournaments.css` | `.ch-tour-` | 01–09 |
| season home | `TournamentsHome.tsx` | `tournaments-home.css` | `.ch-tour-home-` | 10–19 |
| event desk, who counted, holes, evidence drawer | `EventDesk.tsx`, `WhoCounted.tsx`, `HoleGrid.tsx`, `EvidenceDrawer.tsx`, `desk-model.ts` | `tournaments-desk.css` | `.ch-tour-desk-` | 20–34 |
| review, history, link inbox | `Review.tsx`, `History.tsx`, `LinkInbox.tsx` | `tournaments-review.css` | `.ch-tour-rev-` | 35–44 |
| comparison | `Compare.tsx` | `tournaments-compare.css` | `.ch-tour-cmp-` | 45–59 |
| event form, lineup builder | `EventForm.tsx`, `LineupBuilder.tsx` | `tournaments-lineup.css` | `.ch-tour-lu-` | 60–69 |
| live round | `LiveRound.tsx` | `tournaments-live.css` | `.ch-tour-live-` | 70–89 |
| player's view | `PlayerEvent.tsx` | `tournaments-player.css` | `.ch-tour-pl-` | 90–99 |

Rules every view keeps:

- **Props.** Each view takes `{ data, load, phone }` (and `search` where its URL state lives) from `types.ts`. `load`
  draws the view's skeleton (CH-16401) or the page failure (CH-16201); `ready` draws the data, and a section whose read
  failed carries an `errors` flag and its own notice.
- **Data.** `types.ts` is base-owned: team math arrives computed (`scoring.ts`, `standings.ts`) and a view never
  recomputes it. Metrics come from `metrics.ts`. A view that needs a new shape extends `types.ts` and the preview
  fixture together and says so in its changelog.
- **Links.** Views build hrefs through `useTourPaths()` (`paths.tsx`): the real routes by default (the manifest's
  `plannedRoutes`), the preview's `/clubhouse-preview/tournament-*` inside `TourPathsProvider`.
- **Motion.** Nothing draws in on first paint. A value that changes afterwards takes its new value in place with the
  changed-wash (`useChangedWash`, D-100); a chart glides only on a change of its data.
- **Tests.** Tests that name a catalog code live in `src/clubhouse/__tests__/tournaments-*.test.tsx`, where
  `clubhouse:check` reads them; pure modules keep theirs in `__tests__/` here.
