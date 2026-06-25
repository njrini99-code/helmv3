# V7 Baseball CoachHelm Practice Effectiveness Engine

This is the next major BaseballHelm advantage: measure whether practice is working.

## Core Question

What did we practice, who practiced it, how well did they complete it, and did related game/scrimmage/practice metrics improve afterward?

Most systems show practice plans or stats. BaseballHelm should connect the two.

## Data Needed

Practice plan data:

- practice event
- time block
- station
- objective
- players assigned
- staff owner
- measurement target
- completion status
- reps/results
- video links

Pre/post data:

- game stats
- scrimmage stats
- practice metrics
- pitch/swing/batted-ball events
- video tags
- CoachHelm signals
- player tasks
- workload/readiness

## Practice Effectiveness Object

Create `baseball_practice_effectiveness_reviews`:

- team_id
- practice_id
- focus_area
- player_ids
- linked_signal_ids
- metric_before
- metric_after
- sample_before
- sample_after
- window_before_days
- window_after_days
- direction
- confidence
- confounders
- conclusion
- recommended_next_action

## Example Measurements

Two-strike chase station:

- before: chase rate with two strikes over last 25 two-strike pitches
- practice: 36 reps, 31 takes/swings graded correct
- after: two-strike chase over next two games/scrimmages
- result: improved, stable, worse, insufficient sample

Catcher blocking station:

- before: block miss rate on down/arm-side pitches
- practice: station completion and misses
- after: game/scrimmage block opportunities in same zone

Pitcher command block:

- before: glove-side miss rate
- practice: bullpen target hit rate
- after: next outing/bullpen command metrics

Baserunning read block:

- before: extra-base opportunity conversion
- practice: situational reps graded
- after: next game/scrimmage baserunning decisions

## CoachHelm Honesty Rules

CoachHelm must say when it cannot know:

- sample too small
- source missing
- no comparable before/after window
- player did not attend practice
- player was limited or sore
- opponent/context changed
- metric not tracked consistently

Allowed language:

- "associated with improvement"
- "early positive signal"
- "not enough sample"
- "practice completion improved but game transfer not shown yet"
- "metric improved in scrimmage but not official games"

Not allowed:

- unsupported causality
- pretending one practice caused a game result
- using mixed official/scrimmage/practice scopes without labels

## CoachHelm Practice Feedback

After each practice block:

- Was it completed?
- Were the right players assigned?
- Did players understand it?
- Was the metric captured?
- Did it produce a follow-up?

CoachHelm can then recommend:

- repeat
- progress
- regress
- move to individual task
- cut from next practice
- add video review
- change station setup

## Practice Effectiveness Dashboard

Charts:

- focus areas practiced by week
- players assigned by focus
- practice completion rate
- metric improvement by focus
- scrimmage transfer
- official game transfer
- stations with highest measured return
- stations with no evidence of transfer

## Why This Is Revolutionary

Programs talk about player development, but few measure the practice-to-performance loop cleanly. BaseballHelm can become the place where coaches see whether their time allocation is actually improving the metrics they care about.

