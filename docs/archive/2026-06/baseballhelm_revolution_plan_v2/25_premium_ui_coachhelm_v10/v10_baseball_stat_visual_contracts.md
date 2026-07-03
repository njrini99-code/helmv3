# V10 Baseball Stat Visual Contracts

## Purpose

This file defines the premium baseball-specific data visuals Claude should build or plan toward. The goal is to stop the app from showing generic stat cards and make every chart answer a coaching question.

Every visual must support:

- source chips
- sample size
- confidence or data-quality status
- game/scrimmage/practice split when relevant
- event/player/position filters
- table fallback
- empty and insufficient-data states
- chart click or row click into source drawer
- role-safe visibility

## Data Contexts

Stats must not be flattened into one bucket. BaseballHelm should preserve these contexts:

- official game
- scrimmage
- practice
- bullpen
- cage
- showcase
- sensor session
- video-tagged event
- lift
- readiness check-in
- class/availability
- manual note

The UI may show blended views only when the chart clearly labels the blend and lets the user separate the contexts.

## Source Confidence Model

Every visual should draw from source-ranked data:

Priority 1:

- official stat/XML/file source linked to game/event
- verified sensor exports
- manually reviewed import rows

Priority 2:

- coach-entered game/scrimmage lines
- manually mapped CSV/XLSX rows
- reviewed video tags

Priority 3:

- unreviewed uploads
- generic parser output
- player-entered or staff-entered development data

Priority 4:

- inferred aggregates
- AI-derived suggestions
- incomplete source rows

Visual rules:

- Do not show Priority 4 data without a visible caveat.
- Never merge official and scrimmage stats without a context filter.
- Every chart point should open the source drawer when feasible.
- CoachHelm can use lower-confidence data only if the signal states the limitation.

## Team Overview Visuals

### Team Performance Pulse

Question:

- Is the team trending up or down, and where?

Inputs:

- official game stats
- scrimmage stats
- practice metrics
- player availability
- readiness
- lift compliance

UI:

- compact strip of category scores:
  - offense
  - pitching
  - defense
  - baserunning
  - readiness
  - practice effectiveness
- each category has trend arrow, sample size, source badge, and click-through.

Chart type:

- standing strip plus trend sparkline.

Acceptance:

- No category displays as a real score unless minimum data threshold is met.
- Category click opens the responsible signal list and evidence.

### Position Group Board

Question:

- Which group needs attention today?

Inputs:

- roster
- position assignments
- official stats
- practice stats
- readiness
- workload
- injuries/limitations where authorized

UI:

- rows by position group:
  - starting pitchers
  - relievers
  - catchers
  - infield
  - outfield
  - two-way
  - bench/depth
- columns:
  - performance trend
  - readiness
  - workload
  - top signal
  - next action

Chart type:

- dense table with bullet charts and status chips.

Acceptance:

- Sort by attention score, not alphabetically.
- "Why attention?" opens source evidence.

## Hitting Visuals

### EV/LA Contact Quality Matrix

Question:

- Is the hitter producing dangerous contact or empty contact?

Inputs:

- exit velocity
- launch angle
- batted ball result
- pitch type
- count
- game/scrimmage/practice context
- source

UI:

- scatter/hexbin matrix with EV on x-axis and launch angle on y-axis.
- points colored by outcome or context.
- density mode for large samples.
- filters for pitch type, count, source, date range, context.

CoachHelm use:

- identifies hard-ground-ball problem
- identifies pop-up problem
- identifies game-vs-practice contact quality gap
- identifies two-strike contact deterioration

Minimum data:

- show scatter at 15 batted balls
- show density/heatbin at 80 batted balls
- show only recent examples below 15 with "not enough for trend"

Table fallback:

- date, event, context, pitch type, EV, LA, result, source, clip link.

### Zone Chase And Damage Heatmap

Question:

- Where is the hitter expanding, and where does damage come from?

