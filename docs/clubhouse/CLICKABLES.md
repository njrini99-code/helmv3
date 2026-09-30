# Clubhouse clickable inventory: the v2 boards against the built Clubhouse

Compiled 2026-09-30 on branch `agent/clubhouse` at `96445d13a`, from a read of the working tree.
The owner's rule for this list: "if a button in the design UI leads to nothing, then build it."

**What was read.** Only the v2 boards in `design/handoff/` (`Coach - *.html`, `Player - *.html`,
`Coach and Player - *.html`, each with the `.jsx` and `.js` it loads and the empty and loading
states in `gh-states.jsx`), against `src/clubhouse/screens/**`, `shell/**`, `routes/**`, `data/**`
and the server actions they call. The v1 boards (`Coach Home v3.html`, `Calendar.html`,
`Messages.html`, `Roster.html`, `Stats.html`, `Qualifiers.html`, `mobile/`) and `Index.html` were
left out on purpose (`design/handoff/VERSIONS.md`). Decisions were read from
`docs/clubhouse/PROGRESS.md` (D-n, Q-n, Data gaps), the catalogs, the phone specs, the page docs
under `docs/clubhouse/pages/`, `ROUNDS_PLAN.md` and the held-feature docs.

**How a row was judged.** Every control on a board got a row. A `works` row cites the file and line
of the handler or link that was opened and read (the citation lines were checked to exist, and a
sample of about 50 were re-read by hand and matched their claims); it is not inferred from a name, a catalog row or the
generated action map, which is partly stale. The board scaffolding (state switchers, the iOS
frame, frame labels) is not a product control and is skipped; each board says what it skipped.
Loading skeletons, sidebar section labels, identity blocks and crumbs are not clickable, so they have no rows; the one
finding among them (Stats has no phone-shaped skeleton) is in the Stats notes.
Where a board draws a button with no handler of its own, the row says "no handler on the board"
and is judged the same way.

**Statuses.** `works` built and does what the board implies. `hidden-until-rebuilt` not drawn
because its destination is not rebuilt for that role (`rebuiltHref` returns null). `decided`
dropped, held or changed by a recorded decision (D-n, Q-n, catalog or spec line). `data-gap` cannot
be honest without data or a schema change. `GAP` drawn on the board but missing or wrong in
Clubhouse, with no decision or data reason on record. Tags in a Note: `[preview-only]` the screen
is built but reachable only in `/clubhouse-preview/...` (Q-78); `[no-phone-build]` no phone
layout exists (none was found).

**Not on the boards, so not here.** There is no v2 Settings board (see the Settings section).
Calendar, Messages, Stats and Qualifiers have no v2 player board; players use the same built screens
with the permissions players already have (D-1, D-66).

**Line numbers** are from the working tree at `96445d13a`. Other sessions were editing
`src/clubhouse/screens/roster`, `settings` and CoachHelm docs at the same time, so a cited line
can be a few lines off in those files; the file and the symbol are right.

## Counts, per page

Every page in the requested order was reached; nothing was left out.

| Page | Boards | Rows | `works` | `hidden-until-rebuilt` | `decided` | `data-gap` | `GAP` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home, coach | 2 | 25 | 17 | 0 | 5 | 0 | 3 |
| Home, player | 2 | 15 | 8 | 5 | 0 | 0 | 2 |
| Roster | 2 | 48 | 37 | 0 | 8 | 1 | 2 |
| Stats, team and player | 2 | 24 | 21 | 0 | 2 | 0 | 1 |
| Calendar | 2 | 86 | 72 | 0 | 9 | 0 | 5 |
| Messages | 2 | 66 | 46 | 0 | 15 | 1 | 4 |
| Team Hub | 3 | 58 | 40 | 0 | 6 | 0 | 12 |
| Qualifiers | 2 | 47 | 45 | 0 | 2 | 0 | 0 |
| Rounds | 4 | 154 | 14 | 8 | 128 | 0 | 4 |
| CoachHelm | 3 | 24 | 17 | 0 | 5 | 0 | 2 |
| Classes | 2 | 61 | 47 | 0 | 14 | 0 | 0 |
| Settings (no v2 board) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Shell | 4 | 58 | 40 | 0 | 12 | 0 | 6 |
| **All pages** | 30 | **666** | **404** | **13** | **206** | **2** | **41** |

`hidden-until-rebuilt`: 13 rows, all held by one thing, round entry (Q-78, below).
Of the `decided` rows, 121 are Rounds setup and shot tracking controls that are built
and work in `/clubhouse-preview/setup` and `/clubhouse-preview/track`, and are held there by Q-78
until the round engine move gives them a product route; they are one item, not 121.
Rounds' `works` count is low for the same reason. Rows tagged `[no-phone-build]`: 0.

Per board:

| Page | Board | Rows | `works` | `hidden-until-rebuilt` | `decided` | `data-gap` | `GAP` |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home, coach | `Coach - Home.html` (desktop) | 11 | 7 | 0 | 3 | 0 | 1 |
| Home, coach | `Coach - Home - Mobile.html` (phone) | 14 | 10 | 0 | 2 | 0 | 2 |
| Home, player | `Player - Home.html` (desktop) | 8 | 4 | 3 | 0 | 0 | 1 |
| Home, player | `Player - Home - Mobile.html` (phone) | 7 | 4 | 2 | 0 | 0 | 1 |
| Roster | `Coach - Roster.html` (desktop) | 31 | 26 | 0 | 2 | 1 | 2 |
| Roster | `Coach - Roster - Mobile.html` (phone) | 17 | 11 | 0 | 6 | 0 | 0 |
| Stats, team and player | `Coach - Stats.html` (desktop) | 17 | 15 | 0 | 1 | 0 | 1 |
| Stats, team and player | `Coach - Stats - Mobile.html` (phone) | 7 | 6 | 0 | 1 | 0 | 0 |
| Calendar | `Coach - Calendar.html` (desktop) | 67 | 59 | 0 | 3 | 0 | 5 |
| Calendar | `Coach - Calendar - Mobile.html` (phone) | 19 | 13 | 0 | 6 | 0 | 0 |
| Messages | `Coach - Messages.html` (desktop) | 31 | 22 | 0 | 5 | 1 | 3 |
| Messages | `Coach - Messages - Mobile.html` (phone) | 35 | 24 | 0 | 10 | 0 | 1 |
| Team Hub | `Coach - Team Hub.html` (desktop) | 24 | 16 | 0 | 3 | 0 | 5 |
| Team Hub | `Player - Team Hub.html` (desktop) | 5 | 4 | 0 | 0 | 0 | 1 |
| Team Hub | `Coach and Player - Team Hub - Mobile.html` (phone) | 29 | 20 | 0 | 3 | 0 | 6 |
| Qualifiers | `Coach - Qualifiers.html` (desktop) | 24 | 23 | 0 | 1 | 0 | 0 |
| Qualifiers | `Coach - Qualifiers - Mobile.html` (phone) | 23 | 22 | 0 | 1 | 0 | 0 |
| Rounds | `Player - Rounds.html` (desktop), part A: library, course picker, add a course, setup | 38 | 3 | 4 | 30 | 0 | 1 |
| Rounds | `Player - Rounds - Mobile.html` (phone), part A: library, course picker, add a course, setup | 37 | 3 | 4 | 29 | 0 | 1 |
| Rounds | `Player - Rounds.html` (desktop), part B: shot tracking, hole complete, submit, review | 39 | 4 | 0 | 34 | 0 | 1 |
| Rounds | `Player - Rounds - Mobile.html` (phone), part B: shot tracking, hole complete, submit, review | 40 | 4 | 0 | 35 | 0 | 1 |
| CoachHelm | `Coach - CoachHelm.html` (desktop) | 8 | 6 | 0 | 1 | 0 | 1 |
| CoachHelm | `Player - CoachHelm.html` (desktop) | 4 | 3 | 0 | 1 | 0 | 0 |
| CoachHelm | `Coach and Player - CoachHelm - Mobile.html` (phone) | 12 | 8 | 0 | 3 | 0 | 1 |
| Classes | `Player - Classes.html` (desktop) | 31 | 24 | 0 | 7 | 0 | 0 |
| Classes | `Player - Classes - Mobile.html` (phone) | 30 | 23 | 0 | 7 | 0 | 0 |
| Shell | Coach desktop shell (same wiring on every `Coach - *.html`; read from `Coach - Home.html`) | 20 | 15 | 0 | 3 | 0 | 2 |
| Shell | Player desktop shell (same wiring on every `Player - *.html`; read from `Player - Home.html`) | 12 | 9 | 0 | 2 | 0 | 1 |
| Shell | Coach phone shell (tab bar, More sheet, top bars; read from `Coach - Home - Mobile.html` and the other coach phone boards) | 18 | 11 | 0 | 6 | 0 | 1 |
| Shell | Player phone shell (tab bar, top bars; read from `Player - Home - Mobile.html` and the other player phone boards) | 8 | 5 | 0 | 1 | 0 | 2 |

## The GAP list, ranked by how often a real coach or player would hit it

41 GAP rows, 24 items once a control that appears on both the desktop and phone
boards, or in both roles, is counted once. Ranked by my own read of how often the control is met in
a normal week (the units' own Reach labels were calibrated separately and are in each row's Note).
The "Where" column is the file to build in.

| # | Control | Page and boards (rows) | Why it ranks here | Where to build |
| ---: | --- | --- | --- | --- |
| 1 | **Built 2026-09-30** · Notifications bell on the phone tab roots | Shell, phone: CoachHelm (coach); CoachHelm, Rounds, Team Hub (player) (2) | Every phone session: a player has no bell on 3 of their 4 tabs and a coach none on CoachHelm; the bell is how notifications are reached on a phone | `src/clubhouse/shell/TopBar.tsx` and `src/clubhouse/styles/shell.css:812` (keep the bell for a `start` PhoneTop; callers `CoachBoard.tsx:259`, `PlayerBoard.tsx:51`, `RoundsLibrary.tsx:99`, `TeamHub.tsx:270`) |
| 2 | **Built 2026-09-30** · Open recap (coach phone sheet: Round recap) opens the round review, not Stats | Home, coach desktop and phone; Home, player desktop and phone (4) | The latest-round card is on every Home visit for both roles. The round review is now rebuilt for both roles (`nav.ts:140-141`), which is the condition Q-66 and Q-69 waited on | `src/clubhouse/screens/home/LatestRound.tsx` (coach `:167`, player `:159-163`), `HomePhone.tsx:399`, `PlayerHomePhone.tsx:180-183`; link `rebuiltHref(/golf/dashboard/rounds/<id>)`, Stats as the fallback |
| 3 | **Built 2026-09-30** · Team Hub unread count on the player sidebar item and the tab | Shell, player desktop and phone (2) | Shown in every player session; the only cue that an announcement, task or trip is waiting. The counts already exist in `notification-badge-context.tsx:15` | `src/clubhouse/shell/nav.ts` (a `hub` badge), `Sidebar.tsx:12`, `TabBar.tsx:96` |
| 4 | **Built 2026-09-30** · Schedule 1:1 | Roster, coach desktop player panel; Stats, coach desktop player hero (2) | Opened whenever a coach looks at a player; the Calendar seed `?new=1&with=<id>` already exists (D-52) and the phone Roster profile uses it | `src/clubhouse/screens/roster/RosterPeek.tsx:104`, `src/clubhouse/screens/stats/StatsPlayer.tsx:182-195` (as `RosterProfile.tsx:35`) |
| 5 | Attach from Documents in New announcement | Team Hub, coach desktop and phone (2) | Waiver, itinerary and packing-list posts; the action already takes `documentIds` (`announcements.ts:650`) and Clubhouse sends `[]` | `src/clubhouse/screens/hub/sheets.tsx` (ComposeSheet document picker), `writes.ts:57` |
| 6 | **Built 2026-09-30** (as Team stats, Q-79) · "All" link on the phone Latest rounds header | Home, coach phone (1) | A daily-glance section on the coach phone with a header link that goes nowhere; a coach has no Rounds library, so the destination is a choice (Team stats is the nearest) | `src/clubhouse/screens/home/HomePhone.tsx:342-344` |
| 7 | **Built 2026-09-30** · Tap a score cell in the round review to select that hole | Rounds review, desktop and phone (2) | Used on each round a player reviews; hole numbers already select, the board makes the score row the target | `src/clubhouse/screens/rounds/RoundReview.tsx:76` |
| 8 | Trip travelers: the "Pinehurst travelers" audience chip and the "Who's traveling" picker | Team Hub, coach desktop and phone (4) | Once per trip a coach posts to travelers and picks them; needs an `event_id` on `ChTripInput` (`writes.ts:31-43`) and an invitee write | `src/clubhouse/screens/hub/sheets.tsx:181-186` (chip) and `:296-331` (TripSheet), `src/clubhouse/data/hub.ts:309-337` |
| 9 | Duplicate (event More menu) | Calendar, coach desktop (1) | Coaches repeat practice setups; listed as "not built" with no data reason (`PROGRESS.md:406`) | `src/clubhouse/screens/calendar/inspector.tsx:385-390`, seed in `editor.tsx` |
| 10 | Thread-header calendar icon opens the event editor, labelled Schedule | Messages, coach desktop (1) | Coach, occasional; today it opens the Calendar page. D-47 and the phone tile already do `?new=1` | `src/clubhouse/screens/messages/MessagesView.tsx:940` and `:1002` |
| 11 | Edit an announcement (pencil) | Team Hub, coach desktop and phone (2) | Fixing a typo or a time in a posted announcement; the only record of dropping it is an implementer non-goal, and `updateAnnouncement` exists (`announcements.ts:1442`) | `src/clubhouse/screens/hub/parts.tsx:138-149`, `sheets.tsx` |
| 12 | Assign as focus on a strength | CoachHelm, coach desktop and phone (2) | Strengths sort last; the button is hidden with no record of why (`CoachBoard.tsx:217`) | `src/clubhouse/screens/coachhelm/CoachBoard.tsx:217` |
| 13 | Shared files in the desktop Messages Details panel | Messages, coach desktop (1) | Secondary panel; the phone already has it (`MessagesPhone.tsx:666`, `getGolfConversationFiles`, D-48) | `src/clubhouse/screens/messages/MessagesView.tsx` (Details, `:1321-1442`) |
| 14 | Attach (+) in the phone New message composer | Messages, coach phone (1) | A first message with a file; the thread composer has it | `src/clubhouse/screens/messages/MessagesPhone.tsx:911-932` |
| 15 | Print week (Calendar More menu) | Calendar, coach desktop (1) | Occasional; `window.print` plus print CSS | `src/clubhouse/screens/calendar/Calendar.tsx` (`moreItems`), `src/clubhouse/styles/calendar.css` |
| 16 | View insights (Roster row menu) | Roster, coach desktop List view (1) | List view only, first menu item; needs CoachHelm to accept a player (`routes/coachhelm.tsx:25`) | `src/clubhouse/screens/roster/Roster.tsx:180` |
| 17 | Compare schedules (class detail footer) | Calendar, coach desktop (1) | Coach only, from a class block | `src/clubhouse/screens/calendar/inspector.tsx:479-515` |
| 18 | Task untick | Team Hub, player desktop and phone (2) | An accidental tick; needs an uncomplete action (`tasks.ts` has none) | `src/clubhouse/screens/hub/parts.tsx:341`, `src/app/golf/actions/tasks.ts` |
| 19 | Repeat choice when editing a one-off event | Calendar, coach desktop (1) | Turning an event into a series is rare; needs a server path (`updateGolfEvent` cannot make a series) | `src/clubhouse/screens/calendar/editor.tsx:449` |
| 20 | Per-page settings gear (CoachHelm settings, Team Hub settings) | Shell, coach desktop (2) | A secondary icon; CoachHelm already has its own Open CoachHelm settings link | `src/clubhouse/shell/TopBar.tsx:53` (`settings/model.ts:17` has the section ids) |
| 21 | Close (x) on the Calendar jump panel | Calendar, coach desktop (1) | Esc and an outside click already close it | `src/clubhouse/screens/calendar/Calendar.tsx:40-41` |
| 22 | Back in the trip builder | Team Hub, coach desktop and phone (2) | Only matters if the sheet becomes the board's four steps | `src/clubhouse/screens/hub/sheets.tsx:287` |
| 23 | Right-click a bubble opens the reaction bar | Messages, coach desktop (1) | Unlabelled gesture; the React button does the same | `src/clubhouse/screens/messages/MessagesView.tsx:568` |
| 24 | Closing Add a course reopens the course picker `[preview-only]` | Rounds setup, player desktop and phone (2) | Reached only once round entry has a product route (Q-78) | `src/clubhouse/screens/rounds/setup/RoundSetup.tsx:374` |

## Not a GAP, but the biggest thing still not reachable: round entry (Q-78)

- A player cannot start or continue a round in Clubhouse. New round, Continue, Start a round (idle
  card, empty state, and on Home the header and first-run) and Post a round are
  `hidden-until-rebuilt`: `/golf/dashboard/rounds/new` and `/rounds/continue/<id>` are not in
  `CH_REBUILT_ROUTES` or `CH_REBUILT_PATTERNS` (`src/clubhouse/shell/nav.ts:123`, `:141`). CoachHelm's
  empty state says Open Rounds instead. The setup and shot-tracking screens exist and are built to
  the board, but mount only in the preview. `docs/clubhouse/ROUNDS_PLAN.md` steps 3 to 5 and Q-78
  hold this. To follow the owner's rule, give the engine a Clubhouse renderer (the ports and
  `start(form)`) and add the two routes to `nav.ts`. Every `[preview-only]` row and every Start a
  round or Post a round row then flips together, and the N shortcut on player Home needs a handler.
- The library and the round review are live for players; the review is also live for coaches.

## Decided rows the owner's "build it" rule may reopen

These are drawn on a board, absent in Clubhouse, and covered by a record; each is a call for the
owner, so none is a GAP above. Grouped by record.

- **Top-bar search field and the ⌘K hint** (every desktop board): hidden until it has a spec
  (`PROGRESS.md:387`); the board's own `onSearch` is a no-op, so there is no behaviour to copy.
