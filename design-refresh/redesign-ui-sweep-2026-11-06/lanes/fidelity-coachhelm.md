# Fidelity and completeness audit: CoachHelm (Team view, Root cause, Coach vs player, Brief, shared switch)

Repo `helmv3` at main `062f8a2`. Packages: `design-refresh/coachhelm-team`, `design-refresh/coachhelm-read`, `design-refresh/coachhelm-lenses`. This file does not repeat findings already in `lanes/team.md` (TEAM-1..34), `lanes/rootcause.md` (RC-1..18), `lanes/coach-vs-player.md` (CVP-1..20) or `qa-staging.md` (QA-1..18). Motion timing is left to `motion.md`. A finding below only touches motion where a component is missing a hook, such as `sw.enter`.

Paths are relative to `src/clubhouse/` unless stated otherwise.

Flags. All four are production `false` and preview `true`:
- `coachhelm_team_board_v1`. It also sets `TEAM_BOARD_FIRST_VIEW='hole'` and `COURSE_TAB=true`.
- `coachhelm_read_v1`
- `coachhelm_player_file_v1`
- `coachhelm_monday_brief_v1`

Correction for the record. Two prior citations point at the wrong lines:
- RC-8 cites `ReadLadder.tsx:276-286`, but `ReadLadder.tsx` is 49 lines.
- RC-4 cites `ReadsRail.tsx:328-340`, but the switcher is at `ReadsRail.tsx:19-31`.

The findings themselves stand.

## Subpage inventory

Status is one of: matches, drifts, missing in code, missing in design, unreachable.

