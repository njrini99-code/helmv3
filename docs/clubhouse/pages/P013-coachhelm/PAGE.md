# P013 — CoachHelm

One page where CoachHelm's read of the rounds a team posts reaches the people who act on it: a player
sees the one thing to work on this week, with the evidence behind it, and a coach sees the program
pulse and each player's top signal, and can turn it into a focus for that player or dismiss it.

## Identity

```text
Page ID:            P013
Page Name:          CoachHelm
Route:              /golf/dashboard/coachhelm (coach and player); ?view=development|profile|standing show the
                    shell's "not rebuilt yet" page (CH-1301), ?view=insights and no view draw the board; ?player=<id> opens a coach's board on that player (Roster's View insights)
Bridge Namespace:   13 (Bridge IDs 13ccii, D-68; catalog codes CH-13xxx)
Roles:              coach, player
Implementation Root: src/clubhouse/screens/coachhelm
Manifest:           config/clubhouse/pages/P013-coachhelm.json
```

## Purpose

### Primary user

A player checking what CoachHelm found in their rounds and what to practise; a college golf coach scanning
the team for who needs attention and what to prescribe.

### Job to be done

Player: know the one thing to work on this week and why it is believed. Coach: see which players have a
signal worth acting on, and act on it in a tap.

### Primary action

Player: read the focus (the page has no write). Coach: Assign as focus.

### Secondary actions

Player: open another insight into the focus card, open Why we think this. Coach: choose another player,
Dismiss an insight and Undo it, open Roster, and open CoachHelm settings. Both: try a failed section again.

### Information hierarchy

1. Player: the focus, an insight with its claim, evidence, this week's drill and its reasoning. Coach: the
   program pulse, then the players most pressing first with the chosen player's focus beside them.
2. Player: Also worth knowing (the other findings), then Working (the strengths). Coach: the count of players
   with no insight yet.
3. The header: the role, "CoachHelm", and for a coach how many open signals there are across how many
   players.

### User should notice first

For a player, the claim in the focus card and its priority word. For a coach, who is first in By player
and what the pulse flags.

### User should never have to think about

Whether a number was made up (every one is the generator's own), whether an empty page means "nothing" or
"it did not load" (a failed read says so), whether a control is theirs to press (a player is never drawn a
coach's), or whether Retry does the whole job (it does).

### Success looks like

A player opens the page, reads one focus and knows what to practise; a coach assigns the top signal to
the player it belongs to and dismisses the ones that do not matter, without leaving the page.

## Semantic features

Canonical IDs from `memory/registry.yml`:

```text
- coachhelm_ai (memory/features/coachhelm-ai.md)
- player_coachhelm_development (memory/features/player-coachhelm-development.md)
- coach_intelligence_triage (memory/features/coach-intelligence-triage.md)
```

## Design authority

```text
Package:          design/handoff/ (v2; VERSIONS.md)
Desktop reference: design/handoff/Coach - CoachHelm.html, Player - CoachHelm.html, helm3.jsx, helm3.css,
                  coachhelm2.css
Phone spec:       docs/clubhouse/phone/coachhelm.md (approved), from
                  design/handoff/Coach and Player - CoachHelm - Mobile.html
Status:           approved
```

## Related pages

### Enters from

The sidebar (coach and player) and the phone tab bar (CoachHelm is one of each role's four tabs, D-66).

### Exits to

Roster, from Open roster and View roster (a coach), and CoachHelm settings, from Open CoachHelm settings
(`/golf/dashboard/settings/coaching-intelligence`); Rounds, from Open Rounds or Start a round (a player). A
control whose target is not rebuilt is not drawn (`rebuiltHref`), so no control leads nowhere. The shell's
"not rebuilt yet" page (Back to Home) is where `?view=development`, `profile` and `standing` go.

## Ownership

```text
Design:          the owner (Claude Design)
Implementation:  src/clubhouse/screens/coachhelm, on the delivery actions and the server actions the
                 Fairway Brief already uses (one write path per behaviour)
Data:            coachhelm_ai, player_coachhelm_development, coach_intelligence_triage:
                 golf_coach_insights (and the player's feedback on them), golf_drills, golf_player_focus_areas,
                 golf_team_members and golf_players, golf_rounds (a count, only for a first-run player), the
                 CoachHelm gate, and the coach's program pulse
```

## Current status

```text
Design:         approved
Implementation: in_progress (desktop and phone built; gates in PROGRESS.md)
Contract:       complete (CONTRACT.md: all 25 categories answered)
Bridge:         reserved (IDs recorded; nothing is sent until the Bridge is wired, D-68)
Data:           existing (no held plan; nothing is written that the Fairway Brief does not already write)
Verification:   partial (VERIFY.md)
Docs:           current
```