Inputs:

- pitch location
- swing/take
- contact
- result
- count
- pitch type
- pitcher handedness
- source

UI:

- strike zone grid with outer chase zones.
- tabs:
  - chase rate
  - whiff rate
  - damage
  - take correctness
  - two-strike chase
- overlay current period vs prior period.

CoachHelm use:

- two-strike chase signal
- breaking-ball chase signal
- elevated fastball miss signal
- early-count passive damage opportunity

Minimum data:

- zone heatmap requires at least 30 pitches seen.
- pitch-type split requires at least 15 pitches by type.

Table fallback:

- zone, pitches, swings, whiffs, chase, hard contact, source coverage.

### Spray Chart

Question:

- Is the hitter using the field, and what outcomes are tied to direction?

Inputs:

- batted ball angle or field location
- outcome
- EV
- LA
- handedness
- pitch type
- context

UI:

- field diagram with plotted balls.
- color by outcome.
- size by EV.
- shape by context.
- filter by pull/center/oppo, ground/line/fly, game/scrimmage/practice.

CoachHelm use:

- pull-heavy rollover problem
- opposite-field success
- air contact trend
- situational approach review

Minimum data:

- 10 batted balls for display.
- 30 for trend claims.

### Approach Count Ladder

Question:

- Does the hitter change approach by count in a useful way?

Inputs:

- count
- pitch type
- swing/take
- whiff
- chase
- hard contact
- result

UI:

- horizontal count rows:
  - 0-0
  - hitter advantage
  - even
  - pitcher advantage
  - two-strike
- columns:
  - swing rate
  - chase
  - whiff
  - hard-hit
  - outcome

Chart type:

- matrix with bullet bars.

CoachHelm use:

- two-strike plan
- first-pitch aggression adjustment
- hitter-count swing decision

### Game Vs Practice Contact Gap

Question:

- Is cage performance translating?

Inputs:

- practice metrics
- scrimmage metrics
- official game metrics
- sensor metrics
- video tags

UI:

- paired bullet charts by metric:
  - EV
  - hard-hit rate
  - chase
  - whiff
  - barrel/contact quality
  - strikeout
  - walk
- confidence chip for sample size.

CoachHelm use:

- pressure or translation gap
- practice design adjustment
- player development action

## Pitching Visuals

### Pitch Shape Map

Question:

- What does the pitcher's arsenal actually look like?

Inputs:

- pitch type
- velocity
- induced vertical break
- horizontal break
- spin rate
- spin axis
- release height/side
- extension
- source

UI:

- movement scatter with horizontal break and vertical break.
- color by pitch type.
- size or label by velocity.
- optional cluster ellipses.
- pitch-type summary rail.

CoachHelm use:

- pitch design opportunities
- pitch separation
- pitch drift by date
- inconsistent shape
- pitch labeling/mapping quality problems

Minimum data:

- 8 pitches for a pitch-type display.
- 25 pitches for shape trend.

Table fallback:

- pitch type, velocity, IVB, HB, spin, axis, release, extension, source.

### Command Heatmap

Question:

- Can the pitcher locate, and where are misses happening?

Inputs:

- intended target when available
- actual pitch location
- pitch type
- count
- batter handedness
- result
- ump/called strike if available

UI:

- zone heatmap for actual locations.
- miss vector overlay when target exists.
- tabs:
  - all pitches
  - fastball
  - offspeed
  - two-strike
  - ahead/behind
  - glove-side miss
  - arm-side miss

CoachHelm use:

- command decay
- glove-side miss pattern
- two-strike non-competitive miss
- fastball arm-side leak
- fatigue/workload overlay

Minimum data:

- 25 pitches for pitcher-level heatmap.
- 15 by pitch type for split.

### Velocity And Command Decay

Question:

- Is performance dropping with workload?

Inputs:

- pitch sequence number
- inning
- pitch count
- velocity
- strike percentage
- location miss
- spin/movement if available
- readiness
- soreness
- recent lift
- rest days

UI:

- line chart by pitch count segment.
- overlay velocity, strike rate, miss rate.
- background bands by inning or pitch-count threshold.
- player readiness/lift overlay markers.

CoachHelm use:

- pull/limit recommendation
- bullpen design
- recovery flag
- two-way workload risk

Minimum data:

- one outing can display.
- three outings needed for trend.

### Pitch Mix And Outcome Board

Question:

- Which pitches are working, and when?

Inputs:

- pitch type
- usage
- strike rate
- whiff
- CSW
- chase
- hard contact
- run/outcome value where modeled
- count
- batter handedness

UI:

- table with pitch types as rows and metric bullets.
- context filters.
- link to video/source events.

CoachHelm use:

- pitch plan suggestions
- usage imbalance
- pitch-type warning
- hitter-facing scouting plan when opponent data exists

### Release Consistency Plot

Question:

- Is the pitcher tipping or losing repeatability?

Inputs:

- release height
- release side
- extension
- pitch type
- date
- inning

UI:

- scatter with cluster ellipses.
- toggle by pitch type.
- timeline strip.

CoachHelm use:

- release drift
- fatigue/command relationship
- pitch design review

## Catching Visuals

### Catcher Workload Board

Question:

- Is catcher workload affecting performance or availability?

Inputs:

- innings caught
- bullpens caught
- throws
- pop time
- caught stealing
- passed balls
- blocks
- receiving metrics if available
- soreness/readiness

UI:

- workload line plus readiness overlay.
- player table by recent load.

CoachHelm use:

- catcher rest recommendation
- bullpen catching allocation
- late-week workload warning

### Battery Performance Matrix

Question:

- Which pitcher/catcher pairs work best?

Inputs:

- pitcher
- catcher
- strike rate
- passed balls/wild pitch
- stolen base attempts
- ERA/FIP proxies if appropriate
- called strikes/framing where available
- game/scrimmage context

UI:

- matrix with pitcher rows and catcher columns.
- cells show sample, result trend, and source confidence.

CoachHelm use:

- game battery suggestions
- bullpen pairing
- catcher development focus

Minimum data:

- show only samples and notes until enough innings.
- never overstate battery causal impact.

## Defense Visuals

### Defensive Event Map

Question:

- Where are defensive problems or strengths happening?

Inputs:

- ball location
- fielder
- play result
- error
- putout/assist
- arm strength if available
- video tag

UI:

- field diagram with event dots.
- filters by position, player, result, context.

CoachHelm use:

- position group practice prescription
- player-specific reps
- video review selection

### Throwing Accuracy And Arm Board

Question:

- Are throws accurate and strong enough for position demands?

Inputs:

- throw velocity
- accuracy tag
- position
- drill/game context
- video

UI:

- bullet chart vs target.
- trend line.
- source examples.

## Baserunning Visuals

### Speed And Decision Board

Question:

- Are speed and decisions helping or hurting?

Inputs:

- 60 time
- home-to-first
- first-to-third
- stolen base attempts
- steals/caught stealing
- baserunning outs
- tags from video/stat crew

UI:

- player ranking table.
- trend bullets.
- decision event list.

CoachHelm use:

- aggressiveness setting
- player action
- practice block prescription

## Performance And Readiness Visuals

### Readiness Heat Strip

Question:

- Who is ready, who is limited, and who needs check-in?

Inputs:

- soreness
- sleep
- energy
- stress
- bodyweight
- subjective readiness
- lift completion
- workload

UI:

- player rows with daily colored cells.
- icons/text for missing, limited, high soreness.
- filter by position group.

CoachHelm use:

- workload risk
- practice adjustment
- lift modification

### Lift Progression Chart

Question:

- Are players progressing without workload warning signs?

Inputs:

