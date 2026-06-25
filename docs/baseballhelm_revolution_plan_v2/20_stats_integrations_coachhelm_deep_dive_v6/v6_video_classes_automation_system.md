# V6 Video, Classes, and Automation System

BaseballHelm becomes revolutionary when it stops treating video, classes, lift schedules, and stats as separate screens. The product should automate staff coordination from the data already flowing through the program.

## Video Automation

### Video Objects

Every video object should support:

- source: uploaded, phone, Synergy, AWRE, OnForm, external URL
- owner: team, staff member, player
- visibility
- players tagged
- game/practice/session linkage
- clip start/end
- tags
- transcript/annotation where available
- source confidence
- linked stat event
- linked CoachHelm insight
- linked task/dev plan

### Automated Video Workflows

Postgame:

- import box score or play-by-play
- detect players with notable events
- request or attach clips for those events
- create postgame action review
- generate staff meeting topics
- create player-specific video tasks

Pitching:

- pitch-level import detects velocity/spin/command decay
- system suggests relevant clips by inning/pitch type
- pitching coach reviews and approves
- player receives one or two approved clips with precise task
- next bullpen plan includes adjustment

Hitting:

- swing sensor or TrackMan/Rapsodo data detects attack angle/contact trend
- system links recent cage/game clips
- hitting coach labels mechanical or approach cause
- CoachHelm turns it into practice station prescription

Catching/defense:

- passed ball/stolen base/blocking miss/throwing event creates clip request
- catcher coach reviews clip
- system adds receiving/blocking/throwing work to practice plan

Strength:

- lift technique clip can be tied to exercise assignment
- strength coach marks technique pass/fail
- baseball staff sees only readiness/action summary unless granted

Recruiting/showcase:

- approved clips become player passport assets
- public/scout links show only approved videos and verified measurements

### Video UI Requirements

- Player video library by source, tag, event, and date.
- Coach film queue: needs review, player requested feedback, insight evidence missing, postgame clips, practice clips.
- Clip drawer on every stat/insight where video evidence exists.
- Convert clip to task.
- Convert clip to dev plan item.
- Add clip to meeting agenda.
- Mark clip as reviewed by player.

## Classes and Calendar Automation

Current class records are strong enough to automate real operations. BaseballHelm should become the place staff sees who is actually available.

### Class Data Sources

- manual class entry
- CSV/XLSX upload
- Teamworks Academics export/API later
- registrar export if provided
- player-submitted schedule requiring staff approval

### Class Conflict Engine

Inputs:

- player classes
- team calendar events
- lift sessions
- travel
- practices
- games
- study hall
- medical/training appointments if later added

Outputs:

- player conflict list
- team availability heatmap
- practice group constraints
- lift window recommendations
- travel departure exceptions
- academic risk flags
- player daily schedule
- staff tasks

Severity:

- hard conflict: class overlaps mandatory event/lift/practice/game/travel departure
- soft conflict: back-to-back location/travel issue
- watch: high credit load + travel + low compliance
- informational: player unavailable for optional station

### Automation Examples

Game day:

- Class runs until 2:15.
- Bus leaves at 2:20.
- Player has catcher role and cannot be late.
- BaseballHelm flags ops + academic viewer, creates travel letter task, and shows coach a contingency.

Practice planning:

- Six pitchers unavailable 2:00-3:00.
- System suggests bullpen block after 3:20 and moves position-player defense earlier.

Lift planning:

- Strength coach schedules lower-body lift.
- System warns two projected weekend starters have high throwing load and short recovery.

Player Today:

- Player sees class, lift, treatment/recovery task, report time, practice, meal/travel notes, and one development action.

## Baseball Automation Graph

Use this graph for system behavior:

source data -> normalized event -> signal -> staff review -> action -> timeline -> follow-up measurement

Examples:

- TrackMan bullpen -> command decay signal -> pitching coach review -> bullpen task -> next bullpen measurement
- GameChanger box score -> two-strike chase signal -> hitting station -> player task -> next game PA trend
- Class CSV -> travel conflict -> ops task -> player notification -> acknowledgement
- Lift result -> lower-body fatigue -> practice modification -> availability note -> performance outcome
- Synergy clip -> defensive positioning mistake -> team defense block -> player meeting note -> corrected future event

## Automation Should Create Actions, Not Noise

A signal is allowed to notify staff only if:

- it has a source
- it has a confidence
- it has an owner
- it recommends a next action
- it can be snoozed, dismissed, converted, or marked resolved

Default action types:

- create player task
- add practice block
- add lift modification
- add meeting agenda item
- request video clip
- request manual review
- message player
- update availability
- add dev plan item
- mark stat source stale

