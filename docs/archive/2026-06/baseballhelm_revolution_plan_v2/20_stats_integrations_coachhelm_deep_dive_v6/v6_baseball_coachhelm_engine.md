# V6 Baseball CoachHelm Engine

Baseball CoachHelm must be as deep as GolfHelm, but it cannot be golf with renamed columns. Baseball is event-sequence heavy, role-specialized, source-fragmented, and staff-collaborative. The engine must reason across official stats, pitch/swing data, video, practice, strength, readiness, classes, and staff actions.

## Engine Philosophy

CoachHelm should not be "AI chat." It should be a baseball decision engine:

- It reads source-linked evidence.
- It detects meaningful patterns.
- It explains what changed.
- It proposes concrete baseball actions.
- It assigns an owner.
- It tracks whether staff acted.
- It measures whether the action helped.

Every insight must include:

- insight type
- player/team scope
- source object refs
- evidence rows
- confidence
- sample size
- time window
- recommended action
- owner role
- visibility
- lifecycle state
- coach status
- created_at
- stale/recompute logic

## Baseball CoachHelm Tables

Use golf patterns as architecture inspiration:

- `baseball_coach_insights` should be expanded for source refs, engine version, signature, confidence, lifecycle, status, visibility, action/outcome.
- Add `baseball_insight_exposure`, `baseball_insight_action`, `baseball_insight_outcome` mirroring the golf event ledger pattern.
- Add `baseball_patterns_v2` or equivalent for reusable detected patterns.
- Add `baseball_player_insights` only if player-facing insight lifecycle needs to differ from coach-facing insight lifecycle.
- Add `baseball_coach_philosophy` thresholds for alert sensitivity by role/program type.

Required lifecycle model:

- tentative: engine sees pattern but insufficient maturity
- detected: visible to staff
- matured: repeated/validated pattern
- addressed: staff action taken
- resolved: outcome improved or coach resolved
- archived: stale/retracted

Coach status:

- active
- acknowledged
- dismissed
- resolved

Do not collapse lifecycle and coach status. GolfHelm already learned this lesson.

## Engine Modules

### Feature Extraction

Extract:

- batting features
- plate discipline features
- contact features
- pitch-level hitting features
- pitcher command/stuff features
- workload/readiness features
- catcher features
- defense features
- baserunning features
- practice response features
- lift response features
- class/availability features
- video evidence features
- staff action features

### Baseline Registry

Baselines by:

- player
- team
- position group
- class year
- program type
- season phase
- source type
- level: high school, JUCO, college, showcase

Never compare a freshman catcher with three TrackMan sessions to a senior DH with 220 game PAs without displaying sample and context.

### Pattern Generators

Hitting generators:

- Chase spike after two strikes
- Fastball damage gap
- Breaking-ball chase risk
- Pull-side rollover trend
- Oppo hard-contact improvement
- Game EV vs cage EV gap
- Attack angle drift
- Zone contact decline
- High-velocity readiness
- First-pitch take problem
- RISP approach gap
- Quality-at-bat trend

Pitching generators:

- Velocity decay by inning/session
- Spin/movement shape drift
- Fastball command quadrant miss
- Breaking ball chase rate trend
- Changeup separation gap
- Two-strike putaway problem
- First-pitch strike trend
- Walk risk under fatigue
- Pitch mix predictability
- Hitter-handedness split
- Bullpen-to-game transfer gap
- Workload spike

Catching generators:

- Block miss cluster by pitch/location
- Pop time trend
- Run game risk
- Receiving/framing opportunity if source exists
- Pitcher-catcher pairing performance
- High-leverage passed ball/wild pitch concentration

Defense generators:

- Error cluster by position/type
- Routine play reliability
- Throwing accuracy trend
- Outfield assist opportunity
- Team defense communication gap
- Bunt/PFP execution issue

Baserunning generators:

- Extra-base opportunity missed
- Caught stealing decision risk
- Dirt ball read improvement
- First-to-third aggressiveness
- Outs-on-bases risk

Strength/readiness generators:

- Lift compliance drop
- High soreness before game/practice
- Lower-body fatigue vs sprint/defensive performance
- Arm soreness vs pitch velocity/command
- Two-way workload risk
- Catcher workload risk
- Undertraining flag
- Recovery gap after travel

Class/operations generators:

- Class conflict affecting practice block
- Travel departure risk
- Academic risk trend
- Missing acknowledgement risk
- Stale roster/profile/source data
- Player not seeing assigned tasks/videos

### Causal and Counterfactual Layer

The engine should not overclaim causality. It should say:

- "associated with"
- "coincided with"
- "likely contributor"
- "needs review"
- "insufficient sample"

Counterfactual examples:

- If chase rate returns to player baseline, projected OBP improves by X based on current PA volume.
- If first-pitch strike rate improves to team target, walk risk decreases in recent pattern.
- If lower-body lift moved 24 hours earlier, pitcher readiness conflict disappears for Friday.
- If catcher throws are limited after high workload, readiness risk improves.

### Practice Prescription Engine

Every CoachHelm insight should be convertible to:

- practice block
- station
- drill prescription
- player task
- video review task
- lift modification
- meeting topic

Practice prescription fields:

- objective
- players
- station type
- duration
- staff owner
- setup/equipment
- rep target
- measurement method
- success criteria
- linked insight
- follow-up metric

Examples:

- "Two-strike chase reset": 12-minute machine/live recognition station for three hitters; success = chase under 25% in station.
- "Fastball up damage": high-velocity machine up-zone station; success = 70% competitive swings, 6 hard contacts.
- "Slider chase bullpen": pitcher/catcher pitch design block; success = chase zone target and miss distance.
- "Catcher block down-and-arm-side": receiving/blocking station; success = 90% block control in tagged zone.

### Postgame Action Review

After every official stat import:

1. Summarize game outcome.
2. Detect who changed status.
3. Identify source-backed player signals.
4. Create player timeline events.
5. Create staff meeting agenda.
6. Suggest practice focus.
7. Suggest player tasks.
8. Identify missing video evidence.
9. Mark insights that need coach review.
10. Track action outcomes after next game/practice.

### Player Passport Engine

For high school/showcase/college recruiting surfaces:

- Verified measurables
- Source labels
- Video clips
- Game/practice trends
- Coach-approved summaries
- Academic visibility controls
- Scout/share links
- Showcase event packets

The engine should distinguish "verified by staff/vendor" from "player-entered."

### Staff Decision Ledger/Staff Action Engine

Build a meeting packet from:

- new signals
- unresolved signals
- player availability
- class conflicts
- lift/readiness flags
- postgame items
- practice plan
- import problems
- player tasks overdue
- video review queue

Meeting actions should write to tasks, plans, practice, lift modifications, player messages, or timeline.

## Baseball CoachHelm Surfaces

Coach Command Center:

- What changed since last login
- Who needs attention
- Today's practice/lift/class/travel conflicts
- Source trust warnings
- Staff action queue

Player Profile:

- source-backed timeline
- performance trends
- practice/lift/class availability
- approved insights
- video evidence

Stats Center:

- official stats with source drawer
- development metrics
- import history
- CoachHelm patterns

Practice Planner:

- recommended blocks from insights
- station rosters
- measurement criteria
- post-practice completion capture

Performance:

- lift compliance
- readiness
- workload
- baseball impact

Staff Meeting:

- agenda generated from evidence
- action conversion
- outcome tracking

## Minimum V6 Engine Implementation For One-Shot

If the full engine cannot be coded in one session, build this:

- Source-backed insight table extensions.
- Baseball insight event ledger.
- Generator registry skeleton.
- At least six high-value generators:
  - hitter two-strike chase
  - hitter game-vs-practice contact quality gap
  - pitcher velocity/command decay
  - pitcher workload/readiness risk
  - class/lift/practice conflict
  - postgame-to-practice focus
- Insight visibility helper.
- Source drawer UI.
- Convert-to-action buttons.
- Action/outcome tracking.
