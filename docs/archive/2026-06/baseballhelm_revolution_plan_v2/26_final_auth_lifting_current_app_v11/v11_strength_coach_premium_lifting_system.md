# V11 Premium Strength Coach And Lifting System

BaseballHelm Performance is a first-class baseball subsystem. It is not a generic workout tracker. It should feel like a serious strength coach, head coach, and player workflow built inside a professional program operating system.

The current Baseball app has roster, stats, team ops, calendar, tasks, documents, player profile, command center, and team join foundations. It does not yet have a mature lifting module. V11 defines the module from the ground up while plugging into the current tables and navigation.

## Product Promise

The lifting coach can build groups, create training blocks, assign lifts, monitor the weight room, adjust loads, track readiness, and understand whether the work is transferring to baseball.

Players see exactly what to do today, log weights quickly, report soreness, and see progress without navigating a staff dashboard.

Head coaches see a clean connection between lifting, readiness, availability, practice, workload, and game performance.

## Navigation

Coach navigation should add a first-class `Performance` item.

Routes:

| Route | Audience | Purpose |
|---|---|---|
| `/baseball/dashboard/performance` | Staff | Performance command center. |
| `/baseball/dashboard/performance/groups` | Strength staff, head coach | Lift groups and athlete segmentation. |
| `/baseball/dashboard/performance/programs` | Strength staff | Training blocks, templates, weeks, days. |
| `/baseball/dashboard/performance/programs/[programId]` | Strength staff | Program editor. |
| `/baseball/dashboard/performance/live` | Strength staff | Live weight room mode. |
| `/baseball/dashboard/performance/players/[playerId]` | Staff | Player performance profile. |
| `/baseball/dashboard/performance/readiness` | Staff | Readiness, soreness, bodyweight, availability. |
| `/baseball/dashboard/performance/exercises` | Strength staff | Exercise library and lift settings. |
| `/baseball/dashboard/performance/imports` | Staff | TeamBuildr/CSV/import review. |
| `/baseball/dashboard/performance/settings` | Head coach, strength admin | Performance permissions, visibility, readiness settings. |
| `/baseball/dashboard/lift` | Player | Player lift home. |
| `/baseball/dashboard/lift/[sessionId]` | Player | Assigned lift execution. |
| `/baseball/dashboard/readiness` | Player | Check-in, soreness, bodyweight, arm status. |

Mobile bottom nav should not exceed five primary items. For players, "Today" should surface lifts instead of adding too many tabs.

## Performance Command Center

The performance dashboard should answer seven questions in the first viewport:

1. Who is lifting today?
2. Who has completed the lift?
3. Who needs load changes?
4. Who is sore or limited?
5. Which groups are trending up or down?
6. Which players are accumulating baseball workload and weight room stress at the same time?
7. Which strength work appears to transfer to baseball outcomes?

Top-level layout:

- Header with active team, season, role badge, current training week, and date.
- KPI strip:
  - Today completion.
  - Missed lifts.
  - Readiness risk.
  - New PRs.
  - Pitcher red flags.
  - Load modifications pending.
  - Bodyweight movement alerts.
- Left main panel: Today weight room board.
- Right panel: Readiness and availability queue.
- Middle section: Group progress and compliance.
- Lower section: Player trend table, CoachHelm performance signals, and transfer-to-baseball analytics.

Premium UI details:

- Use dense tables where strength coaches need speed.
- Use compact cards only for repeated status items.
- Use source drawers for every CoachHelm signal.
- Use bullet charts for target progress.
- Use line charts for load, bodyweight, readiness, and velocity trends.
- Use heatmaps for soreness by body region.
- Use table fallback for every chart.
- Use sticky filter bar with group, position, day type, status, and risk filters.
- Use split panels on desktop, stacked modules on mobile.
- Use role-aware empty states: setup for strength coach, read-only context for assistant coach, player action card for players.

## Strength Coach Dashboard Zones

### 1. Today Weight Room

The "Today Weight Room" board is the operational center.

Columns:

- Athlete.
- Group.
- Session.
- Status: not started, in progress, complete, modified, missed, excused.
- Readiness.
- Soreness.
- Bodyweight delta.
- Prescribed main lift.
- Actual main lift.
- RPE.
- Notes.
- Action.

Actions:

- Open player lift.
- Modify load.
- Substitute exercise.
- Excuse athlete.
- Add note.
- Message athlete.
- Mark observed.
- Send to trainer or head coach if available in role settings.

Interaction:

- Status changes should be optimistic but server-confirmed.
- Bulk select should allow "modify group load by -10 percent" and "send reminder."
- Row drawer opens player detail without leaving the board.
- Keyboard navigation matters for desktop strength staff.

### 2. Readiness Queue

This queue turns check-ins into decisions.

Inputs:

- Soreness map.
- Arm soreness.
- Lower body soreness.
- Back/core soreness.
- Sleep quality.
- Energy.
- Stress.
- Bodyweight.
- Illness flag.
- Player note.
- Staff note.
- Previous lift RPE.
- Recent pitch count or catcher workload.
- Practice/game schedule.

Decision labels:

- Green: train as planned.
- Yellow: monitor.
- Orange: modify lower body.
- Orange: modify upper body.
- Red: hold and review.
- Blue: return-to-play progression.

The app must never make medical claims. It can say "readiness risk", "reported soreness", "training modification recommended", and "review with staff." It should not diagnose injury.

### 3. Group Progress

Groups are how the strength coach organizes the room.

Default groups:

- Pitchers.
- Starters.
- Relievers.
- Catchers.
- Position players.
- Two-way players.
- In-season travel roster.
- Non-travel developmental.
- Injured/limited.
- Return-to-play.
- Freshmen/new players.
- High workload watch.

Custom groups:

- Coach-created group.
- Dynamic group based on rules.
- Imported group from TeamBuildr or CSV.
- Temporary group for a week or event.

Group rules can include:

- Position.
- Class year.
- Team membership.
- Availability status.
- Recent pitch count.
- Recent game starts.
- Soreness status.
- Lift completion.
- Bodyweight range.
- Training age.
- Coach-selected athletes.

Premium group builder UI:

- Left: group list with counts and status badges.
- Center: athlete table with filters and quick add/remove.
- Right: rule builder and preview.
- Preview shows exact included players before saving.
- Changes can be saved as static or dynamic.
- Dynamic group membership changes create audit events.

### 4. Program Builder

The strength coach needs to build training at multiple levels:

- Macrocycle: fall, winter, preseason, in-season, postseason, summer.
- Block: 3 to 8 week training phase.
- Week: microcycle.
- Day: lift day.
- Section: warmup, movement prep, power, main strength, accessory, arm care, mobility, conditioning.
- Exercise prescription.
- Set prescription.

Program builder must support:

- Drag/drop sections inside a lift day.
- Drag/drop exercises inside a section.
- Duplicate week.
- Duplicate day.
- Save as template.
- Assign to group.
- Assign to individual.
- Override player loads.
- Add video/demo link.
- Add coaching cue.
- Add equipment requirement.
- Add timer/rest period.
- Add readiness modification rules.
- Add baseball context tag: pre-game, post-game, bullpen day, starter +2, reliever recovery, catcher recovery, travel day.

## Exercise Library

The exercise library should be practical, not bloated.

Fields:

```text
baseball_lift_exercises
- id
- team_id nullable for team custom exercise
- created_by_coach_id nullable
- name
- category: warmup, power, strength, accessory, arm_care, mobility, conditioning, recovery, test
- primary_pattern: squat, hinge, push, pull, carry, rotate, anti_rotate, sprint, jump, throw, shoulder, elbow, hip, ankle
- body_region: lower, upper, trunk, arm, full_body
- equipment: barbell, dumbbell, kettlebell, cable, band, med_ball, trap_bar, sled, bodyweight, machine, mound, field
- unilateral boolean
- baseball_constraints jsonb
- default_unit: lb, kg, bodyweight, seconds, yards, reps, mph, watts, mps
- track_load boolean
- track_reps boolean
- track_sets boolean
- track_velocity boolean
- track_distance boolean
- track_time boolean
- track_rpe boolean
- video_url
- instructions
- coaching_cues text[]
- contraindication_notes
- is_active
```

Base library categories:

- Movement prep.
- Sprint/jump/throw.
- Med ball power.
- Main lower.
- Main upper.
- Posterior chain.
- Single-leg.
- Rotational core.
- Anti-rotation core.
- Arm care.
- Shoulder/scap.
- Mobility.
- Conditioning.
- Testing.

Baseball-specific tags:

- Pitcher friendly.
- Catcher friendly.
- Post-throwing.
- Pre-throwing.
- Low CNS.
- High CNS.
- Travel day.
- Return-to-play.
- Grip intense.
- Shoulder load.
- Elbow load.
- Spine load.
- Lower-body power.
- Rotational power.

## Training Block Model

