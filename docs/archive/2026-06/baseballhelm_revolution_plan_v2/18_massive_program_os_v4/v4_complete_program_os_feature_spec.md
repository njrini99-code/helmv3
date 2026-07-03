# V4 Complete Program OS Feature Spec

This file defines the full BaseballHelm experience at professional platform scale. It is not a small MVP brainstorm. It is the product architecture for a serious build that can eventually support hundreds of thousands of lines of application code across web, mobile, server actions, data pipelines, permissions, seed data, QA, and demo environments.

## Product Principle

BaseballHelm should feel like a major sports software company built a baseball-specific command center for staff and athletes. Every screen should answer a real operating question:

- What is happening today?
- Who needs attention?
- What changed since yesterday?
- What is the source?
- Who owns the next action?
- What should the player see?
- What should remain staff-only?
- How does this affect practice, lifting, travel, academics, roster, development, or game prep?

No dashboard should exist just to display numbers. No AI should exist just to sound impressive. No import should exist unless it changes a source-linked object and can be audited.

## Platform Modes

BaseballHelm must support multiple program types with shared infrastructure and different defaults.

### College Mode

Primary jobs:

- daily team operations
- practice planning
- player development
- game/postgame review
- lift/readiness coordination
- academics and class conflicts
- travel logistics
- staff meetings
- role-safe player communication
- later roster construction/recruiting

Default staff nav:

- Command Center
- Signals
- Roster
- Practice
- Performance
- Stats
- Calendar
- Meetings
- Imports
- Team Ops
- Settings

Default player nav:

- Today
- Schedule
- Tasks
- Development
- Performance
- Stats
- Profile

### High School Mode

Primary jobs:

- team schedule and attendance
- player development
- parent/player communication boundaries
- stats and game logs
- showcase/camp readiness
- college interest tracking
- simple strength plan
- player profile exposure if enabled

Default staff nav:

- Command Center
- Roster
- Schedule
- Practice
- Stats
- Player Profiles
- Development
- Communications
- Showcase/Recruiting
- Settings

Default player nav:

- Today
- Schedule
- Assignments
- Stats
- Profile
- Showcase

High school-specific requirements:

- optional parent/guardian contact fields
- guardian visibility settings
- simpler academics, usually class conflict only
- recruiting exposure features more prominent than college mode
- coach can manage players without full university staff complexity

### Showcase Mode

Primary jobs:

- event roster management
- player profile packets
- measurable uploads
- video/document links
- scout/coach packet generation
- event schedule
- college interest/activity tracking
- invite/camp communication

Default staff nav:

- Event Command
- Rosters
- Player Profiles
- Measurables
- Video/Documents
- Scouts/Coaches
- Events/Camps
- Imports
- Reports
- Settings

Default player nav:

- Event Today
- Profile
- Measurables
- Video
- Schedule
- Interest

Showcase-specific requirements:

- public/private profile controls
- event-level rosters
- scout packet export
- verified/unverified metric labels
- video links and document bundles
- team affiliation per event

### JUCO Mode

JUCO should be treated as a bridge between college operations and recruiting/exposure.

Primary jobs:

- college-style daily operations
- transfer/recruiting exposure
- player development
- roster turnover management
- academics and eligibility signals if available

Default nav:

- similar to college, with stronger player exposure and transfer profile surfaces.

## Core Objects

Every major feature must connect to at least one core object.

### Program

Represents a baseball organization context:

- college team
- high school team
- showcase org
- JUCO team
- academy
- club

Program fields:

- name
- type
- season context
- region/state
- competition level
- logo/brand settings
- staff roles
- feature flags
- public profile mode
- demo mode flag

### Team

Programs can have one or more teams:

- varsity
- JV
- fall roster
- summer team
- showcase event team
- travel roster
- position group

Team fields:

- program_id
- team_type
- season
- roster status
- join code
- schedule visibility
- player account policy

### Player

Canonical player identity:

- legal name
- preferred name
- roster name
- jersey numbers by season/team
- positions
- bats/throws
- class year
- academic year or graduation year
- player type: pitcher, hitter, two-way, catcher, manager if needed
- status: active, injured/limited, redshirt, inactive, transfer, alumni, prospect
- player account link
- guardian links where appropriate
- external IDs

Player connections:

