# V10 Premium UI System By Tab

## Design Direction

BaseballHelm should feel like a premium sports operations command system. The visual language should be dense, crisp, and baseball-specific:

- matte surfaces with strong data hierarchy
- restrained navy/graphite foundation
- amber as decision/action accent
- green/amber/red status colors used semantically
- white or near-white data surfaces for readability
- tabular numbers for stats
- clear source chips and confidence badges
- compact chart frames with table fallbacks
- role-aware information density
- reduced-motion support
- no decorative noise that competes with data

The UI should feel engineered, not illustrated. The best comparison is a pro operations desk: lineups, roster status, stat deltas, source badges, charts, practice blocks, and action queues all visible without forcing a coach through seven clicks.

## Product Shell

### Desktop Coach Shell

Use a BaseballHelm command shell derived from Fairway AppShell:

- Fixed sidebar for primary modules.
- Top command/search bar with `Cmd+K` entry.
- Breadcrumb slot for deep routes.
- Right action cluster for team switcher, notifications, import status, and demo mode.
- Optional active event strip when today has a game, practice, lift, travel, or scrimmage.
- Content area with stable gutters and no nested card-on-card section styling.
- Route transitions with reduced-motion respect.
- Source health mini-indicator in the top bar:
  - last official stats import
  - pending import review count
  - sensor upload freshness
  - missing player check-ins

Primary coach nav:

- Command
- Signals
- Roster
- Practice
- Stats Lab
- Video
- Performance
- Calendar/Ops
- Reports
- Settings

Secondary coach nav:

- Import Center
- Lineups
- Documents
- Travel
- Academics
- Admin

### Mobile Coach Shell

Coaches on mobile need review and action, not full admin density.

Mobile top-level surfaces:

- Today
- Signals
- Roster
- Practice
- More

Mobile rules:

- Bottom nav can be used for the five top-level surfaces.
- Deep admin screens use a sheet or drawer path with a clear back action.
- Charts simplify to one primary insight, a compact trend, and a table/expand action.
- Drag-and-drop flows must have tap-based alternatives.
- Lineup and practice planning can be edited on mobile, but desktop/tablet is the premium authoring mode.

### Player Shell

Player UI should be mobile-first and quiet:

- Today
- Schedule
- Training
- Stats
- Video
- Profile

Player Today should avoid staff-only language. It should show exactly what the player needs:

- next event
- required arrival/check-in
- assigned practice blocks
- lift assignment
- readiness/soreness check-in
- tasks/announcements
- personal development action
- recent stat/video feedback if player-visible

## Command Center

### Purpose

The coach should know in 20 seconds:

- what changed
- who needs attention
- what today requires
- what should be practiced next
- what data needs review
- what actions are blocked

### Layout

Desktop:

- Header strip:
  - team/program switcher
  - today context: game/practice/lift/travel
  - source health
  - readiness snapshot
- Left main column:
  - "Work first" directive panel
  - urgent/high signal stack
  - practice prescription preview
  - postgame action review if a game import is pending approval
- Right column:
  - today timeline
  - player attention rail
  - import review queue
  - staff action queue
- Lower grid:
  - team trend cards
  - position group cards
  - readiness/lift cards
  - missing data cards

Mobile:

- One "Work first" card.
- Three compact signal cards.
- Today timeline.
- Player attention strip.
- Import/review count.

### Premium Components

- Directive Panel: one primary recommendation with evidence chips, confidence, and action button.
- Signal Stack: grouped by urgency, player, position group, or source.
- Player Attention Grid: player row with role, status, trend, source freshness, readiness, action.
- Today Rail: timeline with colored event type, staff owner, attendance, conflicts, attachments.
- Source Health: small row of source chips with last sync/upload and warning count.
- Action Queue: staff actions with owner, due date, status, source, and conversion target.

### Acceptance Criteria

- No generic KPI wall as the top experience.
- Every signal shows source and confidence.
- Every action card has owner or assignment path.
- Empty state teaches setup sequence: roster, staff, event, import, practice.
- Command Center can be filtered for head coach, pitching coach, hitting coach, strength staff, director of ops, and player development.

## Signals

### Purpose

Signals are the central triage workspace. They replace scattered alerts, generic AI copy, and hidden import warnings.

### Views

- Feed: best for daily triage.
- Compact: dense list for staff meetings and quick review.
- Grouped: by player, position group, source, category, or owner.
- Board: action lifecycle columns.

### Signal Fields

Required fields:

- title
- player/team/event context
- severity
- category
- source chips
- confidence
- why it matters
- evidence
- recommended action
- owner
- due date if converted
- status
- visibility
- created_at
- expires_at when time-sensitive

Signal categories:

