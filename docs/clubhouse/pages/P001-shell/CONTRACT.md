# P001 — Shell: page contract

Everything the Clubhouse frame promises on every page, by the 25 V2 categories (D-69): the sidebar,
the top bar and bell, the phone tab bar and More sheet, the offline banner, the toasts, the route
error views and the not-rebuilt notice. A contract's number is its Bridge ID (D-68: namespace 1,
category, item); `Code` is the catalog code on the element and in the test
(`docs/clubhouse/catalog/shell.md`). Rows without a code are behaviours with no single element,
recorded in `config/clubhouse/bridge-contracts.json` by hand. Every other page inherits these and
names them where they carry a category. `clubhouse:check` holds this file to the registry.

## 01 — Default / core UI

Status: DEFINED

The frame around every page (10102), and a page change that opens the new page at the top (10101).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 10101 | CH-1904 | `MOVING_TO_ANOTHER_PAGE_2` | Moving to another page |
| 10102 | — | `SHELL_READY` | Every Clubhouse page opens in the frame: on wide screens the sidebar, the top bar with the bell and the page; on a phone the page with the role's tab bar and More sheet. |

## 02 — Initial loading / skeleton

Status: DEFINED

The bell's own skeleton rows (10201). Each page owns its route skeleton; the shell holds it back for 150ms and then fades it in (11609), so a fast load never flashes.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 10201 | CH-1401 | `THE_BELL_IS_LOADING_ITS_LIST` | The bell is loading its list |

## 03 — Background loading / refresh

Status: DEFINED

The bell reads its list again on every open, and a list already shown stays while it does (10301). The sidebar's next event and Roster badge are read on the server with each page load.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 10301 | — | `BELL_REFRESHES_ON_OPEN` | The bell reads its list again every time it opens; a list already shown stays on screen while the new one loads. |

## 04 — Empty

Status: DEFINED

A page not rebuilt yet (10401), an empty bell (10402), a bell filter with nothing (10403), and no next event (10404, the card is left out). Each page's own first-run and filtered empties are in its contract.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 10401 | CH-1301 | `A_PAGE_THAT_HASNT_BEEN_REBUILT_IN` | A page that hasn't been rebuilt in Clubhouse |
| 10402 | CH-1302 | `THE_BELL_HAS_NOTHING` | The bell has nothing |
| 10403 | CH-1303 | `THE_BELLS_FILTER_HAS_NOTHING` | The bell's filter has nothing |
| 10404 | CH-1304 | `NOTHING_IS_SCHEDULED` | Nothing is scheduled |

## 05 — Validation

Status: N/A — the shell takes no typed input. Fields and their validation belong to the pages (for example Settings and Messages).

## 06 — Server / system error

Status: DEFINED

Mark all read fails (10601); the bell's list doesn't load (10602); the five route error views (10603 to 10607), each with its own words and recovery; and the two sidebar reads that hide rather than show something wrong (10608, 10609).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 10601 | CH-1001 | `MARK_ALL_READ_IN_THE_BELL_FAILS` | "Mark all read" in the bell fails |
| 10602 | CH-1201 | `THE_BELLS_LIST_DOESNT_LOAD` | The bell's list doesn't load |
| 10603 | CH-1202 | `THE_PAGE_WAS_BUILT_FOR_AN_OLDER` | The page was built for an older version |
| 10604 | CH-1203 | `GOLFHELM_UPDATED_WHILE_THE_PAGE_WAS_OPEN` | GolfHelm updated while the page was open |
| 10605 | CH-1204 | `THE_SERVER_IS_BUSY` | The server is busy |
| 10606 | CH-1205 | `THE_CONNECTION_DROPPED_MID_LOAD` | The connection dropped mid-load |
| 10607 | CH-1206 | `ANYTHING_ELSE_CRASHED_THE_PAGE` | Anything else crashed the page |
| 10608 | CH-1207 | `THE_SIDEBARS_NEXT_EVENT_DOESNT_LOAD` | The sidebar's next event doesn't load |
| 10609 | CH-1208 | `THE_ROSTER_BADGES_JOIN_REQUESTS_DONT_LOAD` | The Roster badge's join requests don't load |
| 10610 | CH-1002 | `SIGNING_OUT_FROM_THE_PHONES_MORE_SHEET` | Signing out from the phone's More sheet fails |

