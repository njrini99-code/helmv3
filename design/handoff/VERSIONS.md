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
- Trailing whitespace was stripped from nine v2 files on 2026-09-30 (the push hook's
  `git diff --check`); nothing else in them changed.
- `design-system/tokens/colors.css`: **not taken.** The bundle's copy lacks
  `--green-25` and `--champagne-100`, which the repo added for Qualifiers
  (75e9d5084). The repo copy stays.

## Recruiting: the owner-approved boards (approved 2026-09-30, Q-87)

Thirteen boards from the owner's Claude Design canvas "Clubhouse Recruiting"
(https://claude.ai/artifact/BuCcHSQ3ps3zJxcsmraTza), copied in unchanged into
`recruiting/` (the `.dc.html` boards and `canvas.json`). They are the current
design for the coach's Recruiting page; there is no v2 board for it.

| Board | What it shows |
| --- | --- |
| `Main.dc.html` | Desktop: the pipeline timeline, the prospect table and one open prospect's panel |
| `AddProspect.dc.html` | Desktop: the add dialog over the page |
| `Empty.dc.html` | Desktop: first run |
| `NoMatch.dc.html` | Desktop: a search and stage that match nothing, and a new prospect with no contact, notes or documents |
| `LoadFailed.dc.html` | Desktop: the prospects did not load |
| `PhoneList.dc.html`, `PhoneDetail.dc.html` | Phone: the list with the compact timeline, and a prospect with Stage, Email and Call tiles |
| `PhoneEdit.dc.html`, `PhoneStage.dc.html` | Phone: the edit sheet (Cancel, Save, Delete) and the stage picker that saves on pick |
| `PhoneEmpty.dc.html`, `PhoneNoMatch.dc.html`, `PhoneSparse.dc.html`, `PhoneFailed.dc.html` | Phone: first run, no match, a new prospect with nothing yet, did not load |

Not on any board, built from Clubhouse parts and listed as questions for the
owner in `docs/clubhouse/pages/P014-recruiting/DESIGN.md`: the upload dialog
(title and category), removing a document, the no-team page, and a stage that
has no prospects. Copy that said "him" or "his" for a prospect is written
"them" and "their", because the page cannot know a prospect's pronouns.

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