- stats
- practice attendance
- practice grades
- lifting
- wellness/check-ins
- availability
- academic conflicts
- travel roster
- tasks
- notes
- AI insights
- timeline events
- documents/video links

### Event

Event types:

- practice
- lift
- game
- travel
- meeting
- class conflict
- team activity
- showcase event
- camp
- testing session

Event requirements:

- start/end
- report time
- location
- roster/group
- acknowledgement policy
- visibility
- source/import link
- related practice/game/travel object

### Signal

A signal is an operational issue or opportunity that requires review or action.

Signal examples:

- player limited today
- missing acknowledgement
- class conflict
- lift missed
- import warning
- postgame review needed
- practice unpublished
- player trend changed
- low-confidence player match
- travel roster incomplete
- AI recommendation pending

Signal fields:

- type
- severity
- owner role
- status
- source refs
- related player/team/event
- suggested action
- disposition

### Source Reference

Source refs make the product trustworthy.

Source types:

- official stat import
- GameChanger XML
- Presto file
- TrackMan CSV
- Rapsodo CSV
- 6-4-3 report attachment
- TeamBuildr export
- strength coach spreadsheet
- coach note
- player check-in
- calendar event
- manual entry
- AI-derived output

Every AI card, signal, timeline item, and import result must answer:

- What source created this?
- When was it observed?
- Who imported or entered it?
- Is it trusted, unreviewed, player-entered, or AI-derived?

## Feature System 1: Command Center

The Command Center is not a dashboard. It is the daily staff operating room.

### Command Center Sections

Top bar:

- program/team selector
- season phase
- date
- role mode
- quick create
- command search

Primary left rail:

- Today
- Signals
- Practice
- Roster
- Performance
- Stats
- Calendar
- Meetings
- Imports

First viewport:

- Daily Brief
- Signal Inbox
- Today schedule
- Practice status
- Availability board
- Import and data quality status

Daily Brief:

- what changed since last login
- top players to review
- today's operations
- missing staff/player actions
- practice/game/travel readiness

Signal Inbox:

- source-backed signals
- sortable by severity, role, player, source, status
- action buttons:
  - assign task
  - add note
  - add to practice
  - add to meeting
  - dismiss
  - resolve

Practice status:

- next practice
- published/draft/completed
- staff owners missing
- limited players not assigned
- focus source

Availability board:

- available
- limited
- unavailable
- needs review
- no check-in

Import/data quality:

- imports awaiting review
- duplicate file warnings
- low-confidence matches
- stat conflicts
- missing game stats

### Command Center Acceptance

The Command Center passes when a head coach can open it and know in one minute:

- today's schedule
- who is limited
- what players need attention
- what data is suspect
- whether practice is ready
- what staff decisions are unresolved
- which player actions are pending

It fails if it is just cards with metrics and no source/action.

## Feature System 2: Player Today

Player Today is the athlete's daily app. It must be mobile-first and radically simpler than staff surfaces.

### Player Today Sections

First screen:

- next event
- required actions
- check-in
- practice/lift assignment
- acknowledgement status

Secondary:

- today schedule
- development focus
- performance assignment
- messages/announcements
- travel/class reminders
- player-visible timeline updates

Player actions:

- acknowledge event
- complete check-in
- mark lift complete if allowed
- view practice group
- ask for help
- view player-visible coach note
- upload requested file/video if enabled

Player Today must not show:

- staff-only notes
- staff AI risk labels
- other players' private details
- private academic notes
- medical-style risk language

### Player Today Program Variants

College:

- schedule, lift, practice, class/travel reminders, staff development focus

High school:

- schedule, assignments, stats, showcase prep, guardian-safe communication if enabled

Showcase:

- event schedule, report time, profile/measurables checklist, video upload requests, scout visibility status

### Player Today Acceptance

The player should understand what to do today in under 30 seconds. If the player has to interpret a staff dashboard, the product failed.

## Feature System 3: Roster And Player Profiles

Roster is the identity backbone.

### Roster Requirements

Views:

- table view
- position board
- status board
- eligibility/class view
- player account/invite view
- external ID/import matching view
- roster construction view later

Filters:

- position
- player type
- class year
- status
- active/inactive
- missing account
- missing external ID
- limited/unavailable
- program/team