- **Messages Details** (D-48, Q-53 to Q-63): Call (minors' numbers), in-thread Search, Only coaches
  can post, Edit group, Delete chat, and the thread event card; Pinned and the travel squad quick
  group also. Several need a column, a policy or an action change first.
- **Team Hub compose and trips** (Q-70): Pin to the top (no column), Schedule (the action has no
  publish time), the Rooms editor.
- **CoachHelm** Share with {first name}: an unnumbered open owner question
  (`docs/clubhouse/phone/coachhelm.md:34`), so it has no Q-n to answer yet.
- **Classes** (Q-75, `phone/classes.md`): the Sync calendar button (needs a sync timestamp), the
  pencil on an imported row, Share class times with coach (no column).
- **Calendar** phone (Q-67), D-11, D-12: Message invitees, the compact New event form, Workout type,
  the competition-only feed.
- **Roster** status pill popover (Q-1, the availability migration is written and unapplied).
- **Home and shell** (Q-66, `P001-shell/DESIGN.md:119`): the team switcher chevrons, the Workout
  chip.

## Records that are stale (fix when building)

- Q-66, Q-69, D-17 and the Data gaps line "Open recap needs a single-round screen"
  (`PROGRESS.md:176, :292, :295, :386`), and `phone/home.md:27`, `phone/home-player.md:24, :29`: the
  round review exists now. Q-69's "Add classes waits for Classes" is also stale; Add classes is drawn.
- `PROGRESS.md:392` ("Schedule 1:1 and View insights wait for Calendar and CoachHelm"): both are
  rebuilt; `P003-roster/VERIFY.md:127` already says so.
- `PROGRESS.md:406` (Print week and Duplicate "not built") gives no reason; `PROGRESS.md:410`
  (a shared-files list has no backend) is stale since D-48; threaded replies are recorded as no
  backend though `golf_messages.reply_to_id` exists.
- `phone/foundation.md:124` and `PROGRESS.md:430` ("no board draws the More screen"): the coach
  phone board `Coach - Home - Mobile.html` draws it (board "more"), including Settings, Help and Sign
  out, all built.
- `src/clubhouse/shell/nav.ts:30` still says CoachHelm and Team Hub are not rebuilt.
- P004 and P005 `VERIFY.md` and the CHANGELOG say Team stats first-run is not built; it is (CH-4310),
  but only in the Season window, so a coach on the default Last 10 sees "Show the season" first.

---

# The boards, control by control

## Home, coach

### `Coach - Home.html` (coach, desktop)
Built counterpart: src/clubhouse/screens/home/CoachHome.tsx, HomeActions.tsx, Week.tsx, LatestRound.tsx, Leaderboard.tsx, HomeSkeleton.tsx; loader src/clubhouse/data/home.ts; page src/app/golf/(dashboard)/dashboard/page.tsx (no adapter in src/clubhouse/routes/). Phone build: n/a for desktop. Skipped scaffolding: FairwaySidebar (incl. its Next event card and identity), FairwayTopBar search/bell/settings, GHLayer state switcher; coach-home-v3.jsx defines NowCard, Figures and Attention (Plan 1:1, Send reminder, Review lineup) but CoachHomeV3 never renders them, so they are not listed; the Week day cells and agenda rows have no handler and are not styled as controls; gh-states.jsx draws no failed state or Try again for Home (loading is a skeleton with no controls).

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Message team | Header, actions, left | Link to Messages opening the team chat (`?conversation=<id>`, bare Messages if the chat read failed), src/clubhouse/screens/home/HomeActions.tsx:28; deep link read at src/clubhouse/screens/messages/Messages.tsx:102 | `works` | No handler on the board. CH-2208 covers the fallback. |
| New session (kbd N) | Header, actions, primary | "New event": link to the Calendar editor `?new=1`, src/clubhouse/screens/home/HomeActions.tsx:31; D-4, docs/clubhouse/PROGRESS.md:164 | `decided` | Board toasts "Session drafted for today". D-4 renamed it New event and made it open the Calendar editor (Calendar.tsx reads initialNew). |
| N (keyboard shortcut) | Header, New session kbd hint | N pushes the Calendar editor `?new=1`, never while typing or in a dialog, src/clubhouse/screens/home/HomeActions.tsx:15-22; D-4, docs/clubhouse/PROGRESS.md:164 | `decided` | Board hint only (no key handler on the board). CH-2801. |
| Undo (toast action after New session) | Toast stack, bottom, after New session | No toast: New event navigates to the editor, nothing is drafted to undo; D-4, docs/clubhouse/PROGRESS.md:164 | `decided` | Board's toast Undo has no handler on the board. Follows from D-4 replacing the draft with the editor link. |
| Previous round (chevron-left) | Latest round pane, header pager | Steps to the previous of the latest three rounds, src/clubhouse/screens/home/LatestRound.tsx:81 | `works` | Pager hidden when fewer than two rounds (LatestRound.tsx:76). |
| Next round (chevron-right) | Latest round pane, header pager | Steps to the next round, src/clubhouse/screens/home/LatestRound.tsx:82 | `works` | Same pager rule. |
| Open recap | Latest round pane, footer right | "<First name>'s stats": link to Stats `?player=<id>`, src/clubhouse/screens/home/LatestRound.tsx:167; D-17 docs/clubhouse/PROGRESS.md:176, Q-66 docs/clubhouse/PROGRESS.md:292 | `GAP` | Build in src/clubhouse/screens/home/LatestRound.tsx: link "Open recap" to `rebuiltHref(/golf/dashboard/rounds/${r.id}, 'coach')` (review is rebuilt for coach, src/clubhouse/shell/nav.ts:140), Player stats only as the null fallback. Reach high: on the main card every session. Reclassified from `decided`: D-17 and Q-66 (docs/clubhouse/PROGRESS.md:176, :292) rest on 'no round review is rebuilt', which is no longer true; Stats already links it (src/clubhouse/screens/stats/StatsPlayer.tsx:384). No handler on the board. |
| Full roster | Leaderboard section header, right | Link to Roster, src/clubhouse/screens/home/Leaderboard.tsx:83 (rebuiltHref at :69) | `works` | No handler on the board. |
| Leaderboard row (x6) | Leaderboard, each player row | Row is a Link to that player's Stats `?player=<id>`, src/clubhouse/screens/home/Leaderboard.tsx:58 (href at :27); route reads it at src/clubhouse/routes/stats.tsx:34 | `works` | Board draws rows as buttons with no handler. |
| Invite players | Empty state (EMPTY.home.coach), primary | Link to Roster, src/clubhouse/screens/home/CoachHome.tsx:82 (HomeFirstRun, CH-2308, D-71) | `works` | Board goes to Coach - Roster.html; same destination. |
| Add an event | Empty state (EMPTY.home.coach), secondary | Link to the Calendar editor `?new=1`, src/clubhouse/screens/home/CoachHome.tsx:88 | `works` | Board goes to Coach - Calendar.html; built opens the editor directly. |

### `Coach - Home - Mobile.html` (coach, phone)
Built counterpart: src/clubhouse/screens/home/HomePhone.tsx (rendered when useChPhone is true, CoachHome.tsx:25), the shell hero bar src/clubhouse/shell/TopBar.tsx:44 via usePhoneHero, src/clubhouse/ui/Modal.tsx for the round sheet; first-run is CoachHome.tsx HomeFirstRun on both widths. Phone build: HomePhone.tsx. Skipped scaffolding: IOSDevice frames, board captions, GHBoards loading/empty switch rows, MTabs tab bar, MSafari, the hero bell (the shell's Bell, src/clubhouse/shell/Bell.tsx:101), board 06 "More" (MoreM from m-ch.jsx, the shell's More sheet). m-ch.jsx is loaded AND partly rendered: only MoreM (board 06); CoachHelmM is defined there but not rendered on this board. The Needs you rail (Needs in m-home.jsx) is defined but never drawn by HomeM. Today timeline rows and week-strip days have no handler on the board and are not listed.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Varsity (team button with chevron) | Hero bar, left | Team name shown as a label, not a switcher, src/clubhouse/shell/TopBar.tsx:45; Q-66 docs/clubhouse/PROGRESS.md:292, docs/clubhouse/phone/home.md:25 | `decided` | No handler on the board. One team per coach in Clubhouse. |
| Up next card | Hero, Up next (practice day and competition day boards) | Link to Calendar at that event `?date=&event=`, src/clubhouse/screens/home/HomePhone.tsx:125 (href :25); Calendar opens it at src/clubhouse/screens/calendar/Calendar.tsx:207 | `works` | Board's go handler is a no-op (m-home.jsx:114). |
| Practice / Qualifier / Tournament quick chips (x3) | Hero, Up next, No events board, chip row | Each links to the Calendar editor on that type `?new=1&type=`, src/clubhouse/screens/home/HomePhone.tsx:176; type parsed at src/clubhouse/data/calendar.ts:55 | `works` | No handler on the board. |
| Workout quick chip | Hero, Up next, No events board, chip row, fourth | Meeting chip in its place (no workout event type), src/clubhouse/screens/home/HomePhone.tsx:153; Q-66 docs/clubhouse/PROGRESS.md:292, docs/clubhouse/phone/home.md:26 | `decided` | No handler on the board. |
| Add event | Hero, Up next, No events board, bottom | Link to the Calendar editor `?new=1`, src/clubhouse/screens/home/HomePhone.tsx:182 | `works` | No handler on the board. |
| Calendar | Today section header, right link | Link to Calendar, src/clubhouse/screens/home/HomePhone.tsx:198 | `works` | Board draws a styled span with no handler; both show it only when today has events. |
| Plan | Today section, empty (quiet day board) | Link to the Calendar editor `?new=1`, src/clubhouse/screens/home/HomePhone.tsx:211 | `works` | No handler on the board. Hidden when nothing is ahead at all, like the board's `!s.none`. |
| All | Latest rounds section header, right link | Nothing: the header has no link, src/clubhouse/screens/home/HomePhone.tsx:342-344 | `GAP` | Build in src/clubhouse/screens/home/HomePhone.tsx: an All link in the Latest rounds header to the team's rounds (Team stats, /golf/dashboard/stats). Reach medium: a daily-glance section header. Coach has no Rounds library route (nav.ts:110-122). |
| Latest round row (x3) | Latest rounds list, each row | Opens the round's sheet (selection haptic), src/clubhouse/screens/home/HomePhone.tsx:353-360 | `works` | Board 05 is the opened sheet. |
| Close (x) and backdrop | Round scorecard sheet (board 05), header right | Modal close button, src/clubhouse/ui/Modal.tsx:90; backdrop tap :74; drag to dismiss :44 | `works` | |
| Message | Round scorecard sheet, footer left | Link to Messages `?player=<id>` which opens or starts the direct thread, src/clubhouse/screens/home/HomePhone.tsx:394 (href :382); src/clubhouse/screens/messages/Messages.tsx:103-121 | `works` | No handler on the board. |
| Round recap | Round scorecard sheet, footer primary | "Player stats": link to Stats `?player=<id>`, src/clubhouse/screens/home/HomePhone.tsx:399; Q-66 docs/clubhouse/PROGRESS.md:292, docs/clubhouse/phone/home.md:27 | `GAP` | Build in src/clubhouse/screens/home/HomePhone.tsx: in RoundSheet make the footer primary "Round recap" link to `rebuiltHref(/golf/dashboard/rounds/${id}, 'coach')`, Player stats only as the null fallback. Reach high: opened from every Latest rounds row. Reclassified from `decided`: Q-66 (docs/clubhouse/PROGRESS.md:292) rests on 'no round review is rebuilt', which is no longer true (nav.ts:140). No handler on the board. |
| Invite players | Empty phone (GHBoards, EMPTY.home.coach), primary | Link to Roster, src/clubhouse/screens/home/CoachHome.tsx:82; first run is checked before the phone switch (CoachHome.tsx:24) | `works` | |
| Add an event | Empty phone (GHBoards, EMPTY.home.coach), secondary | Link to the Calendar editor `?new=1`, src/clubhouse/screens/home/CoachHome.tsx:88 | `works` | |

#### Notes
- Open recap (desktop) and Round recap (phone) are GAP rows here, reclassified from `decided`: D-17 and Q-66 (docs/clubhouse/PROGRESS.md:176, :292) rest on "no single-round review is rebuilt", which stopped being true: `/golf/dashboard/rounds/<uuid>` is rebuilt for coaches (src/clubhouse/shell/nav.ts:140) and Stats already links it (src/clubhouse/screens/stats/StatsPlayer.tsx:384). Both should link `rebuiltHref('/golf/dashboard/rounds/' + r.id)`, with Player stats as the fallback.
- docs/clubhouse/phone/home.md:27 and P002 DESIGN.md:75,97 repeat the stale "no round review" premise.
- Besides the two recap rows, the only GAP is the phone Latest rounds "All" link; a coach has no Rounds library, so its destination needs a choice (Team stats is the nearest existing surface).
- Built Home adds links the boards do not draw as controls (phone Today rows and week-strip days to Calendar, Try again on every failed section); they are not rows here.

## Home, player

### `Player - Home.html` (player, desktop)
Built counterpart: src/clubhouse/screens/home/PlayerHome.tsx, LatestRound.tsx, PlayerGame.tsx, player-links.ts, Week.tsx, Countdown.tsx; loader src/clubhouse/data/player-home.ts. Phone build: n/a. Skipped scaffolding: sidebar and its "Next event" card, top bar search/bell/settings (shell), GHLayer state switcher; Up next card, day cells, agenda rows and stat rows have no handler on the board; loading skeleton has no controls; gh-states defines no failed or Try again state for home.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Message coach | Header, actions, left | Link to the coach's direct thread, Messages `?user=<coach>`, src/clubhouse/screens/home/PlayerHome.tsx:43 via player-links.ts:4; deep link handled at src/clubhouse/screens/messages/Messages.tsx:98-110 | `works` | No handler on the board. Falls back to the Messages inbox when no coach account is known (player-links.ts:4). |
| Post a round | Header, actions, right (primary) | Not drawn: `postRoundHref()` is `rebuiltHref('/golf/dashboard/rounds/new','player')`, src/clubhouse/screens/home/player-links.ts:7, guarded at PlayerHome.tsx:46; `/rounds/new` is not in CH_REBUILT_ROUTES.player (nav.ts:123) and the player pattern needs a uuid (nav.ts:141) | `hidden-until-rebuilt` | [preview-only] No handler on the board. Q-69 and Q-78 (docs/clubhouse/PROGRESS.md:295, 304): setup exists only at /clubhouse-preview/setup until the round engine move. Same decision as Rounds' Start a round (RoundsLibrary.tsx:29). |
| N (keyboard hint on Post a round) | Header, Post a round kbd | No key handler on player Home; the N shortcut in src/clubhouse/screens/home/HomeActions.tsx:18 is Coach Home only; the button itself is hidden (player-links.ts:7, nav.ts:141) | `hidden-until-rebuilt` | [preview-only] No handler on the board either. Q-69 and Q-78 (PROGRESS.md:295, 304). When Post a round is drawn, add the N key in PlayerHome.tsx on the HomeActions.tsx:18 pattern. |
| Previous round / Next round (x 2) | This week sheet, My latest round pane, pager | Icon buttons step the round shown, src/clubhouse/screens/home/LatestRound.tsx:81-82 (drawn when more than one round) | `works` | Pager label "1 of 3" is aria-live (LatestRound.tsx:78). |
| Open recap | My latest round pane, footer, right | Ghost button "My stats" to /golf/dashboard/stats, src/clubhouse/screens/home/LatestRound.tsx:159-163 (MY_STATS, player-links.ts:10) | `GAP` | Build in src/clubhouse/screens/home/LatestRound.tsx: in the `mine` branch link "Open recap" to `rebuiltHref(/golf/dashboard/rounds/${r.id}, 'player')`, My stats only as the null fallback. Reach high: on the main card every session. No handler on the board. Q-69 said My stats "until a round recap exists"; the review now exists (Q-72e, PROGRESS.md:516; nav.ts:141) and Stats already links it (StatsPlayer.tsx:384). r.id is the golf_rounds id (data/home.ts:307). |
| Last 5 / Last 10 / Last 20 (x 3) | Scoring section, top right segmented | Segmented control sets the window, src/clubhouse/screens/home/PlayerGame.tsx:59-66 | `works` | Drawn when more than 5 rounds; a window is offered only once there are more than half its rounds (PlayerGame.tsx:65). |
| Start a round | Empty state (EMPTY.home.player), primary | Not drawn in the first-run state: `postRoundHref()` is null, src/clubhouse/screens/home/PlayerHome.tsx:96,111-115 via player-links.ts:7; `/rounds/new` not rebuilt for player (nav.ts:123, 141) | `hidden-until-rebuilt` | [preview-only] Q-69 and Q-78 (PROGRESS.md:295, 304; phone/home-player.md:24). The board's target is Player - Rounds.html (the library, rebuilt for players), but the library's own Start a round is also hidden (RoundsLibrary.tsx:29). |
| Add classes | Empty state (EMPTY.home.player), secondary | Link to /golf/dashboard/classes, src/clubhouse/screens/home/PlayerHome.tsx:97,118-122; rebuilt for player (nav.ts:123), page serves ClubhouseClassesRoute to players (src/app/golf/(dashboard)/dashboard/classes/page.tsx:13) | `works` | Q-69's "Add classes waits for Classes" clause is stale: Classes P012 is built (PROGRESS.md:534), and the rebuiltHref guard now draws it. |

### `Player - Home - Mobile.html` (player, phone)
Built counterpart: src/clubhouse/screens/home/PlayerHomePhone.tsx, PlayerGame.tsx (phone), player-links.ts; first-run state PlayerHome.tsx (renders before the phone switch, PlayerHome.tsx:33). Phone build: PlayerHomePhone. Skipped scaffolding: hero bar team logo and bell (shell green top bar, src/clubhouse/shell/phone-chrome.tsx:70), MTabs, MSafari, IOSDevice frame, GHBoards and board labels; Up next card, week day cells and today timeline have no handler on the board; loading skeleton has no controls; no failed or Try again state is drawn.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Message coach | Hero, actions, left | Link to the coach's direct thread, src/clubhouse/screens/home/PlayerHomePhone.tsx:77 (messageCoachHref, player-links.ts:4); handled at src/clubhouse/screens/messages/Messages.tsx:98-110 | `works` | No handler on the board. Press haptic on tap (PlayerHomePhone.tsx:77). |
| Post a round | Hero, actions, right (primary) | Not drawn: guarded by `post` at src/clubhouse/screens/home/PlayerHomePhone.tsx:81, `rebuiltHref('/golf/dashboard/rounds/new','player')` player-links.ts:7; not in nav.ts:123, pattern needs a uuid (nav.ts:141) | `hidden-until-rebuilt` | [preview-only] No handler on the board. Q-69 and Q-78 (PROGRESS.md:295, 304); same decision as the desktop and Rounds. |
| Previous round / Next round (x 2) | My latest round section, pager | Buttons step the round with a selection haptic, src/clubhouse/screens/home/PlayerHomePhone.tsx:125,131 (go at :114) | `works` | Drawn when more than one round (PlayerHomePhone.tsx:123). |
| Open recap | My latest round card, full-width button | Button "My stats" to /golf/dashboard/stats, src/clubhouse/screens/home/PlayerHomePhone.tsx:180-183 | `GAP` | Build in src/clubhouse/screens/home/PlayerHomePhone.tsx: in Latest, "Open recap" to `rebuiltHref(/golf/dashboard/rounds/${r.id}, 'player')`, My stats only as fallback. Reach high: main card each visit. No handler on the board. Q-69's condition is met: review rebuilt (Q-72e, PROGRESS.md:516; nav.ts:141). |
| Last 5 / Last 10 / Last 20 (x 3) | Scoring section, segmented above the chart | Segmented control sets the window, src/clubhouse/screens/home/PlayerGame.tsx:59-66 (phone mode, PlayerHomePhone.tsx:103) | `works` | Built puts the segmented in the section head rather than inside the card; same control. |
| Start a round | Empty state board (EMPTY.home.player, phone), primary | Not drawn: first-run renders PlayerFirstRun on the phone too (PlayerHome.tsx:33), `postRoundHref()` null at PlayerHome.tsx:96,111-115; `/rounds/new` not rebuilt for player (nav.ts:123, 141) | `hidden-until-rebuilt` | [preview-only] Q-69 and Q-78 (PROGRESS.md:295, 304). Board target is Player - Rounds.html; the library's Start a round is hidden too (RoundsLibrary.tsx:29). |
| Add classes | Empty state board (EMPTY.home.player, phone), secondary | Link to /golf/dashboard/classes, src/clubhouse/screens/home/PlayerHome.tsx:97,118-122; rebuilt for player (nav.ts:123) | `works` | Actions stack at 44px on the phone (D-71, PROGRESS.md:243). Q-69's Add classes clause is stale (Classes built, PROGRESS.md:534). |

#### Notes
- Q-69 (PROGRESS.md:295) and phone/home-player.md:24 and :29 have two stale clauses: Add classes now draws (Classes rebuilt for players), and Open recap's "until a round recap exists" is met by the round review at /golf/dashboard/rounds/<id>. The Home line under Data gaps (PROGRESS.md:386) is stale for the same reason.
- Every Post a round and Start a round row turns `works` once `/golf/dashboard/rounds/new` joins CH_REBUILT_ROUTES.player (Q-78); the N shortcut then still needs a handler on player Home.
- The two Open recap GAPs are one change in two files (LatestRound.tsx `mine` branch and PlayerHomePhone.tsx Latest); no new data is needed.

## Roster (coach)

### `Coach - Roster.html` (coach, desktop)
Built counterpart: src/clubhouse/screens/roster/Roster.tsx, RosterPeek.tsx, RosterRequests.tsx, useJoinRequests.ts, useCopyText.ts, src/clubhouse/routes/roster.tsx, src/clubhouse/data/roster.ts. Phone build: n/a for desktop. Skipped scaffolding: sidebar, top bar crumbs/search/bell/settings, the `GHLayer` loading/empty switcher, the header avatar stack (decoration, no handler), recent-round rows in the panel (no handler).

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Export | Header, right (ghost) | Downloads a CSV of the rows on screen with a toast, src/clubhouse/screens/roster/Roster.tsx:278 (exportCsv at :156) | `works` | Hidden while the roster is empty; failure is CH-3005 (Roster.tsx:174) |
| Invite players | Header, right (primary) | Opens the Invite players modal, src/clubhouse/screens/roster/Roster.tsx:284 (InviteModal at :597) | `works` | Steps aside while the page empty state carries it (one primary, D-71) |
| Decline (x N) | Join requests card, each row | Optimistic decline through rejectJoinRequest, src/clubhouse/screens/roster/RosterRequests.tsx:63 to useJoinRequests.ts:84; server sets status rejected at src/app/golf/actions/teams.ts:1461 | `works` | CH-3003 on failure; disabled while another decision is in flight |
| Approve (x N) | Join requests card, each row | Optimistic approve through acceptJoinRequest, src/clubhouse/screens/roster/RosterRequests.tsx:66 to useJoinRequests.ts:69; server inserts the member at src/app/golf/actions/teams.ts:1314 | `works` | CH-3002 on failure |
| Needs a look chip (x N) | Needs a look strip, under the requests | Opens that player's panel, src/clubhouse/screens/roster/Roster.tsx:308 | `works` | Chips are derived from rounds (attention), hidden when season stats fail (CH-3202) |
| Search players by name | Toolbar, left | Filters the list by name, src/clubhouse/screens/roster/Roster.tsx:347 | `works` | Empty result is CH-3302 |
| Clear search (x in the field) | Toolbar, search field, right end | Clears the query, src/clubhouse/ui/SearchField.tsx:33 | `works` | Shown only when there is text, as on the board |
| Active · N / Inactive · N / All | Toolbar, status group | Filters by status, src/clubhouse/screens/roster/Roster.tsx:349 | `works` | PillGroup; CH-3303 when a filter has nobody |
| Team view / List view (icon toggles) | Toolbar, layout group | Switches cards or table and remembers it on the device, src/clubhouse/screens/roster/Roster.tsx:367 (changeView at :91) | `works` | Stored under ch-roster-view |
| Avg score / Handicap / Rounds / Name | Toolbar, sort segmented | Sorts the list, src/clubhouse/screens/roster/Roster.tsx:382 | `works` | Name sorts by last name; nulls last |
| Player face card (x N) | Team view, card grid | Toggles the player panel, src/clubhouse/screens/roster/Roster.tsx:474 | `works` | aria-pressed; the status dot reads as a word (CH-3802) |
| Player row (x N; click or Enter) | List view, table row | The Player cell is a button that toggles the panel, src/clubhouse/screens/roster/Roster.tsx:528 | `works` | Built as a cell button, not a clickable row, for table semantics (CH-3801); Enter works on the button |
| Status pill (Active or Inactive, chevron) and its Set status popover (Active, Inactive) (x N) | List view row Status cell; player panel, top left | Read-only status label, no popover, src/clubhouse/screens/roster/Roster.tsx:537 and RosterPeek.tsx:90 | `decided` | Q-1 (docs/clubhouse/PROGRESS.md:249): availability field is a held migration, pill stays read-only (docs/clubhouse/held/data/roster-availability.md:77) |
| Actions for (name) ⋯ (x N) | List view row, last cell | Opens the row menu, src/clubhouse/screens/roster/Roster.tsx:552 | `works` | Only in List view on the board and in the build |
| View insights | Row menu, first item | Not drawn; menuFor has no such item, src/clubhouse/screens/roster/Roster.tsx:180 | `GAP` | Build in src/clubhouse/screens/roster/Roster.tsx: a View insights item linking to the coach CoachHelm board for this player. Reach low: row menu, List view only. Needs a CoachHelm player param (routes/coachhelm.tsx:25). No handler on the board; PROGRESS.md:392 hold lapsed |
| View stats | Row menu | Link to stats?player=id through rebuiltHref, src/clubhouse/screens/roster/Roster.tsx:183 | `works` | /golf/dashboard/stats is rebuilt for coach (src/clubhouse/shell/nav.ts:117) |
| Message | Row menu | Link to the Messages inbox, src/clubhouse/screens/roster/Roster.tsx:184 | `works` | Board also goes to the plain inbox; the phone uses messages?player= |
| Remove from team | Row menu, danger item | Opens the Remove player confirm, src/clubhouse/screens/roster/Roster.tsx:186 | `works` | Red per D-42 |
| Cancel | Remove player modal, footer | Closes the confirm, src/clubhouse/screens/roster/Roster.tsx:210 | `works` | |
| Remove player | Remove player modal, footer (danger) | Runs removePlayerFromTeam, src/clubhouse/screens/roster/Roster.tsx:217; server deletes the membership at src/app/golf/actions/roster.ts:106 | `works` | Reads Removing while pending (CH-3402); failure CH-3001 |
| Clear search | List view, no-match empty row | Built as Show everyone, which clears the search and sets the filter to All, src/clubhouse/screens/roster/Roster.tsx:457 | `decided` | Catalog CH-3302 records Show everyone (docs/clubhouse/catalog/roster.md:48); also used for an empty status filter (CH-3303) |
| Close (x) | Player panel, top right | Closes the panel, src/clubhouse/screens/roster/RosterPeek.tsx:94 | `works` | Esc also closes it (RosterPeek.tsx:45, CH-3803) |
| Message | Player panel, quick actions | Link to the Messages inbox, src/clubhouse/screens/roster/RosterPeek.tsx:106 | `works` | |
| Schedule 1:1 | Player panel, quick actions | Not drawn on desktop; only Message renders, src/clubhouse/screens/roster/RosterPeek.tsx:104 | `GAP` | Build in src/clubhouse/screens/roster/RosterPeek.tsx: a Schedule 1:1 button to calendar?new=1&with=id, as RosterProfile.tsx:35. Reach medium: on every open panel. No handler on the board. PROGRESS.md:392 hold lapsed, Calendar rebuilt and seed exists (D-52, phone only) |
| Coach's note (textarea) | Player panel, Coach's note section | Saves on blur through setIntent, src/clubhouse/screens/roster/RosterPeek.tsx:245; server upserts at src/app/golf/actions/v3/intent.ts:71 | `works` | CH-3004, CH-3101, CH-3209; board has no save handler, build saves |
| Open full profile | Player panel, footer (primary) | Link to stats?player=id, src/clubhouse/screens/roster/RosterPeek.tsx:187 | `works` | Same destination as the board (Coach - Stats.html?player=) |
| Copy | Invite players modal, join code well | Copies the join code with a toast, src/clubhouse/screens/roster/Roster.tsx:610 (useCopyText.ts:13) | `works` | CH-3006 on failure; CH-3207 or CH-3304 when there is no code |
| player@email.com field and Send | Invite players modal, Or send an invite | Not drawn; replaced by the invite link with Share (or Copy), src/clubhouse/screens/roster/Roster.tsx:618 | `data-gap` | No invite-by-email action (docs/clubhouse/PROGRESS.md:391); D-54 restates no invite by email (PROGRESS.md:202) |
| Done | Invite players modal, footer | Closes the modal, src/clubhouse/screens/roster/Roster.tsx:603 | `works` | |
| Invite players | Empty state (EMPTY.roster), primary | Opens the Invite players modal, src/clubhouse/screens/roster/Roster.tsx:332 | `works` | No handler on the board (EMPTY.roster has no href). Body copy changed to team code (PROGRESS.md:383) |
| Copy team code | Empty state (EMPTY.roster), secondary | Copies the join code, src/clubhouse/screens/roster/Roster.tsx:338 | `works` | No handler on the board. Shown only when the team has a code (catalog/roster.md:47) |

### `Coach - Roster - Mobile.html` (coach, phone)
Built counterpart: src/clubhouse/screens/roster/RosterPhone.tsx (RosterPhone, RosterPhoneRow, RequestsBanner, RequestsSheet, PlayerActions), RosterProfile.tsx, useJoinRequests.ts, useCopyText.ts, picked by useChPhone in Roster.tsx:231. Phone build: RosterPhone.tsx. Skipped scaffolding: board frames and labels, the `GHBoards` state boards' frame, the tab bar (MTabs), MSafari bar, iOS status bar and home indicator, sheet scrim, recent-round rows (no handler).

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| ‹ More | Roster list, top bar, left | Returns to where More was opened, src/clubhouse/screens/roster/RosterPhone.tsx:96 (useBackFromMore) | `works` | No handler on the board. Behaviour per D-50 (PROGRESS.md:198) |
| Invite players (user-plus icon) | Roster list, top bar, right | Opens the Invite players sheet, src/clubhouse/screens/roster/RosterPhone.tsx:98 | `decided` | No handler on the board. D-54 (PROGRESS.md:202) set the target; sheet offers code Copy and link Share, no email |
| 2 join requests banner | Roster list, under the title | Opens the Join requests sheet, src/clubhouse/screens/roster/RosterPhone.tsx:313 | `works` | Hidden with no requests; CH-3203 in its slot on failure |
| Sort by Avg / SG / Name | Roster list, sort bar | Sorts within each section, src/clubhouse/screens/roster/RosterPhone.tsx:164 | `works` | Name by last name (D-59) |
| Player row (x N, Active and Inactive sections) | Roster list, panels | Pushes the player profile, src/clubhouse/screens/roster/RosterPhone.tsx:278 (openPlayer at Roster.tsx:77) | `works` | Profile is a history entry (CH-1906); Inactive listed per D-58 |
| ‹ Roster | Player profile, top bar, left | Pops back to the list, src/clubhouse/screens/roster/RosterPhone.tsx:187 | `works` | Edge swipe also pops (RosterPhone.tsx:89) |
| More actions ⋯ | Player profile, top bar, right | Opens the action sheet (View stats, Remove from team with the CH-3501 confirm), src/clubhouse/screens/roster/RosterPhone.tsx:192 (PlayerActions at :405) | `decided` | No handler on the board. D-54 (PROGRESS.md:202) set the sheet items |
| Message | Player profile, hero actions | Link to messages?player=id, which opens or starts the direct thread, src/clubhouse/screens/roster/RosterProfile.tsx:58 | `works` | No handler on the board. Deep link read at src/clubhouse/screens/messages/Messages.tsx:103 |
| Schedule | Player profile, hero actions | Built as Plan 1:1, link to calendar?new=1&with=id, src/clubhouse/screens/roster/RosterProfile.tsx:63 | `decided` | No handler on the board. D-52 (PROGRESS.md:200) set label and target; seed read at src/clubhouse/screens/calendar/Calendar.tsx:211 |
| All 21 | Player profile, Recent rounds header, right | Link to stats?player=id&window=season&tab=rounds, src/clubhouse/screens/roster/RosterProfile.tsx:128 | `decided` | No handler on the board (a span). D-53 (PROGRESS.md:201) set the target; tab read at src/clubhouse/routes/stats.tsx:22 |
| Close (x) | Join requests sheet, header right | Closes the sheet, src/clubhouse/ui/Modal.tsx:90 (onClose from RosterPhone.tsx:342) | `works` | Scrim tap closes too (Modal.tsx:74); drag to dismiss via useSheetDrag (Modal.tsx:44) |
| Decline (x N) | Join requests sheet, each card | Optimistic decline, src/clubhouse/screens/roster/RosterPhone.tsx:376 to useJoinRequests.ts:84 (server teams.ts:1461) | `works` | No handler on the board. CH-3003 |
| Approve (x N) | Join requests sheet, each card | Optimistic approve, src/clubhouse/screens/roster/RosterPhone.tsx:379 to useJoinRequests.ts:69 (server teams.ts:1314) | `works` | No handler on the board. CH-3002 |
| Approve all N | Join requests sheet, footer | Approves each request in turn, src/clubhouse/screens/roster/RosterPhone.tsx:351 (approveEach at useJoinRequests.ts:90) | `decided` | No handler on the board. D-55 (PROGRESS.md:203): loops the existing action; CH-3403 in flight, CH-3007 on partial failure |
| Copy | Join requests sheet, team code well | Copies the join code, src/clubhouse/screens/roster/RosterPhone.tsx:392 | `works` | No handler on the board. Hidden when the team has no code |
| Invite players | Empty state board (EMPTY.roster), primary | Opens the Invite players sheet, src/clubhouse/screens/roster/RosterPhone.tsx:155 | `works` | No handler on the board |
| Copy team code | Empty state board (EMPTY.roster), secondary | Not drawn on the phone; Invite players opens the sheet with Copy, src/clubhouse/screens/roster/RosterPhone.tsx:148 | `decided` | No handler on the board. Catalog CH-3301 scopes it to desktop (docs/clubhouse/catalog/roster.md:47); phone spec lists empty state with Invite players only (docs/clubhouse/phone/roster.md:157) |

#### Notes
- gh-states.jsx draws no failed state and no Try again for roster; the loading boards (desktop GHSkeleton, phone GHSkeletonM) have no controls. The build's Try again notices (CH-3201, CH-3202, CH-3203, CH-3207) exist but come from no board control, so they have no rows.
- Both desktop GAPs come from one stale hold, docs/clubhouse/PROGRESS.md:392 ("wait for Calendar and CoachHelm"): both routes are now in CH_REBUILT_ROUTES for coach (src/clubhouse/shell/nav.ts:113-114). docs/clubhouse/pages/P003-roster/VERIFY.md:127 already flags it. Update or remove that line when building.
- View insights needs CoachHelm to accept a player selection (for example ?player=id); src/clubhouse/routes/coachhelm.tsx:25 takes only view today.
- Many board controls have no handler on the board: the phone board's buttons and both EMPTY.roster actions (EMPTY.roster has no href). Where a D-n set the destination (D-52 to D-55), the row is `decided`; where the label implies it, `works`.
- No `[no-phone-build]` and no `[preview-only]` rows: RosterPhone is the product phone build via useChPhone (src/clubhouse/screens/roster/Roster.tsx:231).
- Another session (p003-roster) may be editing src/clubhouse/screens/roster; line numbers are from the working tree as read at HEAD 96445d13a.

## Stats, team and player (coach)

### `Coach - Stats.html` (coach, desktop)
Built counterpart: src/clubhouse/routes/stats.tsx, src/clubhouse/screens/stats/StatsTeam.tsx, StatsTeamIslands.tsx, StatsTeamFirstRun.tsx, StatsPlayer.tsx, GameDetail.tsx, links.ts, WindowSwitch.tsx, StatsRouteSkeleton.tsx. Phone build: n/a for desktop. Skipped scaffolding: FairwaySidebar, FairwayTopBar (crumbs, search, bell, settings), the GHLayer state switcher, the `?player=`/localStorage board routing; `StatSheet` (stats-sheet.jsx) is loaded but never rendered, so its group toggles are not drawn; gh-states defines no failed state or Try again for stats.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Window: Last 10 / Season / Qualifiers (x 3) | Team view, header, right | Segmented window switch; pushes `?window=`, src/clubhouse/screens/stats/StatsTeamIslands.tsx:109 (handler :65 to :75) | `works` | Offline refusal CH-4901 and slow notice CH-4902 (StatsTeamIslands.tsx:66, :59) |
| Export | Team view, header, right | Downloads a CSV of the strokes gained grid, src/clubhouse/screens/stats/StatsTeamIslands.tsx:112 (exportCsv :90) | `works` | No handler on the board. Hidden when rounds failed or the grid is empty (:111) |
| Measure: Strokes gained / Scoring (x 2) | Team view, trend card, top right | Segmented lens switch, src/clubhouse/screens/stats/StatsTeamIslands.tsx:255 | `works` | |
| Player trend line (x N) | Team view, trend chart, faint lines | Click focuses or unfocuses that player's line, src/clubhouse/screens/stats/StatsTeamIslands.tsx:296 | `works` | |
| Player end chip (avatar, first name, value) (x N) | Team view, trend card, right-hand list | Button toggles the focused player, src/clubhouse/screens/stats/StatsTeamIslands.tsx:317 | `works` | |
| Leg card: Off the tee / Approach / Around green / Putting (x 4) | Team view, leg small multiples row | Button selects the leg and re-sorts the grid, src/clubhouse/screens/stats/StatsTeamIslands.tsx:361 (onSelect :163) | `works` | |
| Player row (x N) | Team view, "Where each player gains and loses" grid | Link to the player's profile keeping the window, src/clubhouse/screens/stats/StatsTeamIslands.tsx:424 (teamPlayerHref links.ts:4); hover and focus set the trend focus (:429) | `works` | Board also opens on Enter; a Link does the same |
| Team stats (back) | Player view, back row, left | Ghost button link to Team stats in the same window, src/clubhouse/screens/stats/StatsPlayer.tsx:150 | `works` | |
| Previous player / Next player (x 2) | Player view, back row, right | Icon links to the neighbouring roster player, src/clubhouse/screens/stats/StatsPlayer.tsx:155 and :161 | `works` | Shown when the loader returns `nav` (data/stats-player.ts:180) |
| Message | Player view, hero actions | Link to the direct thread, `/golf/dashboard/messages?player=<id>`, src/clubhouse/screens/stats/StatsPlayer.tsx:185 (href :98) | `works` | Board goes to the bare inbox; the build opens the thread (Messages.tsx:103 reads `player`) |
| Schedule 1:1 | Player view, hero actions | Not drawn; no Schedule button in the hero, src/clubhouse/screens/stats/StatsPlayer.tsx:182 to :195 | `GAP` | Build in src/clubhouse/screens/stats/StatsPlayer.tsx: a hero link to `rebuiltHref('/golf/dashboard/calendar?new=1&with=<id>')`, as RosterProfile.tsx:35 (D-52). Reach medium: on every profile, used now and then. No handler on the board |
| Add focus area | Player view, hero actions, primary | Opens the Add focus area sheet, src/clubhouse/screens/stats/StatsPlayer.tsx:190; saves through createFocusArea (actions/development.ts:513, real insert) at StatsPlayer.tsx:515 | `works` | No handler on the board. Proposes the area; the player accepts (Q-77, PROGRESS.md:303) |
| Tabs: Overview / Game detail / Rounds (count) / Development (x 4) | Player view, tab row, left | Real tabs, src/clubhouse/screens/stats/StatsPlayer.tsx:220 (pickTab :106) | `works` | `?tab=` opens one (D-53) |
| Window: Last 10 / Season / Qualifiers (x 3) | Player view, tab row, right | Window switch, src/clubhouse/screens/stats/StatsPlayer.tsx:229 (changeWindow :87) | `works` | CH-5901 offline, CH-5902 slow |
| Game section: Scoring / Off the tee / Approach / Short game / Putting (x 5) | Player view, Game detail tab, section nav | Buttons scroll to the section, src/clubhouse/screens/stats/GameDetail.tsx:191 (jump :107) | `works` | |
| Add | Player view, Development tab, Focus areas card head | Opens the Add focus area sheet, src/clubhouse/screens/stats/StatsPlayer.tsx:425 (onAdd :276) | `works` | No handler on the board |
| View roster | Empty state (EMPTY.stats), both views | Built as CH-4310 with View roster to Roster, src/clubhouse/screens/stats/StatsTeamFirstRun.tsx:22, but only for the Season window (StatsTeam.tsx:43); Last 10 first shows CH-4301 with Show the season | `decided` | docs/clubhouse/catalog/stats-team.md:45 ("other windows keep CH-4301") and D-71 (PROGRESS.md:243). A first-run coach lands on Last 10 and needs one click to reach it |

### `Coach - Stats - Mobile.html` (coach, phone)
Built counterpart: src/clubhouse/screens/stats/StatsTeamPhone.tsx (placed by StatsTeamFrame, StatsTeamIslands.tsx:80), StatsPlayerPhone.tsx (inside StatsPlayer.tsx:128), GameDetail.tsx phone mode, StatsTeamFirstRun.tsx. Phone build: yes, both views. Skipped scaffolding: MApp shell, MTop's default Notifications bell on the team board (the shell's), tab bar, iOS frame, Safari bar, the `B` board list and the GHBoards state row.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Window: Last 10 / Season / Qualifiers (x 3) | Team view ("Team stats" board), under the title | The desktop window switch through the frame's window change, src/clubhouse/screens/stats/StatsTeamPhone.tsx:41 | `works` | CH-4901, CH-4902 shared with desktop |
| Sort: Avg / SG (x 2) | Team view, Players panel head | Segmented sort, src/clubhouse/screens/stats/StatsTeamPhone.tsx:228 | `works` | CH-4703 |
| Player row (x N) | Team view, Players panel | Link to the player's stats in the same window, src/clubhouse/screens/stats/StatsTeamPhone.tsx:245 | `works` | No handicap in the row (Q-68, PROGRESS.md:294) |
| ‹ Team | Player view ("Player · approach" board), top bar, left | Back to Team stats in the same window, src/clubhouse/screens/stats/StatsPlayerPhone.tsx:95 (onBackToTeam StatsPlayer.tsx:137) | `works` | |
| Share | Player view, top bar, right | iOS share sheet with the page link, or copies it, src/clubhouse/screens/stats/StatsPlayerPhone.tsx:95 (share :64) | `works` | No handler on the board. CH-5002 when blocked |
| Section chips: Scoring / Off the tee / Approach / Short game / Putting (x 5) | Player view, under the figures | Chips switch one Game detail section at a time, src/clubhouse/screens/stats/GameDetail.tsx:191 (phone branch :108 to :111) | `works` | Board opens on Approach; the build opens on Scoring (GameDetail.tsx:90) |
| View roster | Empty state (EMPTY.stats), GHBoards "Coach · Empty state" | CH-4310 View roster, src/clubhouse/screens/stats/StatsTeamPhone.tsx:44 (StatsTeamFirstRun.tsx:22), for the Season window only; Last 10 shows CH-4301 with Show the season | `decided` | docs/clubhouse/catalog/stats-team.md:45 and D-71 (PROGRESS.md:243). Same one-click gap as desktop |

