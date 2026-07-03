# V10 Advanced Baseball CoachHelm Engine And Integrations

## Purpose

This file defines how Baseball CoachHelm should work once advanced stats, integrations, practice plans, lifting, readiness, video, and classes are all available. The engine must be as deep and useful as GolfHelm's CoachHelm architecture, but baseball-specific from the ground up.

CoachHelm is not a chatbot. CoachHelm is the source-backed decision engine that watches the program, detects meaningful changes, explains evidence, and turns those changes into staff/player actions.

## GolfHelm Architecture To Translate

GolfHelm has useful engine layers:

- ingest providers
- normalized stats cache
- metric registry
- generator classes
- composite rules
- standing/cohort baselines
- counterfactuals
- ranking
- source citations
- effectiveness ledger
- insight delivery
- feedback and lifecycle

BaseballHelm should translate that into:

- source adapters
- canonical baseball facts
- metric registry
- player/position context
- generator classes
- composite rules
- cohort/role baselines
- signal ranking
- source citations
- action outcomes
- practice effectiveness
- insight delivery
- feedback and calibration

## Core Data Flow

1. Source arrives.
2. Import Dossier stores raw file, provider profile, parser output, player matches, warnings, and source confidence.
3. Canonical facts are written:
   - game
   - scrimmage
   - practice
   - pitch
   - plate appearance
   - swing
   - batted ball
   - pitching outing
   - catching workload
   - defensive event
   - baserunning event
   - lift result
   - readiness check-in
   - class/availability conflict
   - video event reference
4. Derived metrics update read models.
5. CoachHelm generators evaluate facts.
6. Composite rules detect cross-domain patterns.
7. Signals are ranked by severity, recency, player importance, confidence, and coach feedback.
8. Signal appears in Command Center, Signals, Player Profile, Practice, Performance, or Import Center.
9. Coach converts signal into action, practice block, player task, staff action, video review, lineup decision, or status change.
10. Outcome ledger tracks whether the action happened and whether later data moved.

## Source Adapter Model

Every adapter should implement a common contract:

- provider_id
- provider_name
- source_type
- supported_file_types
- detection_rules
- parse_raw
- normalize_entities
- match_players
- validate_rows
- preview_changes
- commit
- rollback
- source_confidence
- warnings
- lineage_refs

Adapters should be settings-first. Direct live sync is deferred unless explicitly configured. Import profiles and AutoSync channels are built first.

## Sources And What They Contribute

### GameChanger Official File/Export Pathways

Potential contributions:

- game schedule
- box score
- season stats
- player game logs
- pitch-by-pitch if available through export
- lineup
- opponent
- game status
- score

CoachHelm value:

- postgame action review
- game-vs-practice gap
- player timeline events
- official stat updates
- workload updates
- practice focus suggestions

Storage:

- raw file
- parsed game
- box score batting/pitching
- official stat lines
- source refs
- corrections
- import warnings

### StatCrew, Presto, SIDEARM, NCAA XML

Potential contributions:

- official NCAA-style game/season stats
- play-by-play where available
- game metadata
- opponent
- score
- player identifiers

CoachHelm value:

- reliable official stats
- duplicate/correction detection
- event-linked season aggregates
- program-grade source trust

Storage:

- official stat source profile
- game/event link
- player external IDs
- XML node lineage
- imported stat facts

### TrackMan And Rapsodo

Potential contributions:

- pitch velocity
- spin rate
- spin axis
- movement
- release height/side
- extension
- location
- pitch type
- batted ball EV
- launch angle
- distance
- spray

CoachHelm value:

- pitch design
- command heatmaps
- shape drift
- velocity decay
- EV/LA contact quality
- game-vs-practice sensor gap
- player development proof

Storage:

- pitch events
- batted-ball events
- sensor session
- provider pitch IDs
- event/player link
- raw row reference

### Blast And Diamond Kinetics

Potential contributions:

- bat speed
- attack angle
- time to contact
- rotational acceleration
- connection metrics
- swing plane
- session tags

CoachHelm value:

- swing intent vs contact quality
- cage-to-game translation
- fatigue/quality trends
- hitter-specific practice actions

Storage:

