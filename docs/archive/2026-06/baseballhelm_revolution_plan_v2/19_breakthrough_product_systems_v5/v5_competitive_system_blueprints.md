# V5 Competitive System Blueprints

This file defines the breakthrough systems that should make BaseballHelm feel superior to a generic app and meaningfully different from category leaders.

## System 1: The Signal Layer

### What It Is

Signals are the heartbeat of BaseballHelm.

A signal is a source-backed operational item that deserves staff review or action.

Signals are not notifications. Notifications say "something happened." Signals say "this matters, here is why, here is the source, here is what you can do."

### Signal Types

Team operations:

- event acknowledgement missing
- travel itinerary changed
- practice unpublished
- task overdue
- document missing

Roster/player:

- player status changed
- duplicate player match detected
- missing external ID
- inactive player appears in import

Performance:

- lift incomplete
- no check-in
- limited/unavailable
- soreness threshold exceeded
- pitcher workload review
- two-way player conflict

Practice:

- limited player assigned to wrong block
- practice block lacks staff owner
- development goal not trained this week
- position group need not reflected in practice

Stats/postgame:

- official stats missing
- stat import conflict
- postgame review needed
- player trend changed
- pitching workload high

Academics:

- class conflict with practice
- travel/class conflict
- academic support note requiring restricted handling

Showcase/recruiting:

- profile incomplete
- unverified metric
- missing video
- scout packet needs review

AI:

- AI suggestion pending review
- AI output stale
- AI source unavailable

### Signal Anatomy

Every signal has:

- title
- plain-English reason
- severity
- owner role
- related player/team/event
- source refs
- confidence
- suggested action
- status
- disposition history

Suggested actions:

- assign task
- add to practice
- add to meeting
- add coach note
- modify player status
- request player action
- review import
- dismiss
- resolve

### Why It Wins

This beats generic dashboards because it creates a staff workflow.

This beats AI chat because it turns insight into action.

This beats spreadsheets because it remembers source and disposition.

### UI Mechanic

Signal Inbox:

- dense table
- left side severity strip
- source badge
- related player chip
- one-line reason
- primary action
- overflow actions
- source drawer

Command Center:

- top 5 signals
- grouped by owner
- today's blockers

Player profile:

- player-specific signals

Practice Planner:

- practice-relevant signals

Staff Meeting:

- unresolved signals become agenda items

### Implementation Mechanic

Signals can be generated from:

- direct rule engine
- import validation
- user action
- AI output
- scheduled evaluator

Signal rules should be data-driven later:

- condition
- source types
- severity
- owner role
- action template
- visibility

Phase 1 can hard-code the first rules, but the schema should allow future configurability.

## System 2: The Source Trust System

### What It Is

Every important piece of information carries a trust label.

Trust labels:

- Official
- Device export
- Staff entered
- Player entered
- Imported
- Attached report
- AI-derived
- Unreviewed
- Conflict

### Why It Wins

Coaches do not trust mystery data. Source trust turns the app from a pretty dashboard into an accountable system.

### UI Mechanic

SourceTrustBadge:

- small pill
- consistent color/icon
- clickable
- opens source drawer

Source Drawer:

- source name
- imported by
- imported at
- raw file
- row number
- mapped field
- confidence
- related objects
- visibility
- audit history

### Product Mechanics

When a metric appears:

- show source badge
- show whether reviewed
- show if conflicting

When AI references data:

- show source refs
- show confidence
- show facts vs interpretation

When a player sees data:

- only show player-visible sources

## System 3: The Action Conversion Engine

### What It Is

Every meaningful object can become another useful object.

Conversions:

- signal -> task
- signal -> practice block
- signal -> staff meeting item
- signal -> coach note
- import warning -> player match review
- postgame insight -> practice focus
- player meeting topic -> development goal
- lift flag -> practice limitation
- class conflict -> schedule note
- showcase metric -> profile proof item

### Why It Wins

This is the product magic. Most tools stop at showing information. BaseballHelm should let staff turn information into workflow in one click.

### UI Mechanic

"Convert to..." action menu:

- Add to practice
- Add to staff meeting
- Assign task
- Add player note
- Request player action
- Mark reviewed

Each conversion:

- preserves source refs
- creates audit event
- writes timeline if player-related
- respects visibility

## System 4: Program-Type Adaptive OS

### What It Is

BaseballHelm changes shape based on program type without becoming separate products.

College:

- operations, practice, performance, academics, travel

High school:

- roster, communication, player profile, showcase readiness

Showcase:

- event, measurables, verified profiles, scout packet

JUCO:

- college operations plus exposure/transfer readiness

### UI Mechanic

Program type controls:

- default landing
- nav order
- enabled modules
- language
- demo story
- role templates
- onboarding questions

### Why It Wins

Competitors are usually broad platforms or narrow tools. Adaptive OS lets BaseballHelm feel purpose-built in each market while sharing one codebase.

## System 5: The Decision Ledger/Staff Action Engine

### What It Is

Staff Decision Room and Player Development Brief Mode are not reports. They are decision workspaces.

Staff Meeting:

- unresolved signals
- players to discuss
- practice issues
- performance readiness
- academic/travel conflicts
- import quality
- open tasks
- decisions needed

Player Meeting:

- player timeline
- development goals
- performance/readiness summary
- coach notes
- recent stats
- agreed actions

### UI Mechanic

Meeting Mode:

- agenda on left
- source-backed detail on right
- action bar
- mark discussed
- create task
- create note
- update goal
- export summary

### Why It Wins

This replaces the real Google Doc/whiteboard staff workflow.

## System 6: The Proof Packet

### What It Is

A Proof Packet is a verified, source-backed player story.

Used for:

- showcase profiles
- player meetings
- recruiting exposure
- exit interviews
- staff evaluation

Packet contents:

- player identity
- verified metrics
- official stats
- development trend
- coach-shared notes
- video/doc links
- source badges
- visibility controls

### Why It Wins

Recruiting platforms have profiles. BaseballHelm can have proof. The difference is source labeling and operational history.

## System 7: The Performance-to-Field Engine

### What It Is

This is the bridge from lifting/readiness to baseball decisions.

Inputs:

- lift completion
- RPE
- soreness
- sleep
- throwing arm status
- pitch count
- catcher workload
- practice attendance
- coach limitations

Outputs:

- availability status
- practice impact
- player Today changes
- strength coach action
- staff signal
- meeting topic

### Why It Wins

Strength platforms tell you workouts. BaseballHelm tells the baseball staff what it means for today.

## System 8: The Postgame-to-Practice Engine

### What It Is

Turns official stats and coach observations into next practice.

Inputs:

- game result
- official stats
- pitch workload
- team weaknesses
- player notes
- upcoming schedule
- availability

Outputs:

- Postgame Action Review
- player timeline entries
- staff meeting topics
- practice focus
- practice blocks
- player tasks

### Why It Wins

Stats tools stop at box scores. BaseballHelm converts the box score into Tuesday's work.

## System 9: The Import Dossier

### What It Is

Every import becomes a reviewable case file.

Dossier includes:

- file
- source
- trust level
- rows
- mapping
- matches
- warnings
- errors
- affected objects
- rollback
- source refs created

### Why It Wins

The market is messy. Dossier makes messy imports safe.

## System 10: The Player Daily Contract

### What It Is

Every player day is a contract:

- where to be
- what to do
- what to acknowledge
- what to log
- what to prepare
- what changed

### UI Mechanic

Player Today should feel like a sports version of a flight checklist:

- next required action
- time and place
- completion state
- simple explanation
- no noise

### Why It Wins

Player adoption comes from clarity, not dashboards.