#### Notes
- First-run empty (both boards): the board shows EMPTY.stats on landing, but the build shows View roster only in the Season window; the default Last 10 shows CH-4301 "Show the season" first. It is recorded (catalog/stats-team.md:45), so it is `decided`. If the owner wants the board's behaviour, StatsTeam.tsx:43 and StatsTeamPhone.tsx:43 should test "no countable round all season", not the window. P004 and P005 VERIFY.md:124/128 and CHANGELOG still say first-run is "not built", which is stale.
- Failed states: gh-states.jsx defines none for stats. The built Try again notices (CH-4201 to CH-4203, CH-5201 to CH-5203) have no board counterpart, so there are no rows for them.
- Not drawn as controls on the board, so no rows: StatSheet (never rendered; DESIGN.md:137 says the owner removed it), PredictionCard "Thursday at Pinehurst" (not interactive; data gap PROGRESS.md:405), Season bests rows and Rounds table rows (no onClick on the board; the build links them anyway).
- Not a control, so not a row: the phone loading state (`GHSkeletonM`) is phone-shaped, but Clubhouse shows the desktop `StatsSkeleton` at 390px (`src/clubhouse/screens/stats/StatsRouteSkeleton.tsx:10`). A phone skeleton would go in `src/clubhouse/screens/stats/StatsSkeleton.tsx`.
- The only real build item is Schedule 1:1 in the desktop player hero. D-52's Calendar seed `?new=1&with=` already exists, so it is a one-link change.
- The Data gaps line PROGRESS.md:392 ("Schedule 1:1 ... hidden") is about Roster only and is stale since D-52. It does not cover Stats.

## Calendar (coach)

### `Coach - Calendar.html` (coach, desktop)
Built counterpart: src/clubhouse/screens/calendar/Calendar.tsx, views.tsx, inspector.tsx, editor.tsx, extras.tsx, CalendarFirstRun.tsx, CalendarSkeleton.tsx; src/clubhouse/data/calendar.ts; src/clubhouse/routes/calendar.tsx. Phone build: n/a for desktop. Skipped scaffolding: FairwaySidebar, FairwayTopBar (search, bell, settings), GHLayer state switcher, the legend dots (not controls), the loading skeleton (GHSkeleton calendar draws no actions; gh-states defines no Try again for calendar).

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Jump to date (month or week title with chevron) | Masthead, left | Title button toggles the jump panel, src/clubhouse/screens/calendar/Calendar.tsx:455 | `works` | Built panel also has previous and next month (Calendar.tsx:57-58) |
| Close (x) | Jump panel, header right | No close button; the panel closes on outside click or Esc (src/clubhouse/screens/calendar/Calendar.tsx:40-41) or by pressing the title again | `GAP` | Build in src/clubhouse/screens/calendar/Calendar.tsx: a Close IconButton in the JumpPanel head calling onClose. Reach low: Esc and outside click already close it. |
| Day numbers (x 31) | Jump panel, grid | Picks the day and moves the view there, src/clubhouse/screens/calendar/Calendar.tsx:68-76 and onPick :469-472 | `works` | Past the loaded window it loads the next window (D-8, Calendar.tsx:256) |
| Today | Masthead, tools (shown when away from today) | Button runs goToday, src/clubhouse/screens/calendar/Calendar.tsx:477-480 | `works` | T key does the same (Calendar.tsx:284) |
| More (ellipsis) | Masthead, tools | Menu trigger, src/clubhouse/screens/calendar/Calendar.tsx:482-490 | `works` | |
| Add to calendar app | More menu | Opens SubscribeSheet, src/clubhouse/screens/calendar/Calendar.tsx:326 and :383 | `works` | |
| My busy time | More menu | "Add busy time" opens BusySheet which calls addCoachBlockedTime, src/clubhouse/screens/calendar/Calendar.tsx:327, extras.tsx:151 | `works` | Board only toasts "Busy time opens here"; built label is Add busy time (docs/clubhouse/pages/P006-calendar/WIRING.md:58); existing blocks open BusyDetail from the grid (inspector.tsx:362) |
| Conflicts | More menu | "Overlaps · N" opens the first overlap in the panel, only when there is one, src/clubhouse/screens/calendar/Calendar.tsx:328 | `works` | Overlaps computed from loaded events and classes (D-9); label says Overlaps |
| Print week | More menu, after separator | Not drawn. Listed as not built in docs/clubhouse/PROGRESS.md:406 and docs/clubhouse/pages/P006-calendar/DESIGN.md:103-104, with no data reason | `GAP` | Build in src/clubhouse/screens/calendar/Calendar.tsx: a Print week item in moreItems calling window.print, plus print rules in src/clubhouse/styles/calendar.css. Reach low: occasional use. No handler on the board. |
| New event (N) | Masthead, right | Primary button opens EventEditor, src/clubhouse/screens/calendar/Calendar.tsx:491-495 | `works` | Coach only |
| N key | Kbd hint on New event | Opens the editor, src/clubhouse/screens/calendar/Calendar.tsx:281-283 | `works` | Ignored while typing or with a dialog open (Calendar.tsx:280) |
| T, left and right arrows, Esc (unlabelled shortcuts in board code) | Page keyboard handler | Today, step, close panel, src/clubhouse/screens/calendar/Calendar.tsx:284-287 | `works` | Arrows also step months (board: day and week only) |
| Previous week / Next week (Previous day / Next day) | Toolbar, left | IconButtons call step, src/clubhouse/screens/calendar/Calendar.tsx:503-504 | `works` | Built also shows them in Month (steps a month); hidden in Agenda like the board |
| Day / Week / Month / Agenda | Toolbar, view segmented | Segmented calls go(v, anchor), src/clubhouse/screens/calendar/Calendar.tsx:507-517 | `works` | View is in the URL (D-8) |
| People (Everyone trigger with avatar stack) | Toolbar, people picker | Opens the picker popover, src/clubhouse/screens/calendar/Calendar.tsx:113 | `works` | Coach only, hidden with no players (Calendar.tsx:519) |
| Clear | Toolbar, beside the people picker (when players chosen) | Clears the filter, src/clubhouse/screens/calendar/Calendar.tsx:126-130 | `works` | |
| Find a player | People popover, search | SearchField filters the list, src/clubhouse/screens/calendar/Calendar.tsx:133 and :106 | `works` | |
| Everyone | People popover, first row | Clears the selection, src/clubhouse/screens/calendar/Calendar.tsx:134 | `works` | |
| Player rows (x 6) | People popover, list | Toggle each player, src/clubhouse/screens/calendar/Calendar.tsx:149 and tog :107-110 | `works` | Filters grid, agenda and month (Calendar.tsx:239-242) |
| Done | People popover, footer | Closes the popover, src/clubhouse/screens/calendar/Calendar.tsx:163 | `works` | |
| Day headers (x 7) | Week grid, column heads | Opens that day in Day view, src/clubhouse/screens/calendar/views.tsx:133-140 with onDay at Calendar.tsx:552 | `works` | |
| All-day bars | Week grid, All day row | Open the event in the panel, src/clubhouse/screens/calendar/views.tsx:155-163 | `works` | |
| Event blocks (events and classes) | Week and Day grid | Open the event, class or busy detail, src/clubhouse/screens/calendar/views.tsx:81-90 with open at Calendar.tsx:299-302 | `works` | Class opens ClassDetail (inspector.tsx:361) |
| Month cells (x 35) | Month view, grid | Select the day and open its first event, src/clubhouse/screens/calendar/views.tsx:229-238 with onPick Calendar.tsx:560-566 | `works` | |
| Show N earlier days / Hide earlier days | Agenda view, top | Toggles past days, src/clubhouse/screens/calendar/views.tsx:283 | `works` | |
| Agenda rows | Agenda view, day lists | Open the event, src/clubhouse/screens/calendar/views.tsx:301-309 | `works` | |
| Next event (time, title, arrow) | Panel summary, under the title | Opens that event, src/clubhouse/screens/calendar/inspector.tsx:151-157 | `works` | |
| Overlap rows (Needs attention) | Panel summary, Needs attention | Open the overlap detail, src/clubhouse/screens/calendar/inspector.tsx:189 | `works` | Coach only |
| N replies pending rows | Panel summary, Needs attention | Open the event, src/clubhouse/screens/calendar/inspector.tsx:204 | `works` | Top three, then a count line (inspector.tsx:217) |
| Today (back) | Event detail, top | Back to the summary, src/clubhouse/screens/calendar/inspector.tsx:379 | `works` | |
| More actions (ellipsis) | Event detail, kicker right | Menu, src/clubhouse/screens/calendar/inspector.tsx:383-396 | `works` | |
| Duplicate | Event detail, More actions menu | Not drawn. Listed as not built in docs/clubhouse/PROGRESS.md:406, with no data reason; menu items at src/clubhouse/screens/calendar/inspector.tsx:385-390 | `GAP` | Build in src/clubhouse/screens/calendar/inspector.tsx: a Duplicate item that opens the editor seeded from the event with no id (EditorSeed in editor.tsx gains title, place, notes, time). Reach medium: coaches reuse practice setups. No handler on the board. |
| Copy link | Event detail, More actions menu | Copies the event deep link, src/clubhouse/screens/calendar/inspector.tsx:386 and copyLink :365-375 | `works` | No handler on the board |
| Cancel event | Event detail, More actions menu (danger) | Opens the CancelEvent confirm, then deleteGolfEvent or deleteRecurringEvent, src/clubhouse/screens/calendar/inspector.tsx:388, editor.tsx:612 | `works` | Built asks first (CH-6501); series scopes are Q-73b and Q-73c |
| Review | Event detail, Schedule overlap notice | Opens the overlap detail, src/clubhouse/screens/calendar/inspector.tsx:416 | `works` | |
| Download (file, x N) | Event detail, Files | The file row is a link to the file in a new tab, src/clubhouse/screens/calendar/extras.tsx:354 | `works` | No handler on the board. Built adds Attach and Remove for coaches (not on the board) |
| Edit event | Event detail, footer | Opens the editor with the event, src/clubhouse/screens/calendar/inspector.tsx:465 and onEdit Calendar.tsx:320 | `works` | |
| Attendance | Event detail, footer | Opens the attendance panel, src/clubhouse/screens/calendar/inspector.tsx:469 | `works` | |
| Today (back) | Class detail, top | Back to the summary, src/clubhouse/screens/calendar/inspector.tsx:484 | `works` | |
| Compare schedules | Class detail, footer | Not drawn; ClassDetail has no footer, src/clubhouse/screens/calendar/inspector.tsx:479-515 | `GAP` | Build in src/clubhouse/screens/calendar/inspector.tsx: a Compare schedules button in ClassDetail that opens the new-event editor (Find a time) seeded with the class owner and date. Reach low: coach-only, from a class block. |
| Back (event title) | Attendance panel, top | Back to the event, src/clubhouse/screens/calendar/inspector.tsx:581 | `works` | |
| Mark all present | Attendance panel, header | Marks everyone present locally, src/clubhouse/screens/calendar/inspector.tsx:602-611 | `works` | |
| Present / Late / No-show (x 3 per player) | Attendance panel, per player | Radio segment sets the mark, src/clubhouse/screens/calendar/inspector.tsx:656-665 | `works` | |
| Save attendance · N | Attendance panel, footer | Calls markAttendance per changed mark, src/clubhouse/screens/calendar/inspector.tsx:633-641 and :563 | `works` | |
| Today (back) | Conflict detail, top | Back to the summary, src/clubhouse/screens/calendar/inspector.tsx:730 | `works` | |
| Open time chips (x N) | Conflict detail, Open times | PillGroup picks the proposal, src/clubhouse/screens/calendar/inspector.tsx:767-772 | `works` | Times computed by openTimes (D-9) |
| Review new time | Conflict detail, footer | Opens the editor with the proposal (Move event), src/clubhouse/screens/calendar/inspector.tsx:778 | `works` | |
| Keep as is | Conflict detail, footer | Toasts "Kept as is … Nothing was changed or sent." and returns to summary, src/clubhouse/screens/calendar/inspector.tsx:781-790; D-12, docs/clubhouse/PROGRESS.md:171 | `decided` | Board toast says the player "will be notified"; D-12 says keep sends nothing and says so |
| Close (x) and Cancel | Event editor, header and footer | Modal close and Cancel run requestClose (discard confirm when changed), src/clubhouse/ui/Modal.tsx:90, src/clubhouse/screens/calendar/editor.tsx:377 | `works` | Discard confirm CH-6503 (editor.tsx:575-599) |
| Event title | Event editor, left column | Title input, src/clubhouse/screens/calendar/editor.tsx:396-406 | `works` | |
| Type chips Practice, Qualifier, Tournament, Meeting, Travel (x 5) | Event editor, Type | Segmented of the database types, src/clubhouse/screens/calendar/editor.tsx:415-429 | `works` | Built adds Other (D-11) |
| Workout | Event editor, Type | Not drawn; D-11, docs/clubhouse/PROGRESS.md:170 | `decided` | No column value; workouts are practices |
| Date | Event editor, When | Date input, src/clubhouse/screens/calendar/editor.tsx:434 | `works` | Board input has a no-op onChange |
| Start time / End time | Event editor, When | Time inputs, src/clubhouse/screens/calendar/editor.tsx:435-436 | `works` | Board inputs have no-op onChange |
| All day | Event editor, When | Switch, src/clubhouse/screens/calendar/editor.tsx:444-448 | `works` | |
| Once / Weekly / Weekdays (new event) | Event editor, Repeat | Segmented, then createRecurringEvent, src/clubhouse/screens/calendar/editor.tsx:449-459 and :270-284 | `works` | Built adds an Until date |
| Once / Weekly / Weekdays (editing an event) | Event editor, Repeat, edit mode | Hidden when editing (`!base`), src/clubhouse/screens/calendar/editor.tsx:449; a series shows Apply to scope instead (:468-483) | `GAP` | Build in src/clubhouse/screens/calendar/editor.tsx: repeat choice when editing a one-off. Reach low: turning an event into a series is rare. Needs a server action path (updateGolfEvent cannot make a series). |
| Location | Event editor, left column | Input, src/clubhouse/screens/calendar/editor.tsx:487 | `works` | |
| Notes | Event editor, left column | Textarea, src/clubhouse/screens/calendar/editor.tsx:491 | `works` | |
| Select all / Clear | Event editor, Invite header | Toggles all invitees, src/clubhouse/screens/calendar/editor.tsx:501 | `works` | |
| Invite checkboxes (x 6) | Event editor, Invite list | Toggle each invitee, src/clubhouse/screens/calendar/editor.tsx:509-516 | `works` | Busy at this time shown per name (:520) |
| Find a time band (drag, or press a lane) | Event editor, Find a time | Pointer drag and lane press move the window, src/clubhouse/screens/calendar/editor.tsx:117-120 and :135-150 | `works` | Built adds arrow keys (:90-95) |
| Publish event / Save changes / Move event | Event editor, footer | submit then createGolfEvent, createRecurringEvent, editRecurringEvent or updateGolfEvent, src/clubhouse/screens/calendar/editor.tsx:380 and :265-324 | `works` | |
| Copy link, Team schedule and My schedule (x 2) | Add to your calendar app modal, feed rows | Copy link copies webcal URL, or Create link calls createCalendarFeed, src/clubhouse/screens/calendar/editor.tsx:747-758 | `works` | Coach gets both feeds (editor.tsx:724) |
| Copy link, Tournaments and qualifiers | Add to your calendar app modal, second feed | Not drawn; D-12, docs/clubhouse/PROGRESS.md:171 | `decided` | Database has no competition-only feed |
| Done and Close (x) | Add to your calendar app modal, footer and header | Close the sheet, src/clubhouse/screens/calendar/editor.tsx:728, src/clubhouse/ui/Modal.tsx:90 | `works` | |
| Create event | Empty state (EMPTY.calendar) | CalendarFirstRun Create event opens the editor, src/clubhouse/screens/calendar/CalendarFirstRun.tsx:22 and Calendar.tsx:399-402 | `works` | No handler on the board (no href). D-71, CH-6309; coach whose team never scheduled anything |

### `Coach - Calendar - Mobile.html` (coach, phone)
Built counterpart: src/clubhouse/screens/calendar/CalendarPhone.tsx (rendered from Calendar.tsx:408-449 when useChPhone is true), with the desktop inspector.tsx and editor.tsx in Modal sheets. Phone build: CalendarPhone. Skipped scaffolding: iOS frame, MTabs tab bar, MSafari bar, qm-board frame labels and captions, GHBoards state row, the loading skeleton (GHSkeletonM calendar has no actions), RSVP counts and people chips (not controls).

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| ‹ More (back) | Top bar, left | Coach gets the tab-root top bar titled Calendar, no back, src/clubhouse/screens/calendar/CalendarPhone.tsx:70; Q-67, docs/clubhouse/phone/calendar.md:21 | `decided` | No handler on the board. D-66 made Calendar a coach tab; a player still gets ‹ More (CalendarPhone.tsx:72) |
| New event (+) | Top bar, right | PhoneIconAction opens the editor sheet, src/clubhouse/screens/calendar/CalendarPhone.tsx:70 and onNew Calendar.tsx:429 | `works` | |
| Day / Month / List | Head, view segmented | Segmented maps to day, month, agenda, src/clubhouse/screens/calendar/CalendarPhone.tsx:76-86 | `works` | |
| Week strip days (x 7) | Day view, week strip | Select the day, src/clubhouse/screens/calendar/CalendarPhone.tsx:141-149 | `works` | |
| Agenda rows (events and classes) | Day view, agenda | Open the event sheet, src/clubhouse/screens/calendar/CalendarPhone.tsx:187-194 and the Modal at Calendar.tsx:433-445 | `works` | Board class rows do nothing; built opens the class detail |
| Month cells (x 35) | Month view, grid | Open that day in Day view, src/clubhouse/screens/calendar/CalendarPhone.tsx:236-244 | `works` | |
| List rows | List view, day panels | Open the event sheet, src/clubhouse/screens/calendar/views.tsx:301-309 with onSelect CalendarPhone.tsx:95 | `works` | Built List is the desktop agenda (phone/calendar.md:16) |
| Close (x) and scrim tap | Event sheet, header | Modal close, src/clubhouse/ui/Modal.tsx:90 and :74 | `works` | Drag to dismiss on phone (Modal.tsx:44) |
| Move to (time) suggestion buttons (x 2) | Event sheet, Schedule conflict card | Overlap notice with Review, then open times and Review new time, src/clubhouse/screens/calendar/inspector.tsx:416 and :767-778; docs/clubhouse/phone/calendar.md:14 | `decided` | No handler on the board. Phone spec maps it to the desktop overlap flow (two taps more than the board) |
| Edit | Event sheet, footer | Edit event opens the editor sheet, src/clubhouse/screens/calendar/inspector.tsx:465 and Calendar.tsx:320 | `works` | No handler on the board |
| Message invitees | Event sheet, footer | Not drawn; Q-67, docs/clubhouse/phone/calendar.md:22 (PROGRESS.md:293) | `decided` | No handler on the board. Needs a Messages entry point that starts a group with chosen people |
| Close (x) and scrim tap | New event sheet, header | Modal close runs requestClose (discard confirm), src/clubhouse/ui/Modal.tsx:90, src/clubhouse/screens/calendar/editor.tsx:367 | `works` | |
| Type chips Practice, Qualifier, Tournament, Meeting, Travel (x 5) | New event sheet, top | Editor Segmented, src/clubhouse/screens/calendar/editor.tsx:415-429 | `works` | |
| Workout | New event sheet, type chips | Not drawn; D-11, docs/clubhouse/PROGRESS.md:170; docs/clubhouse/phone/calendar.md:24 | `decided` | |
| Title | New event sheet | Title input, src/clubhouse/screens/calendar/editor.tsx:396-406 | `works` | |
| Date, Time, Repeat, Location, Invite rows (x 5) | New event sheet, form rows | The full editor's fields in a sheet, src/clubhouse/screens/calendar/editor.tsx:434-537; Q-67, docs/clubhouse/phone/calendar.md:23 | `decided` | No handler on the board. Built is the desktop editor, not the compact rows |
| Check class schedules (switch) | New event sheet, form | No switch; the editor always checks invitees against classes, src/clubhouse/screens/calendar/editor.tsx:540-553; Q-67, docs/clubhouse/phone/calendar.md:23 | `decided` | The check is always on in the full editor |
| Create and invite 6 | New event sheet, footer | Publish event runs createGolfEvent or createRecurringEvent, src/clubhouse/screens/calendar/editor.tsx:380 and :265-297 | `works` | No handler on the board. Label is Publish event (full editor, Q-67) |
| Create event | Empty state (EMPTY.calendar, phone) | CalendarFirstRun renders before the phone branch and opens the editor, src/clubhouse/screens/calendar/Calendar.tsx:399-402, CalendarFirstRun.tsx:22 | `works` | No handler on the board. D-71, CH-6309 |