## 07 — Network / offline

Status: DEFINED

The banner under the top bar (10701), a save over five seconds says so once (10702), a save while offline is refused before anything is sent (10703), and Try again while offline says so instead of failing again (10704). Every page inherits all four.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 10701 | CH-1901 | `THE_DEVICE_GOES_OFFLINE` | The device goes offline |
| 10702 | CH-1902 | `A_SAVE_TAKES_LONGER_THAN_5_SECONDS` | A save takes longer than 5 seconds (forms, switches and CoachHelm settings) |
| 10703 | CH-1903 | `SOMEONE_SAVES_WHILE_OFFLINE` | Someone saves while offline |
| 10704 | CH-1905 | `SOMEONE_PRESSES_TRY_AGAIN_ON_A_NOTICE` | Someone presses Try again on a notice while offline |

## 08 — Permission / authorization

Status: DEFINED

Clubhouse renders only for a coach or a player with the flag on (10801); the same check guards the held server actions. Each role sees only its own navigation, and an address not rebuilt for that role shows the not-rebuilt notice, never another role's page (10802). Who may read or change what is decided by the server actions and RLS, never by the frame; the pages name their own gates.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 10801 | — | `CLUBHOUSE_GATE` | Clubhouse renders only for a coach or a player, and only with golf_clubhouse_ui on (isClubhouseFor); everyone else gets the existing GolfHelm pages, and held server actions refuse through the same check. |
| 10802 | — | `ROLE_SCOPED_NAV` | Each role sees only its own navigation (D-66), and an address not rebuilt for the viewer's role shows the not-rebuilt notice inside the Clubhouse frame, never another role's page or a Fairway page. |

## 09 — Success

Status: DEFINED

A change that lands fires the success haptic and names itself in a toast; an instant switch shows no toast (10901, D-70). Every page's saves go through this.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 10901 | — | `CHANGE_LANDED` | A change made through useAction that lands fires the success haptic and names itself in a toast; an action with no done line (an instant switch) shows no toast, its new position being the confirmation. |

## 10 — Warning

Status: N/A — the shell raises no warnings of its own. A slow save is a network state (10702), and the pages own their partial-success warnings.

## 11 — Destructive

Status: N/A — the frame has no destructive control. Sign out lives in Settings; every destructive action is a page's and asks first there.

## 12 — State preservation

Status: N/A — the frame holds nothing the user typed. A refused offline save changes nothing (10703), and the pages keep their own drafts (for example Messages 71202).

## 13 — Optimistic UI

Status: DEFINED

Mark all read and opening a notification update the bell at once; a failed Mark all read puts the rows back (11301).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 11301 | — | `BELL_MARK_ALL_OPTIMISTIC` | Mark all read clears the unread rows at once and puts them back when the write fails (with CH-1001); opening an unread notification marks it read at once. |

## 14 — Retry / recovery

Status: DEFINED

A crashed page offers Try again, or Reload after an update, with the number of tries (11401). Every error toast carries Retry, which runs the same action again (11402). The route boundary also retries a transient failure once by itself after two seconds when the tab is visible (at most twice per route per session); that part is the shared `RouteErrorBoundary`'s and is not tested here.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 11401 | — | `ROUTE_TRY_AGAIN` | A page that crashes shows its error view with Try again (Reload after an update), locked while it retries, the number of tries, and Back to Home. |
| 11402 | — | `TOAST_RETRY` | Every error toast from useAction carries Retry, which runs the same action with the same arguments again. |

## 15 — Data freshness / sync

Status: N/A — the shell keeps no data that can go stale on screen: the bell re-reads on open (10301) and the sidebar reads come with each page. A page built for an older version, or one open across an update, is caught as a route error (10603, 10604).

## 16 — Micro animation

Status: DEFINED

