# Home catalog (2xxx)

<!-- clubhouse:release-audit:start -->
## Catalog audit — 2026-10-06

Coach/player Home, latest-round expansion, round sheet and partial-data cards.
Check loading-to-content geometry, long names, team-timezone day labels and
latest-round expansion under reduced motion.

See [current all-page evidence](../ALL_PAGE_AUDIT.md#p002-home). Existing
checklist ticks and catalog identifiers retain their recorded scope. Automated
browser checks do not replace physical keyboard, gesture or
assistive-technology acceptance.
<!-- clubhouse:release-audit:end -->

Route `/golf/dashboard` (coach and player) · code `src/clubhouse/screens/home/`,
loaders `src/clubhouse/data/home.ts` (coach) and
`src/clubhouse/data/player-home.ts` (player) · tests
`src/clubhouse/__tests__/home.test.tsx` and `player-home.test.tsx` · preview
`/clubhouse-preview/home` (`?state=empty|failed|loading|error`) and
`/clubhouse-preview/home-player` (`?state=empty|noevents|failed|loading`).

Home only reads. It has no saves, so no error toasts (20xx), validation (21xx)
or confirmations (25xx). Offline, slow and full-page errors are the shell's
(1xxx). Each section fails on its own: the rest of Home keeps working.

Player Up next: all-day events show the event date and All day, without a
countdown to midnight. Timed events keep the four-part countdown, with space
reserved before the browser clock is known. All-day dates and ongoing multi-day
events follow Calendar's date-span rules. Owner decision: Safari review,
2026-10-01.

## 20xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2070 | Saving the term dates fails (class status, P-10) | A toast "Couldn’t save the term dates" + "Nothing was changed." with Try again. The sheet stays open with what was typed | `TermSheet` via `useAction` | class-awareness.test › CH-2070 |
| CH-2071 | Saving a team no-class range fails | A toast "Couldn’t save the break" + "Nothing was changed." with Try again | `TeamBreakSheet` via `useAction` | class-awareness.test › CH-2071 |
| CH-2072 | Removing a team no-class range fails | A toast "Couldn’t remove the break" + "It is still on the list." with Try again | `TeamBreakSheet` via `useAction` | class-awareness.test › CH-2072 |

## 21xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2170 | The last day of classes is not after the first | "Last day of classes must be after classes start." under the form; Save keeps the dates | `validateTerm` (`term-form.ts`) | class-awareness.test › CH-2170 |
| CH-2171 | A term shorter than 4 weeks or longer than about 6 months | "A term is 4 weeks to about 6 months." | `validateTerm` | class-awareness.test › CH-2171 |
| CH-2172 | Exams end more than 3 weeks after the last class | "Exams end within 3 weeks of the last class." | `validateTerm` | class-awareness.test › CH-2172 |
| CH-2173 | Exams end before the last day of classes | "Exams end on or after the last day of classes." | `validateTerm` | class-awareness.test › CH-2173 |
| CH-2174 | The term overlaps another of the team's terms | "This overlaps Spring 2027 (Jan 12 to May 1)." The database refuses the same overlap (`23P01`) | `validateTerm` | class-awareness.test › CH-2174 |
| CH-2175 | The term has no name | "Name the term." | `validateTerm` | class-awareness.test › CH-2175 |
| CH-2176 | A no-class range ends before it starts | "The last day must be on or after the first." | `validateBreak` | class-awareness.test › CH-2176 |
| CH-2177 | A no-class range is longer than 21 days | "A break is at most 21 days." | `validateBreak` | class-awareness.test › CH-2177 |

## 22xx Didn't load (inline notice with Try again; a failed read is never shown as empty)

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2201 | The week's events don't load | "This week’s schedule didn’t load" + "Your events are safe. This is a display problem, and trying again usually clears it." Try again re-renders the page. On the phone it sits on the sheet under the greeting, never inside the green Up next card (whose ivory inks hid its words). With a second part failing, the page's notice (CH-1209) carries the one Try again and this keeps only its title (covered) | `Week`, `RefreshNotice`; logged `clubhouse.home.events` | home.test › CH-2201 |
| CH-2202 | Season rounds (or the roster behind them) don't load | "Recent rounds didn’t load" + "Posted rounds are safe…" Try again. With a second part failing, the page's notice (CH-1209) carries the one Try again and this keeps only its title (covered) | `LatestRound`; logged `clubhouse.home.roster` or `…rounds` | home.test › CH-2202 |
| CH-2203 | A round loads but its hole-by-hole scores don't | The total stays; the card reads "Hole-by-hole scores didn’t load for this round. The total above is correct." | `LatestRound` (`holesError`); logged `clubhouse.home.holes` | home.test › CH-2203 |
| CH-2204 | Season rounds don't load (the leaderboard's source) | "The leaderboard didn’t load" + "Scores are safe…" Try again. With a second part failing, the page's notice (CH-1209) carries the one Try again and this keeps only its title (covered) | `Leaderboard` | home.test › CH-2204 |
| CH-2205 | The week section crashes while drawing | "This week couldn’t be shown." + "The rest of the page is fine. This has been reported automatically." Try again | `SectionBoundary home.week`, reported high | home.test › CH-2205 |
| CH-2206 | The latest round crashes while drawing | "The latest round couldn’t be shown." … | `SectionBoundary home.latestRound` | home.test › CH-2206 |
| CH-2207 | The leaderboard crashes while drawing | "The leaderboard couldn’t be shown." … | `SectionBoundary home.leaderboard` | home.test › CH-2207 |
| CH-2208 | The team chat doesn't load | Nothing looks broken: Message team opens Messages instead of the team chat | `loadCoachHome` → `teamChatId: null`; logged `clubhouse.home.team chat` | home.test › CH-2208 |
| CH-2209 | Event replies don't load | Agenda rows keep their place and drop who is invited and "5 of 6 going", never "0 players" | `loadCoachHome`; logged `clubhouse.home.attendance` | home.test › CH-2209 |
| CH-2210 | The team's timezone doesn't load | The date, greeting and week are read in Eastern time (the product default) | `loadCoachHome`; logged `clubhouse.home.timezone` | home.test › CH-2210 |
| CH-2211 | The team's form doesn't load (phone) | "Team scoring didn’t load" + "Posted rounds are safe. Try again; the error has been reported." in place of the form card. With a second part failing, the page's notice (CH-1209) carries the one Try again and this keeps only its title (covered) | `HomePhone`, `RefreshNotice` | home.test › CH-2211 |
| CH-2212 | The team's form crashes while drawing (phone) | "Team scoring couldn’t be shown." The rest of Home stays | `SectionBoundary home.form` | home.test › CH-2212 |
| CH-2213 | Up next crashes while drawing (phone) | "Up next couldn’t be shown." inside the hero; the greeting stays | `SectionBoundary home.upNext` | home.test › CH-2213 |
| CH-2214 | Today crashes while drawing (phone) | "Today couldn’t be shown." | `SectionBoundary home.today` | home.test › CH-2214 |
| CH-2215 | A player's own rounds don't load (player Home) | "Your rounds didn’t load" + "Posted rounds are safe. Try again; the error has been reported." in Scoring's place; no brief, no parts of the game, never an empty line. The latest round fails with it (one read), so the page's notice (CH-1209) names both sections, "your latest round and your scoring", and each keeps only its title | `PlayerGame` Scoring, `RefreshNotice` | player-home.test › CH-2215 |
| CH-2216 | Scrambling and three-putts don't load (player Home) | "Some of your figures didn’t load" + "Scores, greens and putts are right; scrambling is missing." above the four parts (covered under CH-1209 when another part fails too), which stay (when none of the four has a value to show, the notice is the whole answer: "Nothing to break down yet" is not said over a read that failed) | `PlayerGame` Legs | player-home.test › CH-2216 |
| CH-2217 | The player's scoring or parts of the game crash while drawing | "Your scoring couldn’t be shown." The rest of Home stays | `SectionBoundary home.game` | player-home.test › CH-2217 |
| CH-2218 | Up-and-down figures don't load (coach Home, the team's four parts) | "Up-and-down figures didn’t load" + "Strokes gained is right." above the four parts; Around green's Up and down reads "—" and strokes gained stays. With a second part failing, the page's notice (CH-1209) names "up-and-down figures" and this keeps only its title (covered) | `TeamLegs`, `TeamLegsPhone` (`legs.cacheError`); logged `clubhouse.home.roundCache` | home.test › CH-2218 |
| CH-2219 | The Tour's marks don't load (coach Home, the team's four parts) | "Tour marks didn’t load" + "Strokes gained and the changes are right." above the four parts; each stat stands without its "· Tour 66%" mark, strokes gained and the changes stay. Covered under CH-1209 ("Tour marks") as CH-2218. An unknown tour (the team's row didn't load) has no marks and no notice | `TeamLegs`, `TeamLegsPhone` (`legs.tourError`); logged `clubhouse.home.tourBenchmarks` | home.test › CH-2219 |
| CH-2220 | A part of "Waiting on you" doesn't load (join requests, replies, tasks or posts) | That part is left out (never shown as 0) and the row ends "· some items didn’t load" (on the phone, where the parts are capsules, the note follows them without the dot); with every part failing, the row is that line alone. With a second part failing, the page's notice (CH-1209) names "what’s waiting on you" and the row drops the line (covered) | `CoachQueue` (a null part of `queue`); logged `clubhouse.home.queue <part>` | home.test › CH-2220 |
| CH-2221 | The team's four parts crash while drawing (coach Home, desktop and phone) | "The team’s game couldn’t be shown." The rest of Home stays | `SectionBoundary home.legs` | home.test › CH-2221 |
| CH-2270 | The class day didn't load when the In class now sheet is open (the Home line is hidden while the read is in error) | "Class status didn’t load." + Try again, in the sheet | `InClassSheet` | class-awareness.test › CH-2270 |

## 23xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2301 | Nothing is on the calendar today | "Nothing on the calendar today." (later this week still lists below) | `Week` | home.test › CH-2301 |
| CH-2302 | No rounds this season | "No rounds posted yet this season." + "The newest 18-hole round appears here as soon as a player posts it." On the coach's desktop Home with players on the roster, the leaderboard's CH-2305 says it instead and this pane is not drawn (the week takes the sheet) | `LatestRound` | home.test › CH-2302 |
| CH-2303 | The newest round was posted as a total | The total, with "Posted as a total. Hole-by-hole scores weren’t recorded for this round." where the card would be | `LatestRound` | home.test › CH-2303 |
| CH-2304 | No players on the roster | "No players on the roster yet." + "Share your team code from Roster; players appear here as they join." + Invite players (Roster's invite sheet, `roster?invite=1`). A safety net: a team with no players and no rounds gets the first run (CH-2308) | `Leaderboard` | home.test › CH-2304 |
| CH-2305 | Players, but no 18-hole rounds | "No 18-hole rounds posted yet this season." + "6 players are on the roster. The leaderboard fills in as rounds are posted." With no round at all, the one line that says so on desktop (the latest round's pane steps aside) | `Leaderboard` | home.test › CH-2305 |
| CH-2306 | A player has fewer than three rounds | "Early read" in the SG column, with "Strokes gained appears after three rounds" on hover | `Leaderboard` | home.test › CH-2306 |
| CH-2307 | A coach with no active team | The page empty state (v2 medallion): "You aren’t on a team yet" + what Home shows once they are + Open team settings (Team) | `CoachHomeNoTeam` | home.test › CH-2307 |
| CH-2308 | A team with nobody on it yet: no players, no rounds, and every read answered (events or not: it rests on the people, not the calendar) | The v2 page empty state (gh-states.jsx `EMPTY.home.coach`, D-71): "Your season starts here" + "Add your players and your first event…" ("Add your players." once there is an event) Invite players (Roster's invite sheet) and New event (Calendar's editor); the header's actions step aside. With events this week, the week sits above it (desktop: the week pane; phone: the week strip). It opens under the loaded page's framed head on desktop (the date and the greeting where the loaded Home sets them) and under the Ledger's page intro on the phone (states audit, 2026-10-08) | `HomeFirstRun` in `CoachHome` | home.test › CH-2308 |
| CH-2309 | Nothing on the calendar ahead (phone). A player: "Your coach’s practices and events will show here with a countdown.", no quick adds | Up next reads "No events scheduled" + what the card will hold, with Practice, Qualifier, Tournament and Meeting (each opens the editor on that type, `?new=1&type=`) and Add event. The week strip steps aside | `NoEvents` in `HomePhone` | home.test › CH-2309 |
| CH-2310 | Fewer than two 18-hole rounds (player Home Scoring) | "One round so far." or "No rounds posted yet this season." + "Your scoring line starts with your second 18-hole round." | `PlayerGame` Scoring | player-home.test › CH-2310 |
| CH-2311 | No fairways, greens, scrambling or putts logged (player Home) | "Nothing to break down yet." + "Fairways, greens, scrambling and putts fill in from rounds posted with those stats." | `PlayerGame` Legs | player-home.test › CH-2311 |
| CH-2312 | A new player: no rounds, every read answered (v2 first-run, D-71) | Nothing on the calendar: the page empty state "Welcome to the team" + "Post your first round to start your stats. Team updates and your schedule show up here too." New round and Add classes appear once round entry and Classes are rebuilt (Q-69). Under the loaded page's framed head on desktop and the Ledger's page intro on the phone, as CH-2308. With the team's events: the loaded page keeps its head (New round), Up next and the week, and the same title + "Post your first round to start your stats. Your latest round, scoring line and game fill in here." with Add classes only stands in for Your latest round, Scoring and Your game | `PlayerHome` `PlayerFirstRun`, `NoRoundsYet` | player-home.test › CH-2312 |
| CH-2313 | A player on no active team | "You aren’t on a team yet" + "Ask your coach for your team’s code or an invite. Once you join, Home shows your week, your rounds and your stats." + Open team settings (Golf profile, where joining lives, CH-8302) | `PlayerHomeNoTeam` | player-home.test › CH-2313 |
| CH-2314 | No round in the team's last 10 has hole scores (coach Home, the team's four parts) | "No hole-by-hole rounds in the last 10 yet." + "The four parts fill in once players post rounds with hole scores." in place of the ledger, under its head | `TeamLegs`, `TeamLegsPhone` (`legs.holeRounds === 0`) | home.test › CH-2314 |
| CH-2315 | Rounds with hole scores, but no player with 3 of them (coach Home, the team's four parts) | The parts and their figures stay; Gains most and Loses most read "—", and under the ledger "No player has 3 rounds with hole scores yet, so no one is ranked." | `TeamLegs`, `TeamLegsPhone` (`legs.ranked === false`) | home.test › CH-2315 |
| CH-2370 | Nobody on the team has a class today (the sheet is open) | Title "No classes today", sub "9 players · Class names show to coaches only.", the strip hidden, "No one has a class today."; Travelling and No class status still list | `InClassSheet` | class-awareness.test › CH-2370 |

## 24xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2401 | Home is loading | A skeleton in Home's own shape (header, two panes, five leaderboard rows), so nothing shifts when data lands. On the phone the hero is the reader's own, from the shell's role: the coach's brief as three lines over the coach's Up next card, the player's Up next with its countdown under the greeting and the two keys under it; the card, the keys and the first section land within half a pixel of their bars (WebKit 390, 2026-10-08) | `HomeSkeleton`, `aria-busy` | home.test › CH-2401 |
| CH-2402 | Try again was pressed on a section | The notice title reads "Trying again…" and the button steps aside until the page re-renders | `RefreshNotice` (`useTransition`) | preview |
| CH-2470 | The sheet opens before the class day has arrived | Nothing for 300 ms, then a small spinner and "Loading class status" | `InClassSheet` | class-awareness.test › CH-2470 |

## 25xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2570 | The coach removes a team no-class range | "Remove this break?" + the range + "Class status counts those days again." Keep it / Remove break. Players’ own "No class today" marks are not touched | `TeamBreakSheet` | class-awareness.test › CH-2570 |

## 26xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2601 | Paging the latest round | The round slides 12px out and the next slides in from that side (260ms); instant when motion is reduced | `chSwap`, `AnimatePresence popLayout` | preview |
| CH-2602 | Hovering or pressing a leaderboard row | On desktop the row takes the Ledger row tint (180ms) as its chevron slides in from the left (260ms); a press deepens the tint and nudges the chevron 2px on (110ms), easing back over 180ms. No lift and no scale (the shell's CH-1606) | `.ch-h-lb__row.is-link`, `--ch-ledger-row-press` | preview |
| CH-2670 | The Home class line changes (a minute tick, a refetch) | The two lines crossfade in place on `--ch-dur-quick`; instant with reduced motion; first paint never animates. No digit rolls | `Swap` in `ClassHomeLine` | preview |

## 27xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-2701 | Paging the latest round | A selection tick | `IconButton feel="select"` | home.test › CH-2701 |
| CH-2702 | New event (button or the N key) | A light tap | `Button` primary, `HomeActions` | home.test › CH-2702 |

## 28xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-2801 | N opens a new event from anywhere on Home, but never while typing or inside a dialog | `HomeActions` key handler | home.test › CH-2801 |
| CH-2802 | Each day in the week strip is read as words ("Tuesday 14, 4 events", "competition, 1 event"); today is marked | `ch-sr-only` + `aria-current="date"`; the dots are hidden | home.test › CH-2802 |
| CH-2803 | The leaderboard and both nines of the scorecard are tables: every value sits in a cell under a column header | `role="table\|row\|cell\|columnheader\|rowheader"` | home.test › CH-2803 |
| CH-2804 | The round pager announces "2 of 3"; each form line has a text equivalent ("last 7 rounds: 72, 71…") | `aria-live="polite"`, `FormLine label` | home.test › CH-2701 |
| CH-2805 | No axe violations in any preview state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
| CH-2806 | On a phone the scorecard scrolls sideways; it is a named region that takes focus, so the arrow keys scroll it | `ScrollRegion` (named, focusable) | a11y scan |
| CH-2870 | The Home class line | One button named by the whole line ("4 of 9 in class now. Everyone out of class from 2:15 PM. Opens class status"); the book glyph is decoration; Enter opens the sheet, Escape closes it and returns focus to the line, Up and Down move between rows |`ClassHomeLine`, `InClassSheet`; class-awareness.test › CH-2870|

## 29xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2970 | The sheet is open while offline | The last class day, with a line "Updated 9:42 AM" under the sub; nothing is refetched until the connection returns | `InClassSheet` | class-awareness.test › CH-2970 |
