# V9 Cross-Subsystem Data, Signal, and Action Map

Generated: 2026-06-23

This document defines how BaseballHelm subsystems connect. Claude should use this to avoid building disconnected tabs. The product only becomes revolutionary if stats, practice, lifting, video, classes, imports, tasks, meetings, and CoachHelm all share the same source-to-action loop.

## Core Product Loop

Every major object should be able to participate in this loop:

1. Source arrives.
2. Source is stored and labeled.
3. Source creates or updates baseball objects.
4. Updated object may create a signal.
5. Signal is reviewed, owned, or converted to action.
6. Action appears in the correct staff or player workflow.
7. Completion is tracked.
8. Outcome is measured later.
9. Player timeline and staff reports preserve what happened.

## Canonical Object Groups

### Organization Objects

- program
- team
- season
- program mode
- staff member
- player account
- staff role
- capability
- setting
- integration source

### Baseball Identity Objects

- player
- roster membership
- position group
- external player ID
- player status
- guardian contact where enabled
- profile visibility
- player timeline event

### Event Objects

- game
- practice
- scrimmage
- lift
- bullpen
- cage session
- meeting
- class conflict
- travel event
- showcase event
- camp
- document deadline
- player-only session

### Source Objects

- source provider
- source credential or endpoint
- raw file
- source URL
- import run
- import row
- import mapping
- import warning
- import commit
- rollback
- video source
- manual source

### Performance Objects

- workout template
- workout session
- assignment
- result
- exercise
- set result
- bodyweight
- readiness check-in
- soreness
- workload event
- pitcher readiness
- catcher readiness
- two-way workload

### Practice Objects

- practice plan
- practice block
- station
- staff assignment
- player/group assignment
- attendance
- practice metric
- completion capture
- scrimmage lineup
- scrimmage event
- practice effectiveness review

### Stats Objects

- official game
- box score batting
- box score pitching
- box score fielding
- box score catching
- box score baserunning
- plate appearance
- pitch event
- batted-ball event
- swing event
- development fact
- season snapshot
- player aggregate
- stat split

### Video Objects

- video event
- clip source
- clip URL
- native file
- annotation
- tag
- evidence link
- video task
- player review completion

### Action Objects

- signal
- staff action
- player task
- meeting item
- practice block created from signal
- lift modification
- video request
- message
- acknowledgement
- report
- CoachHelm insight

## Required Shared Fields

Every important table should use consistent trace fields where appropriate:

- `program_id`
- `team_id`
- `season_id`
- `player_id`
- `event_id`
- `source_id`
- `import_run_id`
- `created_by`
- `updated_by`
- `visibility_scope`
- `confidence`
- `source_trust`
- `status`
- `reviewed_by`
- `reviewed_at`
- `created_at`
- `updated_at`

## Source To Storage Map

| Source type | First storage | Normalized storage | Downstream systems |
|---|---|---|---|
| Official XML game file | raw import file, import run, import rows | games, box score tables, plate appearances, pitch events if present | Stats, Command, Signals, Reports, Player Timeline, Practice |
| Season stats CSV | raw file, import run, import rows | season snapshot, player aggregates where configured | Stats, Player Profile, CoachHelm baseline |
| TrackMan pitch/hit CSV | raw file, import run, import rows | pitch events, batted-ball events, development sessions | Stats, Player Profile, CoachHelm, Practice, Video |
| Rapsodo report/CSV | raw file/report, import run, import rows | pitch events, batted-ball events, development facts, video refs | Player Profile, Practice, CoachHelm, Video |
| Swing sensor CSV | raw file, import run, import rows | swing events, development sessions | Player Profile, Hitting Signals, Practice |
| Synergy/6-4-3/AWRE/OnForm clip | source URL/file, video source | video events, annotations, tags | Video, Player Profile, CoachHelm, Tasks |
| TeamBuildr lift export | raw file, import run | performance sessions, assignments, results | Performance, Player Today, Command, CoachHelm |
| ArmCare export/manual | raw file/manual source | readiness, workload, pitcher readiness | Performance, Practice, Command, CoachHelm |
| Teamworks class export | raw file, import run | class schedule, conflicts | Calendar, Player Today, Practice, Performance, Command |
| Manual entry | manual source audit record | target object | affected subsystem, source drawer, timeline |
| PDF report | raw file, extracted text if possible | manual-reviewed rows or evidence link | Import, Player Profile, Video, CoachHelm where reviewed |

## Signal Generation Map

### Official Stats Signals

Inputs:

- official game import
- season total change
- box score trend
- play-by-play context
- plate appearance results

