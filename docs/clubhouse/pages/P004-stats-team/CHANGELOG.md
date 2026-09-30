# P004 — Stats (team): changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-30 — Page docs, permission proven, the export's names written as text

```text
Contract IDs:   13 new behaviour contracts: 40101, 40102, 40501, 40801, 40802, 40901, 41201, 41401, 41901,
                42001, 42101, 42301, 42401 (each named by a test title)
Actions:        5 (ACT-P004-*)
Data impact:    none
```

### Changed

- The six page docs, the manifest's actions, and CONTRACT.md answering all 25 categories, with Permission
  (08) written from the route and the loader rather than assumed.
- The CSV export writes a player's name that starts with =, +, - or @ (or a tab or a return) as text. Players
  type their own names, and the export is opened in a spreadsheet (found while reading the export for
  the contract; Roster fixed the same thing as 30502).
- Tests: 12 added (the route's permission and address, the export's cells and its landing, the choices kept
  across a window change, the keyboard path, the loader's one pass and its logged reads, the busy state
  CH-4402) and five retitled to carry the IDs they prove; the meta test 42401 keeps the file honest. Each new
  test was mutation-checked.
- The catalog's CH-4402 and CH-4702 now name their tests (they said preview).

### Found and not fixed

- v2 draws Stats with no rounds ever as a whole-page empty (D-71). The loader reads only this season's
  rounds, so it cannot say "ever"; owner decision.
- The phone's scoring trend and the player profile's scoring trend draw nothing with fewer than two weeks or
  rounds, and say nothing (desktop says "The trend needs rounds in at least two weeks").
- `createFocusArea` (shared action): stores the coach id the browser sends and skips its roster check when
  the coach has no organisation or no team (see P005).
- The old address /golf/dashboard/stats/team is a Fairway page that redirects a non-coach with a conditional
  `redirect()`, the pattern that crashed /stats with React #310 (the note in stats/page.tsx). Players are not
  linked there.

### Verification

- `npx vitest run src/clubhouse/__tests__/stats-team.test.tsx` 42/42; `npm run -s typecheck:fast` exit 0;
  eslint exit 0 on the changed files. Not run in this pass: clubhouse:check, docs:check, build, a11y.

## 2026-09-30 — v2 phone built

- `StatsTeamPhone`, placed by the page frame so the window change and its notices are the desktop's: four
  figures, the scoring line with its mean, strokes gained by leg (new loader field `legTotals`), players
  sorted by Avg or SG (new grid field `avg`) opening their stats, and team putting. New catalog rows CH-4703
  and CH-4805; the gaps against the board are Q-68. Seven tests, each mutation-checked.

## 2026-09-29 — Offline and slow window changes, a crash on the server render, the island split

- The window switch refuses to request anything offline (CH-4901) and says so once after 5 seconds
  (CH-4902). A section that crashes on the server render no longer fails the whole page: a Suspense inside
  each SectionBoundary (D-24). `StatsTeam` renders on the server and only the islands ship as client code
  (17.7 to 11.8 KB minified); the shell's animation features load lazily (D-25). One round-cache read serves
  the window, the previous window and the bests. CH-4209 and CH-4210: no benchmark of a guessed tour.

## 2026-09-29 — Fidelity pass and old address

- The prototype and the preview rendered box by box at 924 and 1280px against stats-team-01..05; the
  trend note margins, the players column, the leg cards' area fill, the putting rings and the grid subtitle
  were fixed. The old address /stats/team renders this page in place for a coach (D-23). D-26 keeps four
  copy choices as built.

## 2026-09-29 — Desktop build

- Team stats on the RLS-scoped client in one server pass, with trends and strokes gained first (the owner
  removed the team stat sheet), and the state catalog CH-40xx to CH-48xx.
