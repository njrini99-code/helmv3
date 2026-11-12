# Practice: the page as built (10 Nov 2026)

Practice is where a coach plans a practice (blocks, groups, drills), publishes
it, runs it on the day, keeps a drill
and template library and prints it, and where a player sees what to do. Its
catalog rows are in
[`catalog/coachhelm.md`](../catalog/coachhelm.md) (the rows that start
"Practice:"); what the build was missing against
the design, and what is still open, is in [`GAP.md`](GAP.md). The design is
`design-refresh/practice-plan/redesign/coachhelm-practice.html` with
`05-SCREENS.md`'s S-PRC rows.

Code: `src/clubhouse/screens/practice/**`, `src/clubhouse/styles/practice.css`,
the loaders
`src/clubhouse/data/practice-{home,plan,library}.ts`, the routes in
`src/clubhouse/routes/practice.tsx`, and the
previews `src/clubhouse/preview/PreviewPractice*.tsx`. The plan sheet itself
(`PracticePlanSheet`) and the player's
plan page belong to `screens/coachhelm/plan/**`.

## Addresses

| Address | Who | Screen |
| --- | --- | --- |
| `/golf/dashboard/practice` | coach, player | `PracticeHome`, `PlayerPracticeHome` |
| `/golf/dashboard/practice/drills`, `/drills/<id>`, `/groups`, `/templates` | coach | `LibraryPages` |
| `/golf/dashboard/practice/plan/<id>/edit` (`?fill=1`) | coach | `Builder` |
| `/golf/dashboard/practice/plan/<id>` | coach, player | plan sheet under `CoachPlanBar` and `PlanRun`; a player gets `PlayerPractice` |
| `/golf/dashboard/practice/print/<id>` | coach | `PrintStudio` |

A player who opens a coach address is sent to their own. A Fairway user is sent
to the Calendar
(`routes/practice-gate.ts`).

## What each state says

| State | Where | What is on screen | Source |
| --- | --- | --- | --- |
| Practice not on this database | every address | "Practice isn't on yet" and Go to Calendar | a read answered with a missing table, function or column (`isPracticeMissing`) |
| A read failed | home, library | "Practice didn't load. Your plans are safe." and Try again | any other read error |
| A plan that is gone | plan page, print, builder | "This plan isn't available" | the plan row or its event did not read |
| No plan ever made | home | "Plan your first practice" and three starts | `firstRun` (no plan rows) |
| No practice this week | home | "No practices this week"; earlier plans still list | no event ahead |
| Draft | home rows, Up next, plan page | "Draft"; on the plan page "Only coaches can see this. Players get it when you publish." | `status = 'draft'` |
| Published | the same | "Published"; "Players have this plan." | `status = 'published'`, `edited_after_publish = false` |
| Published, with edits players do not have | the same | "Updated" on the week and row with "Edits not published"; on the plan page "Players still have the plan as you last published it." | `edited_after_publish = true` |
| Ended | home rows, week | "Ended" | the practice's end is past |
| Saving, saved, offline, failed, stale | builder | "Saving…", "Saved", "Offline · changes kept on this device", "Couldn't save · Try again", "Another coach changed this plan." with Load latest | `useAutosave` |
| The drills for print did not load | print | "This plan's drills didn't load" with Try again; the rest prints | `loadPlanDrills` threw |

"Edits not published" has one source,
`golf_practice_plans.edited_after_publish`, which the save function sets and the
publish function clears (`editedAfterPublish` in `data/practice-plan.ts`).
`version` counts saves and
`published_version` counts publishes, so the two are never compared.

## The pieces

- **The day to scale** (`DayStrip`). One segment a block, as wide as its
  minutes. In the builder a block takes its
  drill's kind (skill, random, pressure), a rotation's hour is shared between
  its stations, suggestions are outlined
  and what is left of the window is empty. The legend under it counts the same
  minutes. On Up next the plan's drills
  are not read, so every block is the plain ink. Drawn whole at first paint;
  nothing grows.
- **The helper** (`builder/HelperSession.tsx`). One request through
  `useCoachHelmChat({ surface: 'practice_helper' })`.
  The plan it drafts arrives as a `data-practice-plan` part and becomes outlined
  suggestions; nothing joins the plan
  until kept. Opened from New plan's Ask CoachHelm, its first message carries
  the sheet's two picks ("Make it 2 h 30
  long. Work on putting and pressure."). The picks travel in `sessionStorage`
  under `ch-prc-ask:<planId>` and are
  taken once.
