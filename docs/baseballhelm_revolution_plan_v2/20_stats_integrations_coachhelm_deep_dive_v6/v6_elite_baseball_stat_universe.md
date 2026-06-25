# V6 Elite Baseball Stat Universe

BaseballHelm needs to keep every stat an elite high school, college, JUCO, or showcase program would reasonably use, but it should not treat every stat as equally trustworthy or equally actionable. Official stats, development metrics, sensor data, video tags, practice observations, strength metrics, wellness checks, and academic availability all belong in the system with source labels and appropriate visibility.

## Stat Taxonomy

Every metric belongs to one of these top-level domains:

- Official game stats: box score, play-by-play, season totals, conference/NCAA reporting.
- Advanced game stats: rate stats, run value, leverage, splits, quality of contact, pitch value.
- Player development metrics: practice, bullpen, cage, machine, pitch design, defensive work.
- Tracking technology metrics: TrackMan, Rapsodo, Yakkertech, HitTrax, Blast, Diamond Kinetics, Pocket Radar.
- Video metrics and tags: Synergy/AWRE/OnForm/coach-tagged clips.
- Strength and readiness metrics: lifts, jumps, sprints, bodyweight, wellness, soreness, fatigue, arm care.
- Workload metrics: pitches, throws, high-intent throws, bullpens, outings, short/long toss, recovery.
- Academic/classes metrics: class schedule conflicts, eligibility, credit progress, study hall, missed class risk.
- Recruiting/showcase metrics: verified measurables, videos, scout notes, event results, contact activity.
- Staff operations metrics: attendance, task completion, acknowledgement rate, response time, meeting action completion.

## Official Batting Stats

Store raw totals by game, season, split, and career:

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
- runs batted in
- walks
- intentional walks
- strikeouts
- hit by pitch
- sacrifice bunts
- sacrifice flies
- ground into double play
- reached on error
- catcher interference reached
- left on base
- stolen bases
- caught stealing
- pickoffs
- batting order position
- defensive position started
- pinch hit appearances
- pinch hit hits
- pinch run appearances
- two-out RBIs
- runners advanced
- productive outs

Store calculated rates:

- batting average
- on-base percentage
- slugging percentage
- OPS
- isolated power
- walk rate
- strikeout rate
- walk-to-strikeout ratio
- extra-base hit rate
- stolen base success rate
- runs created estimate
- weighted on-base estimate if inputs exist
- ground-ball/fly-ball/line-drive rates if batted-ball data exists
- hard-hit rate if exit velocity exists
- quality-at-bat rate if program defines QAB rules

## Plate Appearance and Pitch-Level Hitting Stats

If source data supports play-by-play or pitch-level import, store every plate appearance:

- game, inning, top/bottom, outs, base state, score differential
- batter, pitcher, catcher, defensive alignment if known
- lineup slot
- pitch count before PA
- PA result
- RBI/resulting runs
- leverage bucket
- pitch sequence
- terminal pitch type/location/velocity
- batted-ball type/location/exit speed/launch angle/distance
- video clip reference

Store pitch-by-pitch hitter events:

- pitch number in PA
- pitch type
- velocity
- spin rate
- induced vertical break
- horizontal break
- extension
- release height/side
- plate height/side
- zone
- called ball/strike
- swing/take
- whiff/foul/in play
- chase
- zone swing
- early/middle/late count
- two-strike chase
- damage count
- swing decision score
- contact quality
- expected result if batted-ball model exists

Derived hitter development metrics:

- chase rate
- zone swing rate
- zone contact rate
- overall contact rate
- whiff rate
- called strike plus whiff rate against
- first-pitch swing rate
- first-pitch strike take rate
- two-strike approach score
- fastball performance
- breaking ball performance
- offspeed performance
- inside/outside/up/down performance
- left/right pitcher split
- ahead/even/behind count split
- runners in scoring position split
- leverage split
- pull/center/oppo distribution
- damage by zone
- contact quality by pitch type

## Batted-Ball and Contact Quality Stats

Store per batted ball:

- exit velocity
- max exit velocity
- average exit velocity
- top 10% exit velocity
- launch angle
- spray angle
- distance
- hang time
- batted-ball type: ground ball, line drive, fly ball, popup
- field zone
- barrel flag if model exists
- sweet spot flag if model exists
- hard-hit flag
- opposite-field hard-hit flag
- pulled ground-ball flag
- infield fly flag
- video clip

Derived metrics:

- hard-hit rate
- barrel rate
- sweet spot rate
- ground-ball rate
- line-drive rate
- fly-ball rate
- popup rate
- pull rate
- center rate
- opposite rate
- average launch angle by pitch type
- damage contact percentage
- mishit percentage
- top-end EV trend
- playable power index
- bat speed to EV conversion if swing sensor data exists

