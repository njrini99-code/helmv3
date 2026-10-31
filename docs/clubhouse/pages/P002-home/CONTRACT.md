# P002 — Home: page contract

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Smoothness repair

LatestRound passes the reduced preference through chSwap, eliminating the
retained fade when motion is disabled.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## Current contract audit — 2026-10-06

The manifest reports complete contract coverage and 13 mapped actions.
Existing Bridge IDs, catalog rows and generated contract tables remain
authoritative. Check loading-to-content geometry, long names, team-timezone
day labels and latest-round expansion under reduced motion.

The [all-page audit](../../ALL_PAGE_AUDIT.md#p002-home) distinguishes
implemented/tested behavior from open runtime acceptance; this pass does not
reserve new IDs or mark manual contracts verified.
<!-- clubhouse:release-audit:end -->

Every behaviour Home promises, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 2, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/home.md`).
Rows without a code are behaviours with no single element, recorded in
`config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001,
namespace 1) apply here too and are named where they carry a category.
`clubhouse:check` holds this file to the registry.

Home is two pages under one address, `/golf/dashboard`: Coach Home and Player
Home. Where a contract belongs to one of them the note says which. Home reads.
The one place it writes is the coach's class line (P-10, behind the
`class_awareness_v1` flag): the Term sheet and the no-class days sheet it opens
save a term and a team break and delete a break, which is why validation,
destructive actions and the class day's freshness are defined below. Everything
else on Home is read only.

Safari review, 2026-10-01: the player's countdown applies to timed events only.
All-day events show their date and All day without treating midnight as a tee
time. All-day dates retain Calendar's literal dates and inclusive multi-day
span; an event active today remains in Today and Up next. The timed countdown
reserves its space before the client clock is available. No schema or event
write changes.

## 01 — Default / core UI

Status: DEFINED

Home is `/golf/dashboard`, and it is two pages. A coach with the Clubhouse flag
on gets Coach Home (20101): the date, the greeting and a one-sentence brief;
Message team and New event; the week beside the latest round in one sheet; and
the season leaderboard. A player gets Player Home (20102): the date and the
greeting, with no brief line under it (owner, 2026-10-06); Message coach; the
week beside Up next with its countdown and Your latest round; then Scoring and
the four parts of the game. Both are read on the server, so the first paint has
its data. A team with nobody on it yet gets the first-run page (20408 for a
coach, events or not, the week above it once there are some), and a player with
no round gets it with nothing on the calendar (20412, D-71); with the team's
events, that player's loaded page keeps the week and shows the welcome in place
of the rounds. The coach first run's Invite players opens Roster with its invite
sheet (`/golf/dashboard/roster?invite=1`, P003 30102). Every
link Home hands out is 20103. Home reads no Clubhouse query parameter: the
Fairway dashboard's `?range=` is ignored here, and there is no deep link into
Home.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 20101 | — | `COACH_HOME_READY` | Coach Home opens with the date, the greeting and the brief, Message team and New event, the week beside the latest round in one sheet, and the season leaderboard, all read on the server for the first paint; a team with nothing yet gets the first-run page (CH-2308), and on a phone the same data is drawn as the phone Home (21901). |
| 20102 | — | `PLAYER_HOME_READY` | Player Home opens with the date and the greeting (no brief line: owner, 2026-10-06), Message coach, the week beside Up next and Your latest round in one sheet, then Scoring and the four parts of the game, all read on the server for the first paint; a new player gets the first-run page (CH-2312), and on a phone the same data is drawn as the phone Home (21901). |
| 20103 | — | `LINKS_OPEN_WHAT_THEY_NAME` | Every link out of Home opens the thing it names: Message team the team chat (?conversation=) or Messages when the chat did not load, Up next and a Today row that event in Calendar (?date=&event=), a week day Calendar's day view (?view=day&date=), New event, Plan, Add event and the quick event types the editor (?new=1, with &type=), a leaderboard row and a latest round's stats link that player's stats (?player=), My stats the player's own stats, Message coach the coach's thread (?user=), the first run's Invite players Roster with its invite sheet open (/golf/dashboard/roster?invite=1), each part of the coach's "Waiting on you" the screen that holds it (join requests Roster, replies that event in Calendar when one event holds them and Calendar when more do, overdue tasks Team Hub's Tasks ?tab=tasks, posts awaiting acknowledgement its Announcements ?tab=ann), a name in the team's four parts that player's Game tab on Stats on the same Last 10 (?player=&tab=game) and Team stats Stats, the coach's Next row Nudge Messages prefilled for who hasn't replied (the phone day card's own link, never sent), and CoachHelm in the player peek and the phone's round sheet that player's deep dive (/golf/dashboard/coachhelm?view=deep-dive&player=); a link to a screen not yet rebuilt for the viewer's role is not drawn. |
| 20104 | — | `COACH_QUEUE_COUNTS_AS_ITS_SCREEN` | Coach Home's "Waiting on you" (under the head on desktop, in the phone's hero, and on the first run) counts each part with the read and rule of the screen that holds it, so the two show one number: pending join requests as the sidebar's Roster badge counts them, replies missing on this week's events that still take one as Team Hub's RSVPs count "no reply" (rsvpQueue), overdue tasks as Team Hub's Tasks (taskStatus, overdueTaskCount) and posts awaiting an acknowledgement as its Announcements (unackedPostCount). Only parts above zero are drawn, in that order; with nothing waiting the row is not drawn. Each part reads on its own: one that fails is null, logged and left out, never 0 (CH-2220). |
| 20105 | — | `TEAM_PARTS_ON_THE_FORMS_LAST_10` | Coach Home's four parts (The team's game; under the team's form on desktop, after Team scoring on the phone) read the form's own Last 10 rounds of the active roster, hole-level only (Q-123): strokes gained per round in each part from 3 rounds with hole scores (else none), its change against the same players' previous ten (Q-112) coloured only when it clears its standard error, the part's plain stat (Fairways, Greens, Up and down, Putts) with the Tour's mark from the team's tour, and who gains and loses most from Team Stats' ranking (ties share a place and are named together; one ranked player, or everyone in one place, loses nothing). No other player's round reaches the figures. |