Recommended tables:

```text
baseball_strength_groups
- id
- team_id
- name
- description
- group_type: static, dynamic, imported, temporary
- rule_json
- created_by_coach_id
- is_active
- created_at
- updated_at

baseball_strength_group_members
- id
- group_id
- player_id
- source: manual, rule, import
- added_by_coach_id
- starts_at
- ends_at
- created_at

baseball_lift_programs
- id
- team_id
- name
- description
- phase: fall, winter, preseason, in_season, postseason, summer, return_to_play, testing
- goal: strength, power, hypertrophy, speed, maintenance, recovery, arm_care, testing
- created_by_coach_id
- visibility: staff_only, assigned_players
- status: draft, active, archived
- start_date
- end_date
- created_at
- updated_at

baseball_lift_weeks
- id
- program_id
- week_number
- name
- theme
- deload boolean
- created_at

baseball_lift_days
- id
- week_id
- day_number
- name
- day_type: lower, upper, full_body, recovery, arm_care, conditioning, testing, custom
- baseball_context: pre_game, post_game, bullpen_day, starter_plus_1, starter_plus_2, travel_day, off_day, practice_day
- estimated_minutes
- created_at

baseball_lift_sections
- id
- lift_day_id
- section_order
- name
- section_type
- instructions
- created_at

baseball_lift_prescriptions
- id
- section_id
- exercise_id
- order_index
- prescription_type: fixed, percent_1rm, rpe, velocity, coach_load, player_select
- sets
- reps
- load_value
- load_unit
- percent_1rm
- target_rpe
- target_rir
- target_velocity_min
- target_velocity_max
- rest_seconds
- tempo
- coaching_note
- substitution_group_id nullable
- created_at
```

## Assignment Model

Assignment turns a program into real sessions on player calendars.

```text
baseball_lift_assignments
- id
- team_id
- program_id
- lift_day_id
- assigned_by_coach_id
- assignment_type: team, group, player
- group_id nullable
- player_id nullable
- event_id nullable references baseball_events(id)
- scheduled_date
- scheduled_start
- scheduled_end
- status: draft, published, cancelled
- player_visible_at
- created_at
- updated_at

baseball_lift_sessions
- id
- assignment_id
- team_id
- player_id
- event_id nullable
- scheduled_date
- status: assigned, started, completed, missed, excused, modified
- started_at
- completed_at
- readiness_checkin_id nullable
- coach_review_status: none, needs_review, reviewed
- player_note
- coach_note
- created_at
- updated_at

baseball_lift_session_exercises
- id
- session_id
- prescription_id
- exercise_id
- exercise_name_snapshot
- order_index
- prescribed_sets
- prescribed_reps
- prescribed_load
- prescribed_load_unit
- prescribed_rpe
- modified_by_coach_id nullable
- modification_reason
- status: assigned, completed, skipped, substituted
- created_at

baseball_lift_set_results
- id
- session_exercise_id
- set_number
- prescribed_reps
- actual_reps
- prescribed_load
- actual_load
- load_unit
- rpe
- rir
- velocity
- completed_at
- player_note
- coach_observed boolean
- created_at
```

Every assignment should create player sessions at publish time or through a deterministic materialization job. Do not make the player UI calculate hidden assigned sessions from templates on the fly.

## Player Lift Experience

Player UX should be fast and obvious.

Player Today shows:

- Today's lift title.
- Estimated duration.
- Status.
- Readiness check-in status.
- Main lift target.
- Coach note.
- Start button.

Before starting:

- Required readiness check-in if enabled.
- Soreness map if enabled.
- Bodyweight if enabled.
- Simple "anything the staff should know?" note.
- If readiness triggers a rule, show "Your coach may modify today's lift."

During lift:

- Section-by-section layout.
- Current exercise card.
- Prescribed sets/reps/load.
- Previous best or last time completed.
- Input actual weight, reps, RPE.
- Quick buttons: complete as prescribed, reduce load, skip with reason, ask coach.
- Rest timer.
- Video/demo link.
- Coaching cues.
- Progress indicator.
- Sticky bottom action on mobile.

After lift:

- Summary card.
- Volume completed.
- Main lift actual vs target.
- RPE.
- PRs.
- Missed/skipped items.
- Player note.
- Coach review pending if needed.

Player history:

- Calendar of completed lifts.
- Exercise history.
- PRs.
- Bodyweight trend.
- Readiness trend.
- Availability history.
- Assigned but missed sessions.

## Live Weight Room Mode

