# V9 Tab-By-Tab Subsystem Plan

Generated: 2026-06-23

This document defines every planned BaseballHelm tab and subsystem in build terms. It is written for Claude Ultracode. Each tab has a job, route ownership, UI surfaces, data ownership, actions, CoachHelm hooks, permissions, states, and acceptance requirements.

## Navigation Standard

The final product should have one clear staff shell and one clear player shell.

### Staff Primary Navigation

1. Command
2. Signals
3. Roster
4. Calendar / Team Ops
5. Practice
6. Stats
7. Performance
8. Video
9. Reports / Meetings
10. Import / AutoSync
11. Admin / Settings

### Player Primary Navigation

1. Today
2. Schedule
3. Tasks
4. Performance
5. Development
6. Profile

### Program Mode Variants

College, high school, showcase, and JUCO should share the same core objects and code patterns, but they should not feel like shallow text swaps.

| Program mode | Staff nav emphasis | Player nav emphasis | Default feature posture |
|---|---|---|---|
| College | Command, Signals, Practice, Stats, Performance, Calendar, Import, Reports, Settings | Today, Schedule, Tasks, Performance, Development, Profile | Most complete operational workflow: official stats, practices, lifting, classes, travel, meetings, player development |
| High school | Command, Roster, Schedule, Practice, Stats, Player Profiles, Development, Communications, Settings | Today, Schedule, Tasks, Stats, Profile, Showcase if enabled | Simpler staff structure, optional guardian contacts, simpler academics, player exposure more visible |
| Showcase | Event Command, Rosters, Player Profiles, Measurables, Video/Documents, Scouts/Coaches, Events/Camps, Imports, Reports, Settings | Event Today, Profile, Measurables, Video, Schedule, Interest | Event roster, verified measurables, video packet, scout packet, public/private profile control |
| JUCO | College nav plus Player Passport, Transfer/Exposure, Recruiting Activity | Today, Schedule, Tasks, Development, Performance, Profile, Exposure | College daily ops plus transfer/recruiting exposure and roster turnover management |

## Staff Tab: Command

### Job

Command is the default staff landing page. It answers:

- What is happening today?
- Who needs attention?
- What changed since the last staff check?
- What sources arrived?
- What requires staff action?
- What should become practice, lift, video, message, meeting, or player task work?

### Route Ownership

- Primary route: `/baseball/command`
- Alias or redirect from existing dashboard route if the repo already has `/baseball/dashboard`
- Staff only
- Player route must never reuse Command UI

### Main UI Zones

- Today strip: games, practices, lifts, meetings, travel, classes, team events
- Signal stack: unresolved high-impact signals grouped by source type
- Availability risk panel: injured/limited, sore, class conflict, travel conflict, missed check-in, pitcher workload, catcher workload, two-way overload
- Import health panel: last imports, failed imports, review queue, expected game file missing
- Practice action panel: next practice focus, draft blocks from CoachHelm, unresolved previous practice completion notes
- Staff follow-up panel: overdue tasks, meeting action items, unassigned signals
- Player watch panel: players needing coach attention today
- Video queue: clips awaiting staff review, player video tasks due, evidence tied to current signals

### Data Ownership

Command reads from:

- `baseball_events`
- `baseball_games`
- `baseball_practices`
- `baseball_practice_blocks`
- `baseball_player_timeline_events`
- `baseball_signals`
- `baseball_staff_actions`
- `baseball_import_runs`
- `baseball_import_rows`
- `baseball_ai_insights`
- `baseball_ai_insight_sources`
- `baseball_video_events`
- `performance_sessions`
- `performance_checkins`
- `baseball_player_classes`
- `baseball_event_acknowledgements`
- existing roster/player tables

Command should not own source data. It is a read-model and action launcher.

### Primary Actions

- create task from signal
- assign signal owner
- dismiss or snooze signal with reason
- convert signal to practice block
- convert signal to lift modification
- convert signal to video review
- convert signal to meeting item
- open player profile drawer
- open source drawer
- open import review
- publish announcement
- acknowledge that a staff member reviewed the daily brief

### CoachHelm Hooks

- Daily staff brief
- Player risk summary
- Practice focus recommendation
- Import cleanup summary
- Postgame carryover summary
- Strength/readiness warning
- Meeting agenda draft