## Swing Sensor Stats

Support Blast Motion and Diamond Kinetics style metrics as development inputs, not official game stats:

- bat speed
- attack angle
- vertical bat angle
- on-plane efficiency
- time to contact
- rotational acceleration
- connection score
- early connection
- connection at impact
- peak hand speed
- power score
- swing quality score
- max barrel speed
- max acceleration
- impact momentum
- approach angle
- swing path tilt
- contact point
- swing handedness
- bat model/length/weight if captured
- drill context
- pitch source: tee, front toss, machine, live, game
- video clip

Derived swing insights:

- game swing vs cage swing gap
- attack angle consistency
- bat speed fatigue trend within session
- contact point drift
- on-plane efficiency under higher velocity
- high-velo timing readiness
- pitch-type-specific swing response
- mechanical risk requiring video review

## Official Pitching Stats

Store raw official totals:

- appearances
- games started
- games finished
- wins
- losses
- saves
- holds
- blown saves
- complete games
- shutouts
- innings pitched using outs as canonical unit
- batters faced
- hits allowed
- runs allowed
- earned runs
- walks
- intentional walks
- strikeouts
- hit batters
- wild pitches
- balks
- home runs allowed
- doubles/triples allowed
- sacrifice bunts/flied allowed
- ground into double plays induced
- pickoffs
- inherited runners
- inherited runners scored
- first-pitch strikes
- pitches
- strikes

Calculated pitching rates:

- ERA
- WHIP
- opponent batting average
- strike percentage
- first-pitch strike percentage
- K/9
- BB/9
- K/BB
- HR/9
- hits per nine
- runners stranded percentage
- inherited runners scored percentage
- ground-ball rate
- strikeout rate
- walk rate
- chase rate if pitch-level exists
- whiff rate if pitch-level exists
- CSW percentage if pitch-level exists

## Pitch Design and Pitch-Level Pitching Stats

Store every tracked pitch when available:

- pitcher, catcher, batter
- game/session/bullpen
- pitch type as thrown and pitch type as classified
- pitch call/result
- velocity
- spin rate
- spin direction/axis
- gyro degree if available
- spin efficiency if available
- seam orientation if available
- induced vertical break
- horizontal break
- total break
- vertical/horizontal approach angle
- release speed
- release height
- release side
- extension
- plate height
- plate side
- zone
- location intent
- missed target distance
- arm slot
- tempo/pitch timer if tracked
- video clip

Derived pitching insights:

- fastball shape consistency
- breaking ball chase quality
- changeup separation from fastball
- pitch tunneling windows
- command by quadrant
- miss pattern by pitch
- velocity trend by inning/out count/session
- fatigue flags by velocity/spin/command decay
- two-strike putaway rate
- first-pitch strike rate
- ahead-count execution
- waste pitch rate
- pitch mix effectiveness
- batter handedness split
- catcher target execution

## Catching Stats

Official and advanced catching should be first-class:

- innings caught
- putouts
- assists
- errors
- passed balls
- wild pitches while catching
- stolen bases allowed
- caught stealing
- pickoffs
- catcher interference
- catcher ERA as optional context, not standalone truth
- pop time
- exchange time
- throw velocity
- throw accuracy
- block opportunities
- blocks made
- blocks missed
- framing opportunities if source supports
- called strikes above expected if model/source exists
- pitcher preference/comfort notes
- game-calling tags

Derived catcher development:

- run game control index
- receiving reliability
- blocking reliability by pitch type/location
- staff handling score
- pitcher-catcher pairing effectiveness
- high-leverage receiving performance
- bullpen receiving workload

## Fielding and Defensive Stats

Official:

- games by position
- starts by position
- innings by position
- putouts
- assists
- errors
- fielding percentage
- double plays
- triple plays
- passed balls for catchers
- pickoff assists
- outfield assists

Advanced/program-defined:

- chances by position
- routine play conversion
- difficult play conversion
- first step grade
- route efficiency if tracked
- arm strength
- arm accuracy
- transfer time
- infield exchange time
- outfield throw carry
- defensive range notes
- cut/relay execution
- bunt defense execution
- PFP execution
- communication misses
- alignment compliance
- video-tagged defensive reps

## Baserunning Stats

Official:

- stolen bases
- caught stealing
- pickoffs
- runs
- extra bases taken
- outs on bases

Advanced/program-defined:

- lead size
- secondary lead quality
- jump time
- home-to-first
- first-to-third
- second-to-home
- dirt ball reads
- tag-up decisions
- first move reads
- steal attempt decision quality
- advancement opportunity conversion
- sprint speed if tracked
- turn efficiency
- baserunning IQ tags
- video evidence