#### Notes
- Five desktop GAPs. Duplicate is medium reach. The other four are low: Print week, the jump panel Close (x), Compare schedules on a class, and Repeat when editing a one-off event. The last needs server work, because recurring-events.ts has no action that turns an event into a series.
- Print week and Duplicate are listed as not built under "Data gaps" (PROGRESS.md:406), but no data reason is given, so they are marked GAP. If the owner confirms that record as a decision, both become `decided`.
- The phone board's differences (top bar, Message invitees, the compact New event form, the Move to buttons) are covered by Q-67 and phone/calendar.md. Q-67 is still open, so if the owner rejects it those rows become GAPs.
- Server actions I checked are real, not stubs: createGolfEvent, updateGolfEvent, deleteGolfEvent, respondToEvent, addCoachBlockedTime, deleteCoachBlockedTime (golf.ts); markAttendance (attendance.ts); createCalendarFeed (calendar-feeds.ts); attach and detach (event-documents.ts); the recurring-event actions.

## Messages (coach)

### `Coach - Messages.html` (coach, desktop)
Built counterpart: src/clubhouse/screens/messages/MessagesView.tsx (Rail, Bubble, Composer, Thread, Details, MuteControl, NewMessage, MessagesDesktop), Messages.tsx (the api over the realtime hooks and actions), MessagesFirstRun.tsx, announcements.tsx, routes/messages.tsx. Phone build: n/a for desktop. Skipped scaffolding: sidebar, top bar crumbs/search/bell/settings, ToastStack dismiss (shell), GHLayer state switcher; the loading skeleton (GHSkeleton messages) draws no control and no failed state is drawn for messages.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| New message (square-pen icon) | Rail header, right of "Messages" | Opens the New message modal, src/clubhouse/screens/messages/MessagesView.tsx:358 (onNew, set at :1863 to setCompose(true), modal at :1927) | `works` | |
| Search people and messages | Rail header, search field | Filters conversations by title and last text, and from 2 characters lists message hits (searchGolfMessages), src/clubhouse/screens/messages/MessagesView.tsx:363 and :444 (MessageHits :181) | `works` | Built also searches message text; a hit opens its conversation (:240) |
| All / Unread · N / Groups | Rail header, segmented filter | Segmented filter over filterConvs, unread counts conversations, src/clubhouse/screens/messages/MessagesView.tsx:369 | `works` | Board also counts conversations here (unread = conversations with unread) |
| Conversation row (x 8) | Rail, Today / This week / Earlier sections | Opens the thread via api.select, src/clubhouse/screens/messages/MessagesView.tsx:281 | `works` | |
| Schedule with this person (calendar-plus icon) | Thread header, right | Coach-only link to the Calendar page, not the editor: rebuiltHref("/golf/dashboard/calendar"), src/clubhouse/screens/messages/MessagesView.tsx:940 and :1002, labelled "Open the calendar" | `GAP` | Build in src/clubhouse/screens/messages/MessagesView.tsx: point the link at /golf/dashboard/calendar?new=1 and label it "Schedule", as D-47 (PROGRESS.md:195) and the phone tile (MessagesPhone.tsx:505) do. Reach medium: thread header, coach, occasional use. |
| Search in conversation (search icon) | Thread header, right | Not drawn; in-thread search hidden until searchGolfMessages takes a conversation, D-48 (docs/clubhouse/PROGRESS.md:196; data gap PROGRESS.md:411) | `decided` | Team-wide search stays in the rail |
| Details (info or users icon) | Thread header, right | Toggles the Details panel, src/clubhouse/screens/messages/MessagesView.tsx:1020 | `works` | |
| Right-click on a bubble (opens the reaction bar) | Thread, any text bubble (onContextMenu) | Nothing on desktop: the right-click path (useLongPress onContextMenu, MessagesView.tsx:568) is only wired when onActions is set, which only the phone passes (MessagesPhone.tsx:401) | `GAP` | Build in src/clubhouse/screens/messages/MessagesView.tsx: on desktop Bubble, onContextMenu opens the reaction picker (setPicking). Reach low: unlabelled gesture; the React tool does the same. |
| React (smile-plus) | Thread, bubble hover tools | Opens the reaction bar, src/clubhouse/screens/messages/MessagesView.tsx:665 | `works` | Built also adds a More (Edit, Delete) menu on your own messages (:670) |
| Reply (reply icon) | Thread, bubble hover tools | Not drawn; threaded replies have no backend, docs/clubhouse/PROGRESS.md:410 | `data-gap` | No handler on the board. golf_messages.reply_to_id exists (src/lib/types/database.ts:14417) but the hook always writes null (src/hooks/golf/use-golf-messages.ts:956); a reply needs a hook write and a quoted-bubble render, no migration |
| Reaction bar: thumbs-up, heart, check, flag, eye (x 5) | Thread, reaction popover | The six stored reactions (thumbs up, heart, laugh, party, surprised, thanks), each toggles via api.react, src/clubhouse/screens/messages/MessagesView.tsx:707; D-14 (PROGRESS.md:173) and D-49 (PROGRESS.md:197, no check) | `decided` | Works end to end (Messages.tsx:515 reactions.setReaction); only the icon set differs, on purpose |
| Reaction chip with count (x N) | Thread, under a bubble | Toggles your reaction, src/clubhouse/screens/messages/MessagesView.tsx:729 | `works` | |
| File bubble (download icon) | Thread, file message | Opens the file's signed URL in a new tab, src/clubhouse/screens/messages/MessagesView.tsx:506 (href :509) | `works` | Failed load is a Try again tile (CH-7209, :481) |
| Open in calendar | Thread, event card in a bubble | Event cards are not rendered: no writer, 0 rows, D-49 (docs/clubhouse/PROGRESS.md:197; phone/messages.md:126) | `decided` | No handler on the board |
| Attach a file (paperclip) | Composer, left | Opens the file picker, sends through sendGolfMessageWithAttachments, src/clubhouse/screens/messages/MessagesView.tsx:869 | `works` | Validation CH-7101 (Messages.tsx:471) |
| Message field, Enter to send / Shift + Enter for a new line | Composer, field and hint | Enter sends, Shift+Enter adds a line, src/clubhouse/screens/messages/MessagesView.tsx:838 | `works` | Hint drawn at :911 |
| Send (arrow-up) | Composer, right | Sends via api.send (useGolfMessages.sendMessage), src/clubhouse/screens/messages/MessagesView.tsx:903 | `works` | A failed send keeps the draft (:826) |
| Close details (x) | Details panel, header | Closes the panel, src/clubhouse/screens/messages/MessagesView.tsx:1348 | `works` | |
| Mute notifications (switch) | Details panel, first section | Mute 8 hours / Mute a week / Until I turn it on, and Unmute, via setGolfConversationMute, src/clubhouse/screens/messages/MessagesView.tsx:1491 (MuteControl :1444) | `works` | A switch on the board, three buttons built; desktop keeps timed mutes by Q-56 / D-47 (PROGRESS.md:282, :195) |
| Add (user-plus), group members | Details panel, members header | Opens AddMembersModal (getGolfGroupAddCandidates, addGolfGroupMember), shown to the group's creator only, src/clubhouse/screens/messages/MessagesView.tsx:1384 | `decided` | Board only toasts "Only players and coaches on this team can be added"; D-47 (PROGRESS.md:195) wired a real Add for the creator |
| Shared files rows (x 2) | Details panel, Shared files section | Not drawn on desktop Details (MessagesView.tsx:1321 to :1442 has no files section) | `GAP` | Build in src/clubhouse/screens/messages/MessagesView.tsx: add the phone's FilesPanel (MessagesPhone.tsx:666, api.files, getGolfConversationFiles, D-48) to desktop Details. Reach low: secondary panel. No handler on the board. |
| Leave group | Details panel, footer (groups) | Opens the leave confirm and calls leaveGolfGroup, hidden from the group's creator, src/clubhouse/screens/messages/MessagesView.tsx:1432 (modal :1211) | `decided` | No handler on the board. Creator can't leave, D-47 / Q-62 (PROGRESS.md:195, :288) |
| Direct / Group / Announcement | New message modal, segmented | Coach-only segmented, resets recipients, src/clubhouse/screens/messages/MessagesView.tsx:1623 | `works` | Players get Direct only (D-15) |
| Find a player or coach | New message modal, search | Filters the directory, src/clubhouse/screens/messages/MessagesView.tsx:1717 | `works` | |
| Person row (x 7) | New message modal, people list | Picks one (Direct) or toggles (Group), src/clubhouse/screens/messages/MessagesView.tsx:1766 | `works` | Built adds a required Group name field (CH-7104, D-45) |
| Remove recipient chip (x) | New message modal, To chips (Group) | Removes the person, src/clubhouse/screens/messages/MessagesView.tsx:1734 | `works` | |
| Title / Message fields | New message modal, Announcement mode | Controlled inputs with validation (CH-7102, CH-7103), src/clubhouse/screens/messages/MessagesView.tsx:1642 and :1658 | `works` | |
| Urgent / Ask players to acknowledge (switches) | New message modal, Announcement mode | Passed to createEnrichedAnnouncement as urgency and requiresAcknowledgement, src/clubhouse/screens/messages/MessagesView.tsx:1674 and :1686; src/clubhouse/screens/messages/Messages.tsx:603 | `works` | D-16 (PROGRESS.md:175) replaced D-13's "not offered" |
| Cancel | New message modal, footer | Closes the modal, src/clubhouse/screens/messages/MessagesView.tsx:1604 | `works` | |
| Start conversation / Create group / Post announcement | New message modal, footer primary | startDirect (createGolfConversation), createGroup (createGolfTeamBroadcast then addGolfGroupMember for coaches) or createAnnouncement (createEnrichedAnnouncement), src/clubhouse/screens/messages/MessagesView.tsx:1607 (go :1570); Messages.tsx:174, :193, :600 | `works` | Opens the new thread or announcement instead of the board's toast only |
| New message | Empty state (EMPTY.messages) | Page empty state opens New message, src/clubhouse/screens/messages/MessagesFirstRun.tsx:22 (onNew set at MessagesView.tsx:1843) | `works` | No handler on the board (no href in EMPTY.messages); CH-7309, D-71 |

### `Coach - Messages - Mobile.html` (coach, phone)
Built counterpart: src/clubhouse/screens/messages/MessagesPhone.tsx (MessagesPhone, PhoneInbox, PhoneThread, PhoneDetails, FilesPanel, PhoneNewMessage), reusing ConvRow, Bubble and Composer from MessagesView.tsx. Phone build: MessagesPhone.tsx, rendered below 820px (MessagesView.tsx:1830). Skipped scaffolding: iOS frame, MSafari, tab bar and More sheet (shell), board labels, GHBoards state row; the loading skeleton (GHSkeletonM messages) draws no control and no failed state is drawn for messages.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| ‹ More | Inbox, top bar left | Returns to the More sheet (coach), src/clubhouse/screens/messages/MessagesPhone.tsx:123 | `works` | No handler on the board. Coach only; a player sees a plain title (:122) |
| New message (square-pen) | Inbox, top bar right | Pushes New message, src/clubhouse/screens/messages/MessagesPhone.tsx:128 | `works` | |
| Search messages | Inbox, search field | Filters conversations and lists message hits, src/clubhouse/screens/messages/MessagesPhone.tsx:206 (MessageHits :285) | `works` | Static on the board (no handler) |
| All / Unread · 4 / Groups (x 3) | Inbox, chips | Chip filter, src/clubhouse/screens/messages/MessagesPhone.tsx:220 | `works` | Unread counts conversations, not messages, D-46 (PROGRESS.md:194) |
| Conversation row (x 8) | Inbox, Today / This week / Earlier | Pushes the thread, src/clubhouse/screens/messages/MessagesView.tsx:281 (ConvRow, used at MessagesPhone.tsx:274) | `works` | Groups use the people mark, not the bus, D-49 |
| Cancel | New message, top bar left | Pops New message, src/clubhouse/screens/messages/MessagesPhone.tsx:787 | `works` | |
| Next / Create group | New message, top bar right | startDirect or createGroup (name required first), src/clubhouse/screens/messages/MessagesPhone.tsx:791 (go :766) | `works` | Group name field added before create, D-45 (PROGRESS.md:193) |
| To token × (x N) | New message, To field | Removes the person, src/clubhouse/screens/messages/MessagesPhone.tsx:802 | `works` | |
| Name or group (To input) | New message, To field | Filters people ("Results"), src/clubhouse/screens/messages/MessagesPhone.tsx:807 | `works` | |
| Whole team | New message, Quick groups | Picks every player and coach and names the group after the team, src/clubhouse/screens/messages/MessagesPhone.tsx:856 | `works` | No handler on the board. Built also adds an Announcement row here (:842), D-44 |
| Pinehurst travel squad | New message, Quick groups | Not drawn: no membership source, D-45 (PROGRESS.md:193; phone/messages.md:204) | `decided` | No handler on the board |
| Seniors | New message, Quick groups | Picks the senior players, group named "Seniors", src/clubhouse/screens/messages/MessagesPhone.tsx:871 | `works` | No handler on the board; D-45 |
| Person row with check (x 7) | New message, People | Toggles the person (players: one at a time, D-15), src/clubhouse/screens/messages/MessagesPhone.tsx:893 | `works` | |
| Attach (+) | New message, composer left | Not drawn: the New message composer has no attach button (MessagesPhone.tsx:911 to :932) | `GAP` | Build in src/clubhouse/screens/messages/MessagesPhone.tsx: an attach button in PhoneNewMessage that hands files to the new thread's Composer with the first message (sendFiles), per phone/messages.md:100. Reach low: first message with a file. No handler on the board. |
| Message field / Send | New message, composer | Draft becomes the first message, sent once the conversation exists, src/clubhouse/screens/messages/MessagesPhone.tsx:913 and :925 | `works` | Send has no handler on the board |
| Back chevron | Thread, top bar left | Pops to the Inbox, src/clubhouse/screens/messages/MessagesPhone.tsx:349 | `works` | |
| Title block (avatar, name, subline) | Thread, top bar centre | Pushes Details, src/clubhouse/screens/messages/MessagesPhone.tsx:351 | `works` | |
| Details (info) | Thread, top bar right | Pushes Details, src/clubhouse/screens/messages/MessagesPhone.tsx:359 | `works` | |
| Attach (+) | Thread, composer left | Opens the file picker (phone Plus icon), src/clubhouse/screens/messages/MessagesView.tsx:869 (Composer phone, MessagesPhone.tsx:421) | `works` | No handler on the board |
| Message field / Send | Thread, composer | Sends via api.send, src/clubhouse/screens/messages/MessagesView.tsx:882 and :903 | `works` | Send has no handler on the board; built adds the long-press actions sheet (CH-7604, MessagesPhone.tsx:423) |
| ‹ Chat | Details, top bar left | Pops Details, src/clubhouse/screens/messages/MessagesPhone.tsx:522 | `works` | |
| Edit (groups) | Details, top bar right | Not drawn, D-48 (docs/clubhouse/PROGRESS.md:196; phone/messages.md:170) | `decided` | No handler on the board; needs a rename action |
| Call | Details, action tiles | Not drawn, D-48 (PROGRESS.md:196; phone/messages.md:156) | `decided` | Phone numbers not loaded, minors' PII |
| Schedule | Details, action tiles | Coach-only link to the Calendar editor, no invitees, src/clubhouse/screens/messages/MessagesPhone.tsx:536 (href :505) | `decided` | D-47 (PROGRESS.md:195). No handler on the board |
| Mute / Muted | Details, action tiles | Toggles mute until turned off via setGolfConversationMute, src/clubhouse/screens/messages/MessagesPhone.tsx:547 | `works` | D-47 |
| Search | Details, action tiles | Not drawn, D-48 (PROGRESS.md:196; phone/messages.md:159) | `decided` | No handler on the board |
| Add | Details, Members header (groups) | Opens AddMembersModal for the group's creator only, src/clubhouse/screens/messages/MessagesPhone.tsx:560 | `decided` | No handler on the board; creator only by D-47 (PROGRESS.md:195) |
| Message (icon) on a member row (x N) | Details, Members (group) | Starts or opens a direct thread, src/clubhouse/screens/messages/MessagesPhone.tsx:650 (message :516, startDirect) | `works` | No handler on the board; not on your own row, as drawn |
| Message (icon) on the other person | Details, People (1:1) | Goes back to this thread, src/clubhouse/screens/messages/MessagesPhone.tsx:517 | `decided` | D-49 (PROGRESS.md:197). No handler on the board |
| File row (x N) | Details, Files | Opens the file through its message's signed URL, src/clubhouse/screens/messages/MessagesPhone.tsx:710 | `works` | No handler on the board. getGolfConversationFiles is HELD behind isClubhouseFor (D-48, D-61, held/features/conversation-files.md) |
| Mute notifications (switch) | Details, settings panel | Same toggle as the tile, src/clubhouse/screens/messages/MessagesPhone.tsx:615 | `works` | |
| Only coaches can post (switch) | Details, settings panel (groups) | Not drawn, D-48 (PROGRESS.md:196; phone/messages.md:167) | `decided` | Needs a column and policy migration |
| Leave group | Details, settings panel (groups) | Leave confirm then leaveGolfGroup, hidden from the creator, src/clubhouse/screens/messages/MessagesPhone.tsx:624 | `decided` | No handler on the board. D-47 / Q-62 (PROGRESS.md:195, :288); the board shows it on a group "created by you" |
| Delete chat | Details, settings panel (1:1) | Not drawn, D-48 (PROGRESS.md:196; phone/messages.md:169) | `decided` | No delete policy on golf_conversations. No handler on the board |
| New message | Empty state (EMPTY.messages) | Page empty state pushes New message, src/clubhouse/screens/messages/MessagesFirstRun.tsx:22 (onNew from MessagesPhone.tsx:249 and :136) | `works` | No handler on the board; CH-7309 |

#### Notes
- Desktop Details has no Files section, although D-48 built getGolfConversationFiles and the phone's FilesPanel (MessagesPhone.tsx:666) already renders it; the data gap at PROGRESS.md:410 ("shared-files list ... no backend") is stale on that point.
- Desktop's thread-header calendar icon goes to /golf/dashboard/calendar, not the editor (?new=1) that D-47 names and the phone tile uses: a one-line fix.
- Reply is recorded as a data gap (PROGRESS.md:410), but golf_messages.reply_to_id already exists; building it is a hook and render change, not a migration.
- Most drawn board controls in the phone Details and several in New message have no handler on the board itself; statuses above judge them by D-44 to D-49.

## Team Hub (coach and player)