- hitting
- pitching
- catching
- defense
- baserunning
- strength
- readiness
- workload
- practice
- academics/classes
- operations
- recruiting/showcase where enabled
- import quality
- video evidence
- roster/admin

### Interactions

- Acknowledge
- Dismiss
- Resolve
- Assign
- Convert to practice block
- Convert to player action
- Convert to staff action
- Attach to event
- Attach to player timeline
- Open source drawer
- Open evidence video
- Add coach note
- Mark not useful, useful, or wrong

### Premium Details

- Use source drawer rather than hiding evidence in tiny text.
- Use filter chips with URL state.
- Show "sample too small" as a first-class status.
- Do not show source-starved alerts as authoritative.
- Batch actions must include confirmation and undo where practical.

## Roster

### Purpose

Roster is the team's operating index. It should be more than a list of names.

### Views

- Table: dense staff view.
- Card grid: visual overview.
- Position board: depth and availability by position.
- Development board: players by focus area.
- Status board: active, limited, unavailable, missing check-in, class conflict, lift restriction.

### Columns

Core:

- player
- jersey
- class/grad year
- positions
- handedness
- height/weight
- roster status
- availability
- readiness
- latest action
- latest signal
- source freshness

Baseball performance:

- hitter profile
- pitcher profile
- two-way status
- catcher workload
- speed/baserunning
- defensive position group

Operations:

- tasks due
- announcements acknowledged
- documents missing
- class conflicts
- travel status
- compliance-ready fields where allowed

### Premium Details

- Player rows should not overfill.
- Use pinned columns on desktop.
- Use quick filters for position group, status, source freshness, attention needed, and availability.
- Row click opens player peek panel; full profile opens on explicit action.
- Player peek panel should show snapshot, signals, today, development plan, latest video, recent stats, lift/readiness, and timeline.

## Player Profile

### Purpose

The player profile is the source-backed player operating record.

### Structure

- Snapshot header:
  - name, number, position, handedness, class, role tags
  - availability/readiness
  - current development focus
  - latest action
  - source freshness
- Profile tabs:
  - Snapshot
  - Timeline
  - Stats
  - Video
  - Practice
  - Performance
  - Academics/Availability
  - Notes
  - Recruiting/Showcase when enabled
  - Settings/Permissions

### Snapshot Cards

- Role card: hitter, pitcher, catcher, two-way, utility.
- Performance trend: official games, scrimmages, practice, sensor.
- CoachHelm signals: active and recently resolved.
- Practice focus: current and upcoming.
- Video evidence: latest tagged clips.
- Lifting/readiness: latest check-in, soreness, load trend.
- Availability: class, travel, event attendance, restrictions.

### Timeline

Timeline event types:

- official game stat
- scrimmage stat
- practice block completion
- video clip
- lift result
- readiness check-in
- class conflict
- CoachHelm signal
- staff action
- player action
- note
- import correction
- injury/availability status only if role-authorized

Timeline rules:

- Every automated timeline event must cite source.
- Staff-private notes cannot leak to players.
- Player-visible notes must be explicitly marked.
- Timeline filters must be role-aware.
- Import correction events show before/after diff.

## Practice

### Purpose

Practice is where data turns into training.

### Main Views

- Practice calendar/list.
- Practice builder.
- Practice plan generator.
- Practice board by field/station.
- Scrimmage lineup workspace.
- Published player view.
- Practice effectiveness review.

### Practice Builder

Required UI:

- Left time rail with start/end/duration.
- Required headline for each block.
- Optional description under headline.
- Block type: team, hitting, pitching, defense, baserunning, bullpen, cage, classroom, lift, recovery, scrimmage.
- Staff owner.
- Station/location.
- Player groups.
- Required equipment.
- Video capture requirement.
- Source-backed signal link.
- Player action link.
- Attendance/check-in.

Time rail details:

- Drag block duration with 5-minute increments.
- Tap/keyboard alternative for duration.
- Warnings for overlap, missing owner, missing field/cage, player conflict, staff conflict, and unreasonable block length.
- Publish validation before players can see it.

### Practice Plan Generator

Allowed:

- Generate practice prescription from CoachHelm signals, official stats, scrimmage data, readiness, workload, upcoming opponent, and facilities.
- Suggest blocks with source citations.
- Explain why a block exists.
- Ask for coach approval before publish.
- Allow coach to edit all generated content.

Not allowed:

- Practice-summary generation.
- Fabricated recap after practice.
- AI claiming the practice worked before future data exists.

The generator should output:

- proposed headline
- time block
- station
- staff owner
- player group
- data reason
- source objects
- expected measurable outcome
- confidence
- risks/constraints

### Scrimmage Lineup Workspace

Workspace elements:

- Batting order for Team A and Team B.
- Defensive diamond for each team.
- Pitcher/catcher battery selector.
- Pitching plan by inning or pitch-count segment.
- Defensive rotation plan.
- Situational script:
  - runner on second
  - bunt defense
  - two-strike approach
  - first-and-third
  - bullpen command challenge
  - late-inning leverage
- Score/inning tracker if the scrimmage is live.
- Stat collection mode:
  - scrimmage stats only
  - practice metrics only
  - both, stored separately
- Video capture markers.

Conflict logic:

- Player already assigned to both teams.
- Pitcher exceeds target workload.
- Catcher workload too high.
- Player has soreness/readiness flag.
- Player has class conflict.
- Player is limited/unavailable.

### Practice Effectiveness Review

This replaces generated practice summaries.

It measures:

- what was practiced
- who participated
- what metric or signal it targeted
- whether later practice, scrimmage, or game data moved
- whether sample size is enough
- whether improvement could plausibly be tied to the practice
- what the next recommended action is

It does not generate a narrative recap. It creates an evidence-backed effectiveness card and action options.

## Stats Lab

### Purpose

Stats Lab is where official, scrimmage, practice, sensor, and video-linked facts become trustworthy insight.

### Top-Level Views

- Team Overview
- Player Stats
- Games
- Scrimmages
- Practice Metrics
- Pitching Lab
- Hitting Lab
- Catching/Defense
- Baserunning
- Source Health
- Import History

### Game And Scrimmage Separation

Stats must be separated by context:

- official game
- scrimmage
- practice
- showcase
- bullpen
- cage
- lift/performance
- readiness/wellness
- class/availability

The UI should let coaches compare contexts without merging them into misleading averages.

### Required Visual Families

- Heatmaps for zone, command, chase, whiff, hard contact, and location density.
- Scatter/bubble charts for pitch movement, EV/LA, sprint/jump/lift relationships, and batted-ball distribution.
- Spray charts for batted-ball direction, outcome, launch angle, and exit velocity.
- Trend lines for velocity, strike percentage, chase, hard-hit, soreness, lift loads, readiness, and workload.
- Bullet charts for target vs actual.
- Tables for every chart.
- Source drawers for every important data point.

See `v10_baseball_stat_visual_contracts.md` for the full visual spec.

## Video

### Purpose

Video should be evidence infrastructure, not only a library.

### Views

- Video Library
- Player Video
- Event Video
- Tagged Clips
- Evidence Rail
- Compare View
- Upload Review

### Video Metadata

Each clip should support:

- player
- team
- event
- practice block
- game/scrimmage
- stat fact reference
- pitch/event number when available
- tag
- source
- visibility
- staff notes
- player-facing notes
- transcript or captions when available
- thumbnail
- start/end clip markers

### Premium Interactions

- Split view: chart on left, video evidence on right.
- Click chart point to open related clip.
- Clip drawer shows source, tags, event, stat facts, and actions.
- Player profile video rail groups clips by development focus.
- CoachHelm signal can cite a clip.
- Player can receive a specific video action if visibility allows.

## Performance And Lifting

### Purpose

Performance must be a real workflow for strength staff and a simple workflow for players.

### Strength Coach Dashboard

Views:

- Team readiness board.
- Lift completion board.
- Soreness and bodyweight trends.
- Pitcher/two-way workload.
- Lift assignments.
- Exercise library and presets.
- Player performance profile.
- Alerts and staff actions.
- Multi-sport-ready settings.

Key widgets:

- readiness distribution
- soreness body map or checklist matrix
- bodyweight trend
- assigned vs completed lifts
- top load movements
- set/rep/RPE compliance
- pitcher workload overlay
- players missing check-in
- players trending down in readiness
- return-to-practice limitations where role-authorized

### Lift Builder

Requirements:

- Preset templates for baseball:
  - in-season maintenance
  - pitcher recovery
  - pre-game activation
  - off-season strength
  - speed/power
  - return-to-throwing support
  - deload
- Exercise blocks:
  - movement
  - sets
  - reps
  - target load
  - percent or RPE
  - rest
  - substitution
  - notes
  - video/demo link
- Assignment:
  - whole team
  - position group
  - pitchers
  - catchers
  - two-way
  - individual
- Player logging:
  - load used
  - reps completed
  - RPE
  - pain/soreness flag
  - completion
  - note

### Player Lift UX

Player screen should show:

- today's lift
- next set
- target load
- last time used weight
- quick load entry
- RPE
- soreness check
- completion
- coach note
- "swap exercise" only if allowed

### Performance-To-Field Connection

CoachHelm can connect:

- heavy lift day plus low readiness plus bullpen workload
- soreness spike plus velocity drop
- missed lift plus fatigue trend
- bodyweight drop plus readiness decline
- high catcher workload plus receiving/throwing decline
- two-way player workload plus hitting/pitching performance dip

All such claims must show confidence and source evidence.

## Calendar And Team Ops

### Purpose

Calendar is the operational backbone.

### Calendar Views

- Day
- Week
- Month
- Agenda
- Availability
- Travel
- Practice attachments
- Game/scrimmage attachments
- Lift attachments

### Event Drawer

Fields:

- title
- type
- time/location
- staff owner
- attendees
- attendance/RSVP
- practice plan attachment
- lineup/scrimmage attachment
- import attachment
- video capture requirement
- lift assignment
- class conflicts
- travel details
- tasks/documents
- source-linked signals
- post-event action list

### Team Ops

Team Ops should include:

- announcements
- tasks
- documents
- travel
- attendance
- roster status
- equipment/checklists
- event acknowledgements
- staff assignments

## Import Center

### Purpose

Import Center is the trust engine.

### Import Dossier Layout

Steps:

1. Select source.
2. Upload/ingest file.
3. Provider detection.
4. Preview raw file and parsed structure.
5. Map columns/entities.
6. Match players.
7. Validate rows.
8. Review warnings and duplicates.
9. Commit.
10. Review affected objects.
11. Rollback if needed.

### Premium Components

- Source Profile Picker.
- File fingerprint card.
- Provider confidence meter.
- Parser output tree.
- Player match table with confidence.
- Warning board.
- Commit impact preview.
- Diff viewer for corrections.
- Rollback timeline.
- Import health dashboard.

### Source Badges

Every import and derived object should show:

- source name
- source type
- import run
- confidence
- reviewed/unreviewed
- corrected/uncorrected
- last updated

## Reports And Decision Room

### Purpose

Reports should be decision surfaces, not generated prose packets.

Rename staff-meeting generation language into:

- Staff Decision Room
- Decision Ledger
- Staff Action Queue
- Player Development Briefs
- Postgame Action Review
- Practice Effectiveness Review

### Staff Decision Room

Allowed:

- Filter unresolved signals.
- Group by player, position, owner, source, event, and priority.
- Build an agenda from selected items.
- Create staff actions.
- Record decisions.
- Attach source evidence.
- Mark outcomes.
- Export a concise decision packet if needed.

Not allowed:

- Generated meeting points.
- AI talking points as a standalone feature.
- Meeting summary generation as a primary output.

### Player Development Brief

Allowed:

- Source-backed player snapshot.
- Current development focus.
- Last action and outcome.
- Relevant video clips.
- Coach-approved player-facing note.
- Next player task.

Not allowed:

- Private staff note leakage.
- Uncited claims.
- Automated sensitive health/academic narrative.

## Settings And Admin

### Settings Sections

- Program profile.
- Program type: college, high school, showcase, JUCO.
- Teams and rosters.
- Staff roles and capabilities.
- Player access.
- Guardian access where applicable.
- Showcase/scout access where applicable.
- Source and integration profiles.
- Import mapping rules.
- AI review gates.
- Notifications.
- Calendar defaults.
- Practice defaults.
- Performance/lifting defaults.
- Appearance/density.
- Demo mode.
- Audit log.

### Capability Rules

Settings should be capability-based:

- head coach
- assistant coach
- pitching coach
- hitting coach
- strength staff
- director of ops
- academic viewer
- player
- admin

Each role can have default permissions plus team-specific overrides.

## Program Type Variants

### College

Defaults:

- official stats imports
- class conflicts
- strength staff
- travel
- role-specific staff
- performance/readiness
- NCAA-style roster fields where appropriate
- advanced sensor imports

### High School

Defaults:

- coach-heavy roster management
- guardian/parent communication option
- simpler import workflows
- player development and recruiting visibility
- lower complexity strength workflow
- school schedule awareness

### Showcase

Defaults:

- multi-team organization
- event/camp workflows
- player profile visibility settings
- video and measurable emphasis
- roster import by event/team
- scout-facing export controls

### JUCO

Defaults:

- transfer/recruiting timeline
- academics/eligibility visibility
- roster churn tracking
- program placement workflows
- high schedule/travel intensity
- player development proof for recruiting

## Premium UI Acceptance Checklist

- No dashboard begins with a decorative hero.
- No important stat lacks source context.
- No chart lacks a table fallback.
- No starved metric renders as real 0.
- No primary workflow relies only on drag-and-drop.
- No icon-only button lacks an accessible label.
- No player view exposes staff-only data.
- No screen is a wall of equal cards.
- Every page has an empty, loading, and error state.
- Every major workflow ends in a stored action, timeline event, import record, or reviewed decision.