| lane | subpage/state | phone/desktop | file:line | design ref | status |
|---|---|---|---|---|---|
| TEAM | Route entry, Team board (`?` no view, flag on) | both | routes/coachhelm.tsx:85 | coachhelm-team 05 §S-TEAM | drifts (no onRetry, no briefHref) |
| TEAM | Route loading fallback | both | routes/coachhelm.tsx:311, team/TeamBoardSkeleton.tsx:35 | 06 §S-TEAM.loading | drifts (TEAM-29 extends) |
| TEAM | Large title + context line | phone | team/TeamBoard.tsx:199, :369 | 06 §S-TEAM header | drifts (plurals, stale count) |
| TEAM | Large title + context line | desktop | team/TeamBoard.tsx:369-373, styles/shell.css:4387-4391 | redesign/coachhelm-team.html :1028 (glass bar scope + switch) | drifts (context hidden, no scope, switch not in bar) |
| TEAM | Team/Ask switch | both | chat/SubTabs.tsx:21, ui/Segmented, styles/controls.css:4-37 | 06 §S-TEAM switch 41/3/12, 35/9, 15/500 | drifts |
| TEAM | Station control (5 chips) | both | team/StationControl.tsx | 06 §S-TEAM.stations | drifts (TEAM-6 already) |
| TEAM | Hole view, populated | both | team/TeamHole.tsx | 06 §S-TEAM.hole | drifts (TEAM-1..5 already) |
| TEAM | Hole coin overflow ("+N") | both | team/TeamHole.tsx:93, team/hole-geometry.ts:52-64 | 05 "5 coins", 08 AC-HOLE-05 "3 then +N" | drifts (1-slot stations) |
| TEAM | Hole view, one player | both | team/TeamHole.tsx | 08 AC-HOLE-07 | matches |
| TEAM | Hole view, players/roster failed | both | team/TeamBoard.tsx:288-289 | 06 §S-TEAM.error | drifts (no Try again) |
| TEAM | Hole view, empty (no rounds) | both | team/TeamBoard.tsx (empty branch) | 06 §S-TEAM.empty | matches |
| TEAM | Read sheet (Modal "Details") | phone | team/TeamBoard.tsx:380, team/panels.tsx ReadPanel | 06 §S-TEAM.read-sheet | drifts (title, copy, button variant) |
| TEAM | Read panel (side) | desktop | team/panels.tsx ReadPanel, styles/coachhelm-team.css:1708 | 06 §S-TEAM.read-desk 22 24 40 | drifts (20 24 40) |
| TEAM | Read sheet, assigning / assigned | both | team/panels.tsx ReadPanel (FocusActions where="board") | 06 §S-TEAM.read-sheet.proposed (42-tall row) | drifts |
| TEAM | Read sheet, no Tour figure | both | team/panels.tsx:68 | 06 §S-TEAM.read-sheet (single-hole reads only) | drifts |
| TEAM | Player panel / sheet | both | team/panels.tsx PlayerPanel :240 | 06 §S-TEAM.player | drifts (TEAM-12 already) |
| TEAM | Course sheet | both | team/panels.tsx CourseSheet :344 | 08 AC-CSHEET-01..06 | drifts (no story link, no delta) |
| TEAM | Course card | phone | team/CourseCard.tsx, styles/coachhelm-team.css:1772 | 06 §S-TEAM.course | drifts (both layouts in DOM) |
| TEAM | Course card | desktop | team/CourseCard.tsx | 06 §S-TEAM.course | drifts |
| TEAM | Course card, failed | both | team/CourseCard.tsx (onRetry gate) | 06 §S-TEAM.course.error | drifts (Try again never shown) |
| TEAM | Working on card | both | team/Cards.tsx WorkingCard | 06 §S-TEAM.working | drifts |
| TEAM | Working on card, failed | both | team/Cards.tsx WorkingCard (onRetry gate) | 06 §S-TEAM.working.error | drifts (Try again never shown) |
| TEAM | Track record card | both | team/Cards.tsx RecordCard :186-189 | 08 AC-RECORD-01 big figure | drifts (no "{held} of {checked}") |
| TEAM | Track record, rung with no bar | both | team/Cards.tsx RecordCard (`t is-none`) | 06 §S-TEAM.record | drifts (empty track drawn) |
| TEAM | Spot card (pattern) | both | team/SpotCard.tsx | 08 AC-SPOT-02 | drifts (rows without a figure) |
| TEAM | Spot card, failed | both | team/SpotCard.tsx | 06 §S-TEAM.spot.error | drifts (no retry) |
| TEAM | Huddle chart | both | team/Huddle.tsx:39-40 | 06 §S-TEAM.huddle | drifts (null as 0) |
| TEAM | Story ring row | both | team/Stories.tsx | 06 §S-STORY | drifts (TEAM-15 already) |
| TEAM | Story viewer (full screen) | phone | team/Stories.tsx StoryViewer | 08 AC-STORY-01..08 | drifts (focus pause, trap) |
| TEAM | Story desk panel | desktop | team/Stories.tsx StoryDeskPanel :299-318 | 08 AC-STORYDESK-01 | drifts (no coin in header) |
| TEAM | Story action tap | both | team/TeamBoard.tsx:194 | 06 §S-STORY.action (opens the read sheet in place) | drifts (hard navigation) |
| TEAM | Player list push to file (S-LIST) | both | none in team/ | coachhelm-lenses 06 §S-LIST | missing in code |
| TEAM | Board off (`data.off`) | both | team/TeamBoard.tsx:198 | 06 §S-TEAM.off | matches |
| TEAM | Toasts (assigned / undo) | both | hooks useFocusActions | 06 §S-TEAM.toast | drifts (copy, see FID-TEAM-6) |
| TEAM | Long data (12+ players, many reads) | both | team/TeamHole.tsx, team/StationControl.tsx | 08 AC-HOLE-05 | drifts (TEAM-1 already) |
| RC | Read page, coach | both | read/ReadPage.tsx | coachhelm-read 05 §S-READ | drifts |
| RC | Read page, player | both | read/ReadPage.tsx | 05 §S-READ (player lens) | drifts |
| RC | Read page loading | both | read/ReadPage.tsx:26-45, routes/coachhelm.tsx:260, :322 | 06 §S-READ.loading | matches |
| RC | Read page, thrown feed | both | read/ReadPage.tsx:91-92 | 06 §S-READ.error CH-13860 | drifts (CH-13866) |
| RC | Read page, no longer open (CH-13861) | both | read/ReadPage.tsx:102 | 06 §S-READ.gone | matches |
| RC | Read page, part failed | both | read/ReadPage.tsx:107-118 | 06 §S-READ.partial | drifts |
| RC | Read headline + stance chip | both | read/cards.tsx:33-70 | 06 §S-READ.headline | drifts (never "Dismissed") |
| RC | How sure | both | read/cards.tsx | 06 §S-READ.sure 20/1.1/600 | drifts |
| RC | Ladder | both | read/ReadLadder.tsx | 06 §S-READ.ladder | drifts (RC-8 already) |
| RC | Do card | both | read/cards.tsx DoCard | 06 §S-READ.do | drifts |
| RC | Dismissed notice | both | read/cards.tsx DoCard | 06 §S-READ.dismissed (top of page) | drifts (placement) |
| RC | Cleared state | both | none | 06 §S-READ.cleared | missing in code |
| RC | Contradicted state | both | none | 06 §S-READ.contradicted | missing in code |
| RC | Under review state | both | none | 06 §S-READ.review | missing in code |
| RC | More menu (Modal) | both | read/ReadPage.tsx:184-203 | 06 §S-READ.more | drifts (RC-1/RC-2 already) |
| RC | Icon button `.ib` | both | read/ReadPage.tsx:153 | DESIGN_LANGUAGE (ui/Button icon) | drifts |
| RC | Reads rail + player switcher | desktop | read/ReadsRail.tsx:19-31 | 06 §S-READ.rail (segmented 34) | drifts |
| RC | Practice link | both | read/ReadPage.tsx:126 (`practiceHref={null}`) | 06 §S-READ.do practice | missing in code |
| RC | Read summary card on board (S-READ-BOARD) | both | read/ReadSummaryCard.tsx, preview/PreviewCoachHelmRead.tsx:21 only | 06 §S-READ-BOARD | unreachable |
| RC | S-READ-BOARD.actions (Assign + More) | both | none | 06 §S-READ-BOARD.actions | missing in code |
| RC | S-READ-BOARD.dismissed | both | none | 06 §S-READ-BOARD.dismissed | missing in code |
| CVP | Player file, coach lens | both | file/PlayerFile.tsx | coachhelm-lenses 05 §S-FILE | drifts |
| CVP | File loading | both | routes/coachhelm.tsx:120, :277 (FileSkeleton) | 06 §S-FILE.loading | matches |
| CVP | File back button | both | file/PlayerFile.tsx:129, :329 | 08 S-FILE 1 "CoachHelm" | drifts ("Back") |
| CVP | File rail (roster) | desktop | file/PlayerFile.tsx:335, :344 | 06 §S-FILE.rail | drifts (always drawn when roster present) |
| CVP | Lens Accept / Decline | both | file/PlayerFile.tsx:207-212 | 08 S-FILE lens (aria-disabled) | drifts |
| CVP | Reads card | both | file/cards.tsx ReadsCard ~:440-470 | 06 §S-FILE.reads | drifts |
| CVP | Reads card, undo of older dismissal | both | file/cards.tsx ReadsCard ~:440-470 | 08 S-FILE undo | drifts (row stays Dismissed) |
| CVP | File part failed | both | file/PlayerFile.tsx:395-410 | 06 §S-FILE.partial | matches |
| CVP | Read sheet from file | both | file/PlayerFile.tsx | 06 §S-FILE.read-sheet | drifts (CVP-6 already) |
| CVP | Plan sheet | both | file/PlayerFile.tsx | 06 §S-FILE.plan-sheet | drifts (CVP-9 already) |
| CVP | More menu | both | file/PlayerFile.tsx | 06 §S-FILE.more | drifts (CVP-10 already) |
| CVP | Toast | both | file/PlayerFile.tsx | 06 §S-FILE.toast | matches |
| CVP | S-LIST (list rows push into file) | both | file/PlayerFile.tsx:344 (rail only) | 06 §S-LIST | missing in code on Team and Coach boards |
| CVP | Player "Your week" (S-BOARD) | both | file/YourWeek.tsx:39, :68, routes/coachhelm.tsx:167 | 06 §S-BOARD | drifts |
| CVP | S-BOARD.focus feature card | both | file/YourWeek.tsx:49-55 | 06 §S-BOARD.focus | drifts (wrong proposal fallback, ProposalRow) |
| CVP | Player loading | both | routes/coachhelm.tsx:336 (CoachHelmSkeleton player) | 06 §S-BOARD.loading | drifts (old board skeleton) |
| CVP | Player board, empty | both | file/YourWeek.tsx:39 | 06 §S-BOARD.empty | matches |
| BRIEF | Brief (`?view=brief`) | phone | views/CoachBrief.tsx:25-50 | none in my packages | missing in design |
| BRIEF | Brief | desktop | views/CoachBrief.tsx:25-50, styles/coachhelm.css:55 | none | missing in design (serif 52 title differs from Team) |
| BRIEF | Brief loading | both | routes/coachhelm.tsx:301-306 | none | drifts (skeleton draws Board/Ask strip the frame lacks) |
| BRIEF | Brief entry from Team view | both | routes/coachhelm.tsx:85 (no briefHref) | none | unreachable from the Team view |
| SHARED | Ask view switch label after Team | both | chat/Ask.tsx:78, :343, chat/AskSkeleton.tsx:21 | 06 §S-TEAM switch "Team / Ask" | drifts ("Board / Ask") |
| SHARED | Coach board skeleton switch (desktop) | desktop | CoachHelmSkeleton.tsx:71 | 06 §S-TEAM | drifts (says Board) |

