# Retired handoff files

This folder holds the owner's September prototypes. Most of it is still the
reference for the page it draws. The files listed here are **not**: the owner
has replaced what they show. They stay in the folder only because other docs
and tests cite their paths. Do not build from them, do not screenshot them as
"the design", and do not restyle a built screen to match them.

## The rule

- Where `design-refresh/<page>/` exists, it replaces `design/handoff/` for that
  page.
- A handoff file is never a reason to rebuild a screen that is already built.
  If a built screen and a handoff file disagree, the built screen is current
  until the owner says otherwise.
- Before changing a built screen toward any design file, ask the owner with a
  labelled picture first: role (coach or player), phone or desktop, light or
  dark, before or after.
- The list of what is current, page by page, is in `src/clubhouse/AGENTS.md`
  ("Current and retired pages").

## Roster: retired 11 Nov 2026

The "Your players." Roster page in this folder is not the Roster. Shown it on
11 Nov 2026, the owner said: "That looks like fairway".

Retired files:

| File | What it is |
| --- | --- |
| `roster.jsx` | The "Your players." Roster prototype |
| `roster.css` | Its styles |
| `Roster.html` | The v1 board |
| `Coach - Roster.html` | The v2 coach desktop board |
| `Coach - Roster - Mobile.html` | The v2 coach phone board |
| `m-roster.jsx` | The phone prototype |
| `mobile/m-roster.jsx` | The v1 phone prototype |
| `screenshots/roster-01-requests-attention.jpg` | Still of the retired page |
| `screenshots/roster-02-filters.jpg` | Still of the retired page |
| `screenshots/roster-03-cards.jpg` | Still of the retired page |
| `screenshots/roster-04-player-peek.jpg` | Still of the retired page |
| `screenshots/roster-05-list-view.jpg` | Still of the retired page |
| `screenshots/coach-roster.jpg` | Still of the retired page |
| `screenshots/coach-roster-mobile.jpg` | Still of the retired page |

What is current instead: the Roster as built in
`src/clubhouse/screens/roster`.

- Coach desktop: opens on the cards (commit `9e6db115f3`).
- Phone: per `design-refresh/classes-roster-home`, approved by the owner on
  31 Oct 2026.