This is the premium staff mode that makes the product feel expensive.

Purpose: the lifting coach can run a room with 20 to 60 athletes without opening individual profiles one by one.

Layout:

- Full-width top bar:
  - Team.
  - Current lift day.
  - Active group.
  - Completion count.
  - Risk count.
  - Clock.
  - Bulk actions.
- Athlete grid:
  - Player name.
  - Position.
  - Current station.
  - Current exercise.
  - Prescribed load.
  - Actual load.
  - RPE.
  - Readiness badge.
  - Last update time.
- Right rail:
  - Needs coach queue.
  - Red/yellow readiness.
  - Load changes.
  - Missed check-ins.
- Bottom drawer:
  - Selected player set logger and notes.

Live actions:

- Coach enters set for player.
- Coach adjusts next set load.
- Coach substitutes exercise.
- Coach marks form observed.
- Coach marks athlete limited.
- Coach sends quick message.
- Coach creates follow-up task.

Premium details:

- Use color plus labels, not color alone.
- Avoid tiny tap targets.
- Use sticky table headers.
- Use keyboard shortcuts on desktop only if discoverable in tooltips.
- Use realtime updates if practical, but a clean polling fallback is acceptable.
- Use optimistic UI with rollback for failed updates.

## Readiness, Soreness, And Availability

Recommended tables:

```text
baseball_readiness_checkins
- id
- team_id
- player_id
- event_id nullable
- lift_session_id nullable
- checkin_date
- sleep_quality integer 1-5
- energy integer 1-5
- stress integer 1-5
- mood integer 1-5 nullable
- arm_status integer 1-5 nullable
- lower_body_status integer 1-5 nullable
- soreness_overall integer 0-10 nullable
- readiness_score numeric nullable
- player_note
- visibility: staff, performance_staff, head_coach_only
- created_at

baseball_soreness_maps
- id
- checkin_id
- body_region
- side: left, right, both, center
- severity integer 0-10
- note
- created_at

baseball_bodyweight_entries
- id
- team_id
- player_id
- entry_date
- weight_lbs numeric
- source: player, coach, import
- created_at

baseball_availability_statuses
- id
- team_id
- player_id
- status: available, limited, hold, return_to_play, unavailable
- reason_category: soreness, illness, injury_note, academic, travel, coach_decision, other
- note
- visibility
- starts_at
- ends_at
- created_by_coach_id nullable
- created_at
```

Readiness scoring should be transparent:

- Show contributing inputs.
- Show stale-data warning.
- Show missing-data warning.
- Let staff override.
- Let players see only player-safe language.
- Do not diagnose medical conditions.

## Weight Progression And Maxes

Recommended tables:

```text
baseball_strength_maxes
- id
- team_id
- player_id
- exercise_id
- max_type: estimated_1rm, tested_1rm, training_max, velocity_profile
- value
- unit
- test_date
- source: coach_test, player_entry, import, calculated
- confidence
- created_at
- updated_at

baseball_strength_prs
- id
- team_id
- player_id
- exercise_id
- pr_type: load, reps, estimated_1rm, velocity, volume
- value
- unit
- achieved_at
- lift_session_id
- verified_by_coach_id nullable
- created_at
```

Progression rules:

- Training max should be editable by coach.
- Estimated 1RM should never silently replace training max.
- PRs can be unverified or coach-verified.
- Player-facing UI celebrates PRs lightly.
- Coach UI emphasizes trend and workload, not vanity numbers.

## Modification Engine

Baseball lifting must account for baseball workload.

Modification triggers:

- Pitcher threw high pitch count.
- Pitcher bullpen today.
- Starter plus one day.
- Catcher caught back-to-back games.
- Position player hamstring soreness.
- Low sleep/energy.
- Bodyweight drop beyond threshold.
- Player missed previous lift.
- Player returned from limited status.
- Travel day.
- Doubleheader.
- Coach override.

Modification outcomes:

- Reduce load percentage.
- Reduce sets.
- Swap exercise.
- Change section to mobility/recovery.
- Hold upper body.
- Hold lower body.
- Add arm care.
- Send to staff review.

Each modification stores:

- Original prescription.
- Modified prescription.
- Reason.
- Source refs.
- Who approved.
- Player-visible explanation.
- Coach-only note.

## CoachHelm Performance Integration

CoachHelm should not try to be a strength coach. It should make source-backed suggestions that help staff decide faster.

Useful CoachHelm signals:

- Player missed two lifts and chase rate worsened after travel.
- Pitcher velocity down two outings after high lower-body RPE week.
- Catcher pop time degraded after high workload and low readiness.
- Player bodyweight down 3 percent across 14 days with lower energy.
- Team lower-body completion low before weekend series.
- Position group has high soreness after a new block.
- Player achieved a lower-body PR and exit velocity increased in the following 21 days, sample caveat included.
- Practice performance improved after a power block, but game transfer is not yet supported by enough samples.

Required source refs:

- Lift session.
- Set results.
- Readiness check-in.
- Soreness map.
- Bodyweight entries.
- Practice/game stats.
- Pitch/catcher workload.
- Calendar events.

Every CoachHelm performance card must include:

- Finding.
- Why it matters.
- Source drawer.
- Confidence.
- Limitation.
- Recommended action.
- Assignable owner.
- Due date or review date.

## Transfer To Baseball Analytics

This is where BaseballHelm can become special.

The Performance Dashboard should not only say "bench went up." It should ask whether physical preparation is supporting baseball outcomes.

Transfer views:

- Lift block vs exit velocity.
- Lift block vs bat speed if imported.
- Lower body power vs sprint/60 time.
- Rotational power vs throwing velocity.
- Readiness vs command.
- Soreness vs chase/quality of contact.
- Pitcher workload plus lifting load vs velocity/command decay.
- Catcher workload plus lower-body load vs pop time/caught stealing.
- Practice attendance plus lifting compliance vs game performance.

Important caveat:

Correlation is not causation. The UI should state "associated with" unless the system has enough controlled context for stronger language.

Chart contracts:

- Line chart: bodyweight/readiness/load over time.
- Bullet chart: player load vs target.
- Heatmap: soreness map and group soreness density.
- Scatter: training load vs baseball metric change.
- Table: raw sessions and source rows.
- Distribution: group RPE spread.
- Calendar overlay: lift intensity vs games/practices.

## Integrations

Phase 1 should support upload/import before direct API where API access is unclear.

Integration sources:

- TeamBuildr export/import.
- TrainHeroic export/import.
- CSV template for strength staff.
- Google Sheets export.
- Wearable readiness CSV if supplied.
- Rapsodo/TrackMan/Hawk-Eye/Blast/Diamond Kinetics for baseball metric correlation through existing stats/import layer.

Import engine must store:

- Source.
- File.
- Import run.
- Mapping.
- Matched players.
- Unmatched rows.
- Units.
- Commit status.
- Rollback status.
- Source confidence.

Do not mix lifting import rows directly into baseball stat rows. Store performance facts separately, then create analytics read models.

## Data Model Summary

Add these table families:

- Staff roles and invites: `baseball_staff_invitations`, staff capability extensions.
- Strength groups: `baseball_strength_groups`, `baseball_strength_group_members`.
- Exercises: `baseball_lift_exercises`, `baseball_lift_exercise_substitutions`.
- Programs: `baseball_lift_programs`, `baseball_lift_weeks`, `baseball_lift_days`, `baseball_lift_sections`, `baseball_lift_prescriptions`.
- Assignments: `baseball_lift_assignments`, `baseball_lift_sessions`, `baseball_lift_session_exercises`, `baseball_lift_set_results`.
- Readiness: `baseball_readiness_checkins`, `baseball_soreness_maps`, `baseball_bodyweight_entries`, `baseball_availability_statuses`.
- Performance metrics: `baseball_strength_maxes`, `baseball_strength_prs`, `baseball_performance_tests`.
- Imports: `baseball_strength_import_runs`, `baseball_strength_import_rows`, `baseball_strength_source_mappings`.
- CoachHelm links: `baseball_performance_signals`, `baseball_signal_sources`, or reuse existing signal-source pattern from V9/V10.

## Future Multi-Sport Structure

The user wants the lifting coach dashboard to eventually integrate other sports. The data model can remain Baseball-scoped for the first build, but avoid hardcoding baseball-only language into reusable performance components.

Recommended compromise:

- Table names can be `baseball_*` for this build.
- Component names can be `PerformanceDashboard`, `LiftProgramBuilder`, `PlayerLiftSession`, `ReadinessPanel`.
- Schema includes optional `sport_context` or `baseball_context` JSON.
- Exercise library can include sport tags.
- UI copy says BaseballHelm, but internal components can be reused later.

Do not build other sports now.

## Player Profile Integration

Player profile needs a Performance Snapshot.

Sections:

- Current availability.
- Current training group.
- Current block.
- Last lift.
- Next lift.
- Completion rate.
- Main lift trends.
- Bodyweight trend.
- Readiness trend.
- Soreness history.
- PRs.
- Coach modifications.
- Baseball transfer signals.

Player-safe view:

- Shows assigned lifts, completed lifts, own readiness, own bodyweight, own PRs, and coach-approved notes.

Staff view:

- Shows full performance context based on capability.
- Private notes only if permitted.
- Medical-adjacent notes require careful visibility controls.

## Calendar Integration

Lifts must be calendar events or linked to calendar events.

Calendar event types:

- Practice.
- Game.
- Lift.
- Testing.
- Recovery.
- Team meeting.
- Travel.
- Class conflict.

When assigning a lift:

- Create or link `baseball_events`.
- Create player lift sessions.
- Show lift on Player Today and Calendar.
- Allow staff to mark event attendance.
- Attendance and lift completion are related but not identical.

## Player Groups And Practice Integration

Strength groups should connect to practice plans.

Examples:

- Pitchers with high lower-body soreness are excluded from max sprint block.
- Catchers after doubleheader get recovery group and modified lift.
- Position player power group gets med ball rotation block linked to bat-speed focus.
- Return-to-play group gets limited practice and limited lift.

Practice builder should be able to view performance constraints:

- Group readiness summary.
- Player limitations.
- Pitcher/catcher workload.
- Recent lift intensity.
- Suggested practice modifications with source refs.

## Premium UI Tokens And Interaction Rules

Use the existing Baseball shell and improve within it.

Visual direction:

- Data-dense, premium operations surface.
- Restrained baseball red as primary action color.
- Neutral warm surfaces or current Baseball theme surfaces.
- Status colors for readiness and completion.
- No decorative fitness-app fluff.
- No oversized marketing hero inside the app.

Interaction rules:

- Tables must be readable on desktop and convert to cards or horizontal scroll on mobile.
- All icon buttons need labels or tooltips.
- All charts need table fallback.
- Loading states use skeletons.
- Empty states offer setup actions.
- Destructive actions require confirmation.
- Bulk actions show undo where possible.
- Drag/drop has keyboard alternative or non-drag control.

## Build Packets

### Packet A: Schema And Permissions

- Add staff invite table.
- Extend staff membership capabilities.
- Add performance/lifting tables.
- Add indexes.
- Enable RLS.
- Add helper functions.
- Generate TypeScript types.

### Packet B: Auth And Staff Invites

- Extend complete signup for invite context.
- Add staff invite acceptance route.
- Add strength coach invite preset.
- Add team/program context resolver.
- Add settings staff management.

### Packet C: Strength Groups

- Group list.
- Group builder.
- Dynamic rule preview.
- Group membership actions.
- Player scope visibility.

### Packet D: Exercise Library

- Base exercise seed.
- Exercise editor.
- Substitution groups.
- Video/cue fields.
- Exercise status and duplicate guard.

### Packet E: Program Builder

- Program list.
- Block/week/day editor.
- Section and exercise editor.
- Template save/duplicate.
- Assignment publish flow.

### Packet F: Player Lift Execution

- Player Today integration.
- Lift session page.
- Set logging.
- RPE/readiness/bodyweight.
- Completion summary.

### Packet G: Live Weight Room

- Live board.
- Player drawer.
- Bulk modifications.
- Real-time or polling update layer.
- Coach observed set logging.

### Packet H: Analytics And CoachHelm

- Readiness dashboard.
- Progress charts.
- Compliance table.
- Baseball transfer overlays.
- CoachHelm performance signals.
- Source drawers and limitations.

## Acceptance Criteria

Strength coach:

- Can accept invite and land on Performance Dashboard.
- Can create groups.
- Can create an exercise.
- Can build a two-week program.
- Can assign a lift to pitchers and position players separately.
- Can modify one player's load.
- Can run Live Weight Room mode.
- Can see readiness red flags.
- Can review player lift history.

Player:

- Sees today's lift.
- Completes readiness check-in.
- Logs actual sets.
- Adds RPE and note.
- Sees completion summary.
- Sees lift on calendar.
- Does not see other players' private data.

Head coach:

- Can see all performance summaries.
- Can manage strength coach access.
- Can connect performance signals to practice and availability.
- Can review source-backed CoachHelm recommendations.

System:

- Every lift result has source and player.
- Every assignment has team and date.
- Every readiness item has visibility.
- Every staff action checks capability server-side.
- Every chart has a table fallback.
