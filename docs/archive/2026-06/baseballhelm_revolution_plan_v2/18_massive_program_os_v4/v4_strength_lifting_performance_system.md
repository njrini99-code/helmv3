# V4 Strength, Lifting, And Performance System

This is the most important missing pillar in the current plan. The lifting/performance product cannot be a small compliance card. It must become a real strength coach operating system that still respects the market reality: TeamBuildr, BridgeAthletic, TrainHeroic, Volt, CoachMePlus, and Smartabase already own deep strength programming, athlete management, and performance data platforms.

BaseballHelm should not clone those platforms. BaseballHelm should become the baseball-specific bridge between strength work and baseball decisions.

## Product Thesis

The strength coach does not need another generic team dashboard. The strength coach needs to know:

- who has lifted
- who missed
- who is limited
- who is trending poorly
- who is sore before throwing
- who needs a modified practice plan
- who has a game/travel/class conflict
- which athletes are not logging
- which lifts correlate with baseball availability and readiness
- what the baseball staff needs to know without exposing sensitive notes

Players need:

- today's lift
- what to complete
- how to log it
- when to check in
- what is visible to coaches
- whether they are limited for practice

Head coaches need:

- enough performance context to make practice/game decisions
- not a full exercise programming tool
- clear source and confidence
- no medical overclaiming

## Strength Coach Role

Add a dedicated role/capability bundle:

`strength_coach`

Default capabilities:

- read roster
- read player availability summary
- read detailed wellness if granted
- create/edit lift assignments
- import lift programs/results
- view lift compliance
- mark lift completion
- create performance notes
- view performance timeline events
- see practice/game calendar
- flag player limitation for staff review
- create strength-related tasks
- add staff meeting items

Default restrictions:

- no private academic notes
- no recruiting notes
- no staff-only baseball scouting notes unless granted
- no admin role changes
- no public profile editing unless granted

## Performance Navigation

Add or upgrade:

- `/baseball/dashboard/performance`
- `/baseball/dashboard/performance/lifts`
- `/baseball/dashboard/performance/readiness`
- `/baseball/dashboard/performance/players/[id]`
- `/baseball/dashboard/performance/imports`
- `/baseball/dashboard/performance/settings`

Performance nav for strength coach:

- Today
- Lift Board
- Readiness
- Player Load
- Groups
- Imports
- Reports
- Settings

Performance nav for player:

- Today Lift
- Check-In
- History
- Progress

Performance nav for head coach:

- Readiness Summary
- Limited Players
- Lift Compliance
- Practice Impact

## Performance Dashboard

First viewport:

- today's lift sessions
- completion status
- no-check-in list
- limited/unavailable players
- soreness/readiness flags
- practice impact list
- import status
- source-cited AI performance brief

Cards/sections:

1. Today Lift Sessions
2. Compliance Board
3. Readiness Flags
4. Practice Impact
5. Pitcher Workload Watch
6. Position Group Trends
7. Import Dossier
8. Staff Notes

No vanity charts unless they answer a staff question.

## Lift Calendar

Lift events should be normal events connected to the calendar.

Lift event fields:

- team_id
- program_id
- event_id
- title
- date/time
- location
- group
- staff owner
- visibility
- required acknowledgement
- assignment link

Lift groups:

- pitchers
- starters
- relievers
- catchers
- position players
- two-way players
- return-to-play group
- freshman group
- custom group

Lift event effects:

- appears in Player Today
- appears in Command Center
- can conflict with class/travel/practice
- can generate acknowledgement/task signals
- can feed compliance reports

## Lift Assignment Model

BaseballHelm should support lift assignments without trying to become TeamBuildr.

Assignment levels:

- team assignment
- position group assignment
- individual assignment
- modified assignment
- recovery assignment

Assignment fields:

- title
- date/due window
- group/player
- source
- workout blocks
- completion requirement
- visibility
- coach owner
- import_run_id if imported

Workout block fields:

- block name
- exercise
- sets
- reps
- target load
- RPE target
- rest notes
- modification notes
- staff-only note

