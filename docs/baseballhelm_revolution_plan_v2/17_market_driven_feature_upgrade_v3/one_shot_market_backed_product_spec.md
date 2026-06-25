# One Shot Market Backed Product Spec

This is the upgraded one-shot target. It is narrower than the whole roadmap and deeper than the previous Phase 1.

## One Shot Objective

Build the Baseball Staff Operating Graph MVP.

By the end of the one-shot, BaseballHelm should let a college baseball staff:

1. import or seed realistic team data
2. see today's operational signals
3. trace every signal to source data
4. turn signals into actions
5. publish a practice plan based on recent needs
6. show players only what they need today
7. prepare staff/player meetings from timelines
8. review a postgame import and create practice/player actions

## Required Build Units

### Unit 1: Source And Signal Foundation

Build:

- source reference model
- signal generation/read model
- status/disposition model
- source trust badge component

Signals to support:

- pending acknowledgement
- missing practice publish
- import warning/error
- low-confidence player match
- limited/unavailable player
- missed lift/check-in
- class conflict
- postgame review needed
- AI suggestion pending review

Acceptance:

- every signal has source, owner, severity, status, next action

### Unit 2: Command Center 2.0

Build:

- Signal Inbox
- Today board
- Availability board
- Import Dossier summary
- Practice publish/status card
- Postgame Review card
- AI Daily Brief with source drawer

Acceptance:

- head coach can make a daily plan from the page
- no generic filler cards

### Unit 3: Player Today 2.0

Build:

- daily player schedule
- acknowledgements
- check-in
- lift/practice assignment
- travel/class reminder
- player-visible development focus

Acceptance:

- player view is mobile-first and safe
- player can complete/acknowledge/ask for help

### Unit 4: Import Dossier

Build:

- import run page
- row validation
- mapping/matching
- duplicate detection
- source trust badge
- affected objects
- rollback

Acceptance:

- a coach can trust or reject the import before data changes

### Unit 5: Player Timeline 2.0

Build:

- timeline event creation from imports/practice/lift/wellness/notes/AI
- role-safe rendering
- filters
- player meeting mode

Acceptance:

- every timeline item is sourced and permissioned

### Unit 6: Practice Intelligence Board

Build:

- practice planner lite
- signal-to-practice-block action
- suggested focus card
- publish/player view
- attendance/recap

Acceptance:

- a weekend stat issue or availability flag can become a practice block

### Unit 7: Postgame Action Review

Build:

- game import status
- official stat source summary
- anomaly list
- AI recap with source refs
- actions: add practice focus, add player note, add staff meeting topic

Acceptance:

- postgame review produces concrete next actions

### Unit 8: Staff Decision Room

Build:

- agenda from signals/timelines/tasks
- player discussion list
- open decisions
- action item creation

Acceptance:

- staff meeting can run from BaseballHelm

## Minimum Data Objects

Must exist or be emulated through current schema:

- players
- team members/capabilities
- events
- acknowledgements
- imports/runs/rows
- source refs
- signals
- timeline events
- practice/plans/blocks/attendance
- availability/check-ins
- lift results
- AI insights/sources/dispositions
- tasks/meeting topics

## Minimum Demo Story

Use North Shore College demo week:

- Tuesday conference prep
- weekend series lost 1-2
- bullpen overuse
- class conflict
- travel acknowledgements missing
- lift non-compliance
- low-confidence import match
- AI brief tied to source refs

## One Shot Non-Negotiables

- no direct vendor integrations
- no Phase 1 recruiting marketplace
- no compliance engine
- no EMR
- no full strength builder
- no AI without source references
- no player data leakage
- no dashboards without actions
- no placeholder demo rows