- swing events
- session facts
- player source IDs
- drill/practice block links

### Synergy, 6-4-3, AWRE, Video/Charting Tools

Potential contributions:

- video clips
- tagged events
- opponent/player tendencies
- pitch location/outcome tags
- defensive events
- scouting notes if imported

CoachHelm value:

- video evidence for signals
- opponent context
- hitter/pitcher tendencies
- staff review workflows

Storage:

- video assets
- clip events
- tags
- player/event links
- signal evidence refs

### TeamBuildr

Potential contributions:

- lift assignments
- exercise results
- sets/reps/load
- completion
- RPE

CoachHelm value:

- performance-to-field analysis
- load/readiness risk
- strength coach dashboard
- player lift history

Storage:

- lift plans
- lift assignments
- lift results
- exercise catalog
- source refs

### Teamworks/Class Systems/Google Calendar/ICS

Potential contributions:

- class schedule
- team events
- travel
- availability conflicts
- tasks/announcements in some contexts

CoachHelm value:

- practice conflict detection
- player availability
- staff planning
- player Today screen

Storage:

- class sessions
- conflict events
- source refs
- availability status

### ArmCare/Readiness/Wellness Inputs

Potential contributions:

- arm status
- soreness
- readiness
- recovery
- workload constraints

CoachHelm value:

- pitcher risk flag
- catcher workload flag
- lift/practice adjustment

Storage:

- readiness check-ins
- soreness fields
- workload constraints
- source refs

### OnForm And Generic Video

Potential contributions:

- video clips
- coach annotations
- tagged mechanics

CoachHelm value:

- evidence clip citations
- player development actions
- practice block video capture

Storage:

- videos
- clip ranges
- annotations
- player/event/practice links

## Canonical Metric Registry

CoachHelm should use a registry for all metrics:

- metric_id
- label
- domain
- context
- unit
- direction
- source requirements
- minimum sample
- threshold
- cohort dimensions
- visibility
- generator ownership

Domains:

- hitting
- pitching
- catching
- defense
- baserunning
- practice
- performance
- readiness
- availability
- academics/classes
- video
- operations
- import quality

Example metric IDs:

- hitter_two_strike_chase_rate
- hitter_zone_damage_rate
- hitter_ev_la_quality
- hitter_game_practice_ev_gap
- hitter_breaking_ball_whiff_rate
- pitcher_fastball_velocity_trend
- pitcher_command_miss_rate
- pitcher_two_strike_noncompetitive_miss_rate
- pitcher_pitch_shape_drift
- pitcher_velocity_decay_after_45
- pitcher_rest_days_since_high_intent
- catcher_recent_innings_caught
- catcher_throw_accuracy
- defense_error_cluster_rate
- baserunning_out_rate
- practice_focus_completion_rate
- practice_focus_outcome_movement
- lift_completion_rate
- lift_rpe_spike
- soreness_spike
- class_conflict_count
- video_evidence_coverage
- import_warning_rate

## Generator Families

### Hitter Approach Generator

Detects:

- two-strike chase trend
- breaking-ball chase
- elevated fastball whiff
- early-count passive damage opportunity
- practice EV not translating to game EV
- hard contact direction pattern
- pull-side rollover trend
- strikeout/walk trend

Inputs:

- pitch events
- swing events
- batted-ball events
- official stats
- scrimmage stats
- practice sensor sessions
- video tags

Outputs:

- signal
- player development action
- practice block suggestion
- video review suggestion

Example:

- "Two-strike chase is rising on breaking balls away over the last 28 seen pitches. Source: Rapsodo cage session plus official game pitch chart. Confidence: medium due mixed source coverage."

### Pitch Design Generator

Detects:

- pitch shape overlap
- fastball velocity drift
- spin/movement inconsistency
- release variance
- pitch type with high hard-contact rate
- slider shape flattening
- changeup separation opportunity

Inputs:

- TrackMan/Rapsodo pitch events
- official outcomes
- video
- bullpen vs game context

Outputs:

- pitch design review signal
- bullpen practice block
- video review
- pitching coach action

### Pitch Command Generator

Detects:

- arm-side/glove-side miss pattern
- noncompetitive miss with two strikes
- command decay after workload threshold
- zone-specific damage
- pitch-specific location failure

Inputs:

- pitch location
- target location where available
- count
- outcome
- pitch count sequence
- readiness/workload

Outputs:

- pitching CoachHelm signal
- bullpen command block
- workload action
- game plan note

### Workload And Readiness Generator

Detects:

- high recent pitch volume
- bullpen plus game workload issue
- catcher workload issue
- two-way player stress
- soreness spike
- readiness drop
- heavy lift proximity to high-intent throwing
- bodyweight trend concern

Inputs:

- games
- bullpens
- practices
- lifts
- readiness check-ins
- soreness
- class/travel

Outputs:

- availability signal
- strength staff action
- practice modification
- pitcher/catcher workload review

Boundaries:

- Do not diagnose injuries.
- Use "workload/readiness risk" language, not medical language.
- Require staff approval for any restriction.

### Catcher And Defense Generator

Detects:

- catcher workload accumulation
- passed ball/blocking trend
- throwing accuracy trend
- stolen base vulnerability
- battery pairing with weak sample caveat
- defensive event clusters
- throwing error trend

Inputs:

- game/scrimmage stats
- video tags
- catcher workload
- sensor/throw data where available

Outputs:

- position group practice block
- individual video review
- workload action

### Practice Prescription Generator

Detects:

- signals that should become practice blocks
- available time windows
- staff ownership gaps
- player group conflicts
- workload/readiness restrictions
- upcoming opponent needs

Inputs:

- unresolved CoachHelm signals
- calendar
- roster status
- facilities
- staff assignments
- readiness/workload
- previous practice blocks

Outputs:

- proposed practice blocks
- player groups
- staff owners
- source evidence
- expected measurable outcomes

Boundaries:

- Generates practice prescription, not practice summary.
- Coach edits and approves before publish.
- Does not claim success until later data supports movement.

### Practice Effectiveness Generator

Measures:

- target metric before practice
- who participated
- completion level
- next data window
- movement in practice, scrimmage, or official games
- confidence and sample caveat

Outputs:

- practice effectiveness card
- next action
- continue/adjust/stop recommendation

Boundaries:

- Never claims causality from one practice.
- Uses "associated with", "too early", "not enough sample", or "no detectable movement" honestly.
- Does not generate a narrative practice summary.

### Import Quality Generator

Detects:

- provider mismatch
- duplicate game
- player match conflict
- sudden stat jump
- missing innings/AB/IP
- impossible values
- correction after prior official import
- stale source

Outputs:

- import review signal
- affected players
- safe auto-commit or manual review recommendation

### Video Evidence Generator

Detects:

- signal lacks video evidence
- new clip matches active development focus
- chart point has video link
- player action should include clip

Outputs:

- video evidence rail item
- player/staff review action

## Composite Rules

Composite rules combine multiple signals into higher-value coaching decisions.

Examples:

### Pitcher Command Decay Composite

Inputs:

- velocity drop after pitch 45
- strike percentage drop
- miss distance rise
- soreness/readiness flag
- recent lift load

Output:

- "Command decay after workload threshold" signal with recommended bullpen/practice adjustment.

### Hitter Translation Gap Composite

Inputs:

- high practice EV
- low game hard-hit rate
- high chase in games
- no class/readiness issue
- video evidence available

Output:

- "Practice quality not translating in games" signal with pressure/situational practice prescription.

### Practice Worked But Needs Reinforcement Composite

Inputs:

- practice focus completed
- target metric improved in scrimmage
- official game sample not enough
- player confidence/readiness stable

Output:

- continue practice block, schedule next follow-up, keep signal open.

### Lift-To-Field Risk Composite

Inputs:

- heavy lower-body lift
- low readiness next day
- sprint speed down
- game scheduled tomorrow

Output:

- strength staff action and coach visibility flag.

## Ranking Model

Signals should be ranked by:

- severity
- source confidence
- recency
- role relevance
- player role importance
- proximity to next game/practice
- workload/readiness risk
- unresolved duration
- coach feedback history
- actionability
- sample size

Ranking should demote:

- low confidence
- no action path
- stale source
- duplicate signal
- source-starved claim

