# Home catalog (2xxx)

Route `/golf/dashboard` (coach and player) · code `src/clubhouse/screens/home/`, loaders
`src/clubhouse/data/home.ts` (coach) and `src/clubhouse/data/player-home.ts` (player) · tests
`src/clubhouse/__tests__/home.test.tsx` and `player-home.test.tsx` · preview
`/clubhouse-preview/home` (`?state=empty|failed|loading|error`) and `/clubhouse-preview/home-player`
(`?state=empty|noevents|failed|loading`).

Home only reads. It has no saves, so no error toasts (20xx), validation (21xx)
or confirmations (25xx). Offline, slow and full-page errors are the shell's
(1xxx). Each section fails on its own: the rest of Home keeps working.

## 22xx Didn't load (inline notice with Try again; a failed read is never shown as empty)

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2201 | The week's events don't load | "This week's schedule didn't load." + "Your events are safe. This is a display problem, and trying again usually clears it." Try again re-renders the page | `Week`, `RefreshNotice`; logged `clubhouse.home.events` | home.test › CH-2201 |
| CH-2202 | Season rounds (or the roster behind them) don't load | "Recent rounds didn't load." + "Posted rounds are safe…" Try again | `LatestRound`; logged `clubhouse.home.roster` or `…rounds` | home.test › CH-2202 |
| CH-2203 | A round loads but its hole-by-hole scores don't | The total stays; the card reads "Hole-by-hole scores didn't load for this round. The total above is correct." | `LatestRound` (`holesError`); logged `clubhouse.home.holes` | home.test › CH-2203 |
| CH-2204 | Season rounds don't load (the leaderboard's source) | "The leaderboard didn't load." + "Scores are safe…" Try again | `Leaderboard` | home.test › CH-2204 |
| CH-2205 | The week section crashes while drawing | "This week couldn't be shown." + "The rest of the page is fine. This has been reported automatically." Try again | `SectionBoundary home.week`, reported high | home.test › CH-2205 |
| CH-2206 | The latest round crashes while drawing | "The latest round couldn't be shown." … | `SectionBoundary home.latestRound` | home.test › CH-2206 |
| CH-2207 | The leaderboard crashes while drawing | "The leaderboard couldn't be shown." … | `SectionBoundary home.leaderboard` | home.test › CH-2207 |
| CH-2208 | The team chat doesn't load | Nothing looks broken: Message team opens Messages instead of the team chat | `loadCoachHome` → `teamChatId: null`; logged `clubhouse.home.team chat` | home.test › CH-2208 |
| CH-2209 | Event replies don't load | Agenda rows keep their place and drop who is invited and "5 of 6 confirmed", never "0 players" | `loadCoachHome`; logged `clubhouse.home.attendance` | home.test › CH-2209 |
| CH-2210 | The team's timezone doesn't load | The date, greeting and week are read in Eastern time (the product default) | `loadCoachHome`; logged `clubhouse.home.timezone` | home.test › CH-2210 |
| CH-2211 | The team's form doesn't load (phone) | "Team scoring didn't load." + "Posted rounds are safe. Try again; the error has been reported." in place of the form card | `HomePhone`, `RefreshNotice` | home.test › CH-2211 |
| CH-2212 | The team's form crashes while drawing (phone) | "Team scoring couldn't be shown." The rest of Home stays | `SectionBoundary home.form` | home.test › CH-2212 |
| CH-2213 | Up next crashes while drawing (phone) | "Up next couldn't be shown." inside the hero; the greeting stays | `SectionBoundary home.upNext` | home.test › CH-2213 |
| CH-2214 | Today crashes while drawing (phone) | "Today couldn't be shown." | `SectionBoundary home.today` | home.test › CH-2214 |
| CH-2215 | A player's own rounds don't load (player Home) | "Your rounds didn't load." + "Posted rounds are safe. Try again; the error has been reported." in Scoring's place; no brief, no parts of the game, never an empty line | `PlayerGame` Scoring, `RefreshNotice` | player-home.test › CH-2215 |
| CH-2216 | Scrambling and three-putts don't load (player Home) | "Some of your figures didn't load." + "Scores, greens and putts are right; scrambling is missing." above the four parts, which stay (when none of the four has a value to show, the notice is the whole answer: "Nothing to break down yet" is not said over a read that failed) | `PlayerGame` Legs | player-home.test › CH-2216 |
| CH-2217 | The player's scoring or parts of the game crash while drawing | "Your scoring couldn't be shown." The rest of Home stays | `SectionBoundary home.game` | player-home.test › CH-2217 |

