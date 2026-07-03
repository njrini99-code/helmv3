# Next Level Feature Systems

These are the feature systems that would make BaseballHelm feel meaningfully better than the original plan. Each system is market-backed and scoped for a one-shot Phase 1 foundation plus future depth.

## 1. Baseball Program Command Graph

Market inspiration:

- Teamworks OS framing
- Smartabase/AMS unified athlete context
- 6-4-3 integrated baseball data

What it is:

A source-linked operating graph connecting players, events, practices, games, lifts, wellness, class conflicts, travel, imports, notes, tasks, and AI insights.

Phase 1 build:

- Source reference model
- Player timeline events
- Import provenance
- AI insight source refs
- Related-object links on Command Center and Player Profile

UI:

- "Why am I seeing this?" source drawer on every AI card/status flag
- Player profile timeline grouped by Game, Practice, Performance, Academics, Travel, Staff Notes
- Command Center "Signals" list with source badges

Acceptance:

- Every major card can point to source objects.
- A coach can trace an AI flag to imported rows/events/notes.
- Player-visible view hides restricted source objects.

## 2. Signal Inbox

Market inspiration:

- Teamworks task/news/notifications
- TeamBuildr questionnaire threshold warnings
- CoachMePlus/AMS dashboards

What it is:

A prioritized staff inbox for operational signals, not generic notifications.

Signals:

- unacknowledged travel/event
- limited/unavailable player
- import warning
- duplicate stat conflict
- practice not published
- lift non-compliance
- class conflict
- AI recommendation needing review
- postPostgame Action Review not completed

Phase 1 build:

- derive signals from existing objects
- status: new, snoozed, assigned, resolved, dismissed
- owner role
- source refs

UI:

- Command Center card
- filter by player, role, urgency, source
- action buttons: assign task, add note, adjust practice, dismiss

Acceptance:

- Signal has action, source, owner, and disposition.
- Signals are not just text summaries.

## 3. Player Development Timeline 2.0

Market inspiration:

- TRAQ development hub
- Rapsodo/TrackMan session history
- Teamworks profiles

What it is:

A player story that combines official game performance, practice observations, development metrics, lift/wellness, goals, and staff meeting outcomes.

Phase 1 build:

- timeline event table/read model
- filters by source/type/visibility
- player-safe vs staff-only rendering
- "meeting packet" generation

Enhancements:

- development goal objects with status
- "evidence" attached to goals
- coach reviewed/imported/shared markers

Acceptance:

- A coach can prep a 10-minute player meeting from one screen.
- A player can see the parts meant for them without private staff context.

## 4. Practice Intelligence Board

Market inspiration:

- TRAQ goals/workout planning
- 6-4-3 analytics reports
- Teamworks calendar/scheduling

What it is:

A practice planning layer that turns recent team/player signals into a practical baseball practice.

Inputs:

- recent game stats
- coach notes
- player development goals
- availability/limitations
- lift fatigue/compliance
- upcoming opponent/schedule
- class conflicts

Phase 1 build:

- Practice Planner Lite
- suggested focus card with source refs
- player groups/stations
- staff owners
- attendance and recap

Future depth:

- drill library
- practice templates by season phase
- opponent scouting tie-in

Acceptance:

- A coach can convert a signal into a practice block.
- Published practice creates player-visible schedule/groups.
- Recap writes timeline events and meeting topics.

## 5. Postgame Action Review

Market inspiration:

- Presto/GameChanger official stats workflows
- 6-4-3 reports
- college staff postgame routines

What it is:

A postgame workflow that turns stats into action.

Phase 1 build:

- stats import completeness
- Postgame Action Review AI
- player timeline updates
- practice focus suggestions
- staff action items

UI:

- "Postgame Review" page from a game
- checklist: box score imported, source reviewed, anomalies resolved, recap approved, practice focus created

Acceptance:

- Imported game stats create reviewable insights.
- Coach can approve recap and generate 2-4 practice/player actions.

## 6. Import Dossier

Market inspiration:

- Universal data importers in AMS products
- GameChanger XML export
- Presto XML/packed file workflows
- Rapsodo cloud/team management data

What it is:

An import confidence system that tells coaches whether data is trusted enough to use.

Phase 1 build:

- import run page
- row-level validation
- player match confidence
- duplicate file detection
- source trust badge
- rollback
- affected-object summary

Acceptance:

- Coach can answer: what changed, who matched, what failed, what warnings remain, can I undo it?

## 7. Availability And Readiness Hub

Market inspiration:

- Smartabase/AMS readiness and availability
- TeamBuildr questionnaires and threshold reports
- Teamworks EMR availability status

What it is:

A non-medical baseball availability hub.

Phase 1 build:

- player check-in
- availability status
- limitation text
- lift/wellness summary
- coach/strength staff visibility
- practice/game impact

Language:

- use "availability", "limitation", "review", "operational flag"
- avoid "injury prediction", "diagnosis", "medical risk"

Acceptance:

- Limited player changes practice groups and Command Center flags.
- Player sees supportive next step, not alarming risk label.

## 8. Staff Decision Room

Market inspiration:

- Teamworks coordination
- AMS dashboards
- baseball staff weekly workflows

What it is:

A weekly staff meeting cockpit.

Phase 1 build:

- agenda sections
- signals since last meeting
- players to discuss
- open tasks
- practice/game/lift/academic/travel issues
- source-backed action recommendations with sources

Acceptance:

- Head coach can run a meeting from BaseballHelm without making a separate Google Doc.

## 9. Player Today 2.0

Market inspiration:

- Teamworks athlete app daily usage
- TrainHeroic athlete simplicity
- TeamBuildr athlete logging

What it is:

The player's daily action surface.

Phase 1 build:

- schedule
- check-in
- acknowledgements
- lift/practice assignment
- player-visible development note
- travel/class reminders

Acceptance:

- A player opens it for less than 60 seconds and knows what to do.
- No staff-only data leaks.

## 10. Roster Construction Board

Market inspiration:

- ARMS/Teamworks recruiting workflows
- 6-4-3 custom rosters/transfer portal use cases
- FieldLevel/Perfect Game recruiting databases

Phase:

- Not Phase 1.
- Build after first pilot or Phase 3.

What it is:

Internal roster planning, not a marketplace.

Inputs:

- current roster
- positions
- class years
- graduation/transfer risk
- player development pipeline
- prospect import list

Acceptance:

- Coaches can identify roster needs without BaseballHelm pretending to be FieldLevel or PG.