- exercise
- target load
- actual load
- reps
- RPE
- completion
- bodyweight
- soreness

UI:

- line chart by exercise.
- set/rep table.
- RPE overlay.
- trend chip.

CoachHelm use:

- deload suggestion
- readiness correlation
- player development note

### Pitcher Workload Overlay

Question:

- Is pitcher workload manageable?

Inputs:

- game pitches
- bullpen pitches
- high-intent throws
- rest days
- lift load
- soreness
- readiness
- velocity trend
- command trend

UI:

- stacked workload bars by day.
- readiness/soreness line.
- velocity/command markers.

CoachHelm use:

- risk flag
- bullpen adjustment
- practice limit

## Practice Effectiveness Visuals

### Practice Focus To Outcome Board

Question:

- Did what we practiced improve later performance?

Inputs:

- practice block target
- participants
- attendance
- drill metric
- scrimmage metrics
- official game metrics
- future time window
- source refs

UI:

- rows by practice focus:
  - focus
  - players
  - date
  - source signal
  - target metric
  - next data window
  - movement
  - confidence
  - next action

Chart type:

- bullet chart plus small trend.

Rules:

- Say "too early" when future data is missing.
- Say "not enough sample" when sample is too small.
- Say "correlated, not proven" when improvement follows practice but causal proof is weak.

### Block Completion And Intensity Board

Question:

- Did practice happen as planned?

Inputs:

- planned blocks
- actual completion
- attendance
- staff notes
- video capture
- station timing

UI:

- planned vs actual timeline.
- attendance chips.
- completion state.
- source-linked action outcomes.

This is completion capture, not practice-summary generation.

## Import And Source Quality Visuals

### Import Diff Viewer

Question:

- What changed because of this import?

Inputs:

- import rows
- existing facts
- corrected facts
- duplicates
- warnings

UI:

- before/after rows.
- grouped by player, game, stat category, warning.
- commit/rollback actions.

### Source Coverage Board

Question:

- Which sources are fresh, stale, or missing?

Inputs:

- source registry
- import runs
- provider profiles
- expected cadence

UI:

- source cards:
  - provider
  - last received
  - last reviewed
  - last success
  - pending warnings
  - mapped players
  - confidence

## Player Snapshot Visuals

### Player DNA Panel

Question:

- What kind of player is this right now?

Inputs:

- position
- role
- hitting/pitching/catching/defense/baserunning metrics
- readiness
- workload
- practice focus

UI:

- compact radar or parallel coordinates plus grouped bar fallback.
- dimensions:
  - contact quality
  - zone discipline
  - power
  - speed
  - defense
  - readiness
  - workload
  - development momentum
- role-specific dimensions for pitcher/catcher/two-way.

Rule:

- Do not use radar as the only precise chart.

### Source-Linked Trend Ribbon

Question:

- What has changed recently?

Inputs:

- latest stats
- video tags
- lifts
- readiness
- practice participation
- actions

UI:

- horizontal ribbon of events and metrics.
- click each point to source drawer or timeline.

## Chart Implementation Rules

Use SVG for small/medium charts:

- line charts below 1,000 points
- bullet charts
- bar charts
- small heatmaps
- tables

Use Canvas for dense charts:

- EV/LA scatter above 500 points
- pitch shape scatter above 500 points
- spray chart above 500 points
- dense zone data above 10,000 cells or high interaction rate

Use aggregation:

- hexbin for dense scatter
- time buckets for long trends
- zone bins for pitch location
- context filters before rendering too much data

Accessibility:

- chart titles and descriptions
- table fallback
- not color-only
- keyboard reachable tooltips or data rows
- visible labels for critical values
- contrast thresholds met
- reduced motion respected

Professional polish:

- no text overflow
- stable chart dimensions
- no jumping layout on filter changes
- skeleton states reserve chart height
- filter chips do not wrap into chaos
- exact values visible on hover/tap and in fallback table