Each CoachHelm output must cite source objects and show confidence.

### Permissions

| Role | Access |
|---|---|
| Head coach | full Command |
| Assistant coach | position group and assigned player view, team-level non-sensitive summaries |
| Pitching coach | pitcher, catcher, pitcher workload, pitching development, relevant practice/lift/video signals |
| Hitting coach | hitter, catcher/offense, approach, batted-ball, swing, relevant video/practice signals |
| Strength staff | performance, readiness, lift, workload, non-private schedule conflicts needed for safety |
| Director of ops | calendar, travel, acknowledgements, documents, availability, messages, non-private player status |
| Academic viewer | class conflict and attendance-style visibility only, not private performance notes |
| Admin | settings and audit visibility |
| Player | no staff Command access |

### Required States

- Loading state with skeleton cards for schedule, signals, import health, and player risk
- Empty state for no signals: "No unresolved signals for this team/date"
- Error state for failing read model query with retry
- Permission state for staff role without access
- Demo state with seeded sample program

### Acceptance

- Head coach sees all seeded high-impact signals.
- Assistant coach sees only assigned player/position group details.
- Player cannot access Command.
- A signal can be converted to task, practice block, meeting item, video request, or lift modification.
- Every displayed insight has a source drawer or explicitly says "manual/coach-entered."
- Command can be used as the daily default landing page without opening another tab.

## Staff Tab: Signals

### Job

Signals is the operational inbox. It is not a generic notification center. Every signal must explain:

- what changed
- which source produced the signal
- who or what is affected
- why it matters
- what the system recommends
- who owns the next action
- whether the action was completed

### Route Ownership

- Primary route: `/baseball/signals`
- Staff only
- Signals may be embedded in Command, Practice, Player Profile, Performance, Stats, Import, and Reports

### Main UI Zones

- Queue tabs: All, Needs Owner, Needs Review, In Progress, Resolved, Snoozed
- Filters: player, position group, source type, confidence, severity, owner, date window, program mode, visibility
- Signal cards with severity, source badges, confidence, recommended action, affected objects, and action buttons
- Bulk assign/snooze/resolve only for roles with permission
- Source drawer
- Action history drawer
- Related video/practice/lift/stat context drawer

### Signal Types

- official stat change
- pitch event trend
- swing sensor trend
- batted-ball trend
- game vs practice gap
- scrimmage transfer signal
- practice effectiveness signal
- workload/readiness signal
- class conflict signal
- travel/availability signal
- import failure or review signal
- video review signal
- task completion signal
- staff meeting follow-up signal
- player profile exposure signal for high school/JUCO/showcase

### Data Ownership

Primary tables:

- `baseball_signals`
- `baseball_signal_sources`
- `baseball_signal_actions`
- `baseball_staff_actions`
- `baseball_ai_insights`
- `baseball_ai_insight_sources`
- `baseball_player_timeline_events`

Signals should link to source objects rather than duplicating source data.

### Required Actions

- assign owner
- change status
- convert to practice block
- convert to player task
- convert to video request
- convert to lift modification
- convert to meeting item
- link to player development plan
- add staff note
- mark insufficient sample
- mark false positive

### Acceptance

- Signals are source-backed and source-visible.
- A signal can move through lifecycle: new -> assigned -> actioned -> measuring -> resolved.
- Resolved signals remain in player timeline if they affected a player.
- CoachHelm cannot generate a signal without storing source references or an explicit low-confidence reason.

## Staff Tab: Roster

### Job

Roster owns canonical baseball identity. It should not be just a list of names. It is where staff understands who is on the team, how they are categorized, how external systems identify them, and what status they have.

### Route Ownership

- Primary route: `/baseball/roster`
- Player profile route: `/baseball/players/[playerId]`
- Staff only for full roster management
- Player can access only their own profile through player shell

### Main UI Zones

- Roster table with filters by team, season, class year, position, status, bats/throws, player type, account status, external ID completeness
- Quick status chips: active, injured/limited, redshirt, inactive, transfer, alumni, prospect, event-only, showcase-only
- External ID completeness panel
- Account invitation status
- Position group ownership
- Bulk invite, bulk status update, bulk import mapping
- Player profile drawer for quick glance

### Data Ownership

