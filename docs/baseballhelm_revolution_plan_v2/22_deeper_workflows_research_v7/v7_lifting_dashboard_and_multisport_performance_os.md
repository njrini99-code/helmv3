# V7 Lifting Dashboard and Future Multi-Sport Performance OS

The lifting system should start baseball-specific but be architected so it can later support other sports. This means the exercise/workout/readiness core should be generic, while baseball-specific workload and CoachHelm logic sits on top.

## Strength Coach Dashboard

Primary sections:

- Today's lift groups
- Readiness alerts
- Missed/modified lifts
- Player soreness map
- Bodyweight trends
- Exercise load progress
- Pitcher/two-way/catcher workload flags
- Upcoming game/practice conflicts
- Players needing coach review
- Lift compliance by group

## Preset Lifts

Create lift templates:

- In-season maintenance
- Preseason strength
- Recovery day
- Lower-body power
- Upper-body maintenance
- Pitcher post-outing recovery
- Pitcher pre-start primer
- Catcher recovery
- Speed/agility
- Showcase testing prep
- Return-to-throw support

Each template includes:

- exercise list
- sets/reps
- load prescription
- RPE/RIR
- rest
- notes
- video/demo link optional
- modification rules

## Player Lift Tracking

Players track:

- completion
- load used
- reps completed
- RPE/RIR
- missed sets
- modification reason
- soreness/pain
- bodyweight
- notes

The system tracks over time:

- exercise max or estimated max
- working weight trend
- bodyweight trend
- compliance
- soreness trend
- readiness trend

## Exercise History

For every exercise:

- player history
- best set
- last used weight
- estimated max
- trend
- coach notes
- injury/soreness flags
- relation to baseball workload

When a coach assigns an exercise, BaseballHelm should suggest last used load and recommended progression.

## Soreness and Check-Ins

Daily check-in:

- sleep hours
- sleep quality
- energy
- stress
- total soreness
- shoulder soreness
- elbow soreness
- lower-body soreness
- back soreness
- illness flag
- throwing readiness
- lifting readiness
- notes

Baseball rules:

- shoulder/elbow soreness affects throwing/pitcher/catcher flags
- lower-body soreness affects sprint/defense/lift/practice flags
- high fatigue before game creates staff signal

## Multi-Sport Architecture

Generic tables:

- performance_athletes
- performance_teams
- performance_workout_templates
- performance_sessions
- performance_assignments
- performance_results
- performance_checkins
- performance_exercises
- performance_bodyweight

Sport-specific overlay:

- baseball_workload_events
- baseball_pitcher_readiness
- baseball_catcher_readiness
- baseball_two_way_workload
- baseball_practice_effectiveness

This allows future sports without duplicating the strength engine.

## Charts and Visuals

Strength coach should see:

- bodyweight over time
- exercise load over time
- readiness heatmap
- soreness heatmap
- compliance by week
- lift volume by player
- workload vs readiness
- missed/modified lift reasons
- group comparison

Player should see:

- today's lift
- last used weights
- bodyweight trend
- personal bests
- readiness trend
- next assignment

## CoachHelm Performance Intelligence

CoachHelm can analyze:

- lift compliance vs game readiness
- bodyweight change vs performance
- soreness spikes vs workload
- heavy lower-body lift proximity to games
- pitcher post-outing recovery adherence
- two-way overload
- catcher fatigue
- undertraining risk
- exercise progression stalls

CoachHelm cannot honestly claim:

- a lift caused a batting slump without more evidence
- soreness caused a poor outing without workload/context support
- bodyweight caused performance changes without sample/context

Instead, it should produce cautious, actionable statements:

- "Readiness and lower-body soreness have been worse after heavy lower-body lifts within 24 hours of games. Consider moving that template earlier."
- "Player has missed 3 of last 5 lift assignments and bodyweight is down 4 lbs. Review nutrition/recovery."
- "Two-way workload is elevated this week. Modify lift volume and practice throwing volume."

