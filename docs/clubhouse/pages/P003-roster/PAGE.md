# P003 — Roster

The team list: who is on the team, how each player is scoring, who needs a look, and who is waiting to join.

## Identity

```text
Page ID:            P003
Page Name:          Roster
Route:              /golf/dashboard/roster (coach only)
Bridge Namespace:   3 (Bridge IDs 3ccii, D-68; catalog codes CH-3xxx)
Roles:              coach
Implementation Root: src/clubhouse/screens/roster
Manifest:           config/clubhouse/pages/P003-roster.json
```

## Purpose

### Primary user

A college golf coach with a roster of about a dozen players, who opens Roster to see how the team is doing and to let the right players in.

### Job to be done

Know at a glance who is on the team, who is scoring well or slipping, and who has asked to join; then open one player, write a note, and act.

### Primary action

Invite players (the page's one primary button). Reading comes first: opening a player to see their form.

### Secondary actions

Approve or decline a join request, and on the phone Approve all. Open a player and read their figures, form and recent rounds. Write a private note about a player. Search, filter by status, sort and switch between cards and a list (desktop). Export the roster as a CSV (desktop). Message a player, view their stats, plan a one-to-one (phone). Remove a player from the team. Copy the team code or share the join link.

### Information hierarchy

1. The players: a card or row each, with average, strokes gained, handicap, and a form line.
2. Why a player needs a look: the Needs a look chips (no round in 9 or more days while the team is posting, scoring up 1.5 or more, or the last four rounds all under the season average). They are worked out from the rounds and can be checked against them.
3. Who is waiting: the join requests, above the list on desktop and as a banner on the phone.
4. The open player: figures, form, recent rounds, development counts (desktop), the coach's note.

### User should notice first

Any join request waiting, and any player flagged in Needs a look.

### User should never have to think about

Whether Inactive means injured (it does not: it means the member has lost team access, D-58); whether removing a player deletes their account or stats (it does not; they can rejoin with the team code); whether a note they wrote was saved (a toast says so, and a failure keeps the text in the field).

### Success looks like

A coach opens Roster on Monday, sees three players flagged, opens one, writes a note, and approves two requests in under a minute, and every failure along the way said exactly what did not happen.

## Semantic features

Canonical IDs from `memory/registry.yml`:

```text
- roster_team (memory/features/roster-team.md)
```

## Design authority

```text
Package:          design/handoff/ (v2; VERSIONS.md). v1 files kept where records cite them.
Desktop reference: design/handoff/Coach - Roster.html, roster.jsx, roster.css (v1: Roster.html,
                  screenshots roster-01..05)
Phone spec:       docs/clubhouse/phone/roster.md (approved), from
                  design/handoff/mobile/Roster Mobile.html and Coach - Roster - Mobile.html
Status:           approved
```

## Related pages

### Enters from

The sidebar (Team › Roster, with the join requests count) and the More sheet on the phone (D-50, D-66), Home's Full roster link, and the bell's join-request notification (its address carries `?tab=requests`, which Roster ignores: the requests are the first thing under the header).

### Exits to

Stats for a player (`stats?player=<id>`; from the phone profile's All N, `&window=season&tab=rounds`, D-53), Messages (desktop: the inbox; phone: `messages?player=<id>`, which opens or starts the direct thread), Calendar's editor with the player invited (phone Plan 1:1, `calendar?new=1&with=<id>`, D-52), and Settings › Team when the team has no join code.

`/golf/dashboard/roster/[id]` (the Fairway player page) is not part of this page: inside the Clubhouse frame it shows the not-rebuilt notice.

## Ownership

```text
Design:          the owner (Claude Design)
Implementation:  src/clubhouse/screens/roster, src/clubhouse/routes/roster.tsx, src/clubhouse/data/roster.ts
Data:            roster_team: golf_team_members, golf_players, golf_teams, golf_team_join_requests,
                 golf_rounds (season), golf_player_focus_areas, golf_goals, golf_coach_player_intent
                 (the coach's notes)
```

## Current status

```text
Design:         approved
Implementation: in_progress (desktop and phone built; gates in PROGRESS.md)
Contract:       complete (CONTRACT.md: all 25 categories answered)
Bridge:         reserved (IDs recorded; nothing is sent until the Bridge is wired, D-68)
Data:           existing, plus one held plan (held/data/roster-availability.md)
Verification:   partial (VERIFY.md)
Docs:           current
```