Subpages and states inventoried: 79.

## Feature checklist

Columns: built / real data / reachable / works. "Prev" means preview only, because the flag is off in production.

| lane | claimed feature (source §) | built | real data | reachable | works | flag | evidence |
|---|---|---|---|---|---|---|---|
| TEAM | Team view replaces board for coaches (02 PR1) | yes | yes | prev | yes | team_board_v1 | routes/coachhelm.tsx:85 |
| TEAM | Team / Ask switch (AC-TEAM-09) | yes | n/a | prev | partly (label flips to Board on Ask) | team_board_v1 | chat/Ask.tsx:78 |
| TEAM | Scope context line, phone and desktop (06 header) | partly | yes | phone only | partly | team_board_v1 | styles/shell.css:4387 |
| TEAM | Hole with coins per station (AC-HOLE-01..07) | yes | yes | prev | partly | team_board_v1 | team/TeamHole.tsx:93 |
| TEAM | Station control filters (AC-STATION) | yes | yes | prev | yes | team_board_v1 | team/StationControl.tsx |
| TEAM | Read sheet / panel (AC-RSHEET) | yes | yes | prev | partly (copy, shape) | team_board_v1 | team/panels.tsx ReadPanel |
| TEAM | Propose as focus with undo (AC-RSHEET-04) | yes | yes | prev | partly (says Assigned) | team_board_v1 | team/panels.tsx |
| TEAM | Ask about this from read (AC-RSHEET-05) | yes | yes | prev | yes (wrong variant) | ask_v2 | team/panels.tsx |
| TEAM | Player panel with open-file link (AC-PSHEET) | yes | yes | prev+file flag | yes | player_file_v1 | team/panels.tsx:240 |
| TEAM | Course tab and card (AC-COURSE) | yes | yes | prev | yes | COURSE_TAB | team/CourseCard.tsx |
| TEAM | Course sheet story link (AC-CSHEET-05) | no | n/a | no | no | team_board_v1 | team/panels.tsx CourseSheet |
| TEAM | Course sheet per-row delta (AC-CSHEET-04) | no | n/a | no | no | team_board_v1 | team/panels.tsx CourseSheet |
| TEAM | Working on card (AC-WORK) | yes | yes | prev | yes | team_board_v1 | team/Cards.tsx WorkingCard |
| TEAM | Track record big figure (AC-RECORD-01) | no | n/a | no | no | team_board_v1 | team/Cards.tsx:186-189 |
| TEAM | Track record rungs (AC-RECORD-02) | yes | yes | prev | partly | team_board_v1 | team/Cards.tsx |
| TEAM | Spot pattern card (AC-SPOT-01..03) | yes | yes | prev | partly | team_board_v1 | team/SpotCard.tsx |
| TEAM | Huddle averages (AC-HUDDLE) | yes | yes | prev | partly (null as 0) | team_board_v1 | team/Huddle.tsx:39-40 |
| TEAM | Stories ring + viewer (AC-STORY-01..08) | yes | yes | prev | partly | team_board_v1 | team/Stories.tsx |
| TEAM | Story pause on focus and hold (AC-STORY-05) | partly | n/a | prev | partly (pointer only) | team_board_v1 | team/Stories.tsx StoryViewer |
| TEAM | Story desk panel with coin (AC-STORYDESK-01) | partly | yes | prev | partly | team_board_v1 | team/Stories.tsx:299-318 |
| TEAM | Story action opens read in place (06 §S-STORY) | partly | yes | prev | partly (full reload) | team_board_v1 | team/TeamBoard.tsx:194 |
| TEAM | Try again on every failed part (06 errors) | partly | n/a | no | no (onRetry never passed) | team_board_v1 | routes/coachhelm.tsx:85 |
| TEAM | Brief and Track record links from board (02 PR4) | no on Team | n/a | no | no | monday_brief_v1 | routes/coachhelm.tsx:85-86 |
| TEAM | Cross-fade on view switch (07) | partly | n/a | prev | partly (no sw.enter on main) | team_board_v1 | team/TeamBoard.tsx:360 |
| RC | Read page per read (02 PR1) | yes | yes | prev | yes | read_v1 | read/ReadPage.tsx |
| RC | Headline + stance chip (AC-READ-01) | yes | yes | prev | partly (no Dismissed stance) | read_v1 | read/cards.tsx:33-70 |
| RC | How sure block (AC-READ-03) | yes | yes | prev | yes (type off) | read_v1 | read/cards.tsx |
| RC | Ladder (AC-READ-04) | yes | yes | prev | yes | read_v1 | read/ReadLadder.tsx |
| RC | Do card with practice link (AC-READ-06) | partly | n/a | no | no (practiceHref null) | read_v1 | read/ReadPage.tsx:126 |
| RC | Dismiss with notice and undo (AC-READ-07) | yes | yes | prev | partly (placement) | read_v1 | read/cards.tsx DoCard |
| RC | Cleared lifecycle (AC-READ-10) | no | no | no | no | read_v1 | no reference in read/ or data shape |
| RC | Contradicted lifecycle (AC-READ-11) | no | no | no | no | read_v1 | same |
| RC | Under review lifecycle (AC-READ-12) | no | no | no | no | read_v1 | same |
| RC | Error codes CH-13860/13861 (AC-READ-ERR) | partly | n/a | prev | partly (13866) | read_v1 | read/ReadPage.tsx:91 |
| RC | Part-failure banner (AC-READ-PART) | partly | n/a | prev | partly (≥2 only) | read_v1 | read/ReadPage.tsx:107-118 |
| RC | Reads rail with player switcher (AC-RAIL) | yes | yes | prev | partly (leaves page) | read_v1 | read/ReadsRail.tsx:19-31 |
| RC | More menu (AC-MORE) | yes | yes | prev | yes | read_v1 | read/ReadPage.tsx:184-203 |
| RC | Read summary card on board (S-READ-BOARD) | yes | yes | no | no (preview only) | read_v1 | preview/PreviewCoachHelmRead.tsx:21 |
| RC | Board card Assign + More (S-READ-BOARD.actions) | no | n/a | no | no | read_v1 | none |
| RC | Board card dismissed state (S-READ-BOARD.dismissed) | no | n/a | no | no | read_v1 | none |
| CVP | Player file page (02 PR1) | yes | yes | prev | yes | player_file_v1 | file/PlayerFile.tsx |
| CVP | S-LIST: list rows push to file (AC S-LIST 1..4) | partly | yes | rail only | partly | player_file_v1 | file/PlayerFile.tsx:344 |
| CVP | Back to CoachHelm (S-FILE 1) | yes | n/a | prev | yes (wrong label) | player_file_v1 | file/PlayerFile.tsx:129 |
| CVP | Rail of roster (S-FILE rail) | yes | yes | prev | yes | player_file_v1 | file/PlayerFile.tsx:335 |
| CVP | Coach / player lens (S-FILE lens) | yes | yes | prev | partly (disabled not aria-disabled) | player_file_v1 | file/PlayerFile.tsx:207-212 |
| CVP | Focus proposal + accept/decline (S-FILE focus) | yes | yes | prev | yes | player_file_v1 | file/cards.tsx |
| CVP | Undo dismissal (S-FILE undo) | partly | yes | prev | partly (older dismissals) | player_file_v1 | file/cards.tsx ~:440-470 |
| CVP | Read sheet, plan sheet, more, toast | yes | yes | prev | yes (CVP-6/9/10) | player_file_v1 | file/PlayerFile.tsx |
| CVP | Player "Your week" board (S-BOARD) | yes | yes | prev | partly | player_file_v1 | file/YourWeek.tsx |
| CVP | S-BOARD.focus Accept/Decline buttons | partly | yes | prev | partly (wrong proposal possible) | player_file_v1 | file/YourWeek.tsx:49-55 |
| CVP | Player board loading skeleton (06 §S-BOARD.loading) | no | n/a | n/a | no (old skeleton) | player_file_v1 | routes/coachhelm.tsx:336 |
| BRIEF | Monday brief view (`?view=brief`) | yes | yes | only via /intelligence when team board on | yes | monday_brief_v1 | views/CoachBrief.tsx |

