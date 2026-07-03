# V5 Practice And Development Operating Engine

This file turns practice and development from separate modules into one product system.

## The Product Name

Postgame-to-Practice Engine.

## Core Promise

BaseballHelm should help coaches turn what happened in games, lifts, practices, and player development into what happens next at practice.

## Why Existing Tools Do Not Solve This

Stats tools show what happened.

Development tools show player work.

Strength tools show lift completion/readiness.

Calendar/team apps show schedule.

Coaches still open a Google Doc and manually decide practice.

BaseballHelm should close that gap.

## Practice Intelligence Inputs

Inputs:

- official stats
- development metrics
- postgame notes
- player development goals
- recent practice attendance
- readiness/availability
- lift completion
- class conflicts
- travel
- upcoming game schedule
- coach priorities
- staff philosophy

## Practice Intelligence Output

Output:

- suggested practice focus
- source-backed reasons
- player groups
- station recommendations
- player limitations
- staff owners
- time allocation
- player-visible plan

## Practice Builder UI

The builder should have four panes:

1. Practice outline
2. Intelligence/signal rail
3. Player groups
4. Staff/equipment/conflict rail

### Practice Outline

Rows:

- time
- duration
- block
- group
- location
- staff owner
- source reason
- visibility

Actions:

- add block
- duplicate block
- assign group
- assign staff
- publish
- recap

### Intelligence Rail

Shows:

- postgame signals
- development goals due
- limited players
- class conflicts
- lift/readiness flags
- recent stat trends

Action:

- drag signal into practice block
- convert signal to block
- dismiss signal
- add to meeting

### Player Groups

Group types:

- position groups
- pitcher groups
- bullpen groups
- hitter groups
- limited group
- two-way split group
- catcher workload group
- custom

Group cards show:

- count
- limited players
- conflicts
- development goals
- staff owner

### Staff Rail

Shows:

- unassigned blocks
- coach conflicts
- equipment/location needs
- player availability problems

## Practice Templates

Templates should be season-phase aware.

College:

- fall development day
- preseason team defense
- game-week day before travel
- post-series correction
- bullpen day
- intrasquad/scrimmage

High school:

- after-school short practice
- pregame practice
- weekend development
- varsity/JV split

Showcase:

- workout day
- pro-style evaluation
- measurable testing
- game rotation

## Development Goals

Goals should be lightweight but connected.

Goal fields:

- player
- category
- target
- source
- owner
- status
- next practice action
- player-visible summary

Categories:

- hitting
- pitching
- catching
- defense
- baserunning
- strength
- readiness
- academics/availability

Goal mechanics:

- attach evidence
- attach practice blocks
- update from coach note
- include in meeting
- show player-safe version

## Player Development Timeline

Timeline should show:

- goal created
- practice work
- coach note
- metric import
- lift status
- game performance
- meeting outcome
- goal updated

The timeline should make player development visible as a story, not a table.

## Postgame Review To Practice

Workflow:

1. import stats
2. run postgame review
3. identify 3 staff decisions
4. choose practice focus
5. create practice blocks
6. assign player groups
7. publish to players
8. recap after practice
9. update timelines

Example:

Weekend issue:

- runners in scoring position: 2-for-17
- 9 strikeouts with runner on third less than 2 outs

Practice output:

- 20-minute situational hitting block
- groups: hitters 1-12
- owner: hitting coach
- source: GameChanger official stat import
- player-visible: "Situational hitting, runner on third contact round"

## Practice Recap

After practice, staff should record:

- attendance
- block completion
- player notes
- standout items
- unresolved issues
- next action

Recap writes:

- player timeline events
- staff meeting topics
- development goal updates
- signals if unresolved

## Why This Competes

TRAQ manages development programs.

GameChanger/Presto record games.

Teamworks schedules events.

BaseballHelm should own the thing coaches actually do every day: turn the last game and today's roster reality into the next practice.
