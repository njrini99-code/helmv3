# P011 — Rounds

One page for a player's rounds: the library (the round in progress, the season's scoring and every posted
round), a round's review for the player and the coach of their team, a new round's setup, and the shot
screen. The library and the review are routed today. Setup and the shot screen are built and previewed but
not routed: they sit behind a neutral contract until the engine moves (see "What is live" below).

## Identity

```text
Page ID:            P011
Page Name:          Rounds
Route:              /golf/dashboard/rounds (the library, player)
                    /golf/dashboard/rounds/[id] (a round's review, player and coach of the player's team)
                    not routed yet: /golf/dashboard/rounds/new (setup, then the shot screen) and
                    /golf/dashboard/rounds/continue/[id]
Bridge Namespace:   11 (Bridge IDs 11ccii, D-68; catalog codes CH-11xxx)
Roles:              player (library, setup, shot screen); player and coach (review)
Implementation Root: src/clubhouse/screens/rounds (setup/ and track/ inside it)
Manifest:           config/clubhouse/pages/P011-rounds.json
```

## What is live, and what is preview only

Everything below is Clubhouse, behind the `golf_clubhouse_ui` flag (`isClubhouseFor`), which stays off in
production.

| Surface | Address | Who | State today | Code | Preview |
| --- | --- | --- | --- | --- | --- |
| Library | `/golf/dashboard/rounds` | player (a coach keeps the Fairway page) | **routed** through `ClubhouseRoundsRoute` | `RoundsLibrary`, `parts`, `writes`, `RoundsSkeleton` | `/clubhouse-preview/rounds` |
| Review | `/golf/dashboard/rounds/[id]` | the player who played it, a coach of their team | **routed** through `ClubhouseRoundReviewRoute` | `RoundReview`, `ReviewLoadFailed` | `/clubhouse-preview/round` |
| Setup | will be `/golf/dashboard/rounds/new` | player | **preview only**: no route renders it; it draws against `ChSetupPorts` (list courses, list tees, a tee's holes, start) that the round screen supplies once the engine moves | `setup/` (`RoundSetup`, `CoursePicker`, `AddCourseSheet`, `HoleConfig`, `shape`) | `/clubhouse-preview/setup` |
| Shot screen | will be the tracking phase of `/rounds/new` and `/rounds/continue/[id]` | player | **preview only**: built on `useShotTracking` and `shot-entry-rules`, the Fairway screen's own logic moved unchanged; the round's sheets (Exit, Scorecard, Round complete, Submitting) are driven by props and played by `PreviewTracking` | `track/` (`RoundTracking`, `ShotEntry`, `HoleReview`, `sheets`, `round-sheets`, `parts`, `labels`) | `/clubhouse-preview/track` |

The plan and its order are in `docs/clubhouse/ROUNDS_PLAN.md` (steps 3 and 4: the renderer first, the engine
move last, one engine per commit). Until step 4, `/rounds/new` and `/rounds/continue/[id]` are not in the
shell's rebuilt list, so a player with the flag on sees the shell's not-rebuilt notice there, never the legacy
entry. The library therefore draws no New round, Start a round or Continue control, and Home's and
CoachHelm's "post a round" links stay hidden for the same reason (`nav.rebuiltHref`). A player with the flag
on can review and discard rounds but cannot start or continue one until the engine move lands. `/rounds/recover`
and `/rounds/[id]/review` (CoachHelm's AI review) are not part of this page and stay as they are.

## Purpose

### Primary user

A college golfer who plays and tracks rounds for a coach who reads them: the player opens Rounds to see what
is in progress and how the season is going, tracks a round shot by shot, and looks back at one. A coach of
their team reads the same review of a player's round.

### Job to be done

Player: start a round in two taps, record every shot without thinking about the app, post it, and see the
season add up. Coach: open a player's round and see the card, the figures and the shots.

### Primary action

Library: Start a round (or Continue at hole N when one is in progress), once round entry is rebuilt. Until
then the library's one live action is Discard. Review: read; the hole picker is the interaction. Setup: Start
round. Shot screen: Next shot (Hole out on the last putt).

### Secondary actions

Library: discard an unfinished round (asks first), search by course, group by month or by course, open a
round's review. Review: pick a hole or step through them, go back to Rounds (or, for a coach, to that
player's rounds on Stats). Setup: browse the course library, add a course by hand, play an open qualifier,
edit a hole's par and yardage for this round, choose Front 9 or Back 9. Shot screen: undo, add a penalty,
change or delete a recorded shot, go to another hole, open the scorecard, exit (save for later, keep playing,
discard), submit the round.

### Information hierarchy

1. Library: the round in progress beside the season's scoring (average, best, putts, greens, then the ribbon
   of every round against par).
2. The book: every posted round by month or by course, each with its card figures.
3. Review: the hero (score and to par), the five figures, the scorecard, then the picked hole's shots.

### User should notice first

The round waiting to be continued or submitted. In a review, the score and the hole where the round went over.

### User should never have to think about

Whether a round was saved (the shot screen says "Saving round" and "Round saved" and retries on its own), whether
a number is a real figure (a missing one is "—", never zero), or whether the library and the review agree with
Home and Stats (one total, one season rule).

### Success looks like

A player finishes nine holes, leaves for class with "Save for later", and finds the round waiting in the
library; after posting, the season card and the ribbon include it, and the coach can open its review.

## Semantic features

Canonical IDs from `memory/registry.yml`:

```text
- golf_round_lifecycle (memory/features/golf-round-lifecycle.md)
```

## Design authority

```text
Package:          design/handoff/ (v2; VERSIONS.md)
Desktop reference: design/handoff/Player - Rounds.html, rounds-flow.jsx, rounds-course.jsx,
                  rounds-track.jsx, rounds-review.jsx, rounds-flow.css, rounds-track.css, rounds-data.js
Phone spec:       docs/clubhouse/phone/rounds.md (approved), from
                  design/handoff/Player - Rounds - Mobile.html
Status:           approved
```

## Related pages

### Enters from

The player's sidebar (My game › Rounds) and the phone tab bar's Rounds tab (D-66). A round's review from the
library's rows and from the Stats player page's Rounds list (for a player and for a coach, through `rebuiltHref`
with the viewer's role); the review's Back goes to Rounds, or for a coach to that player's rounds on Stats (D-53).

### Exits to

A round's review (from the library), Rounds (from a review), Stats (from a coach's review), and once they are
rebuilt `/rounds/new` and `/rounds/continue/[id]` (the library's New round, Start a round and Continue, Home's
and CoachHelm's post-a-round links). A round still being played that is opened at `/rounds/[id]` goes to
`/rounds/continue/[id]`, as on the legacy page.

## Ownership

```text
Design:          the owner (Claude Design)
Implementation:  src/clubhouse/screens/rounds, on the actions the legacy library and round entry already use
                 (one write path per behaviour); the shot screen's logic is src/hooks/golf/use-shot-tracking.ts
                 and src/lib/golf/shot-entry-rules.ts, shared with the Fairway screen
Data:            golf_round_lifecycle: golf_rounds, golf_holes, golf_shots, golf_course_tees, golf_team_members
                 (a coach's access), golf_players (a coach's view of the name); setup's course library reads
                 through actions/course-library.ts, supplied as ports
```

## Current status

```text
Design:         approved
Implementation: in_progress (library and review routed; setup and shot screen built, preview only; gates in
                PROGRESS.md; the engine move is open)
Contract:       complete (CONTRACT.md: all 25 categories answered; all 44 hand contracts are reserved until the tests
                name their Bridge IDs; 32 name a covering test and 12 have none, VERIFY.md)
Bridge:         reserved (IDs recorded; nothing is sent until the Bridge is wired, D-68)
Data:           existing (no held plan; the design's coach notes and the recap's Focus and Keep have no source
                a player can see yet, Q-72f)
Verification:   partial (VERIFY.md)
Docs:           current
```
