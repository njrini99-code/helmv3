# V2 Import Template Field Dictionary

Import Center MVP must treat templates as contracts, not suggestions.

## Universal Import Behavior

Every import must support:

- upload
- type selection
- header detection
- column mapping
- required field validation
- player matching
- duplicate detection
- preview
- warnings vs blocking errors
- commit
- rollback
- row audit
- timeline/report/AI update where applicable

Blocking errors:

- missing required date or player identity
- invalid date/time format after mapping
- no team scope
- row would write to a player outside team
- invalid enum after normalization
- duplicate unique object with no overwrite choice

Warnings:

- low-confidence player match
- missing optional metric
- unusual stat value
- duplicate-looking row with different source
- inactive player match
- jersey mismatch

## Template Requirements

### Roster Import

Required:

- first_name
- last_name

Recommended:

- jersey
- positions
- bats
- throws
- class_year
- status
- email
- external_id
- preferred_name
- hometown
- height
- weight

Creates/updates:

- player identity
- team membership
- external ID
- invite/contact state if email exists

### Schedule Import

Required:

- event_type
- date
- start_time

Recommended:

- end_time
- opponent
- location
- home_away
- report_time
- uniform
- bus_time
- notes

Creates/updates:

- baseball events
- game shell if event_type is game
- travel/calendar links if provided

### Game Stats Import

Required:

- game_date
- opponent
- player_name or external_id

Recommended hitting:

- pa, ab, h, 2b, 3b, hr, bb, k, hbp, sf, sh, rbi, r, sb, cs

Recommended pitching:

- ip, bf, h_allowed, r_allowed, er, bb_allowed, k_pitching, pitches, strikes, hbp_allowed

Required behavior:

- source label is mandatory
- official/development classification is mandatory
- same game/player/source should warn or block duplicate

### Pitching Metrics Import

Required:

- date
- player_name or external_id
- source

Recommended:

- pitch_type
- velocity
- spin_rate
- ivb
- hb
- extension
- release_height
- release_side
- strike_pct
- zone_pct
- notes

Creates:

- development metrics
- timeline event if reviewed/important
- AI source candidates

### Hitting Metrics Import

Required:

- date
- player_name or external_id
- source

Recommended:

- exit_velocity
- max_exit_velocity
- launch_angle
- bat_speed
- attack_angle
- hard_hit
- contact_rate
- chase_rate
- notes

### Lift Results Import

Required:

- date
- player_name or external_id
- workout
- completed

Recommended:

- exercise
- set
- reps
- weight
- rpe
- estimated_1rm
- coach_note
- source

### Wellness Import

Required:

- date
- player_name or external_id

Recommended:

- sleep_hours
- sleep_quality
- soreness
- stress
- energy
- throwing_arm_status
- availability_status
- limitation
- notes

Privacy:

- notes default staff_only.
- player-visible summary must be explicit.

### Class Schedule Import

Required:

- term
- player_name or external_id
- course_code
- days
- start_time
- end_time

Recommended:

- course_name
- location
- instructor
- conflict_policy

Creates:

- class schedule
- conflict events against practice/travel/games

### Practice Attendance Import

Required:

- date
- player_name or external_id
- status

Recommended:

- practice_title
- reason
- limitation
- notes

### Travel Itinerary Import

Required:

- trip_name
- item_type
- title
- starts_at

Recommended:

- ends_at
- location
- player_group
- requires_ack
- notes

### Custom Import

Required:

- source
- metric_name
- metric_value

Recommended:

- player_name
- external_id
- date
- unit
- category
- visibility
- notes

Custom import rules:

- must not silently create new core tables
- stores raw mapped metric first
- requires staff review before AI uses it for recommendations