Phase 1 can store simplified workout text plus row-level lift results. Later phases can add full exercise library/program builder.

## Exercise Library Decision

Do not build a full exercise library in the first one-shot.

Build now:

- free-text exercise names
- common exercise normalization
- imported exercise names
- optional tags:
  - lower body
  - upper body
  - arm care
  - mobility
  - speed
  - recovery
  - power

Build later:

- exercise library
- video demos
- alternate exercise substitutions
- periodization templates
- max percentage prescriptions

Reason:

TeamBuildr, Bridge, TrainHeroic, and Volt already own full strength programming depth. BaseballHelm's first value is baseball integration.

## Player Lift Experience

Player Today lift card:

- lift title
- time/location
- required or optional
- assigned group
- status
- primary action

Player lift detail:

- workout blocks
- exercises
- sets/reps/load targets
- completion logging
- RPE
- notes
- ask for modification
- mark unable/limited

Player logging:

- completed
- partially completed
- skipped with reason
- load/reps/RPE if required
- optional note

Player privacy:

- player sees own data
- player sees coach-shared note
- player does not see team compliance unless explicitly enabled

## Strength Coach Lift Board

Rows:

- player
- position
- group
- assignment
- completion
- RPE
- soreness
- limitation
- last check-in
- practice impact
- source
- action

Filters:

- group
- position
- completion
- readiness
- availability
- no check-in
- limited
- pitcher/catcher/two-way

Actions:

- mark reviewed
- modify assignment
- add performance note
- flag for coach
- add to staff meeting
- change practice recommendation
- message player or create task

## Readiness And Wellness

This must be transparent and non-medical.

Check-in fields:

- sleep hours
- sleep quality
- soreness
- energy
- stress
- throwing arm status
- lower body status
- general availability
- limitation note
- ask for staff follow-up

Scale:

- use 1-5 or 1-10 consistently
- explain labels
- allow program configuration

Do not call this:

- injury prediction
- medical risk
- diagnosis

Call it:

- readiness summary
- operational availability
- limitation review
- staff review flag

## Baseball-Specific Readiness Composite

The product may provide a composite, but it must be explainable.

Inputs:

- check-in completion
- sleep
- soreness
- throwing arm status
- lift completion
- recent practice workload
- recent pitching workload if known
- availability status
- staff limitation

Output:

- green/yellow/red or ready/review/limited
- source breakdown
- confidence
- caveat

Display:

- "Review: throwing arm soreness 4/5, Sunday pitch count 42, lift incomplete."

Never:

- "High injury risk."

## Pitcher Workload Integration

Pitchers are different.

Inputs:

- game pitches
- bullpen pitches if imported/manual
- days since outing
- soreness/check-in
- lift completion
- coach limitation
- role: starter/reliever/two-way

Outputs:

- throwing availability flag
- bullpen group suggestion
- practice limitation
- staff meeting topic

Pitcher-specific statuses:

- available to throw
- light catch only
- bullpen planned
- no mound
- recovery day
- position-player-only for two-way

## Two-Way Player Integration

Two-way players must be first-class.

Example status:

- available to hit
- no mound work
- modified lower body lift
- practice group: hitters
- pitcher workload watch

Data model must not force a player into only pitcher or hitter workflows.

## Catcher Workload Integration

Catchers have unique load:

- bullpen catching
- game innings caught
- blocking/receiving volume
- lower body fatigue
- class/travel conflicts

Add later:

- catcher workload notes
- bullpen catching assignments
- limited catching status

Phase 1:

- allow catcher-specific notes and availability flags.

## Practice Impact

Performance data matters because it changes practice.

Practice impact examples:

- "Move Caleb Morrison out of bullpen block; hitter station only."
- "Jordan Reyes completed lower body primer; available for full defensive work."
- "Three freshmen missed lift; add staff follow-up task."
- "Catcher class conflict overlaps early defensive work; assign alternate catching block."

Every readiness signal should have possible actions:

- modify practice group
- add limitation note
- assign staff follow-up
- add to meeting
- dismiss

## Performance In Player Profile

Staff view:

- recent lift completion
- readiness trend
- limitation history
- performance notes
- source-labeled check-ins
- strength coach comments
- practice impact history

Player view:

- assigned lifts
- completed lifts
- personal progress
- shared notes
- check-in history if enabled

High school:

- simpler lift history
- optional guardian visibility

Showcase:

- measurables and testing results are more important than daily lift compliance

## Import Sources

Support import-first workflows.

Sources:

- TeamBuildr export
- BridgeAthletic export
- TrainHeroic export
- Volt export
- CoachMePlus/AMS export if available
- Google Sheets
- Excel
- CSV from strength coach
- manual entry

Import categories:

- lift assignment
- lift result
- testing/maxes
- wellness questionnaire
- readiness questionnaire
- attendance/compliance

Every import:

- source
- file hash
- raw rows
- mapped rows
- validation
- player matching
- commit
- rollback
- affected players

## Testing And Maxes

Testing matters but should not dominate Phase 1.

Testing fields:

- test date
- player
- test type
- result
- unit
- source
- verified

Examples:

- 10-yard split
- 30-yard sprint
- broad jump
- vertical jump
- med ball throw
- trap bar deadlift
- squat
- bench
- pull-up
- body weight

Use:

- player profile
- staff reports
- showcase profiles if enabled

Do not:

- overbuild performance analytics before adoption.

## Strength Coach Settings

Settings:

- default check-in scale
- readiness thresholds
- who can view detailed wellness
- whether players can self-log lifts
- whether missed lifts notify head coach
- whether lift completion appears in Player Today
- default visibility of performance notes
- import source presets
- position group templates
- two-way player handling
- pitcher workload integration toggle

## Performance Reports

Reports:

- daily compliance
- weekly compliance
- no-check-in list
- readiness review list
- limited/unavailable trend
- lift completion by group
- player performance summary
- staff meeting performance section

Exports:

- CSV
- PDF later
- copy-to-clipboard summary

## Performance AI

AI outputs:

- lift compliance summary
- readiness review explanation
- practice impact recommendation
- player staff decision items
- weekly strength report

AI sources:

- lift results
- check-ins
- availability
- practice attendance
- game workload
- staff notes

AI guardrails:

- no medical claims
- no diagnosis
- no injury prediction
- no player-facing negative labels
- confidence and source refs required

Good output:

"Review Caleb Morrison before bullpen work. Sources: Sunday game log 42 pitches, Tuesday check-in throwing arm soreness 4/5, today's lift not completed. Suggested action: move him to hitter-only practice group unless pitching coach clears him."

Bad output:

"Caleb has a high injury risk."

## Program Type Variants

College:

- strongest performance integration
- strength coach role likely exists
- class/travel conflicts matter
- lifting tied to practice/game availability

High school:

- simpler lift plan
- coach may be strength coach too
- guardian visibility optional
- athlete self-logging may be lighter

Showcase:

- testing/measurables more important
- daily lift compliance less important
- performance data feeds profile/scout packet

JUCO:

- college-style performance plus exposure/transfer profile.

## Performance UI Quality Bar

The performance module should look like a professional sports performance cockpit:

- dense tables
- status chips
- source badges
- no bright gimmicks
- numbers in mono
- fast filters
- mobile player logging
- staff desktop board
- source drawers
- line-level audit

It should not look like a generic fitness app.

## Performance Acceptance Criteria

The system passes if:

- strength coach can see today's lift completion in under 30 seconds
- player can complete a lift/check-in from mobile
- head coach sees practice impact, not raw strength detail
- limited players flow into practice planner
- lift imports are audited and rollback-capable
- wellness data is permissioned
- AI performance notes cite sources
- player profile reflects performance history
- staff meeting includes performance section

It fails if:

- lifting is only a card
- players cannot interact with assignments
- strength coach has no dedicated workflow
- check-ins use medical-risk language
- performance data does not affect practice, availability, or staff meetings