Ranking should promote:

- high severity
- upcoming event relevance
- high confidence source
- repeated trend
- measurable next action
- player safety/readiness risk
- import blocking trusted stats

## Output Types

Allowed CoachHelm outputs:

- Daily Brief
- Signal Card
- Source Drawer Explanation
- Import Cleanup Suggestion
- Practice Prescription
- Practice Effectiveness Review
- Postgame Action Review
- Player Development Brief
- Player Action Recommendation
- Staff Action Recommendation
- Lineup/Scrimmage Constraint Warning
- Performance/Readiness Flag
- Video Evidence Card

Removed or superseded outputs:

- generated meeting points
- generated talking points
- meeting summary generation
- practice summary generation
- uncited motivational prose
- generic chatbot answers as the primary product

## Postgame Action Review

Postgame Action Review is allowed. It replaces vague game recap behavior.

It should include:

- imported source status
- key stat deltas
- player timeline updates
- important video evidence
- workload updates
- import warnings
- staff actions
- player actions
- practice focus candidates
- source confidence

It should not be a long narrative recap. It is an action review.

## Staff Decision Room

Staff Decision Room replaces generated meeting points.

It should:

- gather unresolved signals
- group by player/position/source/owner
- allow staff to select agenda items
- show source evidence
- record decisions
- create action items
- assign owners
- link to practice, game, player, video, or import
- track outcomes

It should not:

- generate talking points
- auto-write meeting summaries
- make uncited claims

## What CoachHelm Can Analyze Well

With strong source data, CoachHelm can help with:

- trends over time
- context splits
- game vs practice gaps
- command or contact quality changes
- source quality and import warnings
- player workload signals
- practice focus alignment
- lift/readiness relationships
- video evidence retrieval
- staff action conversion
- sample-size caveats

## What CoachHelm Cannot Honestly Know

CoachHelm should not claim:

- medical diagnosis
- exact cause of injury
- guaranteed causality from one practice
- mental state without explicit staff/player input
- hidden motivation
- exact opponent intent
- sensor accuracy beyond source quality
- direct vendor sync that was not implemented
- private academic details to unauthorized roles

## AI Review Gates

AI outputs should have review gates:

- auto-show low-risk operational flags with source citations
- require staff approval for player-facing messages
- require staff approval for practice plan publication
- require staff approval for sensitive performance/readiness actions
- require staff approval for any action that changes availability
- allow coaches to mark useful, wrong, irrelevant, or resolved

## Data Model Extensions

Minimum extension set:

- `baseball_sources`
- `baseball_source_profiles`
- `baseball_player_external_ids`
- `baseball_import_runs`
- `baseball_import_files`
- `baseball_import_rows`
- `baseball_import_mappings`
- `baseball_import_player_matches`
- `baseball_import_warnings`
- `baseball_fact_sources`
- `baseball_player_timeline_events`
- `baseball_signals`
- `baseball_signal_sources`
- `baseball_staff_actions`
- `baseball_action_outcomes`
- `baseball_ai_output_sources`
- `baseball_practices`
- `baseball_practice_blocks`
- `baseball_practice_block_players`
- `baseball_practice_attendance`
- `baseball_practice_effectiveness_reviews`
- `baseball_video_events`
- `baseball_lift_assignments`
- `baseball_lift_results`
- `baseball_readiness_checkins`
- `baseball_class_sessions`
- `baseball_availability_conflicts`

Optional fact tables if existing stats tables cannot hold source-scoped facts cleanly:

- `baseball_pitch_events`
- `baseball_plate_appearances`
- `baseball_swing_events`
- `baseball_batted_ball_events`
- `baseball_catching_events`
- `baseball_defensive_events`
- `baseball_baserunning_events`

## Engineering Acceptance

CoachHelm is ready when:

- every signal has source refs
- every AI output has confidence and visibility
- every staff action can link back to a signal/source
- practice prescriptions can attach to calendar practices
- practice effectiveness can evaluate later data
- source-starved metrics show insufficient data
- import corrections update signals/timelines without losing raw lineage
- role permissions are enforced server-side
- player-facing data is explicitly filtered
- coach feedback affects ranking over time