- existing player tables
- `baseball_player_external_ids`
- `baseball_player_status_history`
- `baseball_player_timeline_events`
- `baseball_player_guardians` for high school if enabled
- `baseball_player_profile_visibility`
- `baseball_player_position_groups`

### Player Profile Core Sections

- Snapshot
- Timeline
- Stats
- Development
- Practice
- Performance
- Video
- Classes/Availability
- Tasks
- Documents
- Recruiting/Showcase if enabled
- Source IDs
- Staff notes with visibility controls

### Acceptance

- Every player can have multiple external IDs by provider.
- Player account invitation is separate from player roster record.
- Staff can search by legal name, roster name, jersey, position, class, and external ID.
- Player status changes create timeline entries.
- Players cannot see staff-only notes or private source metadata.

## Staff Tab: Calendar / Team Ops

### Job

Calendar / Team Ops owns schedule, events, acknowledgements, travel, documents, class conflicts, attendance, and operational communication. It is where BaseballHelm competes with fragmented texts and spreadsheets while staying baseball-specific.

### Route Ownership

- Primary route: `/baseball/calendar`
- Team Ops route or subtab: `/baseball/team-ops`
- Events route: `/baseball/events/[eventId]`

### Event Types

- game
- practice
- scrimmage
- lift
- bullpen
- cage session
- team meeting
- staff meeting
- travel
- class conflict
- showcase event
- camp
- document deadline
- player-only session
- recovery/rehab event if enabled

### Main UI Zones

- Calendar view: day, week, month, list
- Event details drawer
- Practice plan attachment
- Scrimmage lineup attachment
- Import attachment
- Video attachment
- Documents and acknowledgement panel
- Attendance panel
- Class conflict matrix
- Travel details
- Announcements/messages
- Player-specific visibility preview

### Data Ownership

- `baseball_events`
- `baseball_event_attendees`
- `baseball_event_acknowledgements`
- `baseball_event_documents`
- `baseball_event_messages`
- `baseball_event_tasks`
- `baseball_player_classes`
- `baseball_class_conflicts`
- `baseball_travel_segments`
- `baseball_practices`
- `baseball_games`

### Acceptance

- Practice plan can attach to practice event.
- Import can attach to game, practice, scrimmage, bullpen, or player session.
- Class conflict visibly affects practice/lift/player availability.
- Player sees only relevant event details.
- Staff sees acknowledgement and attendance status.
- Calendar changes create timeline or audit events where relevant.

## Staff Tab: Practice

### Job

Practice is the signature player-development workflow. It plans the work, assigns staff and players, links the work to signals and video, captures what happened, and measures whether it transferred.

### Route Ownership

- Primary route: `/baseball/practice`
- Builder route: `/baseball/practice/[practiceId]/builder`
- Completion route: `/baseball/practice/[practiceId]/complete`
- Templates route: `/baseball/practice/templates`

### Main UI Zones

- Practice calendar/list
- Plan builder
- Block/station editor
- AI generate plan panel
- Scrimmage lineup builder
- Attendance and availability
- Signal attachment panel
- Video attachment panel
- Measurement target panel
- Completion capture panel
- Practice effectiveness board

### Practice Builder Requirements

Each practice plan must support:

- date
- event link
- start time
- end time
- facility/location
- time slots on the left
- required headline per slot
- optional description
- station type
- assigned staff
- assigned players/groups
- equipment
- linked signal
- linked stat filter
- linked video
- linked player task
- measurement target
- completion status
- completion notes

### Scrimmage Lineup Builder Requirements

Field view must include:

- P
- C
- 1B
- 2B
- 3B
- SS
- LF
- CF
- RF
- DH
- bench
- bullpen

Lineup table must include:

- batting order
- player
- position
- inning range
- planned substitution
- note
- availability warning
- workload warning
- soreness warning
- class conflict warning
- CoachHelm suggestion badge

Scrimmage modes:

- Blue vs White
- situational offense
- situational defense
- pitcher live AB
- defense-only
- bullpen live
- showcase measurement day
- rain-day indoor

### Data Ownership

- `baseball_practices`
- `baseball_practice_blocks`
- `baseball_practice_block_assignments`
- `baseball_practice_attendance`
- `baseball_practice_metrics`
- `baseball_scrimmage_lineups`
- `baseball_scrimmage_lineup_slots`
- `baseball_scrimmage_events`
- `baseball_practice_effectiveness_reviews`
- `baseball_video_events`
- `baseball_signals`
- `baseball_staff_actions`