Claimed features listed: 52. Not fully built (partly or no on any column): 36.

## Findings

### FID-TEAM-1 No Try again anywhere on the Team view in production
- Severity: P1
- Where: every failed part (Working on, Course, Spot, players/roster), phone|desktop, light|dark
- File: routes/coachhelm.tsx:85 (`<TeamBoard … />` has no `onRetry`); team/Cards.tsx WorkingCard and team/CourseCard.tsx gate the button on `onRetry`; team/TeamBoard.tsx:288-289 renders only `failedHole` when players or roster fail
- What's wrong: design draws "Couldn't load this part." with a Try again button on each failed card and on the board error. Code never passes `onRetry`, so the button never renders, and a players/roster failure leaves the whole body as a single failed hole with no way out but a reload.
- Should be: coachhelm-team 06 §S-TEAM.error and §S-TEAM.working.error / .course.error; RUBRIC "every error has a recovery"
- Fix: pass `onRetry={() => router.refresh()}` from the route (same as `ui/RefreshNotice` usage in CoachBoard), and render `ui/States` ErrorState with Try again in the players/roster failure branch
- Confidence: high

### FID-RC-1 Read summary card (S-READ-BOARD) only exists in the preview
- Severity: P1
- Where: coach board / Team view / player board, phone|desktop
- File: read/ReadSummaryCard.tsx (used only at preview/PreviewCoachHelmRead.tsx:21)
- What's wrong: the package specifies a read summary card on the host board that links into the read page. No production screen renders it. TeamBoard, CoachBoard and YourWeek never import it, so the read page is reachable only from the Team read sheet or a deep link.
- Should be: coachhelm-read 05 §S-READ-BOARD, 08 AC-READ-BOARD-01..04
- Fix: render `ReadSummaryCard` in CoachBoard's reads list and YourWeek's reads card behind `isReadEnabled()`, with `href` from the existing read href helper
- Confidence: high