Bulk actions:

- invite players
- assign position group
- update status
- export roster
- assign lift group
- assign practice group
- add to travel roster

### Player Profile Requirements

Staff profile sections:

- identity header
- status/availability
- source trust panel
- timeline
- official stats
- development metrics
- practice participation
- lifting/performance
- wellness/check-in summary
- academics/conflicts
- travel/tasks
- notes
- documents/video
- AI summaries
- meeting packet

Player profile sections:

- identity
- player-visible development goals
- stats if visible
- performance assignments/progress
- schedule/tasks
- shared coach notes
- profile completeness

Showcase public profile:

- controlled by visibility settings
- verified measurements
- video links
- event history
- coach contact rules
- source badges

### Player Timeline Requirements

Timeline item types:

- game performance
- practice note
- practice attendance
- lift completed/missed
- wellness/availability status
- class conflict
- travel action
- video/document upload
- coach note
- AI summary
- player meeting outcome

Every timeline item:

- player_id
- team/program
- event time
- type
- source
- visibility
- owner
- related object

### Profile Acceptance

A coach should be able to run a player meeting from the profile. A player should see a coherent version of their development without staff-only context.

## Feature System 4: Practice Intelligence

Practice is where BaseballHelm can become operationally special.

### Practice Planner Requirements

Practice header:

- date/time
- event link
- location
- report time
- season phase
- focus
- staff owner
- status

Practice blocks:

- start offset
- duration
- activity
- location
- player group
- staff owner
- required equipment
- source reason
- visibility

Practice groups:

- pitchers
- catchers
- infielders
- outfielders
- hitters
- two-way
- rehab/limited
- custom group

Practice inputs:

- recent game stats
- postgame review
- player development goals
- coach notes
- availability status
- lift fatigue/compliance
- upcoming opponent
- weather/location if available later
- class conflicts

Practice outputs:

- player-visible practice plan
- staff assignments
- attendance
- recap
- player timeline events
- meeting topics
- performance load signal

### Practice Intelligence Board

The board shows:

- source-backed practice suggestions
- unresolved signals relevant to practice
- players limited or missing
- position group needs
- recent game issues
- development goals needing work

Actions:

- convert signal to practice block
- add player to group
- mark limitation handled
- add staff owner
- publish plan

### Practice Acceptance

The practice module passes when a coach can build a realistic practice faster than a Google Doc and the system automatically updates players, staff, attendance, and timeline records.

## Feature System 5: Stats And Postgame Action

Stats are not the product. Actions from stats are the product.

### Stats Center Requirements

Official stats:

- game logs
- season summaries
- player stat lines
- team stat lines
- source label
- import run
- conflict warnings

Development metrics:

- hitting metrics
- pitching metrics
- practice/session metrics
- coach-charted metrics
- source trust
- review status

Splits:

- by season
- by game
- by player
- by position/player type
- optional future: vs LHP/RHP, count, inning, leverage

### Postgame Action Review

Workflow:

1. import official stats
2. validate source
3. resolve anomalies
4. generate recap
5. update player timelines
6. create practice focus suggestions
7. add staff meeting topics
8. create player actions/notes

Postgame page sections:

- result and opponent
- source files
- import warnings
- key team issues
- player moments
- pitching workload
- defensive miscues if tracked
- practice implications
- staff decisions

Acceptance:

The postgame review should turn a stat import into at least one concrete staff action or explain why no action is needed.

## Feature System 6: Performance OS

The full lifting system has its own V4 spec in `v4_strength_lifting_performance_system.md`. It is a first-class product pillar.

At the Program OS level, Performance connects:

- lift calendar
- assignments
- completion
- readiness check-ins
- soreness and limitations
- strength coach dashboard
- player Today
- practice planning
- game availability
- staff meeting
- player profile
- imports
- AI source-cited flags

## Feature System 7: Academics And Availability

Academics should be useful but not become compliance software.

### Academic Requirements By Mode

College:

- class schedule import
- class/practice/travel conflict detection
- travel letter status if provided
- academic support role
- eligibility risk field only if explicitly entered/imported

High school:

- usually no detailed academics
- optional school conflict notes
- guardian-safe communication if enabled

Showcase:

- academic fields only for profile/scouting if player chooses
- no class schedule workflow by default

