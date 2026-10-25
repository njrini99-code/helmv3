# Design: Live rounds (coach phone, and the player's cards)

Status: draft. There is no owner board; this maps build plan P-6 (handoff
4.34.6) to the phone. It is the draft the Clubhouse
rule asks for before a phone screen is built, and the owner has not approved it.

## The phone

- **Home.** "Live now · 4 on the course" is the first section under the green
  hero: a card (radius `--ch-radius-card`,
  `--ch-elevation-reading`), a 44 px head with the static dot, the title and a
chevron to the live view, up to four
  compact lanes (48 px: initials, name and where they are, the last six marks,
to-par, thru), and "See all 7" when there
  are more. No card at all when nobody is out. A lane opens a sheet; a long
press (450 ms) opens Message, Open round and
  Open qualifier.
- **The live view** (`/golf/dashboard/live`), a pushed screen. The top bar has
  Back to Home, the title and the feed chip.
  A filter (only the types that have lanes), a sort menu (To par, Thru, Name,
Tee time; kept on the device), then
  groups in cards: On the course, Finished today, Not heard from. A lane is two
lines: name and to-par, then the marks
  and thru. The page edge is `--ch-page-x-phone`.
- **A player's sheet** (radius 20): the figure (to-par at 40 px), thru and the
  next hole, "where they are" as two rows of
  nine, the scorecard as two real tables (one 11-column grid each: a row label,
nine holes, Out or In), Moments,
  How to read this, and Message (prefilled, never sent).

## Board to data

| Piece | Read | Write |
| --- | --- | --- |
| The lane's marks, to-par, thru | `golf_round_live.holes` / v0: `golf_holes` merged with the `draft_data.holes` plan | none |
| Where they are | `golf_rounds.current_hole` (a hole number) and the first unscored hole in play order | none |
| Freshness | `heard_at` (the round's last save) and the newest score's time | none |
| Names | `golf_player_profiles` | none |

## Differences from the plan

- The stylesheet is `src/clubhouse/styles/live.css`, not
  `src/clubhouse/live/live.css`, so the style guards see it.
- The course ribbon is a small component of this page (`CourseRibbon`); the
  tournament feature's own ribbon is not in this
  tree yet. Replace it when that lands.
- The freshness column of the wide lane is the sub line (it carries the same
  words).
