# Phone design: Stats (player profile, and the player's own stats)

Status: approved. The owner's v2 phone board is the spec (D-22): `design/handoff/Coach - Stats - Mobile.html` (board "Player · approach"), `m-stats.jsx` `Player`, `m.css`. It replaces the earlier draft in this file. Built 2026-09-30 as `src/clubhouse/screens/stats/StatsPlayerPhone.tsx`, inside the desktop `StatsPlayer` (the loader, window change, Add focus area sheet and catalog are shared). The iPhone pass is open.

## Layout

| Board piece | Built as |
| --- | --- |
| Top bar "Player stats", ‹ Team, Share | Coach: the same, Team goes back to Team stats in the same window; Share opens the iOS share sheet with the page's link, or copies it (CH-5002 when blocked). Player: "My stats", ‹ More (My stats opens from More), no Share |
| Avatar, name, "year · rounds · hcp" | `.ch-spm-head`; a coach also gets a Message button to the player's thread |
| Scoring avg, SG / round, Trend | Three figures: the window's average (a coach sees the team's under it), strokes gained a round against D1, and form (newer rounds against older, lower is better, green or amber) |
| Section chips: Scoring, Off the tee, Approach, Short game, Putting | Game detail in its phone mode: the chips switch one section at a time, each with its sentence, four figures and the desktop's panels stacked (proximity by distance, greens by lie, make rate, and the rest) |
| Scoring trend | `ScoreLine` over the last ten rounds |

Below the board, from the desktop's other tabs, because a phone has no tabs for them: **Rounds** (five, then All N; Roster's "All N" link opens the list in full and scrolls to it) and **Development** (focus areas and goals; a coach adds a focus area here, the page's one primary action).

## Differences from the board (Q-68)

- **Trend figure**: the board prints a phrase ("Down 1.2"); the phone prints the signed change, coloured, labelled "Newer rounds".
- **Coach comparison table** (desktop Overview's "Jonah vs. team") isn't on the phone; the three figures and the team average under Scoring avg carry the headline.
- **Previous / next player** isn't on the phone; back to Team and choose the next row.
- **Rounds and Development** are added under the board's content (above).

## States

Early read (CH-5305). Rounds didn't load (CH-5201), shot detail (CH-5202), development (CH-5203). No shot-by-shot rounds (CH-5301), no rounds (CH-5302), no focus areas (CH-5303), no goals (CH-5304). Each section crashes on its own (CH-5204 to CH-5207). Share blocked (CH-5002).

## Gestures and haptics

A selection tick on a section chip or window change (the current one is silent), press on Share, success when the link is copied, error when it can't be. The focus-area sheet is the shared Modal as a bottom sheet.