v2 motion (D-64) for every page: the route reveal, the More sheet, menus and the bell, toasts, the offline banner, the press, the focus ring, reduced motion, the skeleton delay, pushed screens, sheet drags and the phone bell (11601 to 11612).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 11601 | CH-1601 | `MOVING_TO_ANOTHER_PAGE` | Moving to another page, or its first load |
| 11602 | CH-1602 | `OPENING_MORE_ON_A_PHONE` | Opening More on a phone |
| 11603 | CH-1603 | `OPENING_THE_BELL_OR_ANY_MENU` | Opening the bell or any menu |
| 11604 | CH-1604 | `A_TOAST_ARRIVES_OR_LEAVES` | A toast arrives or leaves |
| 11605 | CH-1605 | `GOING_OFFLINE_OR_BACK_ONLINE` | Going offline or back online |
| 11606 | CH-1606 | `PRESSING_ANY_BUTTON_ROW_OR_TAB` | Pressing any button, row, tab or link |
| 11607 | CH-1607 | `THE_FIRST_TAB_ON_A_PAGE` | The first Tab on a page |
| 11608 | CH-1608 | `ANIMATIONS_OFF_IN_SETTINGS_OR_THE_OS` | Animations off in Settings, or the OS asks for reduced motion |
| 11609 | CH-1609 | `A_PAGE_OR_SECTION_IS_LOADING` | A page or section is loading |
| 11610 | CH-1610 | `A_PHONE_SCREEN_IS_PUSHED_OR_POPPED` | A phone screen is pushed (a thread, details, a new message) or popped |
| 11611 | CH-1611 | `SOMEONE_DRAGS_A_PHONE_SHEET_DOWN_BY` | Someone drags a phone sheet (More, the bell, or any `Modal`) down by its grab or header |
| 11612 | CH-1612 | `OPENING_THE_BELL_ON_A_PHONE` | Opening the bell on a phone |

## 17 — Haptic

Status: DEFINED