### FID-RC-2 S-READ-BOARD actions row and dismissed state not built
- Severity: P1
- Where: S-READ-BOARD.actions, S-READ-BOARD.dismissed, phone|desktop
- File: read/ReadSummaryCard.tsx (no actions or dismissed branch)
- What's wrong: design gives the card an Assign + More row and a dismissed variant with Undo. Code renders a link card only.
- Should be: coachhelm-read 06 §S-READ-BOARD.actions, §S-READ-BOARD.dismissed
- Fix: add a footer using `ui/Button` (secondary "Assign") and a `ui/Menu` trigger; wire to `useFocusActions` assign and dismiss/undo
- Confidence: high

### FID-RC-3 Cleared, contradicted and under-review read states missing
- Severity: P1
- Where: read page, phone|desktop
- File: read/ReadPage.tsx (no lifecycle branch); read data shape has no lifecycle field
- What's wrong: design draws three lifecycle states with their own headline chip and copy. Code has no reference to any of them; a cleared read falls through to CH-13861 "no longer open".
- Should be: coachhelm-read 06 §S-READ.cleared, .contradicted, .review; 08 AC-READ-10..12
- Fix: add a `lifecycle` field to the read shape, branch in ReadPage, reuse `ui/Badge` for the chip and `ui/States` for the body
- Confidence: high

### FID-CVP-1 S-LIST push from the board rows into the player file not built
- Severity: P1
- Where: Team view players, Coach board players, phone|desktop
- File: none on team/TeamBoard.tsx or CoachBoard.tsx; only file/PlayerFile.tsx:344 rail rows carry `data-ch-hf-open`
- What's wrong: design says every player row on the board pushes into the player file. On the Team view the file is reachable only via the PlayerPanel link "Open {first}'s page" (team/panels.tsx:240); on the Coach board not at all.
- Should be: coachhelm-lenses 06 §S-LIST, 08 S-LIST 1..4
- Fix: wrap board player rows in a `Link` to `playerFileHref(id)` when `fileOn`, reusing the rail row markup
- Confidence: high

### FID-TEAM-2 Switch reads "Board / Ask" once you are on Ask
- Severity: P1
- Where: Ask view entered from the Team view, phone|desktop, light|dark
- File: chat/Ask.tsx:78, :343; chat/AskSkeleton.tsx:21 (`<CoachHelmTabs … />` without `boardLabel`); chat/SubTabs.tsx:21 default `'Board'`
- What's wrong: the Team view labels its segment "Team" (team/TeamBoard.tsx:198). Switch to Ask and the same segment relabels itself "Board". The control changes its words under the coach's finger.
- Should be: coachhelm-team 06 §S-TEAM switch "Team | Ask"; 08 AC-TEAM-09
- Fix: pass `boardLabel={isTeamBoardEnabled() ? 'Team' : 'Board'}` from the route into Ask and AskSkeleton (and CoachHelmSkeleton.tsx:71)
- Confidence: high

### FID-TEAM-3 Desktop context line hidden; scope text and switch not in the glass bar
- Severity: P1
- Where: Team view header, desktop, light|dark
- File: styles/shell.css:4387-4391 (`@media (min-width:821px){ .ch-large-title__context{display:none} }`); team/TeamBoard.tsx:369-373
- What's wrong: design desktop puts "Varsity · 5 players · this season" as scope text in the glass top bar with the switch at 180×34 beside it (redesign/coachhelm-team.html :1028). Code puts the context line under LargeTitle, then the global rule hides it, so desktop shows no scope at all, and the switch sits in the deskhead.
- Should be: coachhelm-team redesign/coachhelm-team.html desktop top bar; 06 §S-TEAM header (desktop)
- Fix: scope the global hide away from `.ch-htb` (`.ch-htb .ch-large-title__context{display:block}`) or move the scope string into the shell top bar slot; owner decision on switch placement (see report)
- Confidence: high

### FID-TEAM-4 Track record never shows its big figure
- Severity: P1
- Where: Track record card, phone|desktop, light|dark
- File: team/Cards.tsx:186-189 (renders `<span>{r.program}</span>` only); styles/coachhelm-team.css:1011 styles a `<b>` that is never rendered
- What's wrong: design leads with "{held} of {checked}" at 34/500 then the sentence. Code shows only the long sentence.
- Should be: coachhelm-team 08 AC-RECORD-01; 06 §S-TEAM.record
- Fix: render `<b>{r.held} of {r.checked}</b>` before the sentence; the CSS is already there
- Confidence: high

