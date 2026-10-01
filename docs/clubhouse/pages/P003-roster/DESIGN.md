# P003 — Roster: design handoff

## Package

```text
Source:   the owner's Claude Design bundles, in design/handoff/ (VERSIONS.md)
Version:  v2 (2026-09-29): Coach - Roster.html, Coach - Roster - Mobile.html
          v1: Roster.html, roster.jsx, roster.css, roster-data.js, screenshots roster-01..05;
          mobile/Roster Mobile.html, m-roster.jsx (the approved phone spec)
Date:     2026-09-29
Status:   approved (the phone design is the approval, D-22; Q-30 to Q-39 answered as D-50 to D-59)
```

## Design objective

A calm team board on the depth vocabulary: each player is a face with the
numbers a coach reads first, the reasons to look at someone sit above the list,
and a single lit panel holds the one player being read. Nothing is decorative.

## Problems being solved

Rosters kept in a spreadsheet and a group chat: no one sees at a glance who has
gone quiet or slipped, join requests wait in an inbox, and a coach's private
notes live on paper.

## User goal

Open the team, see who needs attention, act on it, and let new players in,
without leaving one screen.

## Visual hierarchy

Header (team, season, count, team average), join requests, Needs a look, toolbar
(search, status, layout, sort), the players, the open player. On the phone: the
list with a join requests banner, then a pushed profile, with join requests and
actions as sheets.

## Components

### Reused Clubhouse primitives

`Avatar`, `Button`, `IconButton`, `Icon`, `FormLine`, `Menu`, `Modal` (a bottom
sheet on the phone), `PillGroup`, `Segmented`, `SearchField`, `EmptyState`
(section and page, D-71), `InlineNotice`, `SectionBoundary`, `Skeleton`,
`Toast`, `PhoneBar`, `PhoneIconAction`, `PhoneScreen`, `PhoneTop`, `useAction`,
`useChPhone`, `useChReducedMotion`.

### New Clubhouse components

`Roster` (the container), `RosterList` (cards or table), `RosterPeek` and
`CoachNote` (the desktop panel and the note), `RosterRequests` and
`useJoinRequests` (the join requests, shared with the phone), `InviteModal`,
`RosterPhone`, `RosterPhoneRow`, `RequestsBanner`, `RequestsSheet` and
`PlayerActions` (the phone list, banner and sheets), `RosterProfile` (the
phone's pushed profile), `RosterSkeleton`, `RosterNoTeam` (a coach's or a player's),
`useCopyText`. For a player: `TeamRoster` and `TeamRosterPhone` (the read-only
screen) with `team.ts` (its sort and its "You" line).

### Modified Clubhouse components

`FormLine` gained a bare option (no mean line, no fill) for the phone row's
small spark.

## Actions affected

The list is `config/clubhouse/pages/P003-roster.json` `actions`, and the graph
is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

The player panel slides in 16px and fades in 260ms, and switching players
cross-fades (CH-3601). Cards and rows lift on hover and shrink about 6px on
press, then spring back (CH-3602). Nothing counts up and nothing staggers except
the shell's first-paint reveal. On the phone the profile is pushed with the
shell's slide (CH-1610). All from the v2 tokens (D-64).

## Haptic intent

v2 grammar (D-70): selection for opening a player, changing a filter, layout or
sort; success when a removal, an approval, a note, an export or a copy lands;
warning as Remove player is pressed; error on failure. Every other tap is
silent.

## Desktop

Cards (the default) or a table, with the player panel beside them on a wide
canvas. Below a 1080px container the panel follows the cards instead of sitting
beside them, and below 640px the padding tightens (container queries in
`roster.css`). Esc closes the panel, except while typing a note.

## Phone

Approved spec `docs/clubhouse/phone/roster.md`: a top bar with the back link to
More and an Invite players action, a join requests banner that opens a sheet
(with Approve all and the team code), Avg, SG and Name sorts, active players
then Inactive, and a pushed profile with Message, Plan 1:1, figures, trend,
recent rounds, About and the coach's note. Its ⋯ opens View stats and Remove
from team. The phone is a different structure, never the desktop shrunk
(RosterPhone below 820px).

## The player's view

Owner, 2026-10-01: "the same thing as coach except they can't click". The same
header, search, layout toggle, sort control, face cards, table and phone rows,
drawn from the same stylesheet, with nothing to press. What differs, and why:

- A teammate shows name, class year and handicap: what Fairway's player roster
  showed, and no scores, because a player is set against the Tour and never
  against teammates (the Home contract, 20803). The coach's figures, form line,
  "Needs a look", hometown, high school and notes are not drawn or loaded.
- The header reads "Your team." and the count; there is no Invite, Export, join
  requests card or player panel, and the phone top bar has the back link and no
  action. Only active members are listed, so the Active and Inactive pills are
  gone; the sort is Name, Class or Handicap.
- A card is a list item and a row is a table row or a plain row, never a button
  or a link (they take no focus and no press, and `ch-rs-face--static` and
  `ch-rsm-row--static` drop the hover lift and the pointer). The player's own
  row reads "You".
- States: a failed read is "The roster didn't load." with Try again (CH-3210),
  never an empty team; an empty team and no team are CH-3307 and CH-3308.

## Accessibility

Cards and rows are buttons that name the player (a player's teammates are plain text, CH-3807), the table has real roles, the
status is a word as well as a dot, Esc closes the panel, the note counter is
polite, and the phone row reads name, class, note, average and handicap as one
button. Axe runs at 1280 and 390 (`clubhouse:a11y`).

## Data assumptions

Only data the app has. Not shown because no source exists: captain, major,
birthday, home course, an about line and availability (injured or away; the
migration is written and held). Invite by email has no action, so it is not
offered (D-54). The duplicate-player warning Fairway shows has not been rebuilt
(open, VERIFY.md).

Which rounds the roster counts (owner, 2026-09-30, Q-123). A round posted as a
total only (18 holes, no nines, no holes) counts in a player's rounds, average,
trend and form, and so in "Needs a look"; it has no strokes gained to count.

## Existing backend capabilities used

`getTeamJoinRequests`, `acceptJoinRequest` and `rejectJoinRequest` in
`src/app/golf/actions/teams.ts`, `removePlayerFromTeam` in `roster.ts`,
`setIntent` in `v3/intent.ts`, and the server loader `loadRoster` (the team,
members, this coach's notes, the season's rounds, focus areas and goals). A
player's view has its own loader, `loadPlayerRoster` (the team's name and
season and the active members' name, graduation year and handicap).
WIRING.md maps each.

## HELD requirements

### New features

None.

### New data/schema

Availability on `golf_team_members` (available, injured, away, with a note):
written, held, not applied (`docs/clubhouse/held/data/roster-availability.md`).
Until it is released the Active and Inactive pill is read-only and Inactive
means the member has lost team access.

### Owner decisions

Q-130 (2026-10-01: the player's roster, read-only), Q-1 (a separate availability field), D-50 to D-59 (the phone), D-56 (what stays
desktop only), D-58 (Inactive), D-66 (navigation), D-70 (haptics), D-71 (page
empty state).

## Explicit non-goals

Invite by email, an availability writer, captain and major, birthdays (minors'
data, never collected, D-51), pull to refresh, and Export, search, filters and
the layout toggle on the phone (D-56).

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the server actions and the join-request loader)
```