### `Coach - Team Hub.html` (coach, desktop)
Built counterpart: src/clubhouse/screens/hub/TeamHub.tsx, parts.tsx, sheets.tsx, writes.ts, HubSkeleton.tsx; src/clubhouse/data/hub.ts; src/clubhouse/routes/hub.tsx (route /golf/dashboard/team-hub rebuilt for coach, src/clubhouse/shell/nav.ts:120). Phone build: n/a. Loading (GHSkeleton hub) has no controls; built as HubSkeleton via src/app/golf/(dashboard)/dashboard/team-hub/loading.tsx:8. The board draws no failed state. Skipped scaffolding: sidebar, top bar (crumbs, search "Search announcements, trips, files", bell, Team Hub settings icon), ToastStack, GHLayer state switcher.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Home / Announcements / Travel / Documents / Tasks (x 5) | Tab strip under the header | Real tabs that switch the panel, src/clubhouse/screens/hub/TeamHub.tsx:293-303 (onClick pick, :251) | `works` | Arrow/Home/End keys too (TeamHub.tsx:257); `?tab=` deep link (TeamHub.tsx:41) |
| New announcement | Header, right | Opens the Announcements tab and the compose sheet, src/clubhouse/screens/hub/TeamHub.tsx:284 (openCompose :263, ComposeSheet :435) | `works` | Compose is a Modal sheet rather than an inline card (docs/clubhouse/phone/team-hub.md:38) |
| Write an announcement for the team… | Announcements tab, top line | Opens the compose sheet, src/clubhouse/screens/hub/parts.tsx:492-498 (rendered TeamHub.tsx:376) | `works` | |
| Edit (pencil icon) | Announcement card footer, right (every card) | Not drawn; the card has only the More menu, src/clubhouse/screens/hub/parts.tsx:138-149 | `GAP` | Build in src/clubhouse/screens/hub/parts.tsx and sheets.tsx: an Edit item opening the compose sheet prefilled, saving through the existing updateAnnouncement (src/app/golf/actions/announcements.ts:1442). Reach medium: a coach fixes a typo or a time in a posted announcement. Reclassified from `decided`: the only record is the implementer's non-goal in docs/clubhouse/pages/P010-hub/DESIGN.md:129-131, not an owner D-n or Q-n. No handler on the board. |
| More (ellipsis icon) | Announcement card footer, right (every card) | Menu with Delete announcement, confirm dialog, then deleteAnnouncement, src/clubhouse/screens/hub/parts.tsx:139-148, TeamHub.tsx:187-202, writes.ts:58 | `works` | No handler on the board; built menu holds Delete only |
| Close (x) | New announcement card, top right | Sheet close button and Cancel, src/clubhouse/ui/Modal.tsx:90, src/clubhouse/screens/hub/sheets.tsx:154 | `works` | |
| Headline and message fields | New announcement card, body | Headline and Message (optional) inputs, src/clubhouse/screens/hub/sheets.tsx:164-177 | `works` | Headline validated, CH-10101 |
| Whole team · 6 / Choose players (x 2) | New announcement card, Send to chips | Whole team · N and Choose players (with a player picker), src/clubhouse/screens/hub/sheets.tsx:181-201, sent as recipientPlayerIds writes.ts:57 | `works` | Board draws no picker for Choose players; built adds one |
| Pinehurst travelers · 5 | New announcement card, Send to chips, middle | Not drawn; only Whole team and Choose players, src/clubhouse/screens/hub/sheets.tsx:181-186 | `GAP` | Build in src/clubhouse/screens/hub/sheets.tsx: a next-trip travelers audience chip (ComposeSheet), fed from the loader's trip attendance (src/clubhouse/data/hub.ts:309-337). Reach medium: every trip-week post. No new action needed |
| Ask players to acknowledge | New announcement card, options switch | Switch sent as requiresAcknowledgement, src/clubhouse/screens/hub/sheets.tsx:209, writes.ts:57 | `works` | |
| Pin to the top | New announcement card, options switch | Not drawn | `decided` | Q-70, docs/clubhouse/PROGRESS.md:296 and docs/clubhouse/phone/team-hub.md:25 (no pinned column) |
| Attach from Documents | New announcement card, options, right | Not drawn; writes.ts:57 sends documentIds: [] | `GAP` | Build in src/clubhouse/screens/hub/sheets.tsx: a document picker in ComposeSheet passing documentIds. Reach medium: posts often carry a waiver or itinerary. createEnrichedAnnouncement already takes documentIds (src/app/golf/actions/announcements.ts:650) |
| Schedule | New announcement card, footer | Not drawn | `decided` | Q-70, docs/clubhouse/PROGRESS.md:296 and docs/clubhouse/phone/team-hub.md:26 (action takes no publish time) |
| Post | New announcement card, footer, primary | Validates, then createEnrichedAnnouncement, closes and refreshes, src/clubhouse/screens/hub/sheets.tsx:157 (submit :136-144), writes.ts:56-57 | `works` | Push line not promised (Q-70) |
| Who’s traveling player chips (x 6) | Travel tab, Plan a trip card | Not drawn; the trip sheet has no travelers field, src/clubhouse/screens/hub/sheets.tsx:296-331 | `GAP` | Build in src/clubhouse/screens/hub/sheets.tsx: a travelers picker in TripSheet (link or create the trip's event and its invitees). Reach medium: every trip. ChTripInput has no event_id though createGolfTravelItinerary takes one (travel.ts:83); needs an invitee write |
| Depart / From / Hotel fields | Travel tab, Plan a trip card | Leaves + At, From, Back + At, Hotel, Notes inputs in the Plan a trip sheet, src/clubhouse/screens/hub/sheets.tsx:319-329 | `works` | Opened from the Plan a trip button, TeamHub.tsx:394; form is a sheet (phone/team-hub.md:38) |
| Rooms field | Travel tab, Plan a trip card | Not drawn; rooms show as text when present, src/clubhouse/screens/hub/parts.tsx:225 | `decided` | docs/clubhouse/phone/team-hub.md:30 (Gaps, Q-70) and P010-hub/DESIGN.md:128-129 (no room editor) |
| Next: Travelers / Logistics / Itinerary / Publish | Travel tab, Plan a trip card footer, primary | One-page sheet whose Save trip calls createGolfTravelItinerary, src/clubhouse/screens/hub/sheets.tsx:290 (submit :263-272), writes.ts:61-74 | `works` | Board's four steps collapse to one form; the Event step has no counterpart (no event link, see travelers row) |
| Back | Travel tab, Plan a trip card footer | Not drawn (single-step sheet has only Cancel, sheets.tsx:287) | `GAP` | Build in src/clubhouse/screens/hub/sheets.tsx: step navigation only if TripSheet becomes the board's multi-step builder. Reach low: only matters with steps. No decision records the one-step form |
| Drop files to share with the team | Documents tab, top | Tap opens the file picker, drop uploads; uploadGolfDocument then createGolfDocument, src/clubhouse/screens/hub/parts.tsx:403-434, TeamHub.tsx:178-186, writes.ts:75-88 | `works` | Goes to the Team folder (Q-70); action permissions under review (Q-74) |
| File row (download) (x N) | Documents tab, each folder | Opens a signed link in a new tab, src/clubhouse/screens/hub/parts.tsx:456, TeamHub.tsx:151-175, writes.ts:51-54 | `works` | No handler on the board |
| Assign | Tasks tab, Assigned tasks card header | Opens the Assign a task sheet, createTask, src/clubhouse/screens/hub/parts.tsx:319, TeamHub.tsx:427/437, writes.ts:59 | `works` | No handler on the board |
| New announcement | Empty state (EMPTY.hub coach), primary | Opens compose on Announcements, src/clubhouse/screens/hub/TeamHub.tsx:318-323 | `works` | Board's action has no destination (gh-states.jsx:18, act() no-op) |
| Plan a trip | Empty state (EMPTY.hub coach), secondary | Opens Travel and the trip sheet, src/clubhouse/screens/hub/TeamHub.tsx:325-336 | `works` | Board's action has no destination |

### `Player - Team Hub.html` (player, desktop)
Built counterpart: same files as the coach board, rendered for the player role (nav.ts:123 lists /golf/dashboard/team-hub for players). Phone build: n/a. EMPTY.hub player has no action (gh-states.jsx:19); built CH-10306 matches, TeamHub.tsx:312-324. Loading has no controls (HubSkeleton). No failed state on the board. Skipped scaffolding: sidebar, top bar (crumbs, search, bell, settings), GHLayer state switcher.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Home / Announcements / Travel / Documents (x 4) | Tab strip under the header | Real tabs that switch the panel, src/clubhouse/screens/hub/TeamHub.tsx:293-303 | `works` | |
| Going / Maybe / Can’t (x 3 per event) | Home, Your RSVPs card, each row | Radio group calling respondToEvent, optimistic with undo, src/clubhouse/screens/hub/parts.tsx:94-100, TeamHub.tsx:106-130/204, writes.ts:48 | `works` | Mandatory tag never shows (Q-71, PROGRESS.md:297) |
| Got it | Home featured announcement and Announcements tab, card footer | acknowledgeAnnouncement, then Acknowledged, src/clubhouse/screens/hub/parts.tsx:166, TeamHub.tsx:131-140, writes.ts:49 | `works` | Home card is the newest post awaiting the player (Q-70, no pinning) |
| Task check box (x N) | Home, Your tasks card, each row | completeTask, optimistic, src/clubhouse/screens/hub/parts.tsx:341, TeamHub.tsx:141-150, writes.ts:50 | `GAP` | Build in src/clubhouse/screens/hub/parts.tsx and src/app/golf/actions/tasks.ts: let a player untick a task (needs an uncomplete action; tasks.ts has none), as the board toggles both ways. Reach low: an accidental tick is rare. Reclassified from `works` (ticking works at parts.tsx:341; untick has no counterpart and no decision). |
| File row (download) (x N) | Documents tab, each folder | Opens a signed link in a new tab, src/clubhouse/screens/hub/parts.tsx:456, TeamHub.tsx:151-175, writes.ts:51-54 | `works` | No handler on the board |

### `Coach and Player - Team Hub - Mobile.html` (coach and player, phone)
Built counterpart: the same TeamHub, phone layout via useChPhone (src/clubhouse/screens/hub/TeamHub.tsx:81, PhoneTop :270-271) and CSS at 820px (src/clubhouse/styles/hub.css:862); forms are bottom sheets. Phone build: yes (no [no-phone-build] rows). Board's inline compose and trip builder are sheets in the build (docs/clubhouse/phone/team-hub.md:38). Loading boards (GHSkeletonM) have no controls; no failed state drawn; EMPTY.hub player has no action. Skipped scaffolding: MTop bell, MTabs tab bar, MSafari, iOS frame, board labels, GHBoards state row.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Home / Announcements / Travel / Documents (x 4) | Player: segmented tab strip under the top bar | Scrolling tab strip, src/clubhouse/screens/hub/TeamHub.tsx:293-303 | `works` | Player reaches Team Hub from the tab bar (D-66) |
| Home / Announcements / Travel / Documents / Tasks (x 5) | Coach: tab strip under the top bar | Same tabs, src/clubhouse/screens/hub/TeamHub.tsx:293-303 | `works` | Coach opens from More with a "‹ More" back, TeamHub.tsx:271 |
| New announcement | Coach: header, full-width button | Opens compose sheet, src/clubhouse/screens/hub/TeamHub.tsx:284 | `works` | |
| Going / Maybe / Can’t (x 3 per event) | Player: Home, Your RSVPs card | respondToEvent radios, src/clubhouse/screens/hub/parts.tsx:94-100, writes.ts:48 | `works` | |
| Create event | Coach: Home, RSVPs card empty ("No events need RSVPs") | Link to the Calendar editor, /golf/dashboard/calendar?new=1, src/clubhouse/screens/hub/parts.tsx:57 | `works` | No handler on the board. Calendar rebuilt for coach (nav.ts:114); new=1 handled, calendar/page.tsx:64. Player empty ("You’re all caught up") has no action |
| Got it | Player: Home and Announcements, card footer | acknowledgeAnnouncement, src/clubhouse/screens/hub/parts.tsx:166, writes.ts:49 | `works` | |
| Task check box (x N) | Player: Home, Your tasks card | completeTask, src/clubhouse/screens/hub/parts.tsx:341, writes.ts:50 | `GAP` | Build in src/clubhouse/screens/hub/parts.tsx and src/app/golf/actions/tasks.ts: let a player untick a task (needs an uncomplete action; tasks.ts has none), as the board toggles both ways. Reach low: an accidental tick is rare. Reclassified from `works` (ticking works at parts.tsx:341; untick has no counterpart and no decision). |
| Edit (pencil icon) | Coach: Home and Announcements, card footer | Not drawn, src/clubhouse/screens/hub/parts.tsx:138-149 | `GAP` | Build in src/clubhouse/screens/hub/parts.tsx and sheets.tsx: an Edit item opening the compose sheet prefilled, saving through the existing updateAnnouncement (src/app/golf/actions/announcements.ts:1442). Reach medium: a coach fixes a typo or a time in a posted announcement. Reclassified from `decided`: the only record is the implementer's non-goal in docs/clubhouse/pages/P010-hub/DESIGN.md:129-131, not an owner D-n or Q-n. No handler on the board. |
| More (ellipsis icon) | Coach: Home and Announcements, card footer | Menu with Delete announcement, src/clubhouse/screens/hub/parts.tsx:139-148, writes.ts:58 | `works` | No handler on the board |
| Write an announcement for the team… | Coach: Announcements tab (when compose is closed) | Opens compose sheet, src/clubhouse/screens/hub/parts.tsx:492-498 | `works` | |
| Close (x) | Coach: New announcement card (c-ann board) | Sheet close and Cancel, src/clubhouse/ui/Modal.tsx:90, sheets.tsx:154 | `works` | Sheet drags to dismiss on the phone |
| Headline and message fields | Coach: New announcement card | Inputs, src/clubhouse/screens/hub/sheets.tsx:164-177 | `works` | |
| Whole team · 6 / Choose players (x 2) | Coach: New announcement, Send to chips | src/clubhouse/screens/hub/sheets.tsx:181-201 | `works` | |
| Pinehurst travelers · 5 | Coach: New announcement, Send to chips | Not drawn, src/clubhouse/screens/hub/sheets.tsx:181-186 | `GAP` | Build in src/clubhouse/screens/hub/sheets.tsx: a next-trip travelers audience chip. Reach medium: trip-week posts. Loader already has trip attendance (data/hub.ts:309-337) |
| Ask players to acknowledge | Coach: New announcement, options switch | src/clubhouse/screens/hub/sheets.tsx:209, writes.ts:57 | `works` | |
| Pin to the top | Coach: New announcement, options switch | Not drawn | `decided` | Q-70, docs/clubhouse/PROGRESS.md:296; phone/team-hub.md:25 |
| Attach from Documents | Coach: New announcement, options | Not drawn; writes.ts:57 sends documentIds: [] | `GAP` | Build in src/clubhouse/screens/hub/sheets.tsx: a document picker passing documentIds. Reach medium: posts carry files. Action already accepts documentIds (announcements.ts:650) |
| Schedule | Coach: New announcement footer | Not drawn | `decided` | Q-70, docs/clubhouse/PROGRESS.md:296; phone/team-hub.md:26 |
| Post | Coach: New announcement footer, primary | createEnrichedAnnouncement, src/clubhouse/screens/hub/sheets.tsx:157, writes.ts:56-57 | `works` | |
| Who’s traveling player chips (x 6) | Coach: Travel tab, Plan a trip card (c-travel board) | Not drawn, src/clubhouse/screens/hub/sheets.tsx:296-331 | `GAP` | Build in src/clubhouse/screens/hub/sheets.tsx: a travelers picker in TripSheet. Reach medium: every trip. Needs event_id in ChTripInput and an invitee write |
| Depart / From / Hotel fields | Coach: Plan a trip card | Trip sheet inputs, src/clubhouse/screens/hub/sheets.tsx:319-329 | `works` | Opened by Plan a trip, TeamHub.tsx:394 |
| Rooms field | Coach: Plan a trip card | Not drawn | `decided` | docs/clubhouse/phone/team-hub.md:30 (Gaps, Q-70) |
| Next: Travelers / Logistics / Itinerary / Publish | Coach: Plan a trip card footer, primary | Save trip, createGolfTravelItinerary, src/clubhouse/screens/hub/sheets.tsx:290, writes.ts:61-74 | `works` | Steps collapse to one sheet |
| Back | Coach: Plan a trip card footer | Not drawn (Cancel only, sheets.tsx:287) | `GAP` | Build in src/clubhouse/screens/hub/sheets.tsx: step navigation if TripSheet becomes multi-step. Reach low: only with steps |
| Drop files to share with the team | Coach: Documents tab, top (c-docs board) | Tap opens the file picker, uploads, src/clubhouse/screens/hub/parts.tsx:403-434, writes.ts:75-88 | `works` | Q-74 pending review |
| File row (download) (x N) | Coach and player: Documents tab (p-docs, c-docs) | Opens a signed link, src/clubhouse/screens/hub/parts.tsx:456, writes.ts:51-54 | `works` | |
| Assign | Coach: Tasks tab, card header (c-tasks board) | Assign a task sheet, createTask, src/clubhouse/screens/hub/parts.tsx:319, writes.ts:59 | `works` | No handler on the board |
| New announcement | Coach: Empty state (EMPTY.hub coach, GHBoards) | src/clubhouse/screens/hub/TeamHub.tsx:318-323 | `works` | Board's action has no destination |
| Plan a trip | Coach: Empty state (EMPTY.hub coach, GHBoards) | src/clubhouse/screens/hub/TeamHub.tsx:325-336 | `works` | Board's action has no destination |

#### Notes
- The Edit pencil is a GAP here, reclassified from `decided`: the only record is the implementer's non-goal in docs/clubhouse/pages/P010-hub/DESIGN.md:129-131, not an owner D-n or Q-n, and `updateAnnouncement` already exists (src/app/golf/actions/announcements.ts:1442), so building it needs no new action.
- The trip builder's travelers and Event step have no path, because `ChTripInput` (writes.ts:31-43) carries no `event_id`. Fix that one thing and the travelers chips, the "Pinehurst travelers" audience and the player's "You're traveling" line (Q-70) all get a source.
- Q-74: coach upload and delete stay `works`, but `uploadGolfDocument` checks only sign-in and `deleteGolfDocument` lets any team member through. A security review is due before the flag turns on.
- Every board sheet (compose, trip builder) is drawn inline. The build uses Modal sheets on both desktop and phone (phone/team-hub.md:38). Inline versus sheet is not counted as a gap.
- Player task ticks are one-way in the build: there is no uncomplete action in tasks.ts. The board lets a player untick, so the task check box rows are GAP rows here (reclassified from `works`).

## Qualifiers (coach; the player reads the same list and detail)

### `Coach - Qualifiers.html` (coach, desktop)
Built counterpart: src/clubhouse/screens/qualifiers/ (QualifiersList, QualifierDetail, QualifierSections, QualifierForm, writes), src/clubhouse/routes/qualifiers.tsx, src/clubhouse/data/qualifiers.ts. Phone build: n/a for desktop. Skipped scaffolding: FairwaySidebar, FairwayTopBar (crumbs, search, bell, settings), ToastStack, the GHLayer state switcher; round-by-round header tooltips (title on R1..Rn) are not controls.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Create qualifier | List, header, right | Link to /golf/dashboard/qualifiers/new, src/clubhouse/screens/qualifiers/QualifiersList.tsx:78 | `works` | Coach only; hidden when the team has no qualifiers, where the empty state carries it (QualifiersList.tsx:75) |
| All / Active / Concluded pills (x 3) | List, tools row, left | Filters the loaded list with counts, src/clubhouse/screens/qualifiers/QualifiersList.tsx:129 (choose at :47) | `works` | Select haptic on change |
| Search qualifiers by name, course, or detail | List, tools row, right | Filters name, description, course, src/clubhouse/screens/qualifiers/QualifiersList.tsx:135 (match at :39) | `works` | |
| Clear filters | List, filtered-empty state ("No qualifiers match your filters") | Resets filter and search, src/clubhouse/screens/qualifiers/QualifiersList.tsx:157 | `works` | CH-09302 |
| Hero card (View leaderboard / View details) | List, top hero | Link to /golf/dashboard/qualifiers/[id], src/clubhouse/screens/qualifiers/QualifiersList.tsx:221 | `works` | Leaders well shows only when live and standings loaded (:219) |
| Qualifier cards (x N, Active and Concluded) | List, Active and Concluded grids | Link to /golf/dashboard/qualifiers/[id], src/clubhouse/screens/qualifiers/QualifiersList.tsx:266 | `works` | |
| Create qualifier | Empty state (EMPTY.qualifiers, GHLayer empty) | Link to /qualifiers/new in the page empty state, src/clubhouse/screens/qualifiers/QualifiersList.tsx:111 | `works` | No handler on the board (gh-states.jsx:24 has no href). Coach only; player sees copy without an action (CH-09301) |
| Qualifiers (back) | Detail, top left | Link to /golf/dashboard/qualifiers, src/clubhouse/screens/qualifiers/QualifierDetail.tsx:136 | `works` | |
| Edit qualifier | Detail, header actions | Link to /qualifiers/[id]/edit (prefilled form, runEditPlan), src/clubhouse/screens/qualifiers/QualifierDetail.tsx:156 | `works` | Board only toasts; built per D-32 / Q-11 (PROGRESS.md:210). Coach only |
| Close qualifier | Detail, header actions (live only) | Confirm modal, then updateQualifierStatus(id, completed), src/clubhouse/screens/qualifiers/QualifierDetail.tsx:164 and :106, writes.ts:107 | `works` | Adds a confirm step (CH-09501); closed copy follows D-31 (PROGRESS.md:209), not the board's "started rounds can still be submitted" |
| Reopen qualifier | Detail, header actions (after close) | updateQualifierStatus(id, in_progress), src/clubhouse/screens/qualifiers/QualifierDetail.tsx:177 (reopen at :65) | `works` | Shown on every completed qualifier per D-31, not only right after a close |
| Leaderboard row / chevron (x N) | Detail, Leaderboard, each ranked row | Toggles the row's scorecard tray, src/clubhouse/screens/qualifiers/QualifierDetail.tsx:376 (row) and :411 (chevron button) | `works` | Player can open only their own row (D-30, :331); unscored rows are static as on the board |
| Open selection workspace | Detail, Selections card, footer | Replaced by "Manage selections" in the header, linking to /qualifiers/[id]/selection, src/clubhouse/screens/qualifiers/QualifierDetail.tsx:152 | `decided` | Q-65 (docs/clubhouse/PROGRESS.md:291) builds the workspace as Manage selections, going past D-32. Differs: header not card footer, shown also on upcoming, hidden once the squad is confirmed |
| Qualifiers (back) | Create form, top left | Back to the list; asks "Discard your changes?" when dirty, src/clubhouse/screens/qualifiers/QualifierForm.tsx:199 (cancel at :155) | `works` | CH-09502 |
| Qualifier name, Description | Create form, Basics | Controlled inputs, src/clubhouse/screens/qualifiers/QualifierForm.tsx:241 and :253 | `works` | Inline validation CH-09101 |
| Start date, End date, Entry deadline (x 3) | Create form, Schedule | Date inputs, src/clubhouse/screens/qualifiers/QualifierForm.tsx:275, :282, :290 | `works` | Deadline help reworded per the Data gaps note (PROGRESS.md:437) |
| Rounds | Create form, Course and rules | Numeric input, resets the one-round acknowledgement, src/clubhouse/screens/qualifiers/QualifierForm.tsx:310 | `works` | 1 to 50 (CH-09105) |
| Course | Create form, Course and rules | Free-text course input, src/clubhouse/screens/qualifiers/QualifierForm.tsx:318 | `works` | Built also adds a per-round course and tee picker (CoursePicker) per D-33 (PROGRESS.md:214), not drawn |
| This qualifier intentionally allows one 18-hole round (checkbox) | Create form, shown when Rounds is 1 | Checkbox gating submit, src/clubhouse/screens/qualifiers/QualifierForm.tsx:323 | `works` | CH-09106 |
| Scoring rules | Create form, Course and rules | Textarea, src/clubhouse/screens/qualifiers/QualifierForm.tsx:345 | `works` | |
| Player checkboxes (x 7) | Create form, Players | Toggle entrants, src/clubhouse/screens/qualifiers/QualifierForm.tsx:378 (toggle at :157) | `works` | Select haptic (CH-09701) |
| Squad size, Coach's picks | Create form, Travel squad | Numeric inputs feeding the readout, src/clubhouse/screens/qualifiers/QualifierForm.tsx:419 and :432 | `works` | |
| Cancel | Create form, sticky footer | Same cancel as back, src/clubhouse/screens/qualifiers/QualifierForm.tsx:453 | `works` | |
| Create qualifier | Create form, sticky footer | Submit: validateForm then createGolfQualifier, opens the new qualifier, src/clubhouse/screens/qualifiers/QualifierForm.tsx:456, :70, writes.ts:104 | `works` | Action at src/app/golf/actions/golf.ts:4383; CH-09001 |

### `Coach - Qualifiers - Mobile.html` (coach, phone)
Built counterpart: list and form are the desktop QualifiersList and QualifierForm with phone CSS and PhoneTop; detail is src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx (chosen by useChPhone at QualifierDetail.tsx:115) with the PlayerRounds sheet. Phone build: yes (as the phone spec, docs/clubhouse/phone/qualifiers.md:50, describes). Skipped scaffolding: board labels, SafariBar, inline qm-tabs tab bar, the top bar bell (shell top bar), GHBoards frames and their MTop/MTabs.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Create qualifier | 01 List, full-width primary under the head | Link to /qualifiers/new, src/clubhouse/screens/qualifiers/QualifiersList.tsx:78 | `works` | Same component as desktop at phone width |
| All / Active / Concluded pills (x 3) | 01 List, pills row | Filters the list, src/clubhouse/screens/qualifiers/QualifiersList.tsx:129 | `works` | |
| Search qualifiers | 01 List, under the pills | Filters name, description, course, src/clubhouse/screens/qualifiers/QualifiersList.tsx:135 | `works` | No handler on the board (drawn unwired); phone spec asks it to filter (phone/qualifiers.md:48) |
| Hero card | 01 List, hero | Link to the detail, src/clubhouse/screens/qualifiers/QualifiersList.tsx:221 | `works` | |
| Qualifier cards (x N, Active and Concluded) | 01 List, sections | Link to the detail, src/clubhouse/screens/qualifiers/QualifiersList.tsx:266 | `works` | |
| Qualifiers (back) | 02 Detail, top bar left | router.push to the list, src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:67 | `works` | |
| Manage selections | 02 Detail and 05 Completed, action row | Link to /qualifiers/[id]/selection (start selecting, picks with reason, confirm squad), src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:82 | `works` | No handler on the board. Built 2026-09-30 per Q-65 (PROGRESS.md:291); route page src/app/golf/(dashboard)/dashboard/qualifiers/[id]/selection/page.tsx:24. Hidden once the squad is confirmed, so absent on board 05's state |
| Edit | 02 Detail, action row (ghost) | Opens a sheet: Edit details (link to /edit), Close or Reopen qualifier, src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:86 and :136 | `decided` | No handler on the board. Q-20 via D-33 (PROGRESS.md:375, :211): Close and Reopen sit behind Edit as a sheet action |
| Leaderboard row card (x N) | 02 Detail, Leaderboard | Opens the PlayerRounds sheet, src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:277 | `works` | Player can open only their own row (:226) |
| Close (x) and scrim tap | 03 Player rounds sheet, header right / backdrop | Modal close button and backdrop dismiss, src/clubhouse/ui/Modal.tsx:90 and :74 | `works` | Also drag to dismiss on phone (Modal.tsx:44) |
| Round chips R1 to Rn (x N) | 03 Player rounds sheet, chip row | Select a round; unplayed disabled, src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:363 | `works` | |
| Message | 03 Player rounds sheet, footer left | Link to /golf/dashboard/messages?player=<id> through rebuiltHref, src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:325 and :338 | `works` | No handler on the board. Deep link opens or starts the thread (src/clubhouse/screens/messages/Messages.tsx:103). Coach only |
| Stats | 03 Player rounds sheet, footer right | Link to /golf/dashboard/stats?player=<id> through rebuiltHref, src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:326 and :343 | `works` | No handler on the board. Stats route takes player (src/app/golf/(dashboard)/dashboard/stats/page.tsx:49) |
| Cancel | 04 Create, top bar left | PhoneTop back runs cancel (discard confirm when dirty), src/clubhouse/screens/qualifiers/QualifierForm.tsx:190 | `works` | |
| Create | 04 Create, top bar right | PhoneTextAction submit to createGolfQualifier, src/clubhouse/screens/qualifiers/QualifierForm.tsx:192 | `works` | Board goes to a fixed detail; built validates and opens the new one |
| Qualifier name, Description | 04 Create, Basics | Controlled inputs, src/clubhouse/screens/qualifiers/QualifierForm.tsx:241 and :253 | `works` | |
| Start, End, Entry deadline (x 3) | 04 Create, Schedule | Date inputs, src/clubhouse/screens/qualifiers/QualifierForm.tsx:275, :282, :290 | `works` | |
| Rounds | 04 Create, Course and rules | Numeric input, src/clubhouse/screens/qualifiers/QualifierForm.tsx:310 | `works` | |
| Course | 04 Create, Course and rules | Free-text course input, src/clubhouse/screens/qualifiers/QualifierForm.tsx:318 | `works` | Phone keeps every web field, incl. Scoring rules and the round-course picker (Q-20 via D-33) |
| This qualifier intentionally allows one 18-hole round (checkbox) | 04 Create, when Rounds is 1 | Checkbox gating submit, src/clubhouse/screens/qualifiers/QualifierForm.tsx:323 | `works` | No handler on the board (uncontrolled) |
| Squad size, Coach's picks | 04 Create, Travel squad | Numeric inputs and readout, src/clubhouse/screens/qualifiers/QualifierForm.tsx:419 and :432 | `works` | |
| Player checkboxes (x 7) | 04 Create, Players | Toggle entrants, src/clubhouse/screens/qualifiers/QualifierForm.tsx:378 | `works` | |
| Create qualifier | Empty state (EMPTY.qualifiers, GHBoards empty phone) | Link to /qualifiers/new, src/clubhouse/screens/qualifiers/QualifiersList.tsx:111 | `works` | No handler on the board (gh-states.jsx:24 has no href) |

#### Notes
- No GAP in this unit: every drawn Qualifiers control leads somewhere. The only desktop difference is "Open selection workspace", built as "Manage selections" in the header (Q-65). Manage selections is really there: QualifierDetail.tsx:152, QualifierDetailPhone.tsx:82, and the route (qualifiers.tsx:46, nav.ts:132 allows /selection).
- The desktop board does not draw Selection or a course picker. The course picker (CoursePicker.tsx) and the selection screen (QualifierSelection.tsx) are Clubhouse additions (D-33, Q-65), so they have no rows.
- gh-states.jsx defines no failed state and no Try again for qualifiers, only empty (EMPTY.qualifiers) and loading. Clubhouse still has Try again on its failure notices (CH-09201 and others).
- The board draws a bell in the phone top bar on List and Detail. I skipped it as shell. Clubhouse draws "‹ More" on the list (D-66) and a "Qualifier actions" ellipsis on the detail (QualifierDetailPhone.tsx:68), which the board does not draw.
- docs/clubhouse/phone/qualifiers.md:3 cites the v1 path `design/handoff/mobile/Qualifiers Mobile.html`. The v2 `qual-mobile.jsx` is byte-identical to `mobile/qual-mobile.jsx`, so the spec still holds.

## Rounds (player; the review is also open to a coach)

### `Player - Rounds.html` (player, desktop), part A: library, course picker, add a course, setup
Built counterpart: src/clubhouse/screens/rounds/RoundsLibrary.tsx, parts.tsx, setup/RoundSetup.tsx, setup/CoursePicker.tsx, setup/AddCourseSheet.tsx, setup/HoleConfig.tsx, routes/rounds.tsx, preview/PreviewSetup.tsx (setup is mounted only by the preview). Phone build: n/a for desktop. Skipped scaffolding: sidebar, top bar (search, bell, settings), GHLayer state switcher; tracking and review controls belong to Rounds part B; the season ribbon bars only carry a hover title (no action).

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| New round | Library header, right | Not drawn: `roundsLinks.newRound` is rebuiltHref('/golf/dashboard/rounds/new','player'), src/clubhouse/screens/rounds/RoundsLibrary.tsx:29, gated at :105 | `hidden-until-rebuilt` | /golf/dashboard/rounds/new is not in CH_REBUILT_ROUTES.player (src/clubhouse/shell/nav.ts:123) nor the uuid pattern (:141). Q-78 (PROGRESS.md:304); ROUNDS_PLAN.md:25 |
| In-progress card, Continue at hole 4 (whole card is a button) | Library hero, left card | Card drawn; Continue link not drawn: rebuiltHref('/golf/dashboard/rounds/continue/<id>','player') RoundsLibrary.tsx:30, rendered only if set at src/clubhouse/screens/rounds/parts.tsx:147 | `hidden-until-rebuilt` | continue/<id> not in nav.ts:123 or :141 (player). Q-78. Built puts the action on the CTA link, not the whole card; Discard (trash) is built-only |
| Show example | Library hero, idle card, top right | Not drawn | `decided` | Board device, dropped: docs/clubhouse/phone/rounds.md:34 and ROUNDS_PLAN.md:80 |
| Start a round | Library hero, idle card footer | Not drawn: startHref is the same newHref, parts.tsx:107, passed at RoundsLibrary.tsx:137 | `hidden-until-rebuilt` | /rounds/new not rebuilt for player (nav.ts:123). Q-78; catalog/rounds.md:67 (CH-11304). Same rule as Home's Start a round (Q-69, PROGRESS.md:295) |
| Search course… | Book toolbar, left | Filters the book by course name, SearchField src/clubhouse/screens/rounds/RoundsLibrary.tsx:185, filter in groupRounds :35-37 | `works` | No match shows CH-11303 (RoundsLibrary.tsx:198) |
| By month / By course (x 2) | Book toolbar, right | Segmented regroups the book, src/clubhouse/screens/rounds/RoundsLibrary.tsx:186-195, grouping key at :40 | `works` | |
| Round card (x N) | Book, each round row | Link to the round's review /golf/dashboard/rounds/<id>, src/clubhouse/screens/rounds/parts.tsx:363, href from src/clubhouse/screens/rounds/RoundsLibrary.tsx:31 and :222 | `works` | Review is rebuilt for player by the uuid pattern nav.ts:141; its contents belong to Rounds part B |
| Course row (x N: Recently played, Team courses, Course library, Results) | Course picker sheet, lists | Opens that course's tees, src/clubhouse/screens/rounds/setup/CoursePicker.tsx:98-105 | `decided` | [preview-only] setup mounts only at /clubhouse-preview/setup (src/clubhouse/preview/PreviewSetup.tsx:30); /rounds/new not rebuilt, Q-78 (PROGRESS.md:304) |
| Search courses | Course picker sheet, top | Filters the lists with groupCourses, CoursePicker.tsx:77 and :72 | `decided` | [preview-only] Q-78. No-match copy CH-11310 (CoursePicker.tsx:121-126) |
| Add a course | Course picker sheet, below the lists | Closes the picker and opens Add a course, CoursePicker.tsx:127 into RoundSetup.tsx:367-370 | `decided` | [preview-only] Q-78 |
| Close (x) and scrim tap | Course picker sheet, header right / outside | Modal close button src/clubhouse/ui/Modal.tsx:90, backdrop click :73-74, Escape :69-71, onClose at RoundSetup.tsx:363 | `decided` | [preview-only] Q-78 |
| ‹ Courses | Course picker, tees stage, header left | Back to the course list, CoursePicker.tsx:146 | `decided` | [preview-only] Q-78 |
| Tee card (x N) | Course picker, tees stage | Picks the tee and loads its scorecard, CoursePicker.tsx:167-176 into RoundSetup.tsx:75-87 | `decided` | [preview-only] Q-78. One length bar instead of per-hole bars (Q-72h, PROGRESS.md:298); draft tees are disabled |
| Close (x), and ‹ Courses on step 1 | Add a course sheet, header | Closes to the setup screen (AddCourseSheet.tsx:55-58, :102; RoundSetup.tsx:374); the board reopens the course picker (rounds-flow.jsx:249) | `GAP` | Build in src/clubhouse/screens/rounds/setup/RoundSetup.tsx: when Add a course closes, reopen CoursePicker on the course list. Reach low: only when a player backs out of adding a course. [preview-only] |
| ‹ previous step (Course, Tees, Holes) | Add a course sheet, steps 2 to 4 | Footer ghost button goes back a step, src/clubhouse/screens/rounds/setup/AddCourseSheet.tsx:96-100 | `decided` | [preview-only] Q-78. Built puts Back in the footer, not the header |
| Course name, City, State (x 3) | Add a course, step 1 | Inputs, AddCourseSheet.tsx:128-137 | `decided` | [preview-only] Q-78 |
| 18 holes / 9 holes (x 2) | Add a course, step 1 | Radios reshape the card, AddCourseSheet.tsx:143-147, setCountAndCard :81-84 | `decided` | [preview-only] Q-78 |
| Add a course photo | Add a course, step 1 | Not drawn | `decided` | Q-72a (PROGRESS.md:298); phone/rounds.md:98. No handler on the board |
| Tee chips (x N) and Add tee | Add a course, step 2, top | Not drawn: one tee per typed course | `decided` | docs/clubhouse/phone/rounds.md:99 ("One tee, not the board's several"), Q-72h |
| Tee colour swatches (x 6) | Add a course, step 2 | Radio group sets colour and default name, AddCourseSheet.tsx:157-170 | `decided` | [preview-only] Q-78 |
| Tee name, Course rating, Slope (x 3) | Add a course, step 2 | Inputs, AddCourseSheet.tsx:176-185 (rating and slope optional) | `decided` | [preview-only] Q-78 |
| Par 3 / 4 / 5 per hole (x 18) | Add a course, step 3 | HoleConfig par radios, src/clubhouse/screens/rounds/setup/HoleConfig.tsx:98-113, mounted at AddCourseSheet.tsx:194 | `decided` | [preview-only] Q-78. Pars 3 to 6 (phone/rounds.md:102) |
| Yardage per hole (x 18) | Add a course, step 3 | Inputs, HoleConfig.tsx:116-124 | `decided` | [preview-only] Q-78 |
| Next: Tees / Holes / Review | Add a course, footer right | Advances once addCourseIssue is clear, AddCourseSheet.tsx:109 | `decided` | [preview-only] Q-78 |
| Save and pick tees | Add a course, step 4 footer | "Use this course": the typed course and holes go on the round, AddCourseSheet.tsx:59-80 into RoundSetup.tsx:375-379; "Save this course for next time" checkbox :211 | `decided` | Q-72h (PROGRESS.md:298): the course is the round's own, so no tee pick follows. [preview-only] |
| ‹ Rounds | Setup band, top left | Link to backHref, RoundSetup.tsx:117 (preview passes /clubhouse-preview/rounds, PreviewSetup.tsx:30) | `decided` | [preview-only] Q-78 |
| Browse courses | Setup, course card (no course) | Opens the course picker, RoundSetup.tsx:176 | `decided` | [preview-only] Q-78 |
| Change tees | Setup, course card footer | "Change course": opens the course list, not the tees, RoundSetup.tsx:162 | `decided` | catalog/rounds.md:101 (CH-11510, "Browse courses (or Change course)"). [preview-only] Q-78 |
| Active qualifier · Play | Setup, below the course card | "Open qualifier · Play": sets type, qualifier, course and tees, RoundSetup.tsx:185, playQualifier :89-93 | `decided` | [preview-only] Q-78 |
| Practice / Tournament / Qualifier (x 3) | Round details, Round type | Radios, RoundSetup.tsx:208-221 | `decided` | [preview-only] Q-78. Qualifier shows the qualifier list (CH-11211, CH-11312) |
| Date | Round details | Date input, max today, RoundSetup.tsx:227-235 | `decided` | [preview-only] Q-78. Future date blocks Start (CH-11109) |
| 9 holes / 18 holes (x 2) | Round details, Holes | Radios, RoundSetup.tsx:240-254 | `decided` | [preview-only] Q-78 |
| Front 9 / Back 9 (x 2) | Scorecard card header (9 holes) | Radios, HoleConfig.tsx:56-76 | `decided` | [preview-only] Q-78 |
| Par 3 / 4 / 5 per hole (x N) | Scorecard card, each hole | Radios, HoleConfig.tsx:98-113 via RoundSetup.tsx:317 | `decided` | [preview-only] Q-78. Edited holes marked |
| Yardage per hole (x N) | Scorecard card, each hole | Inputs, HoleConfig.tsx:116-124 | `decided` | [preview-only] Q-78. Bad yardage CH-11107 |
| Start round | Setup dock, right | useAction start.run(form) into ports.start, RoundSetup.tsx:346-354 and :96-104; only the preview supplies a port (PreviewSetup.tsx:25) | `decided` | [preview-only] Q-78: the engine's start(form) is not a port yet (ROUNDS_PLAN.md:68) |
| Back to setup | Started screen (rounds-flow.jsx Started) | Not built; Start opens tracking directly (onStarted, PreviewSetup.tsx:30) | `decided` | phone/rounds.md:100: setup ends when tracking opens. Not drawn on any frame: the board's Start goes to tracking (rounds-flow.jsx:243) |
| Start a round | Empty state (EMPTY.rounds) | Not drawn: EmptyState action is newHref, null today, RoundsLibrary.tsx:120 | `hidden-until-rebuilt` | No handler on the board (gh-states.jsx:25 has no href; act is a no-op, :32). /rounds/new not in nav.ts:123. Q-78; catalog/rounds.md:64 |

### `Player - Rounds - Mobile.html` (player, phone), part A: library, course picker, add a course, setup
Built counterpart: the same components, phone-aware (no separate *Phone.tsx): RoundsLibrary.tsx:55 useChPhone and PhoneTop :99, RoundSetup.tsx:61 usePhoneTabsHidden, Modal as a draggable bottom sheet (src/clubhouse/ui/Modal.tsx:79). Phone build: yes, as above. Skipped scaffolding: iOS frame, MTop bell, MTabs, MSafari, frame labels, ONLY filter, GHBoards switcher; tracking and review frames (Rounds part B); the Started view (no frame draws it); sheet grab handles (no handler).

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| New round | 01 Rounds, page header right | Not drawn: rebuiltHref('/golf/dashboard/rounds/new','player'), src/clubhouse/screens/rounds/RoundsLibrary.tsx:29, gated at :105 | `hidden-until-rebuilt` | /rounds/new not in CH_REBUILT_ROUTES.player (src/clubhouse/shell/nav.ts:123) or :141. Q-78 (PROGRESS.md:304) |
| In-progress card, Continue at hole 4 (whole card is a button) | 01 Rounds, round card | Card drawn; Continue link not drawn, src/clubhouse/screens/rounds/parts.tsx:147, href RoundsLibrary.tsx:30 | `hidden-until-rebuilt` | /rounds/continue/<id> not in nav.ts:123 or :141. Q-78 |
| Show example | 02 Rounds · none in progress, idle card top right | Not drawn | `decided` | Board device, dropped: docs/clubhouse/phone/rounds.md:34, ROUNDS_PLAN.md:80 |
| Start a round | 02 Rounds · none in progress, idle card footer | Not drawn, parts.tsx:107 (startHref null) | `hidden-until-rebuilt` | /rounds/new not rebuilt (nav.ts:123). Q-78; same rule as Home (Q-69, PROGRESS.md:295) |
| Search course… | 01 Rounds, book toolbar | Filters by course, src/clubhouse/screens/rounds/RoundsLibrary.tsx:185, groupRounds :35-37 | `works` | |
| By month / By course (x 2) | 01 Rounds, book toolbar | Segmented, src/clubhouse/screens/rounds/RoundsLibrary.tsx:186-195 | `works` | |
| Round card (x N) | 01 Rounds, book rows | Link to /golf/dashboard/rounds/<id>, src/clubhouse/screens/rounds/parts.tsx:363, href src/clubhouse/screens/rounds/RoundsLibrary.tsx:31 | `works` | Phone row drops the grid and meters below 640px (phone/rounds.md:64) |
| Course row (x N) | 03 Course picker, lists | Opens that course's tees, src/clubhouse/screens/rounds/setup/CoursePicker.tsx:98-105 | `decided` | [preview-only] /clubhouse-preview/setup only (src/clubhouse/preview/PreviewSetup.tsx:30); Q-78 |
| Search courses | 03 Course picker, top | Filters, CoursePicker.tsx:77 | `decided` | [preview-only] Q-78 |
| Add a course | 03 Course picker, bottom | Opens Add a course, CoursePicker.tsx:127, RoundSetup.tsx:367-370 | `decided` | [preview-only] Q-78 |
| Close (x) and scrim tap | 03 and 04 picker sheet, header right / outside | Modal close src/clubhouse/ui/Modal.tsx:90, backdrop :73-74, drag to close :79 | `decided` | [preview-only] Q-78 |
| ‹ Courses | 04 Choose tees, header left | Back to courses, CoursePicker.tsx:146 | `decided` | [preview-only] Q-78 |
| Tee card (x N) | 04 Choose tees | Picks the tee, CoursePicker.tsx:167-176 into RoundSetup.tsx:75-87 | `decided` | [preview-only] Q-78. One length bar (Q-72h, PROGRESS.md:298) |
| Close (x), and ‹ Courses on step 1 | 05 Add a course, header | Closes to setup (AddCourseSheet.tsx:55-58, :102; RoundSetup.tsx:374); board reopens the picker (rounds-flow.jsx:249) | `GAP` | Build in src/clubhouse/screens/rounds/setup/RoundSetup.tsx: when Add a course closes, reopen CoursePicker on the course list. Reach low: only when backing out of adding a course. [preview-only] |
| ‹ previous step | 06 to 08 Add a course, header left | Footer ghost button, src/clubhouse/screens/rounds/setup/AddCourseSheet.tsx:96-100 | `decided` | [preview-only] Q-78 |
| Course name, City, State (x 3) | 05 Add a course | Inputs, AddCourseSheet.tsx:128-137 | `decided` | [preview-only] Q-78 |
| 18 holes / 9 holes (x 2) | 05 Add a course | Radios, AddCourseSheet.tsx:143-147 | `decided` | [preview-only] Q-78 |
| Add a course photo | 05 Add a course | Not drawn | `decided` | Q-72a (PROGRESS.md:298); phone/rounds.md:98. No handler on the board |
| Tee chips (x N) and Add tee | 06 Add a course · tees | Not drawn: one tee | `decided` | docs/clubhouse/phone/rounds.md:99, Q-72h |
| Tee colour swatches (x 6) | 06 Add a course · tees | Radios, AddCourseSheet.tsx:157-170 | `decided` | [preview-only] Q-78 |
| Tee name, Course rating, Slope (x 3) | 06 Add a course · tees | Inputs, AddCourseSheet.tsx:176-185 | `decided` | [preview-only] Q-78 |
| Par 3 / 4 / 5 per hole (x 18) | 07 Add a course · holes | Radios, src/clubhouse/screens/rounds/setup/HoleConfig.tsx:98-113 | `decided` | [preview-only] Q-78. Pars 3 to 6 (phone/rounds.md:102) |
| Yardage per hole (x 18) | 07 Add a course · holes | Inputs, HoleConfig.tsx:116-124 | `decided` | [preview-only] Q-78 |
| Next: Tees / Holes / Review | 05 to 07 Add a course, footer | AddCourseSheet.tsx:109 | `decided` | [preview-only] Q-78 |
| Save and pick tees | 08 Add a course · review, footer | "Use this course", AddCourseSheet.tsx:59-80 into RoundSetup.tsx:375-379; save checkbox :211 | `decided` | Q-72h (PROGRESS.md:298). [preview-only] |
| ‹ Rounds | 09 to 13 Setup, band top left | Link to backHref, RoundSetup.tsx:117 | `decided` | [preview-only] Q-78 |
| Browse courses | 13 Setup · no course, course card | Opens the picker, RoundSetup.tsx:176 | `decided` | [preview-only] Q-78 |
| Change tees | 09 Setup · course picked, course card | "Change course" opens the course list, RoundSetup.tsx:162 | `decided` | catalog/rounds.md:101 (CH-11510). [preview-only] Q-78 |
| Active qualifier · Play | 09 Setup, below the course card | "Open qualifier · Play", RoundSetup.tsx:185, :89-93 | `decided` | [preview-only] Q-78 |
| Practice / Tournament / Qualifier (x 3) | 09 and 11 Setup, Round details | Radios, RoundSetup.tsx:208-221 | `decided` | [preview-only] Q-78 |
| Date | 09 Setup, Round details | Date input, RoundSetup.tsx:227-235 | `decided` | [preview-only] Q-78 |
| 9 holes / 18 holes (x 2) | 09 and 12 Setup, Round details | Radios, RoundSetup.tsx:240-254 | `decided` | [preview-only] Q-78 |
| Front 9 / Back 9 (x 2) | 12 9 holes, scorecard header | Radios, HoleConfig.tsx:56-76 | `decided` | [preview-only] Q-78 |
| Par 3 / 4 / 5 per hole (x N) | 10 Scorecard | Radios, HoleConfig.tsx:98-113 | `decided` | [preview-only] Q-78 |
| Yardage per hole (x N) | 10 Scorecard | Inputs, HoleConfig.tsx:116-124 | `decided` | [preview-only] Q-78 |
| Start round | 09 to 13 Setup, dock | start.run(form), RoundSetup.tsx:346-354; port only in the preview (PreviewSetup.tsx:25) | `decided` | [preview-only] Q-78 (ROUNDS_PLAN.md:68) |
| Start a round | Player · Empty state (EMPTY.rounds) | Not drawn, RoundsLibrary.tsx:120 | `hidden-until-rebuilt` | No handler on the board (gh-states.jsx:25, :32). /rounds/new not in nav.ts:123. Q-78; catalog/rounds.md:64 |

#### Notes
- The whole setup flow (picker, tees, add a course, setup, scorecard, Start) is built but mounted only in /clubhouse-preview/setup; the product /golf/dashboard/rounds/new is not rebuilt (nav.ts:123), so every setup row flips from `decided` [preview-only] to live once Q-78 supplies real ChSetupPorts and the route is added to CH_REBUILT_ROUTES.player.
- New round, Start a round (idle card and EMPTY.rounds) and Continue are all gated by rebuiltHref (RoundsLibrary.tsx:29-30); adding /golf/dashboard/rounds/new and a continue/<id> pattern to nav.ts draws them at once, as with Home's Q-69 controls.
- gh-states.jsx defines no failed state or Try again for rounds; the loading skeletons have no controls.
- The only real GAP: closing Add a course returns to setup instead of the course picker (board rounds-flow.jsx:249).
- The board's Started screen (rounds-flow.jsx:216) is not drawn on any frame; it was listed once (desktop) as `decided`.

### `Player - Rounds.html` (player, desktop), part B: shot tracking, hole complete, submit, review
Built counterpart: src/clubhouse/screens/rounds/track/ (RoundTracking, ShotEntry, parts, sheets, round-sheets, HoleReview, labels), src/clubhouse/preview/PreviewTracking.tsx, src/clubhouse/screens/rounds/RoundReview.tsx, ReviewLoadFailed.tsx, src/clubhouse/routes/round-review.tsx, src/clubhouse/data/round-review.ts. Phone build: n/a for desktop. Skipped scaffolding: shell sidebar and top bar, GHLayer, the RoundsFlow view switcher, library, setup and course picker (Rounds part A), EMPTY.rounds and the rounds skeleton (library states, Rounds part A).

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Exit | Tracking, top bar, left | Pill calls onExit; the preview opens the Exit sheet, src/clubhouse/screens/rounds/track/RoundTracking.tsx:75, src/clubhouse/preview/PreviewTracking.tsx:78 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304): /golf/dashboard/rounds/new and /continue/<id> are not rebuilt (src/clubhouse/shell/nav.ts:123, 141) |
| Scorecard | Tracking, top bar, right | Pill opens the Scorecard sheet, src/clubhouse/screens/rounds/track/RoundTracking.tsx:92, src/clubhouse/screens/rounds/track/round-sheets.tsx:88 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Hole cell (x 18) | Tracking, hole strip | Goes to that hole (earlier, scored, or the next unplayed), src/clubhouse/screens/rounds/track/parts.tsx:84 | `decided` | [preview-only] The board opens the Scorecard sheet on a done hole; built navigates to it, CH-11805 (docs/clubhouse/catalog/rounds.md:132), docs/clubhouse/phone/rounds.md:75. Q-78 |
| Shot log header (expand, chevron) | Tracking, hole hero, under the map | Toggles the full shot list, src/clubhouse/screens/rounds/track/parts.tsx:202 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304); CH-11602 |
| Driver / Non-driver (x 2) | Tracking, entry, Club off tee | Dispatches SET_DRIVER, src/clubhouse/screens/rounds/track/ShotEntry.tsx:139 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Break: L to R, Straight, R to L, Mult. (x 4) | Tracking, entry, Putting details | Dispatches SET_PUTT_BREAK, src/clubhouse/screens/rounds/track/ShotEntry.tsx:152 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Slope: Uphill, Level, Down, Severe (x 4) | Tracking, entry, Putting details | Dispatches SET_PUTT_SLOPE, src/clubhouse/screens/rounds/track/ShotEntry.tsx:156 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Shot result / Putt result: Fairway, Rough, Sand, Green, Holed, Other (x 3 to 6) | Tracking, entry, result grid | Shared shotResultOptions with the not fringe / ace / rolled off notes, handleResultSelect, src/clubhouse/screens/rounds/track/ShotEntry.tsx:162 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Left / Right (x 2) | Tracking, entry, Miss direction (tee miss) | Dispatches SET_MISS_DIRECTION, src/clubhouse/screens/rounds/track/ShotEntry.tsx:179 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Approach miss grid: Long left to Short right (x 8) | Tracking, entry, Miss direction (approach off the green) | Radio grid, dispatches SET_APPROACH_MISS, src/clubhouse/screens/rounds/track/ShotEntry.tsx:194 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Putt tags: Short, Long, Missed left, Missed right, Low side, High side, Bad read, Bad speed (x 8) | Tracking, entry, What happened (missed putt) | Four toggles (Short, Long, Low side, High side), src/clubhouse/screens/rounds/track/ShotEntry.tsx:222 | `decided` | [preview-only] The engine's four tags, not the board's eight: Q-72g (docs/clubhouse/PROGRESS.md:298), docs/clubhouse/phone/rounds.md:74. Q-78 |
| Distance box | Tracking, entry, Distance remaining / Proximity / Leave distance | Text input to SET_DISTANCE_AFTER with a number check (CH-11104), src/clubhouse/screens/rounds/track/ShotEntry.tsx:244 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Quick distances (x 4 to 5) | Tracking, entry, beside the distance box | Quick picks set the distance, src/clubhouse/screens/rounds/track/ShotEntry.tsx:258; on the green 5 to 40 ft (labels.ts:142), board 3 to 25 | `decided` | [preview-only] Green values are the Fairway entry's, docs/clubhouse/phone/rounds.md:77. Q-78 |
| Undo | Tracking, action bar | Asks first (UndoConfirm), then undoes, src/clubhouse/screens/rounds/track/ShotEntry.tsx:308 | `decided` | [preview-only] The board undoes at once; built confirms, docs/clubhouse/phone/rounds.md:73, CH-11502. Q-78 |
| Penalty | Tracking, action bar | Opens the penalty sheet, enabled before the first shot too, src/clubhouse/screens/rounds/track/ShotEntry.tsx:312 | `decided` | [preview-only] The board disables it before shot 1; the engine allows it, docs/clubhouse/phone/rounds.md:72. Q-78 |
| Next shot / Hole out | Tracking, action bar, primary | handleNextShot; disabled with the blocker named (CH-11101); holed reads "Hole out · N", src/clubhouse/screens/rounds/track/ShotEntry.tsx:316 | `decided` | [preview-only] Label change docs/clubhouse/phone/rounds.md:75. Q-78 |
| Shot row with pencil (x N) | Hole complete, Shot review list | Opens the Change shot sheet (handleEditShot), src/clubhouse/screens/rounds/track/HoleReview.tsx:89 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304); CH-11505 |
| Undo last shot | Hole complete, footer, left | Asks first, then undoes, src/clubhouse/screens/rounds/track/HoleReview.tsx:104 | `decided` | [preview-only] Confirm step docs/clubhouse/phone/rounds.md:73. Q-78 |
| Next hole · N / Finish round | Hole complete, footer, primary | No button: the round moves on once the hole saves; "Back to hole N" only when looking back, src/clubhouse/screens/rounds/track/HoleReview.tsx:108 | `decided` | [preview-only] Q-72g (docs/clubhouse/PROGRESS.md:298), docs/clubhouse/phone/rounds.md:75; the preview opens Round complete after the last hole (PreviewTracking.tsx:54). Q-78 |
| Close (X) and scrim tap (x 5 sheets) | Penalty, Edit shot, Exit, Scorecard, Round complete sheets, header | Modal close button and backdrop tap, src/clubhouse/ui/Modal.tsx:90, src/clubhouse/ui/Modal.tsx:73 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Out of bounds, Water hazard, Unplayable lie, Lost ball (x 4) | Add penalty stroke sheet | Radio choices, SET_PENALTY_TYPE, src/clubhouse/screens/rounds/track/sheets.tsx:100 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304); CH-11503 |
| Which shot: Shot N / My next shot from here | Add penalty stroke sheet, Which shot | Asked only for OB and lost ball, SET_PENALTY_ORIGIN, src/clubhouse/screens/rounds/track/sheets.tsx:104 | `decided` | [preview-only] Only stroke and distance asks, docs/clubhouse/phone/rounds.md:72. Q-78 |
| Cancel | Add penalty stroke sheet, footer | Closes, src/clubhouse/screens/rounds/track/sheets.tsx:90 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Add 1 stroke | Add penalty stroke sheet, footer | confirmPenalty (usePenaltyHandler), waits for a choice, src/clubhouse/screens/rounds/track/sheets.tsx:93 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Result (x 6) | Edit shot sheet | Updates the edit form, src/clubhouse/screens/rounds/track/sheets.tsx:313 | `decided` | [preview-only] The board's onChange is a no-op (no handler on the board). Q-78 |
| Distance after | Edit shot sheet | Controlled input to the edit form, src/clubhouse/screens/rounds/track/sheets.tsx:325 | `decided` | [preview-only] The board's input is uncontrolled. Q-78 |
| Delete shot | Edit shot sheet, footer, left | Delete, then "Delete shot N?", then handleDeleteShot, src/clubhouse/screens/rounds/track/sheets.tsx:241 | `decided` | [preview-only] No handler on the board; built confirms and deletes (CH-11505). Q-78 |
| Save shot | Edit shot sheet, footer, primary | Shared rules, then handleSaveEditedShot; "Save anyway" on a warning, src/clubhouse/screens/rounds/track/sheets.tsx:249 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304); CH-11105 |
| Save for later | Exit round sheet | Calls onSave, src/clubhouse/screens/rounds/track/round-sheets.tsx:176; the preview only closes the sheet (PreviewTracking.tsx:88) | `decided` | [preview-only] The engine's save for later and the way back to Rounds come with the renderer, docs/clubhouse/ROUNDS_PLAN.md:66. Q-78 |
| Keep playing | Exit round sheet | Closes back to hole N, src/clubhouse/screens/rounds/track/round-sheets.tsx:183 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Discard round | Exit round sheet | Opens "Discard this round?", then onDiscard, src/clubhouse/screens/rounds/track/round-sheets.tsx:190; the preview fakes it | `decided` | [preview-only] No handler on the board; CH-11507. The real discard wiring is docs/clubhouse/ROUNDS_PLAN.md:66. Q-78 |
| Back to hole 18 | Round complete sheet, footer | Closes the sheet, src/clubhouse/screens/rounds/track/round-sheets.tsx:247 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Submit round | Round complete sheet, footer, primary | Calls onSubmit, src/clubhouse/screens/rounds/track/round-sheets.tsx:250; the preview fakes submitting (PreviewTracking.tsx:58) | `decided` | [preview-only] The submit overlay must own the success navigation, haptic and escape, docs/clubhouse/ROUNDS_PLAN.md:65. Q-78 |
| View round review | Round posted overlay | Link to reviewHref, src/clubhouse/screens/rounds/track/round-sheets.tsx:322; the preview passes /clubhouse-preview/round | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304); CH-11603 |
| Rounds (back) | Round review, top left | Link to /golf/dashboard/rounds for the player; a coach gets the player's name, to stats?player=<id>&tab=rounds, src/clubhouse/screens/rounds/RoundReview.tsx:212 | `works` | The coach variant is not on the board (D-53, docs/clubhouse/phone/rounds.md:46); href from reviewBack, RoundReview.tsx:25 |
| Hole number (x 18) | Round review, Scorecard, header row | Selects the hole, with a selection tick, src/clubhouse/screens/rounds/RoundReview.tsx:57 | `works` | CH-11704, CH-11804 |
| Score cell (x 18) | Round review, Scorecard, Score row | Not tappable: a plain cell with the ScoreMark, src/clubhouse/screens/rounds/RoundReview.tsx:76 | `GAP` | Build in src/clubhouse/screens/rounds/RoundReview.tsx: make each score cell select its hole (onClick on the cell, no second tab stop). Reach medium: the board's own tap-a-hole target. |
| Previous hole | Round review, hole card, header | Steps back one hole, disabled on hole 1, src/clubhouse/screens/rounds/RoundReview.tsx:135 | `works` | step() at RoundReview.tsx:191; CH-11704 |
| Next hole | Round review, hole card, header | Steps forward one hole, disabled on the last, src/clubhouse/screens/rounds/RoundReview.tsx:139 | `works` | step() at RoundReview.tsx:191; CH-11704 |

