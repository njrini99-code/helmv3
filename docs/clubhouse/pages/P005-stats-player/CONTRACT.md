# P005 — Stats (player): page contract

Every behaviour a player profile promises, by the 25 V2 categories (D-69). A contract's number is its Bridge ID (D-68: namespace 5, category, item); `Code` is the catalog code on the element and in the test (`docs/clubhouse/catalog/stats-player.md`). Rows without a code are behaviours with no single element, recorded in `config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001, namespace 1) apply here too and are named where they carry a category. The team's numbers are Stats (team), P004, with its own contracts. `clubhouse:check` holds this file to the registry.

## 01 — Default / core UI

Status: DEFINED

A profile opens on Overview, or the tab the address names, for the window the address names, with who and the four hero figures already in the server's first render (50101). The address is read for its tab and window (50102): ?tab=overview, game, rounds or dev, and ?window=season or qualifiers, anything else opening Overview and Last 10 (D-53; Roster's All N is `window=season&tab=rounds`). A coach pages through the team with Previous player and Next player (50103) and Message opens the player's direct thread (50104). A player's own address is /golf/dashboard/stats with no ?player=.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 50101 | — | `PROFILE_READY` | A profile opens on Overview for the window in the address: who (name, status, class, hometown), four hero figures, the four sections (Overview, Game detail, Rounds, Development) and the comparison table; a coach also gets Message, Add focus area, a way back to Team stats and the previous/next pager; on the phone, the phone profile. |
| 50102 | — | `TAB_AND_WINDOW_FROM_THE_ADDRESS` | ?tab=overview, game, rounds or dev opens that tab and anything else opens Overview (Roster's All N uses tab=rounds); ?window=season or ?window=qualifiers opens that window and anything else opens Last 10. |
| 50103 | — | `COACH_PAGES_THROUGH_THE_TEAM` | A coach pages through the active team ordered by scoring average with Previous player and Next player (N of M), wrapping from the last player to the first, and each link keeps the window. |
| 50104 | — | `MESSAGE_OPENS_THE_PLAYERS_THREAD` | A coach's Message on a profile (the desktop button, the phone header icon) opens Messages on the direct thread with that player (?player=<golf_players.id>); a player's own profile has no Message. |

From the shell (P001): 10101 CH-1904, 10102 SHELL_READY.

## 02 — Initial loading / skeleton

Status: DEFINED

The route's loading state is the Stats skeleton (CH-4401, Bridge 40201 on Team stats), inside the Clubhouse shell only, with the shell's timing: nothing for 150ms, then a fade (11609). It is Team stats' shape: a loading.tsx does not receive the address, so it cannot tell a profile from the team, and a profile's first paint (a taller hero) moves what the skeleton drew. Each tab loads with the page, so there is no per-tab skeleton.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 50201 | CH-5403 | `A_PLAYERS_STATS_ARE_LOADING_THEIR_OWN` | A player's stats are loading: their own, or a coach's `?player=` |
| 50202 | CH-5404 | `A_PLAYERS_ANSWER_TO_A_PROPOSED_FOCUS` | A player's answer to a proposed focus area is being sent |

From the shell (P001): 10201 CH-1401.

## 03 — Background loading / refresh

Status: DEFINED

Changing the window or paging to another player reloads the page in place: it dims and is marked busy, and the scroll stays (50302). A focus area being proposed shows on its button as Adding, and the button cannot be pressed twice (50301). Nothing refreshes in the background: no polling and no realtime.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 50301 | CH-5401 | `A_FOCUS_AREA_IS_BEING_PROPOSED` | A focus area is being proposed |
| 50302 | CH-5402 | `CHANGING_THE_WINDOW_OR_THE_PLAYER` | Changing the window or the player (pager) |

## 04 — Empty

Status: DEFINED

First-run and filtered are distinct, and a failed read is never shown as empty. Each tab and section says what is missing and what fills it in: no shot-by-shot rounds (50401), no rounds in the window (50402), no focus areas (50403) and no goals (50404), and under three rounds an early read that says what will move (50405). Who may not see a profile at all is a permission outcome (50801, 50802), and a signed-in person with no team sees the no-team page state (40409, catalogued on Team stats). Open: v2 draws Stats with no rounds ever as a whole-page empty, "No stats yet" (D-71, gh-states.jsx); the built page shows the tab-level states, because the loader reads only this season's rounds and cannot say "ever". Owner decision, not built.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 50401 | CH-5301 | `NO_ROUNDS_WITH_SHOTS_IN_THE_WINDOW` | No rounds with shots in the window |
| 50402 | CH-5302 | `NO_ROUNDS_IN_THE_WINDOW` | No rounds in the window |
| 50403 | CH-5303 | `NO_FOCUS_AREAS` | No focus areas |
| 50404 | CH-5304 | `NO_GOALS` | No goals |
| 50405 | CH-5305 | `FEWER_THAN_THREE_ROUNDS_IN_THE_WINDOW` | Fewer than three rounds in the window |
| 50406 | CH-5308 | `THREE_OR_MORE_ROUNDS_IN_THE_WINDOW` | Three or more rounds in the window but fewer than three with shots (strokes gained needs three rounds posted with shots) |
| 50407 | CH-5309 | `PHONE_NO_STROKES_GAINED_IN_THE_WINDOW` | Phone: no strokes gained in the window (no leg and no total) |
| 50408 | CH-5310 | `THE_LAST_10_WINDOW_HAS_NO_EARLIER` | The last-10 window has no earlier rounds to set strokes gained against (none, or fewer than three with shots) |

## 05 — Validation

Status: DEFINED

The one form is Add focus area: a name of at least three characters, checked before anything is sent, with the message under the field, the field focused and the warning haptic (50501).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 50501 | CH-5101 | `A_FOCUS_AREA_WITH_A_NAME_UNDER` | A focus area with a name under three characters |

## 06 — Server / system error

Status: DEFINED

Every change that can fail has its own toast: proposing a focus area (50601) and sharing a link from the phone (50610). Every read that can fail has its own notice with Try again: rounds (50602), shot detail (50603) and development items (50604); a failed benchmark read (50609) has no notice, because nothing claims a benchmark it does not have. A crash stays in its tab (50605 to 50608): each tab is inside a SectionBoundary with a Suspense inside it (D-24). A failed player or roster read is not any of these: the loader throws and the route's error view offers Try again (50611), so it is never shown as "not on your team". A page that fails to render at all is the shell's route error view (10603 to 10607).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 50601 | CH-5001 | `PROPOSING_A_FOCUS_AREA_FAILS` | Proposing a focus area fails |
| 50602 | CH-5201 | `ROUNDS_DONT_LOAD` | Rounds don't load |
| 50603 | CH-5202 | `SHOT_LEVEL_DETAIL_DOESNT_LOAD` | Shot-level detail doesn't load |
| 50604 | CH-5203 | `FOCUS_AREAS_OR_GOALS_DONT_LOAD` | Focus areas or goals don't load |
| 50605 | CH-5204 | `THE_OVERVIEW_CRASHES` | The overview crashes |
| 50606 | CH-5205 | `GAME_DETAIL_CRASHES` | Game detail crashes |
| 50607 | CH-5206 | `THE_ROUNDS_TABLE_CRASHES` | The rounds table crashes |
| 50608 | CH-5207 | `DEVELOPMENT_CRASHES` | Development crashes |
| 50609 | CH-5208 | `D1_BENCHMARKS_DONT_LOAD` | D1 benchmarks don't load, or the team's own row (its men's or women's tour) doesn't |
| 50610 | CH-5002 | `SHARING_A_PLAYERS_STATS_FROM_THE_PHONE` | Sharing a player's stats from the phone fails (the browser blocks the clipboard) |
| 50611 | — | `PROFILE_READ_FAILURE_RAISES_ROUTE_ERROR` | When the player row or the roster membership read fails, the loader logs it and throws, so the route error view (with Try again) shows; a profile is never reported as That player isn't on your team unless a read that worked found nobody. |
| 50612 | CH-5003 | `A_PLAYERS_ACCEPT_OF_A_PROPOSED_FOCUS` | A player's Accept of a proposed focus area fails |
| 50613 | CH-5004 | `A_PLAYERS_DECLINE_OF_A_PROPOSED_FOCUS` | A player's Decline of a proposed focus area fails |

## 07 — Network / offline

Status: DEFINED

Changing the window while offline is refused before anything is requested, and a change that takes longer than 5 seconds says so once (50701, 50702). A focus area proposed offline is refused before it is sent with the shell's toast, the sheet keeps its text, and a save over 5 seconds says so (10703, 10702). The offline banner (10701) and Try again while offline (10704) are the shell's.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 50701 | CH-5901 | `CHANGING_THE_WINDOW_WHILE_OFFLINE` | Changing the window (the switch, on desktop or the phone) while offline |
| 50702 | CH-5902 | `A_WINDOW_CHANGE_TAKES_LONGER_THAN_5` | A window change takes longer than 5 seconds |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

A player may open only their own stats, and a coach the team and any player on it.

- A player always gets their own profile (50803): ?player= is never read, the loader is asked for the caller's own id in the player view (their own rounds, D1 comparisons, no team average and no pager), and the page has no Message, no Add focus area and no way to the team.
- A coach's ?player= is read against the coach's own team from the session (50804): an active or inactive player opens; another team's player, a pending or removed member, and an id that is not shaped like an id all open "That player isn't on your team" (50801), and the last makes no read.
- A player with no active team sees "You aren't on a team yet" (40409); "Your stats aren't available" (50802) shows only when the team resolved but the roster has no row for the player when the profile is read.
- A second lock sits behind the route. Every read but the shot-level detail uses the caller's own database session, so row-level security applies. Shot-level detail goes through getDetailedStats, which checks first that the caller is the player or their coach and answers empty otherwise; it then reads on the service role, so that check is the lock. An empty answer shows as "didn't load", never as zeros (50805).
- Only a coach proposes focus areas (50806): the button and the sheet exist for a coach only, and the server action refuses a caller who is not a coach (read from the action, not tested). Found and not fixed, in the shared action: createFocusArea stores the coach id the browser sends, and skips its roster check when the coach has no organisation or no active team; row-level security remains the lock.
- The whole Clubhouse is gated by the shell (10801) and each role sees its own navigation (10802).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 50801 | CH-5306 | `A_COACH_OPENS_A_PLAYER_WHO_ISNT` | A coach opens a player who isn't on their team |
| 50802 | CH-5307 | `A_PLAYER_WHO_ISNT_ON_AN_ACTIVE` | A player who isn't on an active roster |
| 50803 | — | `PLAYER_SEES_ONLY_OWN_STATS` | A player always gets their own profile: ?player= is never read, the loader is asked for the caller's own id as a player view (only their rounds, D1 comparisons, no team average, no pager), and the page has no Message, no Add focus area and no way to the team. |
| 50804 | — | `COACH_OPENS_ROSTERED_PLAYERS_ONLY` | A coach's ?player= is read against the coach's own team from the session: a player who is active or inactive on it opens; another team's player, a pending or removed member, and an id that is not shaped like an id all open That player isn't on your team, and the last makes no read. |
| 50805 | — | `SERVER_REFUSAL_IS_NOT_ZEROS` | Shot-level detail is read through getDetailedStats for the profile's own player id, which answers empty to a caller who is neither the player nor their coach; empty detail for a window that has rounds shows as Shot-level detail didn't load, never as zeros. |
| 50806 | — | `ONLY_A_COACH_PROPOSES_FOCUS_AREAS` | The Add focus area buttons and sheet exist only for a coach viewing a profile (the route hands a coach id only to a coach); a player's profile never offers them. |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV.

## 09 — Success

Status: DEFINED

A proposal that lands names itself in a toast, plays the success haptic, closes the sheet and empties it (50901). It goes through useAction, so it is also the shell's change-landed rule (10901). Copying a link from the phone says Link copied with the same haptic.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 50901 | — | `FOCUS_AREA_PROPOSED` | A proposal that lands sends a focus area for this player from this coach with status proposed, names itself in a toast (Focus area proposed to the player; it starts when they accept) with the success haptic, closes the sheet and empties its fields. |

From the shell (P001): 10901 CHANGE_LANDED.

## 10 — Warning

Status: N/A — A profile warns about nothing: a small sample is an early read, and a figure the app cannot produce is a dash.

## 11 — Destructive

Status: N/A — Nothing on a profile deletes or removes anything; a focus area can only be proposed here, and the player accepts it in their own app.

## 12 — State preservation

Status: DEFINED

A focus area that fails to save keeps the sheet open with the area and the text the coach typed (51201). The chosen tab stays when the window changes or the coach pages to another player (51202). The address changes with scroll off.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 51201 | — | `FOCUS_TEXT_KEPT_ON_FAILURE` | A focus area that fails to save keeps the sheet open with the area and the text the coach typed, and the toast says so. |
| 51202 | — | `TAB_KEPT_ACROSS_WINDOWS_AND_PLAYERS` | The chosen tab stays when the window changes or the coach pages to another player. |

## 13 — Optimistic UI

Status: N/A — Nothing is optimistic: a proposal waits for the server with its button reading Adding, and a window change waits with the page dimmed.

## 14 — Retry / recovery

Status: DEFINED

Try again on a failed-read notice asks the server for the whole page again (51401), so every read is retried, not one tab's. The failure toast's Retry sends the same proposal again (the shell's 11402). Try again on a crash notice only draws that tab again. A page that failed to render at all has the shell's Try again (11401).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 51401 | — | `TRY_AGAIN_REFRESHES_THE_PAGE` | Try again on a failed-read notice (rounds, shot detail, development items) asks the server for the whole page again (router.refresh), so every read is retried, not one tab's. |

## 15 — Data freshness / sync

Status: DEFINED

After a proposal lands the page is read again, so Development lists it as proposed without a reload (51501). There is no other write, and no polling or realtime.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 51501 | — | `PAGE_READ_AGAIN_AFTER_A_PROPOSAL` | After a focus area is proposed the page is read again (router.refresh), so Development lists it as proposed without a reload. |

## 16 — Micro animation

Status: DEFINED

The profile's own motion is the tab underline and the focus-area sheet (51601, 51602), and the busy dim of a window change or paging (50302). Everything else is the shell's: v2 press, reveal, sheets and pushes (11601 to 11612, D-64).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 51601 | CH-5601 | `CHANGING_TABS` | Changing tabs |
| 51602 | CH-5602 | `OPENING_ADD_FOCUS_AREA` | Opening Add focus area |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

The profile's own haptics (51701, 51702) on the v2 grammar (D-70): a selection tick for a tab, a window, paging players or a Game detail section (the current one is silent); the warning pattern for a focus area with no name; success when a proposal lands or a link is copied; error when a save fails, a link cannot be shared or a window change is refused offline. With the shell's (11701 to 11706).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 51701 | CH-5701 | `CHANGING_TABS_THE_WINDOW_OR_PAGING_PLAYERS` | Changing tabs, the window, or paging players; choosing a Game detail leg |
| 51702 | CH-5702 | `PROPOSING_A_FOCUS_AREA_WITH_NO_NAME` | Proposing a focus area with no name |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706.

## 18 — Accessibility

Status: DEFINED

The profile's own (51801 to 51807): real tabs with their panels, "Stats › name" in a coach's top bar, the strokes gained route and hero figures as text, the focus-area field's name and description, axe at 1280 and 390, the rounds table as a named scroll region, and the phone's All N rounds and section chips saying which is open. The shell's skip link, landmarks, focus rules and dialog behaviour (11801 to 11811). Not built: arrow-key movement between tabs; each tab is one Tab stop.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 51801 | CH-5801 | `THE_SECTIONS_ARE_REAL_TABS_SELECTED_STATE` | The sections are real tabs: selected state, each controls its panel |
| 51802 | CH-5802 | `A_COACH_SEES_STATS_JONAH_OKAFOR_IN` | A coach sees "Stats › Jonah Okafor" in the top bar, as in the handoff |
| 51803 | CH-5803 | `THE_STROKES_GAINED_ROUTE_IS_AN_IMAGE` | The strokes gained route is an image with every leg's value in words; the hero figures are a proper definition list |
| 51804 | CH-5804 | `THE_FOCUS_AREA_FIELDS_NAME_IS_JUST` | The focus-area field's name is just "What to work on"; its help or error is read as its description |
| 51805 | CH-5805 | `NO_AXE_VIOLATIONS_ON_EVERY_TAB_AND` | No axe violations on every tab and state, 1280px and 390px |
| 51806 | CH-5806 | `ON_A_PHONE_THE_ROUNDS_TABLE_SCROLLS` | On a phone the rounds table scrolls sideways; it is a named region that takes focus, so the arrow keys scroll it |
| 51807 | CH-5807 | `ON_THE_PHONE_ALL_N_ROUNDS_IS` | On the phone, "All N rounds" is a button that says whether the full list is open; Game detail's section chips say which one is showing |
| 51808 | CH-5808 | `IN_THE_ROUNDS_TABLE_EACH_COURSE_OPENS` | In the Rounds table each course opens that round's review (for a coach and the player), named "Finley GC, Oct 14: open the round"; where the review isn't rebuilt, it stays text |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812.

## 19 — Responsive layout

Status: DEFINED

At 820px and below a profile is the phone view (51901); the phone spec is `docs/clubhouse/phone/stats-player.md` (approved). Above that the desktop layout follows its container, not the viewport, with steps at 1080, 900 and 720px in `stats.css`.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 51901 | — | `PHONE_PROFILE` | At 820px and below a profile is the phone view (who, three figures, Game detail one section at a time, scoring line, rounds, development), never a shrunken desktop; a coach's top bar is Player stats with Team and Share, a player's is My stats with More. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

The window switch moves and chooses with the arrow keys, and Enter in the focus-area field proposes it (52001). The section tabs are one Tab stop, where the arrows (wrapping), Home and End move between them and select, as in every Clubhouse tab list and the Segmented control. Esc closes the focus-area sheet (the shell's Modal).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 52001 | — | `KEYBOARD_PATH` | The window switch moves and chooses with the arrow keys, and Enter in the focus-area field proposes it; the section tabs are one Tab stop, where the arrows, Home and End move between them and select. |

## 21 — Performance

Status: DEFINED

One pass on the server (52101). Web vitals are the shell's (12101).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 52101 | — | `ONE_PASS_LOADER` | loadPlayerProfile reads the team, the player and the membership together, then the rounds, shot detail, benchmarks, focus areas and goals together, and the round figures once; a failed rounds, shot detail, benchmark, focus area or goal read is logged and flagged, never thrown. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page (12201 to 12203). A profile adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Failed reads logged, crashes and failed saves reported, intents breadcrumbed (52301).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 52301 | — | `FAILURES_REPORTED` | A failed read is logged through chLogServer('stats', player\|team\|membership\|rounds\|detailedStats\|d1Benchmarks\|focusAreas\|goals); a tab crash is reported through chReport with its surface (stats.player.overview, game, rounds, development) at high severity; a failed focus area save at low severity as stats.addFocusArea; a window change and a tab change leave a chTrail breadcrumb. |

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

Every catalog code is forced by a named test, and each hand contract is named in a test title (52401); `clubhouse:check` fails a catalog row of kinds 0 to 5 that no test names.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 52401 | — | `TESTS_NAME_CONTRACTS` | src/clubhouse/__tests__/stats-player.test.tsx names, in a test title, every Stats player catalog code it forces (the rows whose Test column names it, and the no-team row Team stats catalogues) and each hand contract above. |

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (change the window, open a tab, propose a focus area) are defined when the Bridge is.