Signals:

- two-strike chase spike
- first-pitch take/strike issue
- pitcher command decay
- bullpen availability concern
- defensive error trend
- catcher blocking/throwing trend
- baserunning decision issue
- lineup production movement

Actions:

- postgame action review
- practice block
- player task
- video request
- staff meeting item
- player profile update

### Tracking Tech Signals

Inputs:

- TrackMan
- Rapsodo
- Yakkertech
- HitTrax
- Pocket Radar

Signals:

- pitch velocity trend
- spin/movement change
- pitch shape regression
- command heatmap change
- release point drift
- exit velocity trend
- launch/spray issue
- contact quality gap
- bullpen-to-game transfer issue

Actions:

- pitch design session
- hitting station
- video review
- workload review
- practice measurement target
- player development brief

### Swing Sensor Signals

Inputs:

- Blast
- Diamond Kinetics
- manual swing metrics

Signals:

- bat speed drop
- attack angle drift
- on-plane efficiency decline
- timing/readiness issue
- cage/game swing gap

Actions:

- hitting development task
- video review
- cage station
- player brief

### Video Signals

Inputs:

- native upload
- Synergy/6-4-3/AWRE/OnForm link
- coach annotation
- player video completion

Signals:

- clip awaiting review
- player did not complete assigned video
- coach annotation requires practice work
- video evidence supports stat signal
- scouting clip supports meeting item

Actions:

- player video task
- practice block
- meeting item
- player timeline entry
- CoachHelm evidence citation

### Performance Signals

Inputs:

- lift completion
- missed/modified lift
- bodyweight
- soreness
- readiness
- ArmCare
- pitcher/catcher/two-way workload

Signals:

- soreness risk
- shoulder/elbow concern
- lower-body fatigue before game
- missed lift/bodyweight drop
- heavy lift too close to game
- two-way overload
- catcher workload risk

Actions:

- lift modification
- practice modification
- staff alert
- player check-in task
- strength coach follow-up
- meeting item

### Calendar/Class/Operations Signals

Inputs:

- event schedule
- class schedule
- travel
- attendance
- acknowledgements
- documents

Signals:

- class conflict with practice block
- lift conflict
- missed acknowledgement
- travel conflict
- player unavailable
- document overdue

Actions:

- event adjustment
- player reminder
- staff follow-up
- practice assignment change
- Player Today update

## Action Conversion Map

| Signal can convert to | Target subsystem | Required fields |
|---|---|---|
| Practice block | Practice | practice_id, block title, time slot, players, staff owner, source signal, measurement target |
| Player task | Player Today / Tasks | player_id, title, due date, visibility, source signal, owner |
| Video request | Video / Player Tasks | player_id, clip or requested clip, purpose, due date, owner |
| Lift modification | Performance | player_id, session_id, modification reason, source signal, strength owner |
| Staff meeting item | Reports / Meetings | meeting_id or backlog, title, affected players, source refs, owner |
| Message | Calendar / Team Ops | recipient group, body, event/player links, visibility |
| Player profile note | Player Profile | player_id, note, visibility, source signal, staff author |
| Import review task | Import / AutoSync | import_run_id, warning type, reviewer role |

## Player Timeline Rules

Player timeline should show source-backed history, not random logs.

Timeline event categories:

- game
- practice
- scrimmage
- lift
- readiness
- class conflict
- video
- task
- staff action
- CoachHelm insight
- import
- profile best
- status change
- document/acknowledgement
- showcase/recruiting where enabled

Timeline visibility:

- staff-only
- assigned staff roles
- player-visible
- guardian-visible where enabled
- showcase-public where enabled

Every player-affecting signal/action should decide whether it writes a timeline event.

## CoachHelm Output Contract

Every CoachHelm output must include:

- title
- output type
- generated at
- generated by model/system
- affected players
- affected team/event
- source references
- source scopes
- confidence
- sample size where numeric
- limitations
- recommended action
- owner suggestion
- visibility
- disposition: new, accepted, converted, dismissed, resolved

CoachHelm must not:

- claim causality without evidence
- mix official/scrimmage/practice/development scopes without labels
- expose staff-only data to players
- cite video the current viewer cannot access
- auto-commit data

## Permission Boundary Map