### Privacy Rules

Coaches see:

- conflict with team activity
- availability impact
- high-level status if permissioned

Academic support sees:

- conflict detail
- academic notes if enabled

Players see:

- own schedule/conflicts
- requested actions

Do not expose private academic notes to general staff by default.

## Feature System 8: Travel And Team Ops

Travel should integrate with calendar, acknowledgements, Player Today, and staff signals.

Travel objects:

- trip
- itinerary item
- roster
- lodging
- meal
- transport
- packing/task checklist
- acknowledgements

Team Ops surfaces:

- travel roster completeness
- missing acknowledgements
- itinerary changes
- player conflicts
- documents attached

Player Today:

- report time
- bus time
- required items
- acknowledgement

Acceptance:

If an itinerary changes, staff can see who has acknowledged it and players see exactly what changed.

## Feature System 9: Documents, Video, And Attachments

Do not build a full video platform. Build a strong attachment layer.

Attachment types:

- video link
- scouting report
- 6-4-3 report
- TrackMan/Rapsodo export
- PDF
- travel doc
- academic form
- player development document
- medical document link restricted if enabled

Requirements:

- source type
- visibility
- related player/event/game/practice
- uploaded_by
- reviewed status
- expiration if needed

Acceptance:

Attachments are useful because they connect to players, events, signals, meetings, and AI source refs.

## Feature System 10: Communications And Tasks

Communication is not chat-first. It is action-first.

Message/announcement requirements:

- target group
- required acknowledgement
- urgency
- related event/task
- visibility
- staff sender
- audit trail

Task requirements:

- owner
- due date
- related object
- visibility
- status
- reminder
- source signal

Acceptance:

Every important communication can create an acknowledgement or task.

## Feature System 11: Recruiting And Exposure

Recruiting is mode-aware.

College:

- defer marketplace
- later roster construction board
- prospect import board
- staff-only scouting notes

High school:

- player exposure workflow
- college interest tracking
- showcase/camp readiness
- public profile controls

Showcase:

- event profiles
- verified measurables
- video/doc links
- scout packet export
- college coach activity if available

Acceptance:

Recruiting does not hijack the college daily team OS. It becomes stronger where high school/showcase need it.

## Feature System 12: Settings And Admin

Settings must be first-class because the app serves multiple program types and privacy contexts.

Settings groups:

- program profile
- teams/seasons
- roles/capabilities
- player account policy
- guardian policy
- source/import settings
- AI visibility and review settings
- demo mode
- public profile settings
- notifications
- data retention
- exports
- billing later

Full settings detail is in `v4_settings_admin_integrations_permissions.md`.

## Feature System 13: AI

AI must be operational, source-cited, and permissioned.

AI outputs:

- Daily Brief
- Signal explanation
- Import cleanup
- Practice recommendation
- PostPostgame Action Review
- Staff meeting prep
- Player decision brief
- Performance workload note
- Academic conflict note
- Travel change summary

AI must never:

- make medical claims
- expose restricted notes
- auto-message players
- auto-change records
- invent source data
- present confidence as certainty

Acceptance:

AI is acceptable only if it improves a workflow and can show source references.

## Feature System 14: Demo And Sales Mode

A serious product needs a serious demo mode.

Demo modes:

- College demo
- High school demo
- Showcase demo
- Strength coach demo
- Player demo
- Ops demo

Demo must include:

- realistic names
- realistic schedules
- messy imports
- source-backed AI
- player-safe and staff-only data differences
- current week story
- practice and postgame workflows
- performance readiness issue
- travel/academic conflict

Acceptance:

The sales demo should make a coach say: this is how my week actually works.

## Feature System 15: Search And Command Palette

At massive scale, navigation cannot be the only access model.

Command palette:

- search players
- search events
- create task
- create note
- jump to import
- start staff meeting
- open practice
- add signal to practice
- view player timeline

Search results must respect permissions.

## Platform Acceptance

The massive BaseballHelm build passes only when:

- each program type has a tailored default experience
- strength/lifting is first-class
- source trust is visible
- settings are real
- imports are auditable
- player and staff experiences are meaningfully different
- high school/showcase/college are not just text swaps
- the UI feels premium, professional, and dense where staff need it
- the player app feels simple and fast
- every feature connects to the Program OS graph
