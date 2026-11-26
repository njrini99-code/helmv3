# Clubhouse state catalog

Every error, empty state, loading state, confirmation, motion, haptic and
accessibility behaviour on every Clubhouse page has a number. The number is
stable: it is never reused, and a removed row stays in its table marked
retired. Later it becomes the key the Helm Bridge groups on; for now it lives
in the UI as `data-ch-code="CH-8001"` so tests (and anyone inspecting the
page) can find it. It is not sent to Sentry yet.

## Numbering

`CH-`, then the page, the kind, and two digits. The first eight pages have a
one-digit page number (`CH-8001`). Every page after them has two digits
(`CH-09001`), so no existing number ever changes. A new page takes the next
free number when its catalog is started, added here and in `CATALOG_PAGE`
(`scripts/clubhouse/check.mjs`) together.

| First digit | Page |
| --- | --- |
| 1 | Shell (sidebar, top bar, bell, offline, shared behaviour) |
| 2 | Home |
| 3 | Roster |
| 4 | Stats (team) |
| 5 | Stats (player) |
| 6 | Calendar |
| 7 | Messages |
| 8 | Settings |
| 09 | Qualifiers (list, detail, create and edit; coach and player) |
| 10 | Team Hub (coach and player) |
| 11 | Rounds (player: library; review and round entry to come) |
| 12 | Classes (player) |
| 13 | CoachHelm (coach and player) |
| 14 | Recruiting (coach) |
| 15 | Auth: sign in, welcome, sign up and onboarding (signed out, then new to the team) |
| 16 | Tournaments (P016: season home, event desk, review, history, link inbox, compare, event form, lineup, live round; coach and player), and the Live rounds rows (P-6: CH-16600 to CH-16677 and CH-16680 to CH-16685, which follow the plan's copy deck, not the kinds below) |
| 17 | Practice (P017): the practice design's own error and log codes, `CH-17001` to `CH-17505`, which the server actions and the plan model write (`src/app/golf/actions/practice-*.ts`, `src/lib/golf/practice-{errors,fanout}.ts`, `src/lib/coachhelm/v3/practice-plan/model.ts`). Registered as they stand (plan D12, 2026-11-24). Practice's screen rows stay in `coachhelm.md` as CH-13080 and up; `pages/P017-practice/PAGE.md` maps one numbering to the other |
| 18, 19, … | Pages after these, in the order their catalogs are started |

| Second digit | Kind | What it means |
| --- | --- | --- |
| 0 | Error toast | Something the person did didn't save or send |
| 1 | Validation | A form message shown before anything is sent |
| 2 | Didn't load | A section's data failed to load: an inline notice with Try again |
| 3 | Empty | There is nothing to show yet, and what to do about it |
| 4 | Loading | Skeletons and in-progress states |
| 5 | Confirm | A question asked before something destructive or unsaved is lost |
| 6 | Motion | A micro animation and its duration |
| 7 | Haptic | A tap felt in the iOS app |
| 8 | Accessibility | Keyboard, screen reader and contrast behaviour |
| 9 | Network and UX | Offline, slow, and signals of a confusing experience |

A code in a comment may be a range, not a row: `CH-166xx`, `CH-60xx`, `CH-614x`
and `CH-153xx` name a block of a catalog, and a two-digit `CH-01` to `CH-24` in
a chart note is a tag, not a catalog code (a search for `CH-\d+` finds both).

So `CH-8001` is Settings, error toast, number one, and `CH-09001` is the
ninth page's first error toast. A new page's catalog starts from
`../CATALOG_TEMPLATE.md`; the full steps for a new design are in
`../README.md`.

## How each row is written

| Column | Meaning |
| --- | --- |
| # | The number |
| When | What the person did or what happened, in plain words |
| They see | The exact words (or the visible behaviour) |
| How | The mechanism: component, hook, duration, haptic |
| Test | Where it is forced in CI (`src/clubhouse/__tests__/…`), `a11y scan` for the axe run, or `preview` when checked in the preview only |

The shell's rows (1xxx) hold for every page: offline, slow saves, full-page
errors, navigation motion and haptics, skip link. A page lists only what is
its own.

## Control ids (`CTL-`)

A `CH-` number names a state; a `CTL-` id names a control a person can
press (spec §4.7, owner decision D11). Every button, link, tab, switch and
row in `src/clubhouse` carries one on its element, `data-ctl="CTL-P007-014"`:
the page it was first numbered on (`P000` for shared files no page claims),
then a number. The Bridge counts taps by it, so an id is permanent. It stays
with the element when the code moves, and a removed control's id goes to the
ledger's tombstones and is never reused.

The ledger is `config/clubhouse/controls/P###.json`, one entry per id: page,
file, element, label (or `labelTemplate`, "Open {name}'s thread", when the
label is built at run time), a plain description, role, viewport, the `ACT-`
actions it runs and its 2026-09-30 board verdict from `../CLICKABLES.md`.
`label`, `labelTemplate` and `description` are yours to edit; the rest is
read from the code on every run. The Bridge reads it through the graph
(`generated/bridge-graph.json`, `controls`).

To add a control, write it, then run `npm run clubhouse:controls`. It numbers
anything new, rewrites the ledger and the
[clickable map](../generated/CLUBHOUSE_CLICKABLE_MAP.md), and syncs the graph.
Running it twice changes nothing. If the control has no visible words, give it
an `aria-label` in the code, or a `label` in the ledger when the name comes
from elsewhere (an `aria-labelledby`, say). A shared component (`ui/Button`,
`IconButton`, a page's `NavRow`) takes `data-ctl` from its caller and writes
it as `data-ctl={…}` on its own element. An element written that way forwards
its caller's id and takes none of its own. After a rebase or a merge
conflict, take either side of a conflicted ledger and rerun the command. Two
branches that took the same next number are split, and the first occurrence
keeps the id.

## Checks

- `npm run clubhouse:check` (CI): every control has a `data-ctl` and a label
  (in the code or the ledger), and the ledgers match the code.
- `npm run clubhouse:check` (CI): every number used in `src/clubhouse` is
  catalogued once in its page's block; every row of kinds 0–5 is used in code
  and named by a test; retired numbers stay unused.
- `npm run test:file -- src/clubhouse/__tests__` (CI): each test is named by
  the number it forces.
- `npm run clubhouse:a11y` (local, needs the dev server on 3100): axe-core,
  WCAG 2.2 AA, every preview screen and state at 1280px and 390px.

Pages: [shell](shell.md) · [home](home.md) · [roster](roster.md) ·
[stats-team](stats-team.md) · [stats-player](stats-player.md) ·
[calendar](calendar.md) · [messages](messages.md) · [settings](settings.md) ·
[qualifiers](qualifiers.md) · [classes](classes.md) · [coachhelm](coachhelm.md)
·
[recruiting](recruiting.md) · [auth](auth.md) · [tournaments](tournaments.md).