### `Player - Rounds - Mobile.html` (player, phone), part B: shot tracking, hole complete, submit, review
Built counterpart: the same files; tracking is RoundTracking with usePhoneTabsHidden (src/clubhouse/screens/rounds/track/RoundTracking.tsx:52) and phone CSS, sheets are Modal bottom sheets that drag to close, the review draws PhoneTop on a phone (src/clubhouse/screens/rounds/RoundReview.tsx:210). Phone build: RoundTracking (responsive, phone spec docs/clubhouse/phone/rounds.md:82-91) and the RoundReview phone branch. Skipped scaffolding: the B board list, ONLY filter, qm-board labels, IOSDevice, MSafari, GHBoards, MTop and MTabs, library and setup frames (Rounds part A).

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Exit | Tracking frames, top bar, left | Pill calls onExit; the preview opens the Exit sheet, src/clubhouse/screens/rounds/track/RoundTracking.tsx:75 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304): /rounds/new and /continue/<id> not rebuilt (src/clubhouse/shell/nav.ts:123, 141) |
| Scorecard | Tracking frames, top bar, right | Opens the Scorecard sheet, src/clubhouse/screens/rounds/track/RoundTracking.tsx:92 | `decided` | [preview-only] An icon on the phone, docs/clubhouse/phone/rounds.md:86. Q-78 |
| Hole cell (x 18) | Tracking frames, hole strip (scrolls sideways) | Goes to that hole, src/clubhouse/screens/rounds/track/parts.tsx:84 | `decided` | [preview-only] The board opens the Scorecard on a done hole; built navigates, docs/clubhouse/catalog/rounds.md:132, docs/clubhouse/phone/rounds.md:75. Q-78 |
| Shot log header | Tracking frames, under the map | Toggles the shot list, src/clubhouse/screens/rounds/track/parts.tsx:202 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Driver / Non-driver (x 2) | Tee shot frame, Club off tee | SET_DRIVER, src/clubhouse/screens/rounds/track/ShotEntry.tsx:139 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Break (x 4) | Putt frame, Putting details | SET_PUTT_BREAK, src/clubhouse/screens/rounds/track/ShotEntry.tsx:152 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Slope (x 4) | Putt frame, Putting details | SET_PUTT_SLOPE, src/clubhouse/screens/rounds/track/ShotEntry.tsx:156 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Shot result / Putt result (x 3 to 6) | Tee, approach and putt frames, result grid | handleResultSelect over shotResultOptions, src/clubhouse/screens/rounds/track/ShotEntry.tsx:162 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Left / Right (x 2) | Tee shot missed frame, Miss direction | SET_MISS_DIRECTION, src/clubhouse/screens/rounds/track/ShotEntry.tsx:179 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Approach miss grid (x 8) | Approach missed green frame | SET_APPROACH_MISS radio grid, src/clubhouse/screens/rounds/track/ShotEntry.tsx:194 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Putt tags (x 8) | Putt frame, What happened | Four toggles, src/clubhouse/screens/rounds/track/ShotEntry.tsx:222 | `decided` | [preview-only] Q-72g (docs/clubhouse/PROGRESS.md:298), docs/clubhouse/phone/rounds.md:74. Q-78 |
| Distance box | Tracking frames, distance section | SET_DISTANCE_AFTER input, src/clubhouse/screens/rounds/track/ShotEntry.tsx:244 | `decided` | [preview-only] No Done key on iOS yet, docs/clubhouse/phone/rounds.md:91. Q-78 |
| Quick distances (x 4 to 5) | Tracking frames, distance section | Quick picks in a 44px row, src/clubhouse/screens/rounds/track/ShotEntry.tsx:258 | `decided` | [preview-only] Green values docs/clubhouse/phone/rounds.md:77. Q-78 |
| Undo | Tracking frames, action bar | Asks first, then undoes, src/clubhouse/screens/rounds/track/ShotEntry.tsx:308 | `decided` | [preview-only] docs/clubhouse/phone/rounds.md:73. Q-78 |
| Penalty | Tracking frames, action bar | Opens the penalty sheet, src/clubhouse/screens/rounds/track/ShotEntry.tsx:312 | `decided` | [preview-only] Enabled before shot 1, docs/clubhouse/phone/rounds.md:72. Q-78 |
| Next shot / Hole out | Tracking frames, action bar, primary | handleNextShot, blocker named, "Hole out · N", src/clubhouse/screens/rounds/track/ShotEntry.tsx:316 | `decided` | [preview-only] docs/clubhouse/phone/rounds.md:75. Q-78 |
| Shot row (x N) | Hole complete frame, Shot review | Opens the Change shot sheet, src/clubhouse/screens/rounds/track/HoleReview.tsx:89 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Undo last shot | Hole complete frame, footer | Asks first, src/clubhouse/screens/rounds/track/HoleReview.tsx:104 | `decided` | [preview-only] docs/clubhouse/phone/rounds.md:73. Q-78 |
| Next hole · N / Finish round | Hole complete frame, footer, primary | No button: moves on once saved; "Back to hole N" when looking back, src/clubhouse/screens/rounds/track/HoleReview.tsx:108 | `decided` | [preview-only] Q-72g (docs/clubhouse/PROGRESS.md:298), docs/clubhouse/phone/rounds.md:75. Q-78 |
| Close (X) and scrim tap (x 5 sheets) | Penalty, Exit, Scorecard, Round complete, Edit sheets, header | Modal close and backdrop tap, src/clubhouse/ui/Modal.tsx:90, src/clubhouse/ui/Modal.tsx:73 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Grab handle, drag down (x 5 sheets) | Every sheet, top | Drags to close on a phone (useSheetDrag), src/clubhouse/ui/Modal.tsx:79 | `decided` | [preview-only] docs/clubhouse/phone/rounds.md:90. Q-78 |
| Out of bounds, Water hazard, Unplayable lie, Lost ball (x 4) | Penalty frame | SET_PENALTY_TYPE, src/clubhouse/screens/rounds/track/sheets.tsx:100 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Which shot: Shot N / My next shot from here | Penalty frame | Only for OB and lost ball, src/clubhouse/screens/rounds/track/sheets.tsx:104 | `decided` | [preview-only] docs/clubhouse/phone/rounds.md:72. Q-78 |
| Cancel | Penalty frame, footer | Closes, src/clubhouse/screens/rounds/track/sheets.tsx:90 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Add 1 stroke | Penalty frame, footer | confirmPenalty, src/clubhouse/screens/rounds/track/sheets.tsx:93 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Result (x 6) | Edit shot sheet (from a shot row) | Updates the edit form, src/clubhouse/screens/rounds/track/sheets.tsx:313 | `decided` | [preview-only] No handler on the board (a no-op onChange). Q-78 |
| Distance after | Edit shot sheet | Controlled input, src/clubhouse/screens/rounds/track/sheets.tsx:325 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Delete shot | Edit shot sheet, footer | Confirm, then handleDeleteShot, src/clubhouse/screens/rounds/track/sheets.tsx:241 | `decided` | [preview-only] No handler on the board. Q-78 |
| Save shot | Edit shot sheet, footer | handleSaveEditedShot after the shared rules, src/clubhouse/screens/rounds/track/sheets.tsx:249 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Save for later | Exit frame | onSave, src/clubhouse/screens/rounds/track/round-sheets.tsx:176; the preview only closes | `decided` | [preview-only] docs/clubhouse/ROUNDS_PLAN.md:66. Q-78 |
| Keep playing | Exit frame | Closes, src/clubhouse/screens/rounds/track/round-sheets.tsx:183 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Discard round | Exit frame | Confirm, then onDiscard, src/clubhouse/screens/rounds/track/round-sheets.tsx:190 | `decided` | [preview-only] No handler on the board; CH-11507, docs/clubhouse/ROUNDS_PLAN.md:66. Q-78 |
| Back to hole 18 | Round complete frame, footer | Closes, src/clubhouse/screens/rounds/track/round-sheets.tsx:247 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Submit round | Round complete frame, footer | onSubmit, src/clubhouse/screens/rounds/track/round-sheets.tsx:250; the preview fakes it | `decided` | [preview-only] docs/clubhouse/ROUNDS_PLAN.md:65. Q-78 |
| View round review | Round posted frame | Link to reviewHref, src/clubhouse/screens/rounds/track/round-sheets.tsx:322 | `decided` | [preview-only] Q-78 (docs/clubhouse/PROGRESS.md:304) |
| Rounds (back) | Round review frame, top left | PhoneTop "‹ Rounds" (a coach gets "‹ Stats") pushes the back href, src/clubhouse/screens/rounds/RoundReview.tsx:210 | `works` | Moved into the top bar per docs/clubhouse/phone/rounds.md:66 |
| Hole number (x 18) | Round review frame, Scorecard, header row | Selects the hole, src/clubhouse/screens/rounds/RoundReview.tsx:57 | `works` | The card scrolls inside its frame, docs/clubhouse/phone/rounds.md:66 |
| Score cell (x 18) | Round review frame, Scorecard, Score row | Not tappable, src/clubhouse/screens/rounds/RoundReview.tsx:76 | `GAP` | Build in src/clubhouse/screens/rounds/RoundReview.tsx: make each score cell select its hole. Reach medium: the larger tap target on a phone card. |
| Previous hole | Round review frame, hole card | Steps back, src/clubhouse/screens/rounds/RoundReview.tsx:135 | `works` | CH-11704 |
| Next hole | Round review frame, hole card | Steps forward, src/clubhouse/screens/rounds/RoundReview.tsx:139 | `works` | CH-11704 |