v2 haptics (D-70) for every page: a tab change, a save that lands, a failure, the More sheet, the bell and menus, and the connection dropping (11701 to 11706).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 11701 | CH-1701 | `CHANGING_TABS` | Changing tabs (not tapping the tab they're on) |
| 11702 | CH-1702 | `ANY_SAVE_OR_SEND_LANDS` | Any save or send lands |
| 11703 | CH-1703 | `ANY_SAVE_OR_SEND_FAILS` | Any save or send fails |
| 11704 | CH-1704 | `OPENING_MORE_SWIPING_THE_SHEET_AWAY` | Opening More; swiping the sheet away |
| 11705 | CH-1705 | `OPENING_THE_BELL_A_NOTIFICATION_OR_A` | Opening the bell, a notification, or a menu item |
| 11706 | CH-1706 | `THE_CONNECTION_DROPS` | The connection drops |

## 18 — Accessibility

Status: DEFINED

Skip to content, the modal More sheet, the current page and named landmarks, announced toasts, the bell as a dialog, focus rings, axe clean, the phone tab bar, pushed screens named and focused, the phone top bar, and the phone bell as a modal sheet (11801 to 11811).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 11801 | CH-1801 | `THE_FIRST_TAB_ON_ANY_PAGE_OFFERS` | The first Tab on any page offers "Skip to content", which jumps past the navigation to the page |
| 11802 | CH-1802 | `THE_PHONE_MORE_SHEET_IS_MODAL_FOCUS` | The phone More sheet is modal: focus moves in, Tab stays inside, Esc closes it and focus returns to More |
| 11803 | CH-1803 | `THE_CURRENT_PAGE_IS_MARKED_IN_THE` | The current page is marked in the sidebar and tab bar; the sidebar and its navigation are named landmarks; breadcrumbs mark the current page |
| 11804 | CH-1804 | `TOASTS_ARE_ANNOUNCED_CONFIRMATIONS_POLITELY_ERRORS_RIGHT` | Toasts are announced: confirmations politely, errors right away |
| 11805 | CH-1805 | `THE_BELL_PANEL_IS_A_DIALOG_IT` | The bell panel is a dialog: it takes focus on open, Esc closes it, and the filter menu works by keyboard |
| 11806 | CH-1806 | `EVERY_CONTROL_SHOWS_A_FOCUS_RING_ON` | Every control shows a focus ring on keyboard focus; text fields show their own green or ink ring instead, never two |
| 11807 | CH-1807 | `NO_AXE_VIOLATIONS_WITH_THE_BELL_OPEN` | No axe violations (WCAG 2.2 AA, contrast included) with the bell open (a sheet on the phone) and the More sheet open |
| 11808 | CH-1808 | `THE_PHONE_TAB_BAR_LISTS_THE_ROLES` | The phone tab bar lists the role's tabs (coach: Home, CoachHelm, Calendar, Stats, More; player: Home, CoachHelm, Rounds, Team Hub, More; D-66), and when Messages is under More, More is named with its unread count ("More, 3 unread messages") |
| 11809 | CH-1809 | `A_PUSHED_PHONE_SCREEN_IS_NAMED_BY` | A pushed phone screen is named by its title, and focus moves to that title; while it is up, the shell's top bar and tab bar are inert, so VoiceOver can't wander behind it |
| 11810 | CH-1810 | `ON_THE_PHONE_THE_TOP_BAR_NAMES` | On the phone the top bar names the page; a page with its own top (`PhoneTop`) gets a back link named for where it goes ("Back to More") in place of the bell |
| 11811 | CH-1811 | `ON_THE_PHONE_THE_BELL_OPENS_AS` | On the phone the bell opens as a modal sheet instead of a popover: focus moves in, Tab stays inside, Esc, Close or the scrim close it and focus returns to the bell; the edge swipe is off while it is up |
| 11812 | CH-1812 | `A_TOAST_RAISED_WHILE_A_DIALOG_OR` | A toast raised while a dialog or sheet is open shows inside it (on the phone, from the top), so it is seen, announced and its Retry can be tapped; a modal dialog makes everything outside it inert, which had hidden them. When the dialog closes, open toasts move back to the page |

## 19 — Responsive layout

Status: DEFINED

On a phone the sidebar gives way to the role's tab bar and the More sheet (11901, D-66). The phone spec is `docs/clubhouse/phone/foundation.md`.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 11901 | — | `PHONE_CHROME` | On a phone the sidebar gives way to the role's tab bar (coach Home, CoachHelm, Calendar, Stats; player Home, CoachHelm, Rounds, Team Hub) and a More sheet with the rest. |

## 20 — Keyboard / input

Status: DEFINED

On the phone the edge swipe and the browser's back pop a pushed screen, as its back link would (12001). Esc closes the More sheet and the bell (11802, 11805).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 12001 | CH-1906 | `ON_THE_PHONE_THE_EDGE_SWIPE_OR` | On the phone, the edge swipe or the browser's back while a screen is pushed |

## 21 — Performance

Status: DEFINED

Web vitals (INP, CLS, LCP) come from Sentry browser tracing, sampled at 20% of sessions (12101); nothing Clubhouse-side measures them yet. The animation features load in their own chunk after first paint (D-25); the shell's server reads run in parallel in one pass and never take a page down.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 12101 | CH-1954 | `THE_PAGE_IS_SLOW_TO_RESPOND_OR` | The page is slow to respond or shifts after loading (INP, CLS, LCP) |

## 22 — Analytics

Status: DEFINED

Rage, dead and slow clicks are seen only through Sentry Replay (10% of sessions plus every session with an error), with nothing on screen (12201 to 12203). There is no Clubhouse-side detector, so most are not seen; the Bridge is where they will be counted.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 12201 | CH-1951 | `SOMEONE_CLICKS_THE_SAME_THING_OVER_AND` | Someone clicks the same thing over and over (rage click) |
| 12202 | CH-1952 | `A_CLICK_THAT_DOES_NOTHING` | A click that does nothing (dead click) |
| 12203 | CH-1953 | `A_SLOW_RESPONSE_TO_A_CLICK` | A slow response to a click (slow click) |

## 23 — Logging / observability

Status: DEFINED

Every client failure goes through chReport with its surface and action, a refused action at low severity; every event carries ui=clubhouse; server reads log through chLogServer; each intent leaves a breadcrumb (12301).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 12301 | — | `FAILURES_REPORTED` | A thrown action is reported through chReport with its surface and action; a refused one at low severity; every event is tagged ui=clubhouse, and server reads log through chLogServer as clubhouse.<surface>.<read>. |

## 24 — CI / automated test

Status: DEFINED

`clubhouse:check` fails a catalog code that no test names (12401); `shell.test.tsx`, `gate.test.ts`, `native.test.tsx` and `motion.test.tsx` force the shell's states by their codes and Bridge IDs.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 12401 | — | `TESTS_NAME_CONTRACTS` | Every catalog code is used in code and forced by a test that names it; clubhouse:check fails a row of kinds 0 to 5 that no test names. |

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the shell's commands (open the bell, go to a page, open More) are defined when the Bridge is.