### CoachHelm Hooks

- generate practice from linked signals
- recommend player groups based on trend and availability
- warn on workload or class conflicts
- measure practice effectiveness from human-entered completion notes and later data
- create follow-up player tasks
- measure practice effectiveness against future data

### Acceptance

- A coach can create a practice plan from scratch.
- A coach can generate a practice plan from CoachHelm signals, then edit before publishing.
- Players see only their assignments in Player Today.
- Scrimmage stats are stored separately from official game stats.
- Practice effectiveness review states sample size, scope, and confidence.

## Staff Tab: Stats

### Job

Stats owns official game stats, scrimmage stats, practice metrics, development facts, advanced events, source health, and stat-to-action workflow. It is not just a table.

### Route Ownership

- Primary route: `/baseball/stats`
- Game route: `/baseball/stats/games/[gameId]`
- Player stats embedded in player profile
- Import review redirects into Import / AutoSync

### Main UI Zones

- Official Games
- Scrimmages
- Practices
- Development Metrics
- Pitch Events
- Swing Events
- Batted-Ball Events
- Fielding/Catching/Baserunning
- Source Health
- Player Splits
- Team Trends
- Postgame Action Review

### Official Stat Coverage

Batting:

- games played
- games started
- plate appearances
- at bats
- runs
- hits
- singles
- doubles
- triples
- home runs
- total bases
- RBI
- walks
- intentional walks
- strikeouts
- hit by pitch
- sacrifice bunts
- sacrifice flies
- ground into double play
- reached on error
- catcher interference
- left on base
- stolen bases
- caught stealing
- pickoffs
- lineup slot
- position started
- pinch hit
- pinch run
- two-out RBI
- productive outs

Pitching:

- appearances
- starts
- innings
- batters faced
- pitches
- strikes
- runs
- earned runs
- hits
- walks
- strikeouts
- hit batters
- home runs
- wild pitches
- balks
- pickoffs
- inherited runners
- holds
- saves
- first-pitch strikes where available

Fielding/Catching/Baserunning:

- putouts
- assists
- errors
- double plays
- passed balls
- caught stealing
- stolen bases allowed
- pickoffs
- blocks where available
- receiving/framing where available
- pop time where available
- extra-base decisions
- advancement decisions

Development facts:

- pitch velocity
- pitch movement
- spin
- release
- location
- exit velocity
- launch angle
- spray angle
- distance
- bat speed
- attack angle
- on-plane efficiency
- bodyweight
- lift load
- soreness
- readiness
- class conflict
- video tag

### Data Ownership

- `baseball_games`
- `baseball_box_score_batting`
- `baseball_box_score_pitching`
- `baseball_box_score_fielding`
- `baseball_box_score_catching`
- `baseball_box_score_baserunning`
- `baseball_plate_appearances`
- `baseball_pitch_events`
- `baseball_batted_ball_events`
- `baseball_swing_events`
- `baseball_development_facts`
- `baseball_stat_sources`
- `baseball_import_runs`
- `baseball_video_events`

### Acceptance

- Official, scrimmage, practice, and development scopes are separated.
- Every stat row can show source and confidence.
- Imported game can produce postgame action review.
- Team and player trend windows exist.
- CoachHelm cannot mix scopes without labeling them.

## Staff Tab: Performance

### Job

Performance owns strength, lifting, readiness, soreness, bodyweight, workload, availability, and the strength coach workflow. It is not just a chart.

### Route Ownership

- Primary route: `/baseball/performance`
- Strength staff dashboard: `/baseball/performance/strength`
- Player lift route embedded in player profile and player shell

### Main UI Zones

- Strength coach dashboard
- Today's lift groups
- Lift assignment calendar
- Preset lift templates
- Player lift completion
- Exercise history
- Bodyweight trends
- Soreness heatmap
- Readiness heatmap
- Pitcher/catcher/two-way workload warnings
- Missed/modified lift reasons
- Performance-to-practice recommendations

### Data Ownership

- `performance_workout_templates`
- `performance_sessions`
- `performance_assignments`
- `performance_results`
- `performance_exercises`
- `performance_bodyweight`
- `performance_checkins`
- `baseball_workload_events`
- `baseball_pitcher_readiness`
- `baseball_catcher_readiness`
- `baseball_two_way_workload`
- `baseball_staff_actions`

