# Handoff versions

Which files in `design/handoff/` are the current design, and which are kept
only because older records cite them.

## v2: the full coach and player design (received 2026-09-29)

The owner's Claude Design bundle `Coach home dashboard redesign (2).zip`
(`design_handoff_golfhelm_fairway/`, 325 files) was copied in unchanged, with
one exception (below). **It is the current design.** Start at `Index.html`.
`README.md` is its README.

| Screen | Role | Desktop board | Phone board | In Clubhouse today |
| --- | --- | --- | --- | --- |
| Home | coach | `Coach - Home.html` | `Coach - Home - Mobile.html` | desktop built; phone new |
| Calendar | coach | `Coach - Calendar.html` | `Coach - Calendar - Mobile.html` | desktop built; phone new |
| Messages | coach | `Coach - Messages.html` | `Coach - Messages - Mobile.html` | desktop and phone built |
| Roster | coach | `Coach - Roster.html` | `Coach - Roster - Mobile.html` | desktop and phone built |
| Stats | coach | `Coach - Stats.html` | `Coach - Stats - Mobile.html` | desktop built; phone new |
| Qualifiers | coach | `Coach - Qualifiers.html` | `Coach - Qualifiers - Mobile.html` | desktop built; phone spec approved, not built |
| CoachHelm | coach | `Coach - CoachHelm.html` | `Coach and Player - CoachHelm - Mobile.html` | new |
| Team Hub | coach | `Coach - Team Hub.html` | `Coach and Player - Team Hub - Mobile.html` | new |
| Home | player | `Player - Home.html` | `Player - Home - Mobile.html` | new |
| CoachHelm | player | `Player - CoachHelm.html` | `Coach and Player - CoachHelm - Mobile.html` | new |
| Team Hub | player | `Player - Team Hub.html` | `Coach and Player - Team Hub - Mobile.html` | new |
| Rounds (list, course picker, add a course, setup and scorecard, shot tracking, hole complete, review) | player | `Player - Rounds.html` | `Player - Rounds - Mobile.html` | new |
| Classes | player | `Player - Classes.html` | `Player - Classes - Mobile.html` | new |

Shared by every v2 board: `gh-nav.js` (the sidebar and tab bar for each role),
`gh-states.jsx` and `gh-polish.css` (loading and empty states, motion),
`gh-core.js` (press, haptics), `depth.css`, `sidebar.css`, `_ds/`.

What changed in files that already existed:

- `roster.jsx`, `stats.jsx`: links renamed to the new board names only.
- `m-shell.jsx`: the tab bar reads its tabs from `gh-nav.js` for each role.
- `m-msg.jsx`, `m-roster.jsx`: "Delete conversation" is now "Delete chat".
- `design-system/tokens/colors.css`: **not taken.** The bundle's copy lacks
  `--green-25` and `--champagne-100`, which the repo added for Qualifiers
  (75e9d5084). The repo copy stays.

## v1: the first five screens, and the approved phone designs

Kept because the specs, checklists, catalogs and PROGRESS cite them. Where v1
and v2 disagree, v2 wins unless a logged decision says otherwise.

- `README-v1.md` (the v1 README).
- `Coach Home v3.html`, `Calendar.html`, `Messages.html`, `Roster.html`,
  `Stats.html`, `Qualifiers.html`: the same screens as the v2 `Coach - …`
  boards, without the v2 shell and state layer.
- `screenshots/` files named `home-*`, `calendar-*`, `messages-*`,
  `roster-*`, `stats-*`: the per-state captures. v2 sends one capture per
  board (`screenshots/coach-*`, `player-*`).
- `mobile/`: the phone designs behind the approved phone specs for Messages,
  Roster and Qualifiers. The v2 phone boards now sit at the top level of this
  folder.