### FID-TEAM-5 Read sheet says "Assigning… / Assigned as {first}'s focus"; design says propose
- Severity: P1
- Where: Team read sheet / panel, propose action, phone|desktop
- File: team/panels.tsx ReadPanel (`FocusActions where="board"`)
- What's wrong: design: busy "Proposing", done row 42 tall reading "Proposed to {first} · now in Working on". Code: busy "Assigning…", done chip "Assigned as {first}'s focus". Wrong verb (the player accepts or declines, so the coach proposes) and wrong shape (chip vs row).
- Should be: coachhelm-team 06 §S-TEAM.read-sheet.proposed; coachhelm-lenses 06 §S-FILE focus (propose / accept)
- Fix: add a `where="team"` copy set to FocusActions or pass labels; render the done state as a 42px row inside `ui/Surface`
- Confidence: high

### FID-TEAM-6 Story viewer does not pause on keyboard focus and has no focus trap
- Severity: P1
- Where: Story viewer, phone, light|dark
- File: team/Stories.tsx StoryViewer (pause wired to pointer hold only)
- What's wrong: auto-advancing content pauses only on press-and-hold. Keyboard or switch users cannot stop it, and Tab leaves the viewer while it keeps advancing.
- Should be: coachhelm-team 08 AC-STORY-05; WCAG 2.2.2 Pause, Stop, Hide
- Fix: pause on `focusin`/resume on `focusout`, add a Pause button, trap focus as `ui/Modal` does
- Confidence: high

### FID-TEAM-7 Story action reloads the whole page instead of opening the read in place
- Severity: P1
- Where: Story viewer / desk panel action, phone|desktop
- File: team/TeamBoard.tsx:194 (`else window.location.assign(s.href)`); action labels "Open the read", "See Working on", "Open this" in team/Stories.tsx
- What's wrong: design opens the read sheet over the board. Code does a full document navigation, losing board state and the transition, and uses generic labels.
- Should be: coachhelm-team 06 §S-STORY.action
- Fix: route story actions through the same `openRead(id)` the hole coins use; use `router.push` for non-read targets; use the spec's labelled verbs
- Confidence: high

### FID-RC-4 Reads rail player switcher leaves the read page
- Severity: P1
- Where: Reads rail, desktop, coach
- File: read/ReadsRail.tsx:19-31 (links to `coachBoardFor(p.id)`)
- What's wrong: design: a 34-tall segmented switcher that swaps whose reads the rail lists, staying on the read page. Code: links that navigate to the coach board. Extends RC-4 (clipping).
- Should be: coachhelm-read 06 §S-READ.rail
- Fix: replace with `ui/Segmented` (size 34) driving local state; link rows to that player's read hrefs
- Confidence: high

### FID-CVP-2 Your week feature card can show Accept / Decline for an unrelated proposal
- Severity: P1
- Where: Player board S-BOARD.focus, phone|desktop
- File: file/YourWeek.tsx:49 (`proposal = list.find(title match) ?? data.proposals.list[0]`)
- What's wrong: when no proposal matches the feature's title the fallback picks the first proposal, so the player accepts something other than what the card describes.
- Should be: coachhelm-lenses 06 §S-BOARD.focus (buttons act on the shown focus)
- Fix: match by id, drop the `?? list[0]` fallback, and hide the buttons when nothing matches
- Confidence: high

### FID-CVP-3 Undoing an older dismissal does nothing visible
- Severity: P1
- Where: Player file Reads card, dismissed row, phone|desktop
- File: file/cards.tsx ReadsCard ~:440-470 (server-dismissed rows have `x.ins` null; undo passes playerId `''` and a fake ChInsight; success only clears local state)
- What's wrong: the row stays "Dismissed" until a reload, and the call is made with an empty player id.
- Should be: coachhelm-lenses 08 S-FILE undo
- Fix: carry `playerId` and insight id on server-dismissed rows; on success refresh the row from the response
- Confidence: medium

### FID-TEAM-8 Context line says "1 players" and counts stale reads as open
- Severity: P2
- Where: Team view header, phone
- File: team/TeamBoard.tsx:199; data/coachhelm-team-shape.ts:168 (`readsDrawn` counts every need and working read)
- What's wrong: fixed plurals give "1 players · 1 rounds · 1 open reads". Stale reads are counted as open.
- Should be: 06 §S-TEAM header; DESIGN_LANGUAGE copy rules
- Fix: use the existing plural helper; exclude stale from `readsDrawn`
- Confidence: high

### FID-TEAM-9 Team/Ask switch dimensions off spec
- Severity: P2
- Where: switch, phone|desktop, light|dark
- File: ui/Segmented via styles/controls.css:4-37
- What's wrong: design 41 tall, padding 3, radius 12, segments 35 tall radius 9, 15/500. Code padding 4, radius 16, segments 30 tall radius 12, 13px medium.
- Should be: coachhelm-team 06 §S-TEAM switch
- Fix: add a `size="lg"` variant to `ui/Segmented` with those values; do not fork
- Confidence: high

### FID-TEAM-10 Desktop panel padding 20 vs 22; phone sheet bottom 48 vs 72
- Severity: P2
- Where: desktop body, phone sheet
- File: styles/coachhelm-team.css:1708 (`.ch-htb-desk{padding:20px 24px 40px}`), :1702 (`calc(48px + env(safe-area-inset-bottom))`)
- What's wrong: design 22 24 40 on desktop, 6 16 72 on the phone sheet.
- Should be: coachhelm-team 06 §S-TEAM layout
- Fix: change to 22px top and 72px bottom; keep the safe-area term
- Confidence: high