#### Notes
- Every tracking, hole complete, summary and submit control is built, but only in `/clubhouse-preview/track` (src/app/clubhouse-preview/[screen]/page.tsx:199). Nothing in src imports RoundTracking or round-sheets outside the preview and the tests. Q-78 holds it. When `/rounds/new` and `/continue/<id>` are rebuilt, all 34 desktop and 35 phone tracking rows change status together.
- The round screen that owns Exit, Save for later, Discard, submit and the success navigation does not exist yet. The preview fakes that part (src/clubhouse/preview/PreviewTracking.tsx:81-99). docs/clubhouse/ROUNDS_PLAN.md:63-68 (step 5) lists what the second renderer must take on.
- The review is live for both roles at `/golf/dashboard/rounds/<uuid>` (src/clubhouse/shell/nav.ts:140-141). Its only gap is the score row, which can't be tapped.
- The library states (EMPTY.rounds, the rounds skeleton) and the library's Continue and New round belong to Rounds part A. The review's states (CH-11204, 11205, 11206, 11307) are not drawn on the board, so they have no rows here.

## CoachHelm (coach and player)

### `Coach - CoachHelm.html` (coach, desktop)
Built counterpart: src/clubhouse/routes/coachhelm.tsx, src/clubhouse/screens/coachhelm/CoachBoard.tsx, parts.tsx, writes.ts, CoachHelmSkeleton.tsx, src/app/golf/(dashboard)/dashboard/coachhelm/loading.tsx. Phone build: n/a. Skipped scaffolding: sidebar and its footer, top bar (search "Ask about a player or a stat", bell, "CoachHelm settings" icon), ToastStack (never called), GHLayer switcher; program pulse rows are plain li with no handler on the board, not controls.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Player row (x 4: avatar, name, top signal, count) | By player list, left column | Toggle button selects the player and swaps the focus card, src/clubhouse/screens/coachhelm/CoachBoard.tsx:184 | `works` | Selection haptic (CoachBoard.tsx:185); aria-pressed; row reads "Dismissed" after a dismiss (CoachBoard.tsx:192) |
| Why we think this | Focus card, bottom disclosure | Disclosure opens the rest of the insight's content, src/clubhouse/screens/coachhelm/parts.tsx:128 | `works` | Closed on every new insight (keyed FocusCard, CoachBoard.tsx:215) |
| Assign as focus | Focus card actions, first (primary) | Calls createFocusAreaFromInsightV2 via useAction, then the "Assigned as X's focus" chip, src/clubhouse/screens/coachhelm/CoachBoard.tsx:224 | `works` | writes.ts:31, real insert at src/app/golf/actions/development.ts:1483. Creates a proposal; player accepts in Stats Development (Q-77, PROGRESS.md:303, :533), not on this board |
| Assign as focus, on a strength (Theo, "Double bogey-or-worse rate", good) | Focus card actions, when the top insight is a strength | Not drawn: hidden when cur.top.strength, src/clubhouse/screens/coachhelm/CoachBoard.tsx:217 | `GAP` | Build in src/clubhouse/screens/coachhelm/CoachBoard.tsx: draw Assign for a strength (a keep-doing focus) or record the hide as a decision. Reach low: strengths sort last (phone/coachhelm.md:27). No doc or test records the hide |
| Share with {first name} | Focus card actions, second | Not drawn; no action shares an insight, docs/clubhouse/phone/coachhelm.md:34 | `decided` | Also docs/clubhouse/screens/coachhelm.md:9. Unnumbered open owner question (push or message nudge, what copy) |
| Dismiss | Focus card actions, third (ghost) | Warning haptic, then dismissInsight via useAction; focus replaced by the dismissed notice, src/clubhouse/screens/coachhelm/CoachBoard.tsx:228 | `works` | writes.ts:32, real update at src/app/golf/actions/insights.ts:1451. Open count drops by one (CoachBoard.tsx:94) |
| Undo | Dismissed notice, right | reactivateInsight with the prior lifecycle, card comes back, src/clubhouse/screens/coachhelm/CoachBoard.tsx:209 | `works` | writes.ts:34, update at src/app/golf/actions/insights.ts:1623. Notice copy differs from the board ("comes back only if the pattern changes"), decided at phone/coachhelm.md:36 |
| View roster | Empty state (EMPTY.coachhelm coach), primary | Link to /golf/dashboard/roster, src/clubhouse/screens/coachhelm/CoachBoard.tsx:164 | `works` | rosterHref from coachBoardLinks.roster (CoachBoard.tsx:25), rebuilt for coach (src/clubhouse/shell/nav.ts:116); CH-13306. No-players variant says Open roster (CoachBoard.tsx:130) |

### `Player - CoachHelm.html` (player, desktop)
Built counterpart: src/clubhouse/routes/coachhelm.tsx, src/clubhouse/screens/coachhelm/PlayerBoard.tsx, parts.tsx, CoachHelmSkeleton.tsx, src/app/golf/(dashboard)/dashboard/coachhelm/loading.tsx. Phone build: n/a. Skipped scaffolding: sidebar and its footer, top bar (search, bell, settings), GHLayer switcher.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Why we think this | Focus card, bottom disclosure | Disclosure opens the rest of the insight's content, src/clubhouse/screens/coachhelm/parts.tsx:128 | `works` | Keyed per insight so it opens closed (PlayerBoard.tsx:105) |
| Insight row (x 2) | Side, Also worth knowing | Button puts that insight in the focus card, src/clubhouse/screens/coachhelm/PlayerBoard.tsx:122 | `works` | InsightRow onClick at parts.tsx:151 with selection haptic; partitionInsights re-sorts (PlayerBoard.tsx:41) |
| Insight row (x 1) | Side, Working | Button puts the strength in the focus card, src/clubhouse/screens/coachhelm/PlayerBoard.tsx:130 | `works` | Same InsightRow (parts.tsx:151); strength pill reads Working (parts.tsx:11) |
| Start a round | Empty state (EMPTY.coachhelm player), primary | Button reads "Open Rounds" and links to /golf/dashboard/rounds, src/clubhouse/screens/coachhelm/PlayerBoard.tsx:93 | `decided` | docs/clubhouse/catalog/coachhelm.md:41: Start a round once round entry is rebuilt, until then Open Rounds (PlayerBoard.tsx:19). /rounds/new not rebuilt (nav.ts:141), Q-78. Board's "2 of 5 rounds" bar not built: no threshold (catalog:42) |

### `Coach and Player - CoachHelm - Mobile.html` (coach and player, phone)
Built counterpart: same CoachBoard.tsx and PlayerBoard.tsx, phone layout when useChPhone() is true (is-phone class, PhoneTop, CoachBoard.tsx:258, PlayerBoard.tsx:50), spec docs/clubhouse/phone/coachhelm.md:61. Phone build: yes, the shared boards with phone CSS. Skipped scaffolding: MTop, MTabs, MSafari, iOS frame, board frames' initial props (why, sel, player, hidePulse), GHBoards state switcher; pulse rows are plain li with no handler.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Why we think this | Player frames 1-3, focus card | Disclosure, src/clubhouse/screens/coachhelm/parts.tsx:128 | `works` | Frame 2 draws it opened; the build opens it closed on every insight (catalog CH-13804) |
| Insight row (x 2) | Player frames 1-3, Also worth knowing | Picks the insight and scrolls the focus into view, src/clubhouse/screens/coachhelm/PlayerBoard.tsx:122 | `works` | scrollIntoView on phone at PlayerBoard.tsx:46; phone/coachhelm.md:69 |
| Insight row (x 1) | Player frames 1-3, Working | Picks the strength and scrolls the focus into view, src/clubhouse/screens/coachhelm/PlayerBoard.tsx:130 | `works` | PlayerBoard.tsx:46 |
| Player row (x 4) | Coach frames 4-6, By player | Sideways-scrolling pills; tap selects the player, src/clubhouse/screens/coachhelm/CoachBoard.tsx:184 | `decided` | Pills without the top-signal title, phone/coachhelm.md:67; the focus card names it. Board draws full rows |
| Why we think this | Coach frames 4-6, focus card | Disclosure, src/clubhouse/screens/coachhelm/parts.tsx:128 | `works` | Same FocusCard as desktop |
| Assign as focus | Coach frames 4-6, focus actions | createFocusAreaFromInsightV2 via useAction, then the Assigned chip, src/clubhouse/screens/coachhelm/CoachBoard.tsx:224 | `works` | Shares the row with Dismiss, phone/coachhelm.md:68; insert at development.ts:1483; Q-77 for the player's Accept |
| Assign as focus, on a strength | Coach frames 4-6, when the top insight is a strength | Not drawn: hidden when cur.top.strength, src/clubhouse/screens/coachhelm/CoachBoard.tsx:217 | `GAP` | Build in src/clubhouse/screens/coachhelm/CoachBoard.tsx: draw Assign for a strength or record the hide as a decision. Reach low: strengths sort last. Same as the desktop row |
| Share with {first name} | Coach frames 4-6, focus actions | Not drawn, docs/clubhouse/phone/coachhelm.md:34 | `decided` | Unnumbered open owner question |
| Dismiss | Coach frames 4-6, focus actions | dismissInsight via useAction, dismissed notice, src/clubhouse/screens/coachhelm/CoachBoard.tsx:228 | `works` | update at insights.ts:1451 |
| Undo | Coach frames 4-6, dismissed notice | reactivateInsight, card comes back, src/clubhouse/screens/coachhelm/CoachBoard.tsx:209 | `works` | Copy differs, phone/coachhelm.md:36 |
| Start a round | Player empty-state frame (EMPTY.coachhelm player) | "Open Rounds" link to /golf/dashboard/rounds, src/clubhouse/screens/coachhelm/PlayerBoard.tsx:93 | `decided` | catalog/coachhelm.md:41; /rounds/new not rebuilt (nav.ts:141), Q-78. Rounds is a player phone tab too |
| View roster | Coach empty-state frame (EMPTY.coachhelm coach) | Link to /golf/dashboard/roster, src/clubhouse/screens/coachhelm/CoachBoard.tsx:164 | `works` | Roster rebuilt for coach, nav.ts:116 (reached from More on the phone) |

#### Notes
- None of the three boards loads ch2-data.js, and coachhelm2.css (phone board only) is a stylesheet. The boards draw only helm3.jsx CoachHelm3 and PlayerHelm, so the signals queue, morning brief, standing and player focus view in the prompt have no rows: they are not on these boards.
- gh-states.jsx has no failed state for coachhelm (only GHEmpty and GHSkeleton, no Try again). The built Try again notices (CH-13201 to CH-13203) are not board controls and have no rows.
- Share with {first name} is recorded only as an unnumbered open owner question (phone/coachhelm.md:34, DESIGN.md:106), not a Q-n in PROGRESS.md. Under "build it" the owner may want it numbered and answered.
- Cross-page disagreement: CoachHelm's empty state draws "Open Rounds" (catalog:41) while Player Home hides its Start a round under Q-69. Both are justified by round entry not being rebuilt (Q-78), but the two pages treat it differently.
- The program pulse rows are not clickable on the board, but the pulse items carry action.href (src/lib/coachhelm/v3/chat/program-pulse.ts:49), which pulseRows drops (src/clubhouse/data/coachhelm-shape.ts:193). This is an optional improvement, not a gap.
- The board's ?view=development or profile or standing drills are not drawn on these boards. They show the not-rebuilt notice (Q-76, routes/coachhelm.tsx:23), so they have no rows.

## Classes (player)

### `Player - Classes.html` (player, desktop)
Built counterpart: src/clubhouse/screens/classes/ (ClassesView, parts, ClassForm, ClassDetail, ImportSchedule, import-read, writes, ClassesSkeleton), src/clubhouse/data/classes.ts, classes-shape.ts, src/clubhouse/routes/classes.tsx, src/app/golf/(dashboard)/dashboard/classes/page.tsx:13 (player in Clubhouse only; a coach gets LegacyClassesPage, nav.ts:123 lists /classes for players only). Phone build: n/a for desktop. Skipped scaffolding: sidebar, top bar crumbs/search/bell/settings (shell), GHLayer state switcher, unrendered classes.jsx components (Ribbon, Dial, AddInline, Week, CourseCard are defined but ClassesPage never draws them), TermBar hover titles; the loading skeleton (GHSkeleton classes) has no controls, built as ClassesSkeleton via classes/loading.tsx:19.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Sync calendar (with "Calendar synced · 2 min ago") | Header, right actions | Not drawn; the header shows "Adding to your calendar…" while a sync runs and "Retry sync" only after a failure, src/clubhouse/screens/classes/parts.tsx:326; recorded docs/clubhouse/phone/classes.md:29 | `decided` | No column records a sync, so no "synced N min ago" and no manual sync button (phone/classes.md:29) |
| Retry sync (sync failed state, "1 class didn't sync") | Header, right actions | "N classes are not on your calendar" + Retry sync, replays the failed syncs via syncClassToCalendar, src/clubhouse/screens/classes/parts.tsx:344, ClassesView.tsx:245, writes.ts:138 | `works` | Sheet also has Retry sync for one class, ClassDetail.tsx:108 |
| Import schedule | Header, right actions | Opens the Import schedule sheet, src/clubhouse/screens/classes/ClassesView.tsx:246 (startImport :221) | `works` | Header actions are not drawn in the empty state (catalog/classes.md:61); the empty state's own Import schedule does the same |
| Add class | Header, right actions (primary) | Opens the Add a class sheet, src/clubhouse/screens/classes/ClassesView.tsx:249 (startAdd :217) | `works` | Same hide-in-empty rule as Import schedule (catalog/classes.md:61) |
| Class card (x N, one per class) | Deck, left column | Card button opens the class sheet, src/clubhouse/screens/classes/parts.tsx:162 to ClassesView.tsx:293 | `works` | Selection haptic, parts.tsx:167 |
| Add a class (dashed tile) | Deck, last tile | Opens the Add a class sheet (not the inline card), src/clubhouse/screens/classes/parts.tsx:237; ClassesView.tsx:299 | `decided` | Q-75b (docs/clubhouse/PROGRESS.md:301) and phone/classes.md:27: a sheet instead of the inline card |
| Cancel (X) | Inline New class card, top right | No inline card; the sheet has Cancel and Close, src/clubhouse/screens/classes/ClassForm.tsx:141 | `decided` | Q-75b (PROGRESS.md:301) |
| Mon to Fri day toggles (x 5) | Inline New class card, Days | Same toggles in the Add a class sheet, src/clubhouse/screens/classes/ClassForm.tsx:226 | `decided` | Q-75b (PROGRESS.md:301): the inline card is a sheet |
| Add {code} / Add class | Inline New class card, bottom | The sheet's Add class saves to golf_player_classes, src/clubhouse/screens/classes/ClassForm.tsx:144 to ClassesView.tsx:334, writes.ts:99 | `decided` | Q-75b (PROGRESS.md:301); on the board this only closes the card |
| Import schedule | Empty state (GHEmpty renders ClassesPage empty) | EmptyState primary opens the import sheet, src/clubhouse/screens/classes/ClassesView.tsx:266 | `works` | CH-12301 |
| Add a class | Empty state, secondary | Opens the Add a class sheet, src/clubhouse/screens/classes/ClassesView.tsx:271 | `works` | CH-12301 |
| Close (X) / scrim tap | Class detail sheet, hero top right | Modal Close button and backdrop close it, src/clubhouse/ui/Modal.tsx:90 and :74; ClassesView.tsx:319 | `works` | Esc also closes (Modal.tsx:69) |
| Share class times with coach (switch) | Class detail sheet, body | Not drawn, src/clubhouse/screens/classes/ClassDetail.tsx:25 | `decided` | Q-75d (PROGRESS.md:301) and phone/classes.md:28: no column for it; grade and next deadline also not drawn |
| Remove class | Class detail sheet, footer left | Warning haptic, then "Remove this class?" confirm; Remove class runs removeClassFromCalendar then delete, src/clubhouse/screens/classes/ClassDetail.tsx:81, ClassesView.tsx:360, writes.ts:120 | `works` | No handler on the board; built does the obvious thing (CH-12501) |
| Edit class | Class detail sheet, footer right | Opens the form sheet on the class, src/clubhouse/screens/classes/ClassDetail.tsx:92 to ClassesView.tsx:320 | `works` | No handler on the board |
| Close (X) / scrim tap | Add a class sheet, header | Close asks "Discard your changes?" when dirty, src/clubhouse/screens/classes/ClassForm.tsx:115, :135 | `works` | CH-12502 |
| Mon to Fri day toggles (x 5) | Add a class sheet, Days | aria-pressed day buttons, src/clubhouse/screens/classes/ClassForm.tsx:226 | `works` | A weekend day already on the class is also offered (ClassForm.tsx:85) |
| Cancel | Add a class sheet, footer | Closes (or asks to discard), src/clubhouse/screens/classes/ClassForm.tsx:141 | `works` |  |
| Add class | Add a class sheet, footer (primary) | Validates, inserts into golf_player_classes, then syncClassToCalendar, src/clubhouse/screens/classes/ClassForm.tsx:144, ClassesView.tsx:133, writes.ts:108 | `works` | No handler on the board |
| Close (X) / scrim tap | Import schedule sheet, header | Modal Close, src/clubhouse/ui/Modal.tsx:90; ImportSchedule.tsx:108 | `works` | A read in flight is dropped |
| Screenshot or file / Paste text (tabs x 2) | Import schedule sheet, tab strip | Segmented control, src/clubhouse/screens/classes/ImportSchedule.tsx:307 | `works` | Board also shows the tabs in the error views; built offers Choose another file / Paste text there instead |
| Drop your schedule here | Import schedule sheet, file tab | Button opens the file picker; a drop is read, src/clubhouse/screens/classes/ImportSchedule.tsx:325, :331, reader import-read.ts:234 | `works` | Image via extractClassesFromScheduleImage, PDF/TXT locally |
| Read schedule | Import schedule sheet, paste tab | Reads pasted text with parseScheduleText, src/clubhouse/screens/classes/ImportSchedule.tsx:387; import-read.ts:228 | `works` | Empty text says "Paste your schedule text first." (CH-12110) |
| Choose another file | Import error views (not a schedule, too large, unsupported), primary | Back to the file tab, src/clubhouse/screens/classes/ImportSchedule.tsx:225 | `works` |  |
| Paste text instead | Import error views, secondary; primary in reader failed | Switches to the paste tab, src/clubhouse/screens/classes/ImportSchedule.tsx:235 | `works` | Primary for fault, ghost otherwise (ImportSchedule.tsx:236) |
| Paste text | Import error view, No classes found | Switches to the paste tab, src/clubhouse/screens/classes/ImportSchedule.tsx:242 | `works` |  |
| Edit {code} (pencil, x N) | Import review, each row | Not drawn | `decided` | phone/classes.md:31: rows are removed in review and edited from the class once imported; no handler on the board |
| Remove {code} (trash, x N) | Import review, each row | Removes the row from the review, src/clubhouse/screens/classes/ImportSchedule.tsx:295 | `works` |  |
| Start over | Import review, footer left | Clears rows, back to pick, src/clubhouse/screens/classes/ImportSchedule.tsx:176 | `works` |  |
| Import N classes | Import review, footer right (primary) | Inserts the reviewed rows then syncs each, src/clubhouse/screens/classes/ImportSchedule.tsx:185, ClassesView.tsx:175, writes.ts:158 | `works` | CH-12004 on failure |
| View classes | Import success, footer | Closes the sheet onto the updated list, src/clubhouse/screens/classes/ImportSchedule.tsx:171 | `works` | List already updated in importAction (ClassesView.tsx:183) |