## Practice and Development Stats

Every practice metric needs station, coach, drill, intent, and rep context:

- practice ID
- station ID
- drill ID
- player group
- staff owner
- rep number
- rep outcome
- quality grade
- coach note
- video clip
- sensor source
- athlete self-score
- completion status

Hitting practice:

- tee/front toss/machine/live reps
- pitch velocity bucket
- pitch type bucket
- zone bucket
- swing/take
- contact result
- exit velocity
- launch angle
- spray
- QAB grade
- approach tag
- mechanical tag
- fatigue marker

Pitching practice:

- bullpen count
- high-intent count
- pitch mix
- location intent
- target hit/miss
- miss distance
- velocity
- spin/break
- RPE
- catcher feedback
- pitch design objective
- recovery assignment

Defense practice:

- ground-ball reps
- fly-ball reps
- throwing reps
- bunt/PFP/relay/team defense reps
- execution grade
- communication grade
- footwork tag
- error type
- video clip

## Strength, Lifting, and Performance Stats

The lifting coach system must keep enough data to compete with TeamBuildr-like expectations without becoming a full separate S&C company in Phase 1.

Exercise/session:

- workout assignment
- phase/block/week/day
- exercise
- sets/reps/load
- prescribed intensity
- actual intensity
- RPE/RIR
- velocity if VBT exists
- completion percentage
- missed/modified reason
- coach adjustment
- soreness/pain flag
- video technique clip

Performance testing:

- bodyweight
- jump height
- broad jump
- 10-yard sprint
- 30/60-yard sprint
- pro agility
- med ball throw
- grip strength
- shoulder internal/external rotation strength
- range of motion
- arm care readiness
- peak force/power if force plate exists
- asymmetry

Baseball-specific readiness:

- pitcher readiness
- position-player throwing readiness
- catcher workload readiness
- lower-body fatigue
- shoulder/elbow soreness
- hamstring/groin soreness
- sleep
- hydration
- stress
- illness
- travel fatigue
- class/life load

Derived performance insights:

- lift compliance to performance trend
- heavy lower-body day vs sprint/throw readiness
- bullpen day vs lift prescription conflict
- catcher workload vs recovery
- two-way player overload
- undertraining and detraining flags
- ACWR-style workload trend where appropriate
- return-to-throw progression adherence

## Classes, Academics, and Availability Stats

Class data becomes operational data:

- class schedule by day/time
- credit load
- class location
- professor/instructor
- required attendance flag
- lab/exam dates
- study hall assignments
- eligibility status
- GPA/credits thresholds
- academic standing
- missed class count if tracked
- travel letters/documents sent
- conflict with practice/lift/travel

Derived operations:

- available practice window
- available lift window
- player daily calendar
- conflict severity
- academic risk flag
- travel departure exception
- staff task for academic support
- team-wide class conflict heatmap

## Video-Derived Stats and Tags

Video should be an evidence layer:

- clip type: swing, pitch, catch, defense, baserun, lift, meeting, opponent scouting
- source: uploaded, Synergy, AWRE, OnForm, phone, YouTube/Vimeo/private link
- player(s)
- event/game/session
- start/end timestamp
- tags
- outcome
- coach annotation
- player response
- linked insight
- linked task
- linked dev plan

Video tag families:

- hitting mechanics
- pitch recognition
- swing decision
- pitch shape
- command miss
- receiving/blocking/throwing
- defensive footwork
- throwing mechanics
- baserunning read
- lift technique
- opponent scouting

## Team and Staff Operations Metrics

BaseballHelm should measure whether the program is operating:

- announcement acknowledgement rate
- task completion rate
- player check-in compliance
- practice attendance
- lift attendance
- video review completion
- postPostgame Action Review completion
- import processing time
- unresolved player matching count
- stale stat sources
- staff meeting action completion
- player meeting completion
- roster profile completeness
- recruiting/showcase packet completeness

## Visibility Rules

Not every stat is visible to every role.

- Players see their own performance, tasks, schedule, approved insights, approved video, and non-sensitive development plans.
- Coaches see team/player performance, staff notes by role, stats sources, and actions.
- Strength staff see lifting/readiness/performance metrics plus practice/game context needed for training decisions.
- Academic viewers see classes/eligibility and approved schedule context, not private baseball notes.
- Guardians in high school see schedule, announcements, approved player items, and safe academic/admin fields only.
- Showcase/scout viewers see only public/approved profile, verified measurables, approved video, and event stats.
- AI outputs inherit the strictest visibility of any source used.

