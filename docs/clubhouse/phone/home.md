# Phone design: Home (coach)

Status: approved. The owner's v2 phone board is the spec (D-22): `design/handoff/Coach - Home - Mobile.html`, `m-home.jsx`, `m-home.css`, on the v2 shell (`m-shell.jsx`, `gh-nav.js`). It replaces the earlier draft in this file. Built 2026-09-30 as `src/clubhouse/screens/home/HomePhone.tsx` (the iPhone pass is open).

The boards: practice day, competition day, quiet day, no events, and a round's scorecard, then the loading and empty phones (`GHBoards`).

## Layout, top to bottom

| Board piece | Built as | Data |
| --- | --- | --- |
| Hero bar: team and the bell, on green | The shell's top bar in its hero variant (`usePhoneHero`): the team name in place of the title, the bell on green | `userData.teamName` |
| Date, greeting | `data.todayLabel`, `data.greeting` | the loader, in the team's timezone |
| Brief (sparkles line) | `data.subline` | the loader's program summary; absent when its read failed |
| Up next card: type, countdown, title, time and place, who is going | `UpNext` → Calendar at that event (`?date=&event=`) | `data.phone.next`: the first team event not over yet, today or later in the loaded window; replies from `golf_event_attendance` |
| No events (board 04): what the card holds, quick types, Add event | `NoEvents` (CH-2309) | quick types open the editor on that type (`?new=1&type=`) |
| Today: a timeline with past, now and clash marks | `Today` → each row opens its event | `data.phone.today`; a clash is two of today's timed events overlapping |
| Team scoring card: average, change, line, Rounds, GIR, Putts | `Form` | `data.phone.form` (`teamForm`): the last ten 18-hole rounds against the ten before; the line is a five-round moving average; Rounds counts this week's rounds |
| This week strip, competition days dark, the next competition's note | `WeekStrip` → Calendar's day view | `data.week.days`, `data.phone.weekNote` |
| Latest rounds → a round's sheet: figures, Out and In, Message, recap | `Rounds`, `RoundSheet` | `data.latestRounds` |

## Differences from the board (Q-66)

- **No leaderboard on the phone.** The board has none; desktop keeps it.
- **"Needs you" rail.** `m-home.jsx` defines it but `HomeM` never draws it, so it isn't built.
- **Team chevron.** The board's team button has a chevron (a team switcher). A coach has one team in Clubhouse, so the team is a label, not a dead control.
- **Workout chip.** There is no workout event type; the fourth quick type is Meeting.
- **Round recap.** No single-round review is rebuilt; the sheet's primary is Player stats.
- **"First tee 8:42" for competitions.** The card shows the event's own time range for every type.

## States

- Loading: the Home skeleton (CH-2401).
- A failed read shows its notice in place: the week (CH-2201, in the hero), rounds (CH-2202), team scoring (CH-2211). Never an empty state.
- Each section crashes on its own (CH-2212 to CH-2214, CH-2205, CH-2206).
- First run (no players, events or rounds): the v2 page empty state, on desktop and phone (CH-2308).
- No team: CH-2307.

## Gestures and haptics

Selection when a round's sheet opens; a light tap on Add event; nothing else. The sheet drags shut (the shell's CH-1611). Reduced motion turns off the press and reveal.