### `Player - Classes - Mobile.html` (player, phone)
Built counterpart: same ClassesView; phone mode via useChPhone (src/clubhouse/screens/classes/ClassesView.tsx:42) draws PhoneTop and every sheet as a draggable bottom sheet (src/clubhouse/ui/Modal.tsx:44). Phone build: ClassesView in phone mode (no separate *Phone.tsx). Skipped scaffolding: iOS frame, MTabs tab bar, MSafari, qm-board labels, GHBoards loading frame (skeleton has no controls; built ClassesSkeleton, classes/loading.tsx:19), unrendered classes.jsx components.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| ‹ More (back) | Top bar, every frame | PhoneTop back to More, src/clubhouse/screens/classes/ClassesView.tsx:234 (useBackFromMore :44) | `works` | D-66: Classes opens from More |
| Sync calendar (with "Calendar synced · 2 min ago") | 01 Classes, header actions | Not drawn; status only while syncing or after a failure, src/clubhouse/screens/classes/parts.tsx:326 | `decided` | docs/clubhouse/phone/classes.md:29 |
| Retry sync | 12 Sync failed, header actions | Retry sync replays the failed syncs, src/clubhouse/screens/classes/parts.tsx:344, ClassesView.tsx:245 | `works` |  |
| Import schedule | 01 Classes, header actions | Opens the import bottom sheet, src/clubhouse/screens/classes/ClassesView.tsx:246 | `works` | Not drawn in the empty frame (catalog/classes.md:61) |
| Add class | 01 Classes, header actions | Opens the Add a class bottom sheet, src/clubhouse/screens/classes/ClassesView.tsx:249 | `works` | Not drawn in the empty frame (catalog/classes.md:61) |
| Class card (x N) | 01 Classes, deck | Opens the class sheet, src/clubhouse/screens/classes/parts.tsx:162, ClassesView.tsx:293 | `works` |  |
| Add a class (dashed tile) | 01 Classes, end of deck | Opens the Add a class bottom sheet, src/clubhouse/screens/classes/parts.tsx:237 | `decided` | Q-75b (PROGRESS.md:301), phone/classes.md:27 |
| Cancel (X) | 14 Add a class, inline card | Sheet Cancel / Close instead, src/clubhouse/screens/classes/ClassForm.tsx:141 | `decided` | Q-75b (PROGRESS.md:301) |
| Mon to Fri day toggles (x 5) | 14 Add a class, inline card Days | In the sheet, src/clubhouse/screens/classes/ClassForm.tsx:226 | `decided` | Q-75b (PROGRESS.md:301) |
| Add {code} | 14 Add a class, inline card bottom | Sheet Add class saves, src/clubhouse/screens/classes/ClassForm.tsx:144, writes.ts:108 | `decided` | Q-75b (PROGRESS.md:301) |
| Import schedule | 02 Empty state, primary | Opens the import sheet, src/clubhouse/screens/classes/ClassesView.tsx:266 | `works` | CH-12301 |
| Add a class | 02 Empty state, secondary | Opens the Add a class sheet, src/clubhouse/screens/classes/ClassesView.tsx:271 | `works` | CH-12301 |
| Close (X) / scrim tap | 13 Class detail sheet | Close button, backdrop, or drag down, src/clubhouse/ui/Modal.tsx:90, :74, :44 | `works` |  |
| Share class times with coach (switch) | 13 Class detail sheet, body | Not drawn, src/clubhouse/screens/classes/ClassDetail.tsx:25 | `decided` | Q-75d (PROGRESS.md:301), phone/classes.md:28 |
| Remove class | 13 Class detail sheet, footer | Confirm then removeClassFromCalendar and delete, src/clubhouse/screens/classes/ClassDetail.tsx:81, ClassesView.tsx:360, writes.ts:120 | `works` | No handler on the board |
| Edit class | 13 Class detail sheet, footer | Opens the form sheet, src/clubhouse/screens/classes/ClassDetail.tsx:92 | `works` | No handler on the board |
| Close (X) / scrim tap | Add a class sheet (from header Add class or empty state) | Close, discard question when dirty, src/clubhouse/screens/classes/ClassForm.tsx:115 | `works` | No frame draws this sheet open; reached from the header and empty-state buttons |
| Day toggles (x 5), Cancel, Add class | Add a class sheet | src/clubhouse/screens/classes/ClassForm.tsx:226, :141, :144 | `works` | Board's Add class has no handler |
| Close (X) / scrim tap | 03 to 11 Import sheet, header | src/clubhouse/ui/Modal.tsx:90; ImportSchedule.tsx:108 | `works` |  |
| Screenshot or file / Paste text (tabs x 2) | 03 Import pick, 04 Import paste | Segmented, src/clubhouse/screens/classes/ImportSchedule.tsx:307 | `works` |  |
| Drop your schedule here | 03 Import pick | Opens the file picker, src/clubhouse/screens/classes/ImportSchedule.tsx:325 | `works` |  |
| Read schedule | 04 Import paste text | src/clubhouse/screens/classes/ImportSchedule.tsx:387 | `works` |  |
| Choose another file | 08 Not a schedule, 09 Too large, primary | src/clubhouse/screens/classes/ImportSchedule.tsx:225 | `works` |  |
| Paste text instead | 08, 09 secondary; 10 Reader failed primary | src/clubhouse/screens/classes/ImportSchedule.tsx:235 | `works` |  |
| Paste text | 11 No classes found | src/clubhouse/screens/classes/ImportSchedule.tsx:242 | `works` |  |
| Edit {code} (pencil, x N) | 06 Review, each row | Not drawn | `decided` | phone/classes.md:31; no handler on the board |
| Remove {code} (trash, x N) | 06 Review, each row | src/clubhouse/screens/classes/ImportSchedule.tsx:295 | `works` |  |
| Start over | 06 Review, footer | src/clubhouse/screens/classes/ImportSchedule.tsx:176 | `works` |  |
| Import N classes | 06 Review, footer (primary) | Inserts then syncs, src/clubhouse/screens/classes/ImportSchedule.tsx:185, writes.ts:158 | `works` |  |
| View classes | 07 Imported, footer | Closes onto the updated list, src/clubhouse/screens/classes/ImportSchedule.tsx:171 | `works` |  |

#### Notes
- No GAP rows: every drawn control either works on the live player route or is covered by Q-75b/Q-75d or phone/classes.md:27-31.
- Q-75a (Delete all) is held for the owner (PROGRESS.md:301, phone/classes.md:33) but is not drawn on either v2 board, so it has no row here; do not build it without the owner.
- Several board buttons have no handler on the board itself (detail Remove class and Edit class, AddClass sheet's Add class, review Edit pencil); the built ones do the obvious action, except the pencil, which is decided.
- The live page is the Clubhouse screen only for a player with isClubhouseFor('player') (page.tsx:13); a coach gets LegacyClassesPage, and nav.ts gives coaches no /classes.
- The board's always-visible "Sync calendar" button is intentionally absent (phone/classes.md:29); if the owner wants a manual re-sync, it needs a sync timestamp column first.

## Settings (no v2 board)

There is no v2 Settings board. The controls that lead to Settings are drawn on other boards and are listed under the Shell section: the top-bar gear on the desktop boards, and Settings, Help and Sign out in the coach phone More sheet. Settings itself was built from the design system (D-18, docs/clubhouse/PROGRESS.md:177), so it has no board to check against. Nothing to inventory here.

## Shell: sidebar, top bar, tab bar, More sheet, bell, and the Settings entry (coach and player)

### Coach desktop shell (same wiring on every `Coach - *.html`; read from `Coach - Home.html`)
Built counterpart: src/clubhouse/shell/Sidebar.tsx, NextEventCard.tsx, TopBar.tsx, Bell.tsx, crumbs.tsx, nav.ts, data/shell.ts (same shell wiring checked in Coach - CoachHelm, Calendar, Team Hub, Messages, Roster, Stats, Qualifiers .html; FairwaySidebar/FairwayTopBar/IconButton in _ds_bundle.js:1260, 2067, 2127). Phone build: n/a. Skipped scaffolding: GHLayer state overlay, the board's "isn't designed yet" placeholder, ToastStack.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Varsity · Fall 2026 (chevrons-up-down team chip) | Sidebar, brand block | Team name as a plain label, no switcher, src/clubhouse/shell/Sidebar.tsx:49 | `decided` | No handler on the board. Team switcher is an explicit non-goal, docs/clubhouse/pages/P001-shell/DESIGN.md:119 (one team per coach, Q-66 PROGRESS.md:292) |
| Home | Sidebar, main group | Link to /golf/dashboard, src/clubhouse/shell/Sidebar.tsx:65 (href from nav.ts:35) | `works` | Board GH.go (gh-nav.js:29) |
| CoachHelm | Sidebar, main group | Link to /golf/dashboard/coachhelm, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:36), rebuilt for coach nav.ts:113 | `works` | nav.ts:30 comment calling it not rebuilt is stale (D-66) |
| Calendar | Sidebar, main group | Link to /golf/dashboard/calendar, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:37) | `works` | |
| Team Hub | Sidebar, main group | Link to /golf/dashboard/team-hub, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:38), rebuilt nav.ts:120 | `works` | |
| Messages (count 3) | Sidebar, main group | Link to /golf/dashboard/messages with the live unread count, src/clubhouse/shell/Sidebar.tsx:17 and :73 | `works` | Count from useNotificationBadges().messages; hidden at 0 |
| Roster | Sidebar, Team | Link to /golf/dashboard/roster, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:40) | `works` | Clubhouse adds a join-request count the board does not draw (Sidebar.tsx:19, CH-1208) |
| Stats | Sidebar, Team | Link to /golf/dashboard/stats, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:41) | `works` | |
| Qualifiers | Sidebar, Team | Link to /golf/dashboard/qualifiers, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:42) | `works` | |
| Next event card (Pinehurst qualifier, In 2 days, 5 of 6 players ready) | Sidebar, footer | Link to /golf/dashboard/calendar?event=id, src/clubhouse/shell/NextEventCard.tsx:8, opened by Calendar.tsx:208 | `works` | No handler on the board (a div). "Ready" reads as "N of M confirmed" (D-17, PROGRESS.md:176). Hidden when nothing is scheduled (CH-1304) |
| Search field (placeholder "Search players, rounds, events"; CoachHelm board "Ask about a player or a stat"; Calendar "Search events, players, places"; Team Hub "Search announcements, trips, files") | Top bar, centre | Not rendered, src/clubhouse/shell/TopBar.tsx:13 | `decided` | Board handler is onSearch={() => {}}, a no-op. PROGRESS.md:387: search needs its own spec. Sensible destination: a ⌘K palette over players, events and rounds Reclassified from `data-gap`: the record is a decision to hide until a spec exists (PROGRESS.md:387), not a missing data source. |
| ⌘K hint | Top bar, inside search field | No shortcut, no field, src/clubhouse/shell/TopBar.tsx:13 | `decided` | Same record as the search field, PROGRESS.md:387 Reclassified from `data-gap` (a recorded hide, PROGRESS.md:387). |
| Notifications (bell) | Top bar, right | Opens the notifications popover, src/clubhouse/shell/Bell.tsx:318 | `works` | No handler on the board; D-17 (PROGRESS.md:176) makes it the current app's feed. Unread count badge Bell.tsx:325 |
| Bell: filter (All / category) | Bell popover (built, not drawn on the board) | Category menu, src/clubhouse/shell/Bell.tsx:215 | `works` | Shown only when two or more categories are present |
| Bell: Mark all read | Bell popover (built, not drawn on the board) | Calls markAllNotificationsRead (unified-notifications.ts:357 updates both tables), src/clubhouse/shell/Bell.tsx:230 | `works` | CH-1001 on failure, restores dots |
| Bell: open a notification | Bell popover row (built, not drawn on the board) | Marks read and routes to its internal link, src/clubhouse/shell/Bell.tsx:196 | `works` | Off-site links ignored (isSafeInternalPath) |
| Bell: Try again / Show all | Bell popover states (built, not drawn on the board) | Retry load src/clubhouse/shell/Bell.tsx:250; clear filter src/clubhouse/shell/Bell.tsx:269 | `works` | CH-1201, CH-1303 |
| Settings (gear) | Top bar, right (Home, Calendar, Messages, Roster, Stats, Qualifiers boards) | Link to /golf/dashboard/settings, src/clubhouse/shell/TopBar.tsx:52, rebuilt nav.ts:108 | `works` | The only desktop route to Settings on the boards; the sidebar draws none and Clubhouse adds none (D-41 covers the phone) |
| CoachHelm settings (gear) | Top bar, right (Coach - CoachHelm.html:42) | Same gear to Settings, which opens on Account, src/clubhouse/shell/TopBar.tsx:53 | `GAP` | Build in src/clubhouse/shell/TopBar.tsx: on /golf/dashboard/coachhelm link the gear to /golf/dashboard/settings?section=coachhelm and label it "CoachHelm settings". Reach low: CoachHelm has its own Open CoachHelm settings link. No handler on the board |
| Team Hub settings (gear) | Top bar, right (Coach - Team Hub.html:44) | Same gear to Settings, Account section, src/clubhouse/shell/TopBar.tsx:53 | `GAP` | Build in src/clubhouse/shell/TopBar.tsx: on /golf/dashboard/team-hub (coach) link the gear to /golf/dashboard/settings?section=team. Reach low: a secondary icon. No handler on the board; section ids in settings/model.ts:17 |

### Player desktop shell (same wiring on every `Player - *.html`; read from `Player - Home.html`)
Built counterpart: src/clubhouse/shell/Sidebar.tsx, NextEventCard.tsx, TopBar.tsx, Bell.tsx, nav.ts:50 (same shell wiring checked in Player - CoachHelm, Team Hub, Rounds, Classes .html). Phone build: n/a. Skipped scaffolding: GHLayer state overlay; the player brand block has no chevron and no handler, so no row.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Home | Sidebar, main group | Link to /golf/dashboard, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:51) | `works` | |
| CoachHelm | Sidebar, main group | Link to /golf/dashboard/coachhelm, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:52), rebuilt for player nav.ts:123 | `works` | |
| Team Hub | Sidebar, main group | Link to /golf/dashboard/team-hub, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:54) | `works` | |
| Team Hub count (3) | Sidebar, Team Hub item | No count; nav.ts:54 has no badge, src/clubhouse/shell/Sidebar.tsx:12 | `GAP` | Build in src/clubhouse/shell/nav.ts and Sidebar.tsx: a 'hub' badge summing useNotificationBadges() announcements + tasks + travel. Reach medium: shown in every player session. Counts already exist in notification-badge-context.tsx:15 |
| Rounds | Sidebar, My game | Link to /golf/dashboard/rounds, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:56), rebuilt for player nav.ts:123 | `works` | |
| Classes | Sidebar, School | Link to /golf/dashboard/classes, src/clubhouse/shell/Sidebar.tsx:65 (nav.ts:59) | `works` | |
| Next event card (Pinehurst qualifier, Tee time 8:42) | Sidebar, footer | Link to /golf/dashboard/calendar?event=id, src/clubhouse/shell/NextEventCard.tsx:8 | `works` | No handler on the board. The meta line shows "N of M confirmed" for players too, not a tee time (no per-player tee time source) |
| Search field ("Search rounds, courses, events") | Top bar, centre | Not rendered, src/clubhouse/shell/TopBar.tsx:13 | `decided` | Board onSearch={() => {}}. PROGRESS.md:387 Reclassified from `data-gap`: the record is a decision to hide until a spec exists (PROGRESS.md:387), not a missing data source. |
| ⌘K hint | Top bar, inside search field | Not rendered | `decided` | PROGRESS.md:387 Reclassified from `data-gap` (a recorded hide, PROGRESS.md:387). |
| Notifications (bell) | Top bar, right | Opens the notifications popover, src/clubhouse/shell/Bell.tsx:318 | `works` | No handler on the board; D-17 |
| Bell: filter, Mark all read, open a notification, Try again | Bell popover (built, not drawn on the board) | src/clubhouse/shell/Bell.tsx:215, :230, :196, :250 | `works` | Same component as coach |
| Settings (gear) | Top bar, right | Link to /golf/dashboard/settings, src/clubhouse/shell/TopBar.tsx:52 | `works` | Player sections: account, golf, notifications, preferences (settings/model.ts:21) |

### Coach phone shell (tab bar, More sheet, top bars; read from `Coach - Home - Mobile.html` and the other coach phone boards)
Built counterpart: src/clubhouse/shell/TabBar.tsx, TopBar.tsx, Bell.tsx, phone-chrome.tsx, ui/PhoneBar.tsx, shell.css:786-860. Board sources: m-shell.jsx (MTop, MTabs), m-ch.jsx MoreM (board "more"), m-home.jsx:110 hero bar, plus the top bars on Coach - Calendar/Stats/Roster/Messages/Qualifiers - Mobile and Coach and Player - CoachHelm/Team Hub - Mobile. Phone build: TabBar and More sheet. Skipped scaffolding: MSafari (dropped, D-43), iOS frame, GHBoards loading/empty phones, page-owned top-bar actions and in-page back links (Roster, Chat, Team, Helm).

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Home, CoachHelm, Calendar, Stats (x4) | Tab bar | Links to each rebuilt route, src/clubhouse/shell/TabBar.tsx:99, set nav.ts:70 | `works` | No handler on the board (MTabs buttons, m-shell.jsx:15). Select haptic on change |
| More (badge 3) | Tab bar, right | Opens the More sheet, src/clubhouse/shell/TabBar.tsx:127; badge is the Messages unread count, TabBar.tsx:56 | `works` | No handler on the board. D-40 roll-up |
| Home, Helm, Rounds, Stats, More (older set, Rounds active) | Tab bar on Coach - Qualifiers - Mobile (qual-mobile.jsx:155) | Not drawn; coach tabs per nav.ts:70 | `decided` | Superseded by D-66, PROGRESS.md:239 |
| Varsity (team chip, chevron-down) | Home hero bar, left (m-home.jsx:110) | Team label, no switcher, src/clubhouse/shell/TopBar.tsx:45 | `decided` | No handler on the board. Q-66, PROGRESS.md:292: the team is a label (one team per coach) |
| Notifications (bell) | Home hero bar right; tab-root top bar right on Stats | Bell opens a modal sheet, src/clubhouse/shell/Bell.tsx:318 and :346 | `works` | No handler on the board. Sheet has filter, Mark all read, rows (foundation.md:81) |
| Notifications (bell) on CoachHelm tab root | Top bar right, Coach and Player - CoachHelm - Mobile (MTop default) | Hidden: CoachBoard.tsx:259 renders PhoneTop start, and shell.css:812 hides the bell for any page top | `GAP` | Build in src/clubhouse/shell/TopBar.tsx (and shell.css:812): keep the bell for a `start` PhoneTop with no action. Reach medium: CoachHelm is a tab. Spec: tab root has the bell, foundation.md:74 |
| Notifications (bell) on Team Hub and Qualifiers | Top bar right, Team Hub - Mobile and Qualifiers - Mobile (MTop default) | Replaced by "‹ More" back link, TeamHub.tsx:271, QualifiersList.tsx:65 | `decided` | A page top swaps the bell for the back link, catalog/shell.md:90 (CH-1810), D-41 PROGRESS.md:189 |
| ‹ More (back) | Top bar left, Roster, Messages (and Calendar) boards | Back via useBackFromMore, src/clubhouse/shell/phone-chrome.tsx:117 (RosterPhone.tsx:94, MessagesPhone.tsx:120) | `works` | Returns to where the user came from (D-41). Calendar is a coach tab root instead (CalendarPhone.tsx:70), per D-66 |
| Maya Reyes, Head coach · Varsity (me card, chevrons-up-down) | More, top | Link to Settings, src/clubhouse/shell/TabBar.tsx:180 | `works` | No handler on the board; the chevron hints a switcher, a non-goal (P001 DESIGN.md:119) |
| Calendar (Pinehurst qualifier Thursday) | More, list | Not in the coach sheet: Calendar is a tab, nav.ts:70 | `decided` | D-66, PROGRESS.md:239. The next-event subline is built on the Calendar row when it is under More (TabBar.tsx:203, player) |
| Messages (4 unread, badge 3) | More, list | Link with unread count, src/clubhouse/shell/TabBar.tsx:193 and :214 | `works` | No handler on the board. The "4 unread" subline is shown as the count only |
| Roster (7 active · 2 join requests) | More, list | Link with join-request count, src/clubhouse/shell/TabBar.tsx:193 | `works` | No handler on the board. Subline not drawn; the count is |
| Qualifiers (Pinehurst · live) | More, list | Link to /golf/dashboard/qualifiers, src/clubhouse/shell/TabBar.tsx:193 | `works` | No handler on the board. "Pinehurst · live" subline not drawn |
| Lineups | More, list | Not drawn | `decided` | D-33 (Lineups hidden, PROGRESS.md:217) and D-66 (PROGRESS.md:239) |
| Courses | More, list | Not drawn; no Courses entry in nav.ts and no Courses screen | `decided` | D-66 (PROGRESS.md:239) follows gh-nav.js, which has no Courses; gh-nav.js:31 says More is the rest of the sidebar. No decision names Courses itself: owner to confirm |
| Settings | More, second group | Link to /golf/dashboard/settings, src/clubhouse/shell/TabBar.tsx:228 | `works` | D-41: Settings lives in More on the phone (no gear on the phone bar, shell.css:794) |
| Help | More, second group | Link to Settings, Help and legal card, src/clubhouse/shell/TabBar.tsx:234 (Account.tsx:263) | `works` | No handler on the board |
| Sign out | More, second group | Signs out via chSignOut, src/clubhouse/shell/TabBar.tsx:240 (lib/sign-out.ts:15) | `works` | CH-1002 toast with Retry on failure |

### Player phone shell (tab bar, top bars; read from `Player - Home - Mobile.html` and the other player phone boards)
Built counterpart: src/clubhouse/shell/TabBar.tsx, TopBar.tsx, Bell.tsx, phone-chrome.tsx, shell.css:786-860. Board sources: m-player-home.jsx:148 hero bar and :157 tabs, m-shell.jsx MTop/MTabs, plus top bars on Player - Rounds - Mobile, Player - Classes - Mobile, and the player frames of Coach and Player - CoachHelm/Team Hub - Mobile. Phone build: TabBar and More sheet. Skipped scaffolding: MSafari, iOS frame, GHBoards phones; the player hero team label is a span (no row); no board draws a player More sheet.

| Control (as labelled on the board) | Where on the board | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Home, CoachHelm, Rounds, Team Hub (x4) | Tab bar | Links to each rebuilt route, src/clubhouse/shell/TabBar.tsx:99, set nav.ts:71 | `works` | No handler on the board (m-shell.jsx:15) |
| Team Hub tab badge (3) | Tab bar, Team Hub | No badge; nav.ts:54 has none, src/clubhouse/shell/TabBar.tsx:96 | `GAP` | Build in src/clubhouse/shell/nav.ts and Sidebar.tsx badgeCount: the same 'hub' count as the desktop row. Reach medium: on the tab bar every session. Counts exist in notification-badge-context.tsx:15 |
| More (badge 3 on Rounds and Classes boards) | Tab bar, right | Opens the More sheet with the Messages count, src/clubhouse/shell/TabBar.tsx:127 and :56 | `works` | Sheet holds Calendar, Messages, My stats, Qualifiers, Classes, then Settings, Help, Sign out (TabBar.tsx:190, :228) |
| Notifications (bell) | Home hero bar, right (m-player-home.jsx:148) | Bell on the green hero bar opens the sheet, src/clubhouse/shell/Bell.tsx:318, hero via PlayerHomePhone.tsx:30 | `works` | No handler on the board |
| Notifications (bell) on CoachHelm, Rounds and Team Hub tab roots (x3) | Top bar right (MTop default on those boards) | Hidden: PlayerBoard.tsx:51, RoundsLibrary.tsx:99, TeamHub.tsx:270 render PhoneTop start, and shell.css:812 hides the bell | `GAP` | Build in src/clubhouse/shell/TopBar.tsx (and shell.css:812): keep the bell on a `start` PhoneTop with no action. Reach high: three of the four player tabs have no bell. Spec foundation.md:74 |
| Notifications (bell) with ‹ More | Top bar right, Classes board (MTop back="More", no right) | Back link replaces the bell, src/clubhouse/screens/classes/ClassesView.tsx:234 | `decided` | CH-1810, catalog/shell.md:90 |
| ‹ More (back) | Top bar left, Classes board | Back via useBackFromMore, src/clubhouse/shell/phone-chrome.tsx:117 (ClassesView.tsx:234) | `works` | No handler on the board (no onBack). D-41 |
| Settings | More sheet (player sheet not drawn; top bar has no gear) | Link to /golf/dashboard/settings, src/clubhouse/shell/TabBar.tsx:228 | `works` | D-41, PROGRESS.md:189 |

#### Notes
- The top-bar gear is not the only v2 route to Settings: MoreM (m-ch.jsx:47-57, board "more" in Coach - Home - Mobile.html:48) draws Settings, Help and Sign out, all built (TabBar.tsx:228, :234, :240). phone/foundation.md:124 and PROGRESS.md:430 ("no board draws the More screen") are stale.
- Phone bell: any PhoneTop, even the `start` tab-root variant, sets data-phone='page', and shell.css:812 hides the bell. Players lose it on three of four tabs and coaches on CoachHelm. One fix in TopBar/shell.css closes all four GAP rows.
- The player sidebar and More sheet also carry built screens v2 does not draw: Calendar, Messages (with an unread badge), My stats and Qualifiers (nav.ts:53-58, D-66). The coach More sheet carries Team Hub, which MoreM omits.
- MoreM is out of step with gh-nav.js: it lists Calendar (now a coach tab), Lineups and Courses. Courses is `decided` only by inference from D-66; ask the owner if they want it.
- Crumb drift: board "Program › Qualifiers" and "Team › Messages" against Clubhouse "Team › Qualifiers" and "Messages". Not controls.
- Pull to refresh and the push soft ask are not drawn on any v2 board (D-43 holds them), so they get no rows.