### FID-TEAM-11 Course sheet missing story link and per-row delta
- Severity: P2
- Where: Course sheet, phone|desktop
- File: team/panels.tsx CourseSheet
- What's wrong: no "Read the story from {when}" link (AC-CSHEET-05); rows lack the "1.6 over / 0.4 under / Level" delta (AC-CSHEET-04). The raw date (TEAM-21) is separate.
- Should be: coachhelm-team 08 AC-CSHEET-04, -05
- Fix: add the delta with U+2212-free words per spec, and a `ui/Button` ghost link to the story
- Confidence: high

### FID-TEAM-12 Story desk panel header has no coin
- Severity: P2
- Where: Story desk panel, desktop
- File: team/Stories.tsx:299-318
- What's wrong: design header leads with the player coin; code shows text only.
- Should be: coachhelm-team 08 AC-STORYDESK-01
- Fix: render `ui/Avatar` size 28 before the name
- Confidence: high

### FID-TEAM-13 One-slot stations show only "+N", hiding every initial
- Severity: P2
- Where: Hole, tee and short game with 2+ players
- File: team/hole-geometry.ts:52-64 (tee 1, short_game 1 slot); team/TeamHole.tsx:93
- What's wrong: with 2 players at tee only a "+2" coin draws. 08 says up to 3 coins then "+N"; 05 says 5.
- Should be: coachhelm-team 08 AC-HOLE-05 (owner to settle 3 vs 5)
- Fix: give each station at least 3 slots and lay out the overflow coin after them
- Confidence: high

### FID-TEAM-14 "No Tour figure for single holes" shows on every read without a Tour figure
- Severity: P2
- Where: Read sheet
- File: team/panels.tsx:68
- What's wrong: the line is meant for single-hole reads only; code shows it for any read lacking a Tour figure.
- Should be: coachhelm-team 06 §S-TEAM.read-sheet
- Fix: gate on `read.scope === 'hole'`
- Confidence: medium

### FID-TEAM-15 Read sheet "Ask about this" uses secondary, design says ghost; Modal titled "Details"
- Severity: P2
- Where: Read sheet, phone
- File: team/panels.tsx ReadPanel; team/TeamBoard.tsx:380
- What's wrong: button variant secondary vs ghost; sheet title "Details" vs the read's own headline.
- Should be: coachhelm-team 06 §S-TEAM.read-sheet
- Fix: `variant="ghost"`; pass the read title to `ui/Modal`
- Confidence: high

### FID-TEAM-16 Spot rows include players with no figure; failed spot has no retry
- Severity: P2
- Where: Spot card
- File: team/SpotCard.tsx
- What's wrong: rows draw for players with no figure (AC-SPOT-02 says "with a figure"); "Couldn't load this part." has no Try again.
- Should be: coachhelm-team 08 AC-SPOT-02; 06 §S-TEAM.spot.error
- Fix: filter null figures; add the retry with FID-TEAM-1
- Confidence: high

### FID-TEAM-17 Huddle draws missing stations on the Tour line
- Severity: P2
- Where: Huddle chart
- File: team/Huddle.tsx:39-40
- What's wrong: a null station average is treated as 0, so it sits exactly on Tour, reading as "level".
- Should be: coachhelm-team 06 §S-TEAM.huddle (missing = no mark)
- Fix: skip null points and break the line
- Confidence: high

### FID-TEAM-18 Rungs with no bar render an empty track
- Severity: P2
- Where: Track record rungs
- File: team/Cards.tsx RecordCard (`t is-none`)
- What's wrong: an empty grey track draws where design shows "—".
- Should be: coachhelm-team 06 §S-TEAM.record; number format rule "—"
- Fix: render "—" in place of the track
- Confidence: medium

### FID-TEAM-19 Team view and Your week main lack the view-switch enter hook
- Severity: P2
- Where: Team view, Your week, phone|desktop
- File: team/TeamBoard.tsx:360; file/YourWeek.tsx:39, :68
- What's wrong: `<main>` does not spread `{...sw.enter}`, so the cross-fade CoachBoard and Ask get does not run here. Timing values are for motion.md.
- Should be: coachhelm-team 07 view switch
- Fix: spread `sw.enter` on both `<main>` elements
- Confidence: high

### FID-TEAM-20 Course card renders both layouts into the DOM
- Severity: P2
- Where: Course card, phone|desktop
- File: team/CourseCard.tsx; styles/coachhelm-team.css:1772
- What's wrong: both trees mount, and CSS hides one. Screen readers on some engines and find-in-page see both.
- Should be: BUILD_BRIEF one tree per breakpoint
- Fix: pick the layout from the existing `phone` flag
- Confidence: high

### FID-TEAM-21 Dead `.lt h2` rule
- Severity: P2
- Where: header
- File: styles/coachhelm-team.css:94
- What's wrong: `ui/LargeTitle` renders `h1`/`p.ch-large-title`; the `h2` rule never applies, so the title is styled by defaults only.
- Should be: tokens via LargeTitle
- Fix: delete the rule or retarget `.ch-large-title`
- Confidence: high

### FID-TEAM-22 Brief unreachable from the Team view
- Severity: P2
- Where: Team view, phone|desktop
- File: routes/coachhelm.tsx:85 (no `briefHref` / `trackRecordHref`, while :86 passes both to CoachBoard)
- What's wrong: with the team board on, nothing in CoachHelm links to the Brief; it is reached only via /intelligence.
- Should be: coachhelm-team 02 (Brief entry kept from board)
- Fix: pass both hrefs and render them where CoachBoard does; owner decision on whether the Brief belongs in the switch
- Confidence: high