From the shell (P001): 10101 CH-1904, 10102 SHELL_READY,
10103 TEAM_SWITCH_READS_EVERY_SCREEN_AGAIN.

## 02 — Initial loading / skeleton

Status: DEFINED

One route skeleton (20201), `HomeSkeleton`, for both roles. On a desktop width
it is Coach Home's shape (the header, two panes and five leaderboard rows) for
both roles: Player Home's own desktop skeleton is not built (open gap,
VERIFY.md). On a phone it is the phone Home's shape in the reader's role (since
2026-10-08, `SkeletonPhoneHero` reads the shell's role): the coach's brief lines
above Up next, or the player's two keys under it. Nothing on either Home loads
by itself after first paint, so there is no skeleton per section. v2 timing
(nothing for 150ms, then a fade) is the shell's 11609.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 20201 | CH-2401 | `HOME_IS_LOADING` | Home is loading |
| 20202 | CH-2470 | `THE_SHEET_OPENS_BEFORE_THE_CLASS_DAY` | The sheet opens before the class day has arrived |

## 03 — Background loading / refresh

Status: DEFINED

Home does not poll, has no realtime and no pull to refresh: the page is
`force-dynamic`, so a new visit reads afresh (going back or forward may show
Next's client cache; not tested). What moves on its own is the clock (20301):
the phone's Up next line (In 50 min, Happening now) is recomputed every minute,
and the player's countdown every second, from the device's clock. The phone's
Today marks (Now, past, and for a player Next) follow the same clock; the
player's are tested (`player-home-phone.test`), the coach's are read from the
code. The desktop agenda's Next badge is set on the server when the page loads
and does not move. "Today", "Tomorrow" and the weekday compare the event's
team-local date with the team-local date now, both on the team's clock
(`whenLabel`). A page left open past midnight in the team's timezone reads
itself again (`router.refresh`) when the team-local date turns: at the team's
next midnight, and when the page comes back into view (visibilitychange, focus,
pageshow), at most three times for one new day if the server still answers with
the old one (`useHomeDayRollover`, home-day-rollover.test).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 20301 | — | `CLOCK_KEEPS_TIME` | The phone's Up next line (In 50 min, Happening now) is recomputed from the device clock every minute and the player's countdown every second, so neither needs a reload. |

## 04 — Empty

Status: DEFINED

First-run states and section empties. Home has no filter or search, so there is
no filtered empty. A failed read is never drawn as empty: it is a notice with
Try again (category 06), and the first-run page is refused while any section
failed. Both roles: nothing on the calendar today (20401), no rounds this season
(20402), and the newest round posted as a total (20403). Coach Home: no players
(20404), players but no 18-hole rounds (20405), a player with fewer than three
rounds reads Early read (20406), nothing ahead on the phone, with quick adds
(20409), a coach with no team (20407) and a team with nothing yet (20408).
Player Home: nothing ahead in the player's wording, with no quick adds (20409),
fewer than two rounds for the Scoring line (20410), nothing to break down
(20411), a new player (20412) and a player on no team (20413). The no-team and
first-run states are the v2 page empty state (D-71). Which viewer meets which is
the route's decision (20802).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 20401 | CH-2301 | `NOTHING_IS_ON_THE_CALENDAR_TODAY` | Nothing is on the calendar today |
| 20402 | CH-2302 | `NO_ROUNDS_THIS_SEASON` | No rounds this season |
| 20403 | CH-2303 | `THE_NEWEST_ROUND_WAS_POSTED_AS_A` | The newest round was posted as a total |
| 20404 | CH-2304 | `NO_PLAYERS_ON_THE_ROSTER` | No players on the roster |
| 20405 | CH-2305 | `PLAYERS_BUT_NO_18_HOLE_ROUNDS` | Players, but no 18-hole rounds |
| 20406 | CH-2306 | `A_PLAYER_HAS_FEWER_THAN_THREE_ROUNDS` | A player has fewer than three rounds |
| 20407 | CH-2307 | `A_COACH_WITH_NO_ACTIVE_TEAM` | A coach with no active team |
| 20408 | CH-2308 | `A_TEAM_WITH_NOTHING_YET_NO_PLAYERS` | A team with nobody on it yet: no players, no rounds, and every read answered (events or not: it rests on the people, not the calendar) |
| 20409 | CH-2309 | `NOTHING_ON_THE_CALENDAR_AHEAD` | Nothing on the calendar ahead (phone). A player: "Your coach’s practices and events will show here with a countdown.", no quick adds |
| 20410 | CH-2310 | `FEWER_THAN_TWO_18_HOLE_ROUNDS` | Fewer than two 18-hole rounds (player Home Scoring) |
| 20411 | CH-2311 | `NO_FAIRWAYS_GREENS_SCRAMBLING_OR_PUTTS_LOGGED` | No fairways, greens, scrambling or putts logged (player Home) |
| 20412 | CH-2312 | `A_NEW_PLAYER_NO_ROUNDS_NOTHING_ON` | A new player: no rounds, every read answered (v2 first-run, D-71) |
| 20413 | CH-2313 | `A_PLAYER_ON_NO_ACTIVE_TEAM` | A player on no active team |
| 20414 | CH-2314 | `NO_ROUND_IN_THE_TEAMS_LAST_10` | No round in the team's last 10 has hole scores (coach Home, the team's four parts) |
| 20415 | CH-2315 | `ROUNDS_WITH_HOLE_SCORES_BUT_NO_PLAYER` | Rounds with hole scores, but no player with 3 of them (coach Home, the team's four parts) |
| 20416 | CH-2370 | `NOBODY_ON_THE_TEAM_HAS_A_CLASS` | Nobody on the team has a class today (the sheet is open) |

## 05 — Validation

Status: DEFINED

Home takes input in one place: the coach's Term sheet (a name, three dates and a
time zone) and the no-class days sheet (two dates and a name), both opened from
the class line (P-10). They say what is wrong in a sentence before anything is
sent, and the database refuses the same limits. Everything else on Home takes no
input: its controls are links, the latest-round pager, the Scoring window (a
choice of three) and the N shortcut, none of which can be invalid.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 20501 | CH-2170 | `THE_LAST_DAY_OF_CLASSES_IS_NOT` | The last day of classes is not after the first |
| 20502 | CH-2171 | `A_TERM_SHORTER_THAN_4_WEEKS_OR` | A term shorter than 4 weeks or longer than about 6 months |
| 20503 | CH-2172 | `EXAMS_END_MORE_THAN_3_WEEKS_AFTER` | Exams end more than 3 weeks after the last class |
| 20504 | CH-2173 | `EXAMS_END_BEFORE_THE_LAST_DAY_OF` | Exams end before the last day of classes |
| 20505 | CH-2174 | `THE_TERM_OVERLAPS_ANOTHER_OF_THE_TEAMS` | The term overlaps another of the team's terms |
| 20506 | CH-2175 | `THE_TERM_HAS_NO_NAME` | The term has no name |
| 20507 | CH-2176 | `A_NO_CLASS_RANGE_ENDS_BEFORE_IT` | A no-class range ends before it starts |
| 20508 | CH-2177 | `A_NO_CLASS_RANGE_IS_LONGER_THAN` | A no-class range is longer than 21 days |

## 06 — Server / system error

Status: DEFINED

Home only reads, so it has no error toasts. Every section that fails to load
shows its own notice with Try again and never an empty state (20601 to 20604 for
the week, the rounds, the hole-by-hole scores and the leaderboard; 20611 for the
phone's team form; 20615 and 20616 for the player's rounds and scrambling). A
crash stays in its section (SectionBoundary): 20605 to 20607 on the desktop,
20612 to 20614 on the phone, 20617 for the player's scoring and parts of the
game, 20622 for the coach's four parts (desktop and phone). The coach's four
parts say what did not load above them and keep the rest: the up-and-down
figures (20619; strokes gained stays) and the Tour's marks (20620; each stat
stands without its mark). A part of "Waiting on you" that fails is left out,
never counted as 0, and the row says some items didn't load (20621). Three reads
change a link or a line instead of showing a notice: the team chat (20608,
Message team opens Messages), the event replies (20609, an agenda row drops who
is invited and the "going" count, never "0 players") and the timezone (20610,
Eastern). A stored timezone that is not a real zone is read the same way
(20618), where before it failed the whole page. The route's own errors are the
shell's (10603 to 10607); a player's membership read that fails is one of them
(20802). A figure with no source is left out rather than invented: a part of the
game without a D1 benchmark draws no D1 mark, and a team without a known coach
opens Messages plain (20805).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 20601 | CH-2201 | `THE_WEEKS_EVENTS_DONT_LOAD` | The week's events don't load |
| 20602 | CH-2202 | `SEASON_ROUNDS_DONT_LOAD` | Season rounds (or the roster behind them) don't load |
| 20603 | CH-2203 | `A_ROUND_LOADS_BUT_ITS_HOLE_BY` | A round loads but its hole-by-hole scores don't |
| 20604 | CH-2204 | `SEASON_ROUNDS_DONT_LOAD_2` | Season rounds don't load (the leaderboard's source) |
| 20605 | CH-2205 | `THE_WEEK_SECTION_CRASHES_WHILE_DRAWING` | The week section crashes while drawing |
| 20606 | CH-2206 | `THE_LATEST_ROUND_CRASHES_WHILE_DRAWING` | The latest round crashes while drawing |
| 20607 | CH-2207 | `THE_LEADERBOARD_CRASHES_WHILE_DRAWING` | The leaderboard crashes while drawing |
| 20608 | CH-2208 | `THE_TEAM_CHAT_DOESNT_LOAD` | The team chat doesn't load |
| 20609 | CH-2209 | `EVENT_REPLIES_DONT_LOAD` | Event replies don't load |
| 20610 | CH-2210 | `THE_TEAMS_TIMEZONE_DOESNT_LOAD` | The team's timezone doesn't load |
| 20611 | CH-2211 | `THE_TEAMS_FORM_DOESNT_LOAD` | The team's form doesn't load (phone) |
| 20612 | CH-2212 | `THE_TEAMS_FORM_CRASHES_WHILE_DRAWING` | The team's form crashes while drawing (phone) |
| 20613 | CH-2213 | `UP_NEXT_CRASHES_WHILE_DRAWING` | Up next crashes while drawing (phone) |
| 20614 | CH-2214 | `TODAY_CRASHES_WHILE_DRAWING` | Today crashes while drawing (phone) |
| 20615 | CH-2215 | `A_PLAYERS_OWN_ROUNDS_DONT_LOAD` | A player's own rounds don't load (player Home) |
| 20616 | CH-2216 | `SCRAMBLING_AND_THREE_PUTTS_DONT_LOAD` | Scrambling and three-putts don't load (player Home) |
| 20617 | CH-2217 | `THE_PLAYERS_SCORING_OR_PARTS_OF_THE` | The player's scoring or parts of the game crash while drawing |
| 20618 | — | `UNKNOWN_TIMEZONE_READS_AS_EASTERN` | A stored team timezone that is not a real zone reads like a missing one: the date, greeting and week are read in Eastern time, the bad value is logged as clubhouse.home.timezone, and Home still opens instead of failing the page. |
| 20619 | CH-2218 | `UP_AND_DOWN_FIGURES_DONT_LOAD` | Up-and-down figures don't load (coach Home, the team's four parts) |
| 20620 | CH-2219 | `THE_TOURS_MARKS_DONT_LOAD` | The Tour's marks don't load (coach Home, the team's four parts) |
| 20621 | CH-2220 | `A_PART_OF_WAITING_ON_YOU_DOESNT` | A part of "Waiting on you" doesn't load (join requests, replies, tasks or posts) |
| 20622 | CH-2221 | `THE_TEAMS_FOUR_PARTS_CRASH_WHILE_DRAWING` | The team's four parts crash while drawing (coach Home, desktop and phone) |
| 20623 | CH-2070 | `SAVING_THE_TERM_DATES_FAILS` | Saving the term dates fails (class status, P-10) |
| 20624 | CH-2071 | `SAVING_A_TEAM_NO_CLASS_RANGE_FAILS` | Saving a team no-class range fails |
| 20625 | CH-2072 | `REMOVING_A_TEAM_NO_CLASS_RANGE_FAILS` | Removing a team no-class range fails |
| 20626 | CH-2270 | `THE_CLASS_DAY_DIDNT_LOAD_WHEN_THE` | The class day didn't load when the In class now sheet is open (the Home line is hidden while the read is in error) |

## 07 — Network / offline

Status: DEFINED

Home has no saves, so a slow save (10702) and a save refused offline (10703)
never fire here. What applies is the shell's: the offline banner (10701), and
Try again on a notice while offline, which says so and asks nothing (10704;
proved on Home's own notices by the 21402 test). Following a link while offline
is the browser's, not tested here.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 20701 | CH-2970 | `THE_SHEET_IS_OPEN_WHILE_OFFLINE` | The sheet is open while offline |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903,
10704 CH-1905, 10705 CH-1909, 10706 CH-1910.

## 08 — Permission / authorization

Status: DEFINED

Which Home a viewer gets (20801). `/golf/dashboard` is one address for both
roles. A signed-in coach with `golf_clubhouse_ui` on gets Coach Home, a
signed-in player with it on gets Player Home, and with the flag off each gets
the existing GolfHelm dashboard (the shell's gate, 10801; the per-role
navigation is 10802). A session holding both a coach and a player profile is
treated as a coach: the coach branch runs first, so that session never reaches
Player Home, even with the coach flag off. No session is sent to sign in, and a
session with neither profile to sign up.

Which team (20802). Neither Home takes a team from the address. The coach's team
is the active team the request resolves (`resolveCoachActiveTeamIdForRequest`;
by that module's own comment the active-team cookie is validated against the
coach's staff rows, else their staffed team, else the organisation's; read, not
tested). The player's is their own active membership
(`getActivePlayerTeamMembership`). Both loaders read through the signed-in
user's own client (`createClient` from `@/lib/supabase/server`), never the
service role, so row level security is the second gate; what those policies
return was read from the code and not checked against the database. Home calls
no server action, so nothing on it can write.

No team. A coach with no organisation or no active team gets "You aren't on a
team yet" (20407), and a player with no active membership gets the same title
with their own advice (20413); in both, nothing is read (20802). A player whose
membership read fails does not get that page: the read throws to the route error
view with its Try again (20802; the shell's 10603 to 10607), so an outage is
never told to a player as "you have no team". A failed coach team resolution was
not tested.

What a player sees of others. Player Home reads the player's own rounds only
(20803): rounds filtered to their player id, their own player row and the D1
benchmarks. It reads no roster, no teammate's rounds and no leaderboard, and the
strokes gained and the parts of the game are set against D1, never against
teammates. The team's week comes through the loader Coach Home uses, but a
player's copy is given no names (20804): an agenda row reads at most a count
("Green 2 · 2 players", "First tee 8:42 · 1 of 2 going"), and no teammate's name
or id is in what the page receives. Whether the policies on
`golf_event_attendance` would hand a player the other players' replies was not
checked; the screen never has a name to draw.

Controls (20806). Each role's Home draws its own role's controls only. A player
has no Message team, New event or N shortcut, no Plan, Add event or quick event
types, no leaderboard and no link to another player's stats or thread; a coach
has no Message coach, New round or countdown. New round and Add classes
are not drawn for a player until round entry and Classes are rebuilt (Q-69), so
a control never leads to a screen the player's Clubhouse does not have.

Message coach (20805). It opens Messages on `?user=<the coach's user id>`: the
coach who created the team (`golf_teams.created_by` is a `golf_coaches.id`, not
a user id, which the first version got wrong), else a coach of the organisation
who has an account (the query sets no order, so which one is not fixed), else
Messages plain. Messages then opens the thread only for someone in the team
directory, which is the program's coaches and the team's players: anyone else
gets "Couldn't open that conversation" (CH-7001, 70801, that page's contract).
Home and the directory read the organisation's coaches from the same table with
the same limit of 50, so the coach Home names is in the directory unless a
program has more than 50 coaches; that edge was not tested end to end.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 20801 | — | `ROLE_PICKS_THE_HOME` | /golf/dashboard hands a coach with the Clubhouse flag on Coach Home and a player with it on Player Home, and everyone else the existing GolfHelm dashboard; a session holding both profiles is treated as a coach, no session is sent to sign in, and a session with neither profile to sign up. |
| 20802 | — | `TEAM_COMES_FROM_THE_SESSION` | The team Home reads is the coach's active team or the player's own active membership, taken from the session and never from the address; with no team nothing is read and the no-team page shows (CH-2307, CH-2313), and a player membership read that fails is the error page with Try again, never the no-team page. |
| 20803 | — | `PLAYER_READS_ONLY_OWN_ROUNDS` | Player Home asks only for the signed-in player's own rounds (golf_rounds filtered to their player id) and their own player row, reads no roster or teammate's figures, and sets the player against D1 benchmarks, never against teammates. |
| 20804 | — | `PLAYER_WEEK_NAMES_NO_ONE` | A player's week never names another player: loadHomeWeek is given no names, so an event reads at most a count (Green 2 · 2 players, First tee 8:42 · 1 of 2 going), and no teammate's name or id is in what the page receives. |
| 20805 | — | `MESSAGE_COACH_FINDS_THE_TEAMS_COACH` | Message coach opens Messages on ?user=<the coach's user id>: the coach who created the team (golf_teams.created_by is a golf_coaches.id) if they have an account, else a coach of the organisation who has one (the query sets no order, so which one is not fixed), else plain Messages; Messages itself opens the thread only for someone in the team directory (CH-7001, 70801). |
| 20806 | — | `CONTROLS_STAY_WITH_THEIR_ROLE` | Home draws its own role's controls only: Player Home has no Message team, New event or N shortcut, no Plan, Add event or quick event types, no leaderboard and no link to another player's stats or thread, and Coach Home has no Message coach, New round or countdown. |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV,
10803 TEAM_SWITCH_IS_A_HEAD_COACHS, 10804 CH-1911.

## 09 — Success

Status: N/A — a save from the class sheets closes the sheet with the success

haptic and no toast (`useAction` with an empty `done`); Home has no other change
and no other success.

The shell's 10901 (a change made through `useAction`) is triggered from Home
only by those two sheets, and only their failures draw a toast (category 06).

## 10 — Warning

Status: N/A — Home makes no change that could land in part.

A section that loads in part is a failed read, told in category 06 (for example
20616, scrambling missing above the four parts of the game).

## 11 — Destructive

Status: DEFINED

Removing a team no-class range from the no-class days sheet asks first. Nothing
else on Home deletes, removes or discards anything.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 21101 | CH-2570 | `THE_COACH_REMOVES_A_TEAM_NO_CLASS` | The coach removes a team no-class range |

## 12 — State preservation

Status: N/A — Home holds nothing the person typed, apart from the open class

sheets' own fields, which start again each time a sheet opens.

The latest round's pager position and the Scoring window are view choices, kept
in the page's memory only: they are not stored, and they start again on each
visit.

## 13 — Optimistic UI

Status: N/A — Home makes no change, so nothing is shown before the server

confirms it.

## 14 — Retry / recovery

Status: DEFINED

Try again on a section that did not load asks the server for the whole page
again (`router.refresh`), not one section (21402). While the page re-renders the
notice reads Trying again and the button steps aside (21401, CH-2402; seen only
in the preview). Offline, Try again says so and asks nothing (10704, proved on
Home's notices). A section that crashed only draws itself again
(SectionBoundary) and does not ask the server (21402). A page that crashes shows
the route error view with its own Try again (11401).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 21401 | CH-2402 | `TRY_AGAIN_WAS_PRESSED_ON_A_SECTION` | Try again was pressed on a section |
| 21402 | — | `TRY_AGAIN_ASKS_THE_SERVER_AGAIN` | Try again on a section that did not load asks the server for the whole page again (router.refresh) and, offline, says so and asks nothing; a section that crashed only draws itself again and does not ask the server. |

From the shell (P001): 11401 ROUTE_TRY_AGAIN, 11402 TOAST_RETRY.

## 15 — Data freshness / sync

Status: N/A — apart from the coach's class line, Home has no cache, polling or

realtime to keep in step. The class line reads the team's class day through one
shared cache (`useTeamClassDay`): it refreshes on focus, every five minutes
while visible, at the class zone's midnight and when a no-class row changes, and
a payload older than 15 minutes is not claimed (tested in
`use-class-day.test.tsx`).

The page is `force-dynamic` and a new visit reads afresh (going back or forward
may show Next's client cache; not tested); Try again (21402) reads it again, and
the device clock keeps its own times moving (20301). A page left open past the
team's midnight reads itself again when the date turns (20301).

## 16 — Micro animation

Status: DEFINED

Home's own motion is two states, both seen in the preview only: paging the
latest round slides the card 12px out and the next in from that side, instantly
when motion is reduced (21601), and on desktop a leaderboard row takes the
Ledger tint on hover as its chevron slides in, and a deeper tint on press, never
a lift or a scale (21602). The player's countdown ticks in place (20301). The
shell's: the page crossfade, the press on keys, sheets and skeletons (11601 to
11613, D-64); there is no first-paint rise.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 21601 | CH-2601 | `PAGING_THE_LATEST_ROUND` | Paging the latest round |
| 21602 | CH-2602 | `HOVERING_OR_PRESSING_A_LEADERBOARD_ROW` | Hovering or pressing a leaderboard row |
| 21603 | CH-2670 | `THE_HOME_CLASS_LINE_CHANGES` | The Home class line changes (a minute tick, a refetch) |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603,
11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608,
11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612, 11613 CH-1613,
11614 CH-1614, 11615 CH-1615, 11616 CH-1616, 11617 CH-1617, 11618 CH-1618,
11619 CH-1619, 11620 CH-1620, 11621 CH-1621, 11622 CH-1622.

## 17 — Haptic

Status: DEFINED

Home's catalogued haptics: a selection tick when paging the latest round (21701)
and the light tap for New event, by button or by N (21702). The rest of Home's
taps (21703): a selection tick for opening a round's card, choosing a quick
event type and choosing the Scoring window; the light tap for Add event and, on
the phone, Message coach; nothing for Message team or the other links (only
primary buttons tap). Home makes no change, so none of its own controls fires
success or error; the one warning is the shell's, when Try again is pressed
offline (10704). The shell's grammar is 11701 to 11706.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 21701 | CH-2701 | `PAGING_THE_LATEST_ROUND_2` | Paging the latest round |
| 21702 | CH-2702 | `NEW_EVENT` | New event (button or the N key) |
| 21703 | — | `TAPS_FOLLOW_THE_GRAMMAR` | Home's taps follow the haptic grammar: a selection tick for paging the latest round, opening a round's card, choosing a quick event type and choosing the Scoring window, the light tap for New event (button or N), Add event and, on the phone, Message coach, and nothing for Message team; Home makes no change, so none of its own controls fires a success or error haptic. |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703,
11704 CH-1704, 11705 CH-1705, 11706 CH-1706, 11707 CH-1707, 11708 CH-1708,
11709 CH-1709.

## 18 — Accessibility

Status: DEFINED

Home's own (21801 to 21806): N opens a new event but never while typing or in a
dialog, each day of the week is read as words, the leaderboard and both nines
are tables, the round pager announces its position, the phone's scorecard
scrolls as a named, focusable region, and axe finds nothing in any preview state
at 1280 and 390 (`clubhouse:a11y`, not run for this pass). The player's
countdown is a timer named "Starts in 1 day, 18 hours and 2 minutes" whose
digits are hidden from a screen reader, so it is heard once and not every second
(21807). Known, not changed: a leaderboard row is a link with the role row, so
the table reads correctly (21803), which hides that it is a link from a screen
reader; not tried with one. The shell's skip link, landmarks and dialog
behaviour are 11801 to 11811.

CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809
CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812, 11813 CH-1813, 11814
CH-1814, 11815 CH-1815, 11816 CH-1820, 11817 CH-1821, 11818 CH-1822, 11819
CH-1830, 11820 CH-1831, 11821 CH-1832, 11822 CH-1840, 11823 CH-1841, 11824
CH-1842, 11825 CH-1816.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 21801 | CH-2801 | `N_OPENS_A_NEW_EVENT_FROM_ANYWHERE` | N opens a new event from anywhere on Home, but never while typing or inside a dialog |
| 21802 | CH-2802 | `EACH_DAY_IN_THE_WEEK_STRIP_IS` | Each day in the week strip is read as words ("Tuesday 14, 4 events", "competition, 1 event"); today is marked |
| 21803 | CH-2803 | `THE_LEADERBOARD_AND_BOTH_NINES_OF_THE` | The leaderboard and both nines of the scorecard are tables: every value sits in a cell under a column header |
| 21804 | CH-2804 | `THE_ROUND_PAGER_ANNOUNCES_2_OF_3` | The round pager announces "2 of 3"; each form line has a text equivalent ("last 7 rounds: 72, 71…") |
| 21805 | CH-2805 | `NO_AXE_VIOLATIONS_IN_ANY_PREVIEW_STATE` | No axe violations in any preview state, 1280px and 390px |
| 21806 | CH-2806 | `ON_A_PHONE_THE_SCORECARD_SCROLLS_SIDEWAYS` | On a phone the scorecard scrolls sideways; it is a named region that takes focus, so the arrow keys scroll it |
| 21807 | — | `COUNTDOWN_IS_A_NAMED_TIMER` | The player's countdown is a timer named for a screen reader as Starts in N days, N hours and N minutes (singular at one), and its digits, the ticking seconds included, are hidden from a screen reader, so it is heard once, not every second. |
| 21808 | CH-2870 | `THE_HOME_CLASS_LINE` | The Home class line |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803,
11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808,
11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812, 11813 CH-1813,
11814 CH-1814, 11815 CH-1815, 11816 CH-1820, 11817 CH-1821, 11818 CH-1822,
11819 CH-1830, 11820 CH-1831, 11821 CH-1832, 11822 CH-1840, 11823 CH-1841,
11824 CH-1842, 11825 CH-1816, 11826 CH-1817.

## 19 — Responsive layout

Status: DEFINED

At 820px and below both roles get the phone Home (21901, `useChPhone`); wider
canvases get the desktop Home. The phone is its own screen from the owner's v2
boards (`docs/clubhouse/phone/home.md` for the coach, `home-player.md` for the
player), never the desktop shrunk. The server renders the desktop markup and
`home.css` hides it at 820px and below until hydration swaps the phone Home in
(read from the code, not measured). On a narrow desktop canvas (a container
under 860px) the two panes stack. The shell's phone chrome is 11901.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 21901 | — | `PHONE_HOME` | At 820px and below both roles get the phone Home, never the desktop page shrunk: a hero with Up next, then for a coach Today, the team's scoring form, This week and Latest rounds, and for a player This week, Today, Your latest round, Scoring and the parts of the game; wider canvases get the desktop Home. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

N opens a new event from anywhere on Coach Home's desktop page, but never while
typing, inside a dialog or with a modifier (21801, CH-2801). Player Home, the
phone and the first-run page have no shortcut (20806). Everything else is a link
or a button reached by Tab; the phone's scorecard is a focusable region so the
arrow keys scroll it (21806).

## 21 — Performance

Status: DEFINED

Each Home is read on the server in one request before its first paint, and no
Home component fetches (read from the code: there is no client fetch under
`screens/home`). Coach Home reads the team's timezone, the roster, the team (its
tour), the team chat, the week and what is waiting on the coach (join requests,
this week's events that take replies, tasks) together; then the season's rounds,
the Tour's marks and the replies; then the hole-by-hole cards and the four
parts' round cache (three round trips, `home-reads.test.ts`). Player Home reads
the timezone, then the week, the player's rounds, their player row and their
team together, then the holes, the round cache, the D1 benchmarks and the coach
together. A failed read is logged and flagged on its own section and never
throws (22101, proved for both loaders). Layout shift, LCP and first-load JS
were not measured (the shell's web vitals are 12101).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 22101 | — | `LOADERS_NEVER_THROW` | Each Home is read on the server before its first paint, and a failed read is logged through chLogServer('home', {read}) and flagged on its own section instead of throwing, so one failed read never takes the page down. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page (12201 to 12203).
Home adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

A section that crashes is reported through `chReport` with surface
`home.<section>` (week, latestRound, leaderboard, upNext, today, form, game,
legs) at high severity; a failed server read is logged through
`chLogServer('home', <read>)` (reads: timezone, team chat, roster, events,
attendance, rounds, holes, roundCache, tourBenchmarks, player, team, coaches,
and the coach's queue parts `queue joinRequests`, `queue replies`, `queue
tasks`, `queue posts`); and the N shortcut, opening Up next on the phone and
opening a round on the phone leave `chTrail` breadcrumbs (22301). Not
instrumented: the pagers, the Scoring window, and Up next in the player's
desktop week.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 22301 | — | `FAILURES_REPORTED` | A section that crashes while drawing is reported through chReport with surface home.<section> (week, latestRound, leaderboard, upNext, today, form, game, legs) at high severity, a failed server read is logged through chLogServer('home', {read}), and the N shortcut and opening Up next or a round leave chTrail breadcrumbs (home new event (keyboard), home open next event, home open round). |

## 24 — CI / automated test

Status: DEFINED

`src/clubhouse/__tests__/home.test.tsx` and `player-home.test.tsx` name every
catalog code of kinds 0 to 5 that is not marked preview, and each hand contract
above (22401). The route is tested in `home.test.tsx` against the real dashboard
page, with only the session, the flag and the request-scoped team resolvers
faked.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 22401 | — | `TESTS_NAME_CONTRACTS` | src/clubhouse/__tests__/home.test.tsx and player-home.test.tsx name in a test title every Home catalog code of kinds 0 to 5 that is not marked preview, and each hand contract on this page. |

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above

already has its Bridge ID; the commands (open New event, message the coach, page
the latest round) are defined when the Bridge is.
