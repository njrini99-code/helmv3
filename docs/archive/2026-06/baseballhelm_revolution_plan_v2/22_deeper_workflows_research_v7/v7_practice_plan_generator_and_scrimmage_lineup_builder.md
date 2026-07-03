# V7 Practice Plan Generator and Scrimmage Lineup Builder

Practice planning must become one of BaseballHelm's signature workflows. It should be fast enough for a coach to use daily and deep enough to connect practice work to measurable player development.

## Practice Plan Builder

### Core Layout

Left rail:

- time slots
- start time
- end time
- duration
- field/cage/bullpen/lift room location

Main row content:

- headline: required
- optional description under headline
- station type
- assigned staff
- assigned players/groups
- equipment
- linked signal
- linked stat/video/player task
- measurement target

Example:

| Time | Headline | Description |
|---|---|---|
| 2:45-3:00 | Dynamic warmup + throwing ramp | Pitchers follow workload-specific throwing plan. |
| 3:00-3:18 | Two-strike chase station | Group A sees breaking balls below zone; record swing/take decisions. |
| 3:18-3:36 | Catcher block down/arm-side | Catchers rotate with machine; tag every miss by location. |
| 3:36-4:05 | Team defense bunt/PFP | Emphasis on communication and first-base coverage. |
| 4:05-4:45 | Controlled scrimmage | Drag/drop lineups, score as scrimmage, link results to practice. |

### Required Interactions

- Add time slot.
- Drag to reorder.
- Drag slot edge to resize duration.
- Duplicate slot.
- Add headline inline.
- Optional description expands under headline.
- Assign staff.
- Assign player group.
- Attach CoachHelm signal.
- Attach video.
- Attach import/stat filter.
- Mark station as measured/unmeasured.
- Publish to calendar event.
- Notify players/staff.
- Convert into printable PDF.
- Clone from previous practice.
- Generate from templates.

### Practice Event Calendar Attachment

Every practice plan can attach to a `baseball_events` practice event.

Workflow:

1. Coach creates practice event on calendar.
2. Click "Build Practice Plan."
3. Plan inherits date/time/location.
4. Coach adds slots.
5. Publish plan.
6. Players see only their assignments on Player Today.
7. Staff see full plan.
8. After practice, coach records recap and completion.

If a practice plan is built first, BaseballHelm should create or link a calendar event.

## AI Practice Plan Generator

Coach can click "Generate Plan" and choose:

- practice duration
- theme: offense, defense, pitching, pregame, recovery, scrimmage, game prep
- available facilities
- player groups
- staff available
- linked opponent/game
- linked CoachHelm signals
- workload constraints
- class conflicts
- lift schedule

CoachHelm generates:

- time-blocked plan
- station headlines
- optional descriptions
- staff/player assignments
- measurement criteria
- recommended scrimmage lineup if relevant
- what to track during practice

The coach edits before publish.

## Scrimmage Lineup Builder

### Drag-and-Drop Field View

The scrimmage builder should include:

- field diagram
- labeled defensive positions: P, C, 1B, 2B, 3B, SS, LF, CF, RF, DH, bench, bullpen
- drag players from roster into positions
- left/right batting handedness indicators
- throwing hand
- pitch count/workload flag
- soreness/availability flag
- class conflict flag
- position eligibility
- recent workload
- CoachHelm suggestion badge

### Lineup Table

Alongside field view:

- batting order
- player
- position
- inning range
- planned substitution
- note
- availability warning

Drag players to reorder batting order.

### Scrimmage Modes

- Intrasquad: Team Blue vs Team White.
- Situational: runners/outs/count/score state.
- Pitcher live AB: pitcher vs hitter group.
- Defense-only: no batting order, rep-based.
- Bullpen live: pitcher/catcher/batter only.

### Scrimmage Stats

Scrimmage stats are separated from official game stats:

- scrimmage batting lines
- scrimmage pitching lines
- pitch events
- batted ball events
- swing decisions
- defensive events
- catcher events
- baserunning events

They flow to development trends, not official record.

## Practice Recap

After practice:

- mark each block complete/partial/skipped
- enter station metrics
- attach videos
- score scrimmage
- capture coach notes
- assign player tasks
- update CoachHelm outcomes

CoachHelm should then compare:

- planned practice
- completed practice
- measured practice results
- next game/scrimmage outcomes

## Templates

Preset templates:

- Pre-game day
- Post-game recovery
- Bullpen + defense
- Offensive approach
- Two-strike offense
- Catcher development
- Team defense
- Baserunning
- Controlled scrimmage
- Showcase measurement day
- High school short practice
- College full practice
- Rain-day indoor practice

Each template has:

- default time blocks
- staff roles
- equipment
- measurement suggestions
- CoachHelm trigger conditions