### Preset Lift Templates

- in-season maintenance
- preseason strength
- recovery day
- lower-body power
- upper-body maintenance
- pitcher post-outing recovery
- pitcher pre-start primer
- catcher recovery
- speed/agility
- showcase testing prep
- return-to-throw support

### Player Lift UX

Player can submit:

- completion
- load used
- reps completed
- RPE/RIR
- missed sets
- modification reason
- soreness/pain
- bodyweight
- notes

### Acceptance

- Strength staff can assign and review lifts.
- Player can complete lift on mobile.
- Last-used load and history appear.
- Soreness/readiness affects Command, Practice, and Player Today.
- CoachHelm can recommend modifications but cannot claim unsupported causality.

## Staff Tab: Video

### Job

Video owns the evidence layer. It indexes, links, uploads, permissions, tags, tasks, and player timeline connection for video. It does not pretend BaseballHelm automatically owns protected vendor video.

### Route Ownership

- Primary route: `/baseball/video`
- Player video embedded in player profile
- Video tasks embedded in Player Today

### Main UI Zones

- Video library
- Player clip index
- Practice video
- Game video
- Lift video
- Vendor-linked clips
- Native uploads
- Tag and annotation panel
- Video-to-task panel
- Permissions panel
- Evidence source drawer

### Video Source Types

- native upload
- Synergy link/export
- 6-4-3 clip/reference
- TrackMan media reference
- Rapsodo video reference
- AWRE reference
- OnForm shared clip
- coach phone clip
- player upload
- team drive link
- generic URL

### Data Ownership

- `baseball_video_events`
- `baseball_video_sources`
- `baseball_video_annotations`
- `baseball_video_tasks`
- `baseball_ai_insight_sources`
- `baseball_player_timeline_events`
- storage buckets for native uploads

### Acceptance

- Native upload creates clip record, thumbnail where supported, player link, source record, and timeline entry.
- Vendor link creates evidence record without copying protected media.
- Coach can annotate clip and assign player task.
- Player sees only clips/tasks visible to them.
- CoachHelm can cite a clip as evidence only when the user role can access it.

## Staff Tab: Reports / Meetings

### Job

Reports / Meetings turns source data into staff operating rhythm. It owns staff meeting agendas, postgame reviews, weekly reports, player development briefs, and action follow-up.

### Route Ownership

- Primary route: `/baseball/reports`
- Meeting route: `/baseball/meetings`
- Meeting detail route: `/baseball/meetings/[meetingId]`

### Main UI Zones

- Staff Decision Room
- Postgame Action Review
- Weekly Staff Report
- Practice Effectiveness Report
- Player Development Briefs
- Strength/Readiness Report
- Import Health Report
- Player Passport export for modes where enabled

### Data Ownership

- `baseball_reports`
- `baseball_meetings`
- `baseball_meeting_items`
- `baseball_staff_actions`
- `baseball_ai_insights`
- `baseball_ai_insight_sources`
- `baseball_practice_effectiveness_reviews`
- `baseball_import_runs`

### Acceptance

- Decision agenda can be assembled from selected unresolved signals, imports, availability, human-entered practice completion notes, and tasks.
- Meeting items can be assigned and tracked.
- Postgame report links to game source and player timelines.
- Reports preserve source references.

## Staff Tab: Import / AutoSync

### Job

Import / AutoSync is the source gateway. It owns manual upload, parser profiles, mappings, player matching, validation, preview, commit, rollback, raw file storage, confidence, correction handling, setup wizard, monitoring, and official file automation.

### Route Ownership

- Primary route: `/baseball/import`
- AutoSync settings: `/baseball/import/autosync`
- Import review: `/baseball/import/runs/[importRunId]`
- Source settings: `/baseball/import/sources`

### Main UI Zones

- Upload panel
- Detected source panel
- Parser selection
- Grain detection
- Field mapping
- Player matching
- Validation warnings
- Preview commit
- Affected objects
- Rollback
- Source health
- AutoSync setup wizard
- SID invitation
- SFTP/HTTPS/email/local agent status
- Correction diff screen

### Data Ownership