- **Publish**. Review's Publish opens a confirm (facts, then the press), then an
  8 second hold with Undo before
  anything is written or sent.
- **Run** (`PlanRun`). From 15 minutes before the start until the end, on a
  published plan: the block under way, each
  group's stop now and next (one clock a row), and two shifts of five minutes
  that save and republish.
- **Print** (`PrintStudio`). Four pieces, each a portrait sheet of US Letter:
  the coach copy (the schedule, then
  drills, what to bring and notes), the range board (a sheet a rotation), pocket
  cards (two groups a sheet) and the
  drills appendix (four drills a sheet). The studio draws each piece on its
  paper inside the print's own 16mm margin,
  measures it against one sheet (`LETTER_CONTENT`, 695 by 935 CSS pixels), and
  says how many sheets will come out:
  a piece that runs past one sheet counts every sheet it takes, each break is
  marked on the paper ("Sheet 2 starts
  here") and falls above a row, never through one (`pageCuts`), and the page
  number in a footer is the sheet in the
  hand. It says when the appendix alone is more than two sheets. Nothing
  interactive is inside a printed sheet. A
  schedule row and a rotation carry `break-inside: avoid`
  (`coachhelm-plan.css`), and so do a pocket card, a drill and
  a line of the range board.
- **Forms** (`PracticeSheet`). New plan, New drill and Save group are the shared
  `FormSheet` on a phone and the shared
  `Modal` on a desk, with the same fields and the same one action.

## What a player gets

Only the live published version (`golf_practice_plan_versions`, which RLS holds
to their team) and their own own-work
lines. The sheet model for a player has no Why, no Aim and only their own group;
the home page draws their next
practice from that model. Loader tests: `data/__tests__/practice-plan.test.ts`.

## Held migrations

Practice needs twelve migrations that are held (`supabase/migrations/HELD.md`):
`20261026010000` to `010800`,
`20261026090300`, `20261102090000` and `20261104090000`. On a database without
them, or with only some, every Practice
address says "Practice isn't on yet". Saving a Why line or a plan format without
its migration answers "Comes with the
Practice tab."

## What the printed file showed (10 and 11 Nov)

A real paginated file was made from the studio's own Print press, in Chrome
(WebKit's test browser cannot write a
PDF), for a three-hour plan, a twelve-hour plan, every piece switched on, and a
fourteen-drill appendix.

- The studio's count and the file's page count are equal in all four: 4, 5, 7
  and 8 sheets.
- No schedule row, rotation, pocket card or drill is split across two sheets.
- Type and colour print as drawn: the print root carries the Clubhouse font
  class, which it did not before.
- Every piece is portrait. WebKit has no named pages (the `page` property reads
  as unsupported), so a landscape piece
  printed on portrait paper there, and Chrome turned the paper but laid the
  piece out at the portrait width. A
  landscape range board needs a mechanism that holds in Safari.
- Not done: a print from Safari on a phone or a Mac to paper or to its own PDF.
  WebKit was measured in print media
  (nothing outside the print root shows, nothing can be pressed, the type is
  right), which is not a paginated file.

## Previews

`/clubhouse-preview/coachhelm-practice-home` (`empty`, `firstrun`, `new`,
`player`, `player-empty`), `-builder`
(`empty`, `blocks`, `sheet`, `ghosts`, `kept`, `groups`, `drills`, `review`,
`publish`, `stale`), `-run` (`draft`,
`edited`), `-library` (`tab=drills|drill|groups|templates`,
`state=empty|library`), `-print` (`norotation`, `nodrills`,
`draft`, `unread`, `long`, `cards`, `tall`). Nothing in a preview reaches a server.

## Rows the catalog does not have yet

These behaviours have tests and no CH code. Minting one regenerates the shared
bridge map, so they are listed for the
coordinator instead of added here.

| Proposed row | What is seen | Test |
| --- | --- | --- |
| Practice: the plan page's state | Draft, Published or Edits not published, each with its line | practice-states › the plan page says which of three states |
| Practice: print, the drills did not load | "This plan's drills didn't load" with Try again | practice-states › a drills read that failed is said |
| Practice: print, the sheet count | "4 sheets · Coach copy 3 · Range board 1", with "Coach copy runs past one sheet…" and the breaks marked on the paper | practice-states › counts the sheets before the press; › a piece that runs past one sheet; page-cuts |
| Practice: New plan, Ask CoachHelm | "What should Friday cover?" with How long and Work on; the action reads Build plan | new-plan-ask |
| Practice: not on this database | "Practice isn't on yet" on the plan page and print | routes › practice-unavailable |