## 23xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2301 | Nothing is on the calendar today | "Nothing on the calendar today." (later this week still lists below) | `Week` | home.test › CH-2301 |
| CH-2302 | No rounds this season | "No rounds posted yet this season." + "The newest 18-hole round appears here as soon as a player posts it." | `LatestRound` | home.test › CH-2302 |
| CH-2303 | The newest round was posted as a total | The total, with "Posted as a total. Hole-by-hole scores weren't recorded for this round." where the card would be | `LatestRound` | home.test › CH-2303 |
| CH-2304 | No players on the roster | "No players on the roster yet." + "Share your team's join code from Roster, and players appear here once you approve them." | `Leaderboard` | home.test › CH-2304 |
| CH-2305 | Players, but no 18-hole rounds | "No 18-hole rounds this season yet." + "6 players are on the roster. The leaderboard fills in as rounds are posted." | `Leaderboard` | home.test › CH-2305 |
| CH-2306 | A player has fewer than three rounds | "Early read" in the SG column, with "Strokes gained appears after three rounds" on hover | `Leaderboard` | home.test › CH-2306 |
| CH-2307 | A coach with no active team | The page empty state (v2 medallion): "You aren't on a team yet" + what Home shows once they are | `CoachHomeNoTeam` | home.test › CH-2307 |
| CH-2308 | A team with nothing yet: no players, no events this week, no rounds, and every read answered | The v2 page empty state (gh-states.jsx `EMPTY.home.coach`, D-71): "Your season starts here" + "Add your players and your first event…" Invite players (Roster) and Add an event (Calendar's editor); the header's actions step aside | `HomeFirstRun` in `CoachHome` | home.test › CH-2308 |
| CH-2309 | Nothing on the calendar ahead (phone). A player: "Your coach's practices and events will show here with a countdown.", no quick adds | Up next reads "No events scheduled" + what the card will hold, with Practice, Qualifier, Tournament and Meeting (each opens the editor on that type, `?new=1&type=`) and Add event. The week strip steps aside | `NoEvents` in `HomePhone` | home.test › CH-2309 |
| CH-2310 | Fewer than two 18-hole rounds (player Home Scoring) | "One round so far." or "No rounds posted yet this season." + "Your scoring line starts with your second 18-hole round." | `PlayerGame` Scoring | player-home.test › CH-2310 |
| CH-2311 | No fairways, greens, scrambling or putts logged (player Home) | "Nothing to break down yet." + "Fairways, greens, scrambling and putts fill in from rounds posted with those stats." | `PlayerGame` Legs | player-home.test › CH-2311 |
| CH-2312 | A new player: no rounds, nothing on the calendar, every read answered (v2 first-run, D-71) | Page empty state "Welcome to the team" + "Post your first round to start your stats. Team updates and your schedule show up here too." Start a round and Add classes appear once round entry and Classes are rebuilt (Q-69) | `PlayerHome` `PlayerFirstRun` | player-home.test › CH-2312 |
| CH-2313 | A player on no active team | "You aren't on a team yet" + "Ask your coach for your team's code or an invite. Once you join, Home shows your week, your rounds and your stats." | `PlayerHomeNoTeam` | player-home.test › CH-2313 |

## 24xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2401 | Home is loading | A skeleton in Home's own shape (header, two panes, five leaderboard rows), so nothing shifts when data lands | `HomeSkeleton`, `aria-busy` | home.test › CH-2401 |
| CH-2402 | Try again was pressed on a section | The notice title reads "Trying again" and the button steps aside until the page re-renders | `RefreshNotice` (`useTransition`) | preview |

## 26xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-2601 | Paging the latest round | The round slides 12px out and the next slides in from that side (260ms); a fade only when motion is reduced | `chSwap`, `AnimatePresence popLayout` | preview |
| CH-2602 | Hovering or pressing a leaderboard row | The row lifts onto a raised surface (180ms) and shrinks about 6px (110ms) and springs back (280ms) | `.ch-h-lb__row.is-link` | preview |

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
| CH-2803 | The leaderboard and both nines of the scorecard are tables: every value sits in a cell under a column header | `role="table|row|cell|columnheader|rowheader"` | home.test › CH-2803 |
| CH-2804 | The round pager announces "2 of 3"; each form line has a text equivalent ("last 7 rounds: 72, 71…") | `aria-live="polite"`, `FormLine label` | home.test › CH-2701 |
| CH-2805 | No axe violations in any preview state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
| CH-2806 | On a phone the scorecard scrolls sideways; it is a named region that takes focus, so the arrow keys scroll it | `ScrollRegion` (named, focusable) | a11y scan |