### FID-TEAM-23 Brief frame differs from Team, and its skeleton jumps
- Severity: P2
- Where: Brief, phone|desktop
- File: views/CoachBrief.tsx:25-50; styles/coachhelm.css:55; routes/coachhelm.tsx:301-306
- What's wrong: desktop title is a serif 52px `h1.ch-hl-h__t`, not `ui/LargeTitle` as on Team. No switch. Loading fallback `CoachHelmSkeleton view="coach"` draws a Board/Ask strip the loaded page does not have, so the frame jumps.
- Should be: DESIGN_LANGUAGE one header system; no design in my packages (missing in design)
- Fix: use LargeTitle on desktop too; add a Brief skeleton matching its frame
- Confidence: high

### FID-RC-5 Thrown feed uses CH-13866; spec says CH-13860
- Severity: P2
- Where: Read page error
- File: read/ReadPage.tsx:91 (test at read/__tests__/read-page.test.tsx:152-155 asserts the wrong code)
- What's wrong: code CH-13866 vs spec CH-13860.
- Should be: coachhelm-read 06 §S-READ.error
- Fix: change the code and the test
- Confidence: medium (the test was written deliberately; confirm with owner)

### FID-RC-6 Part-failure banner only at 2+ failures, above the headline, middle sentence dropped
- Severity: P2
- Where: Read page partial
- File: read/ReadPage.tsx:107-118
- What's wrong: design shows the notice when any part fails, below the headline, with three sentences. Code needs ≥2, places it above, and drops the middle sentence.
- Should be: coachhelm-read 06 §S-READ.partial
- Fix: threshold 1, move under ReadHeadline, restore copy; use `ui/RefreshNotice`
- Confidence: high

### FID-RC-7 Dismissed notice inside the Do card, and stance chip never says "Dismissed"
- Severity: P2
- Where: Read page dismissed
- File: read/cards.tsx:33-70 (ReadHeadline), DoCard
- What's wrong: design puts the notice at the top and switches the chip to "Dismissed". Code nests the notice in DoCard and the chip keeps its stance.
- Should be: coachhelm-read 06 §S-READ.dismissed
- Fix: lift the notice above the headline; add a dismissed chip state to `ui/Badge` usage
- Confidence: high

### FID-RC-8 How sure word in meta style, spec 20/1.1/600
- Severity: P2
- Where: Read page How sure
- File: read/cards.tsx (How sure block)
- What's wrong: rendered at meta size/weight vs 20px, line height 1.1, weight 600.
- Should be: coachhelm-read 06 §S-READ.sure
- Fix: use the title3 type token
- Confidence: medium

### FID-RC-9 Hand-drawn icon button
- Severity: P2
- Where: Read page header
- File: read/ReadPage.tsx:153 (`.ib`)
- What's wrong: bespoke button with its own size and focus ring instead of the kit's icon button.
- Should be: DESIGN_LANGUAGE components from ui/
- Fix: `ui/Button` icon variant
- Confidence: high

### FID-RC-10 Practice link never wired
- Severity: P2
- Where: Read page Do card
- File: read/ReadPage.tsx:126 (`practiceHref={null}`)
- What's wrong: Do card's practice link never renders; no href source exists.
- Should be: coachhelm-read 08 AC-READ-06 (allowed to be absent until practice-plan ships, but it is a claimed feature not built)
- Fix: pass the practice-plan href once that lane's route is live
- Confidence: high

### FID-CVP-4 File back label "Back"; spec "CoachHelm"
- Severity: P2
- Where: Player file header, phone|desktop
- File: file/PlayerFile.tsx:129, :329
- What's wrong: wrong word.
- Should be: coachhelm-lenses 08 S-FILE 1
- Fix: label "CoachHelm"
- Confidence: high

### FID-CVP-5 Lens Accept / Decline use disabled
- Severity: P2
- Where: Player file lens, phone|desktop
- File: file/PlayerFile.tsx:207-212
- What's wrong: `disabled` drops the buttons from tab order and silences them; spec says aria-disabled with an explanation.
- Should be: coachhelm-lenses 08 S-FILE lens
- Fix: `aria-disabled` plus `aria-describedby` on `ui/Button`
- Confidence: high

### FID-CVP-6 Your week feature card uses ProposalRow, not the designed buttons
- Severity: P2
- Where: S-BOARD.focus
- File: file/YourWeek.tsx:53-55
- What's wrong: the card nests a list-style ProposalRow; design has two buttons on the card.
- Should be: coachhelm-lenses 06 §S-BOARD.focus
- Fix: render `ui/Button` primary Accept + secondary Decline
- Confidence: high

### FID-CVP-7 Player board loading uses the old board skeleton
- Severity: P2
- Where: Player board loading
- File: routes/coachhelm.tsx:336 (`viewSkeleton('board')`)
- What's wrong: skeleton shape does not match Your week, so the page jumps.
- Should be: coachhelm-lenses 06 §S-BOARD.loading
- Fix: add a YourWeek skeleton with the same blocks
- Confidence: high

### FID-CVP-8 File rail drawn whenever roster is present, and dead `void isEarly`
- Severity: P2
- Where: Player file desktop, player lens
- File: file/PlayerFile.tsx:335, :270
- What's wrong: the rail of other players draws in any lens when roster exists; spec has it on the coach lens only. `void isEarly` is dead code for an early state never drawn.
- Should be: coachhelm-lenses 06 §S-FILE.rail
- Fix: gate on coach lens; remove or implement the early state
- Confidence: medium
