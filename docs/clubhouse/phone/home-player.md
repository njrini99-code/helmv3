# Phone design: Home (player)

Status: approved. The owner's v2 boards are the spec (D-22): desktop `design/handoff/Player - Home.html` (`player-home.jsx`, `player-home.css`), phone `design/handoff/Player - Home - Mobile.html` (`m-player-home.jsx`, `m-player-home.css`). Built 2026-09-30 as `src/clubhouse/screens/home/PlayerHome.tsx` (desktop, the switch, first run, no team) and `PlayerHomePhone.tsx`, from `loadPlayerHome` (`src/clubhouse/data/player-home.ts`). The iPhone pass is open.

## What it reads

The player's own rounds only (a player is compared against D1, never against teammates, as on Stats). The week is the team's calendar through the loader Coach Home uses (`loadHomeWeek`), without who else is invited. The coach for Message coach is the team's creator when they coach in its organisation, otherwise the organisation's first coach.

## Layout

| Board piece | Built as |
| --- | --- |
| Date, "Good afternoon, Theo.", the brief | `homeClock` in the team's timezone; the brief is one sentence from the player's rounds (`briefFor`): the last three rounds' average, then the leg gaining most, or the one costing most |
| Message coach | Messages `?user=<coach>` opens (or starts) the direct thread (CH-7001 when that person isn't on the team) |
| Post a round | Drawn once round entry is rebuilt for players (`rebuiltHref`); until then it isn't drawn rather than leading nowhere (Q-69) |
| This week, Up next with a countdown, Today | Desktop: the shared `Week` with Up next between the days and the agenda. Phone: the week strip and its note, then Today's timeline (no Plan on an empty day: a player can't add team events). The countdown ticks days, hours, minutes and seconds; a screen reader hears it once |
| My latest round (1 of 3) | Desktop: the shared `LatestRound` in its player mode (a flag, the course as the title). Phone: the card inline with a pager, Out and In, GIR, putts and strokes gained |
| Open recap | No single-round recap is rebuilt; the button is My stats, which holds every round |
| Scoring, Last 5 / 10 / 20 | The scores against par (hatched below it) and the player's own mean, the best round pinned on desktop; four figures (average against the previous window, strokes gained a round, handicap, rounds under par) and a sentence (`scoringNote`) |
| By part of the game | Off the tee (fairways), Approach (greens), Short game (scrambling), Putting (putts a round): the value over the last ten rounds, strokes gained, a seven-round spark, one line from the same rounds, and a D1 mark where `golf_pga_standards` has one |

## Differences from the board (Q-69)

- **Post a round**, **Start a round** and **Add classes** wait for round entry and Classes to be rebuilt.
- **D1 marks**: the benchmark table has greens in regulation only among these four stats, so Approach alone draws the D1 mark; the others show no mark rather than an invented one.
- **"The best on the team"** in the brief would compare the player with teammates; it's left out.
- **"Week 7 of 12"** has no source (no season calendar in the data) and isn't shown.
- **Leg notes** are counts from the same rounds ("101 of 142 fairways in the last 10 rounds") rather than the board's shot-level lines (driver carry, proximity), which need shot data Home doesn't read.
- **Open recap** is My stats until a round recap exists.

## States

The week (CH-2201), rounds (CH-2202, CH-2215), hole-by-hole (CH-2203), scrambling (CH-2216). Empty: today (CH-2301), no rounds (CH-2302), a total-only round (CH-2303), nothing ahead (CH-2309, the player's wording), too few rounds for the line (CH-2310), nothing to break down (CH-2311), a new player (CH-2312), no team (CH-2313). Crashes stay in their section (CH-2205, CH-2206, CH-2213, CH-2214, CH-2217).

## Gestures and haptics

A selection tick on the window and the round pager, press on the hero's two actions. The hero turns the top bar green (`usePhoneHero`).