- `baseball_sources`
- `baseball_source_credentials`
- `baseball_import_runs`
- `baseball_import_files`
- `baseball_import_rows`
- `baseball_import_mappings`
- `baseball_import_player_matches`
- `baseball_import_commits`
- `baseball_import_rollbacks`
- `baseball_player_external_ids`
- `baseball_autosync_endpoints`
- `baseball_autosync_events`

### Acceptance

- Every imported row is traceable to run/file/source.
- Every commit can be previewed.
- Rollback can undo committed rows where allowed.
- Duplicate detection handles same file hash and same game/different file hash.
- Review screen shows warnings and affected objects.
- Low-confidence imports do not silently commit.

## Staff Tab: Admin / Settings

### Job

Admin / Settings owns program type, roles, capabilities, access, source settings, integrations, AI review, notifications, appearance, audit, demo mode, and safety controls.

### Route Ownership

- Primary route: `/baseball/settings`
- Admin only for sensitive settings
- Staff can access limited preferences and notifications

### Settings Sections

- Program profile
- Program type
- Teams/seasons
- Staff roles
- Capability presets
- Player account policy
- Guardian access
- Showcase/scout access
- Import source registry
- Integration settings
- AutoSync endpoints
- AI review settings
- Notification rules
- Visibility rules
- Appearance/branding
- Demo mode
- Audit log

### Acceptance

- Program type changes default nav/features without deleting data.
- Role/capability model is explicit.
- Source settings control import trust and commit thresholds.
- Player/guardian/showcase visibility is configurable and safe.
- Audit log captures sensitive settings changes.

## Player Tab: Today

### Job

Today is the player's default mobile-first landing page. It answers:

- What do I need to do today?
- Where do I need to be?
- What lift/check-in/task/video do I owe?
- What did a coach assign to me?
- What is my development focus?

### UI Zones

- Today schedule
- Practice assignments
- Lift assignment
- Readiness/soreness check-in
- Tasks due
- Video clips assigned
- Coach-approved notes
- Acknowledgements
- Development priority

### Acceptance

- Player cannot see staff-only signals.
- Player cannot see other players' private data.
- Player can complete tasks, check-ins, lift entries, acknowledgements, and video reviews.
- Player Today loads fast on mobile.

## Player Tab: Schedule

### Job

Schedule shows player-visible events and required acknowledgements.

### UI Zones

- Day/week list
- Event detail
- Location/time
- My assignments
- Acknowledgement
- Travel details visible to player
- Class conflicts visible to the player

### Acceptance

- Player sees only relevant events.
- Practice plan details are filtered to assigned blocks.
- Staff-only notes remain hidden.

## Player Tab: Tasks

### Job

Tasks is the player's action queue.

### Task Types

- video review
- lift completion
- soreness check-in
- practice follow-up
- meeting follow-up visible to player
- document acknowledgement
- travel acknowledgement
- development task
- profile update
- showcase packet item

### Acceptance

- Task status changes create timeline entries.
- Player-visible tasks preserve coach owner and due date.
- Staff can see completion in Command and player profile.

## Player Tab: Performance

### Job

Performance lets the player complete lift/readiness workflows and see approved performance history.

### UI Zones

- Today's lift
- Last used weights
- Set/reps/load entry
- RPE/RIR
- bodyweight entry
- soreness/readiness check-in
- approved trends
- personal bests

### Acceptance

- Player can submit lift and check-in without staff app complexity.
- Staff sees submissions in Performance and Command.
- Player cannot see staff-only workload interpretation unless approved.

## Player Tab: Development

### Job

Development gives the player approved coaching priorities without exposing staff-only analysis.

### UI Zones

- current focus
- assigned video
- assigned practice work
- approved CoachHelm/player brief
- progress status
- upcoming review

### Acceptance

- Staff controls what is player-visible.
- Development tasks link to practice, video, stats, or lift source where appropriate.

## Player Tab: Profile

### Job

Profile gives the player identity, verified measurables, approved stats, videos, and showcase/recruiting controls when enabled.

### UI Zones

- roster info
- positions
- bats/throws
- approved stats
- verified measurables
- videos
- profile visibility
- contact/profile packet for high school, JUCO, showcase

### Acceptance

- Player can update permitted fields.
- Staff approves public/showcase exposure where enabled.
- Verified metrics link to source.