| Data type | Head coach | Assistant | Strength | Ops | Academic | Player |
|---|---|---|---|---|---|---|
| Official team stats | full | role/player scoped | read if relevant | read summary | no default | own approved |
| Practice plans | full | assigned/role scoped | read if relevant | schedule view | conflict view | assigned blocks |
| Staff notes | full | scoped | performance-scoped | ops-scoped | academic-scoped | no |
| Lift results | full | summary if relevant | full | no private detail | no | own |
| Soreness/readiness | full | scoped summary | full performance context | availability only | no | own submission/approved |
| Class conflicts | full | conflict summary | conflict summary if impacts lift | full ops view | full academic view | own |
| Video clips | full | scoped | lift/performance clips | no default | no | assigned/approved |
| AI insights | full | scoped | performance scoped | ops scoped | academic conflict scoped | player-approved only |
| Import files | full/admin | relevant summaries | relevant performance imports | ops/class imports | class imports | no |

## Read Models Claude Should Build

Do not make every page query every table directly. Create focused read models.

### Command Read Model

Inputs:

- events today
- unresolved signals
- player risks
- import health
- tasks
- recent timeline items
- practice carryovers
- lift/readiness carryovers

Output:

- grouped cards for Command tab.

### Player Profile Read Model

Inputs:

- player identity
- roster memberships
- stats summaries
- development facts
- timeline
- tasks
- video
- practice
- performance
- classes
- source IDs

Output:

- role-aware player profile.

### Player Today Read Model

Inputs:

- player events
- assigned practice blocks
- lift assignment
- tasks
- video tasks
- check-ins due
- acknowledgements
- approved development notes

Output:

- mobile action stack.

### Import Review Read Model

Inputs:

- import run
- raw files
- parser detection
- rows
- mappings
- player matches
- validation warnings
- affected objects
- commit plan

Output:

- review and commit UI.

### Practice Builder Read Model

Inputs:

- event
- practice plan
- blocks
- assignments
- staff
- roster
- signals
- availability
- video
- templates

Output:

- editable practice builder and scrimmage lineup builder.

### Performance Read Model

Inputs:

- lift assignments
- results
- exercises
- check-ins
- bodyweight
- soreness
- workload events
- baseball event schedule

Output:

- strength coach dashboard and player lift UI.

## Audit Requirements

Every sensitive write should produce an audit event:

- role/capability changes
- source trust changes
- import commits
- import rollbacks
- manual stat edits
- player visibility changes
- player status changes
- staff-only note creation
- AI disposition changes
- video visibility changes
- lift modifications
- practice publish
- meeting item resolution

## Subsystem Dependency Order

1. Program/team/player/role/capability foundation
2. Source registry and external IDs
3. Import run/file/row/mapping foundation
4. Event/calendar foundation
5. Player timeline foundation
6. Signals/actions foundation
7. Command read model
8. Player Today read model
9. Practice plan and block tables
10. Stats official/development separation
11. Performance/lift/readiness foundation
12. Video event foundation
13. CoachHelm source-backed output tables
14. Reports/meeting tables
15. AutoSync endpoint settings
16. Program mode settings and demo seed data

## Cross-System Acceptance Test Scenarios

### Scenario 1: Official Game To Practice

1. Import official XML/CSV game.
2. Store raw file and import rows.
3. Match players.
4. Commit official game stats.
5. Generate postgame action review.
6. Create two-strike chase signal for three hitters.
7. Convert signal into practice block.
8. Publish practice to calendar.
9. Players see assigned practice block.
10. Coach completes human-entered practice completion notes.
11. Later game/scrimmage data creates practice effectiveness review.

### Scenario 2: Rapsodo Bullpen To Player Development

1. Upload Rapsodo pitching session.
2. Store as development source.
3. Link rows to pitcher and bullpen event.
4. Detect command/movement change.
5. Create CoachHelm signal.
6. Assign video review or bullpen focus.
7. Add timeline event.
8. Compare later bullpen/game trend.

### Scenario 3: Class Conflict To Practice Adjustment

1. Import Teamworks/class CSV.
2. Create class schedule rows.
3. Detect conflict with practice block.
4. Signal appears in Command and Practice.
5. Coach moves player assignment.
6. Player Today updates.
7. Timeline records conflict-resolved event if staff chooses.

### Scenario 4: Lift Readiness To Workload Modification

1. Player submits soreness/check-in.
2. Performance flags lower-body soreness.
3. Pitcher/catcher/two-way workload adds context.
4. CoachHelm suggests modification.
5. Strength coach modifies lift.
6. Practice block warns coach.
7. Staff meeting item tracks follow-up.

### Scenario 5: Vendor Video To Task

1. Staff adds Synergy/6-4-3/OnForm clip link.
2. Clip linked to player and pitch/swing context.
3. Coach annotates clip.
4. Task assigned to player.
5. Player completes video review.
6. CoachHelm can cite completed video evidence in development brief.
