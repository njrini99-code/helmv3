# Data Model V2 Overview

## Core rule

Preserve and extend existing `baseball_*` patterns where possible. Do not create a parallel clean-room schema unless live repo verification proves the current model cannot support V2.

## Required model themes

- Canonical player identity
- Team/org membership and capability checks
- Event/task acknowledgement
- Practice object model
- Official stats separated from development metrics
- Performance Lite model
- Wellness/availability privacy model
- Academic conflict import model
- Travel itinerary model
- Import lifecycle with rollback
- AI insights with source refs/confidence/status
- Audit logging


## `baseball_player_external_ids`

**Purpose:** Canonical external identifiers for imports/vendor exports.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| player_id | uuid | required | FK baseball_players(id) |
| source | text | required | vendor/import source |
| external_id | text | required | source-specific id |
| confidence | numeric | optional | 0-1 match confidence |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_player_timeline_events`

**Purpose:** Chronological player story across games/practice/lifts/check-ins/notes/imports/AI.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| player_id | uuid | required | FK baseball_players(id) |
| event_type | text | required | game|practice|lift|wellness|note|import|ai|academic|travel |
| event_at | timestamptz | required | when it happened |
| title | text | required | display title |
| summary | text | optional | short summary |
| source_table | text | optional | source object table |
| source_id | uuid | optional | source object id |
| visibility | text | required | staff_only|player_visible|restricted |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_event_acknowledgements`

**Purpose:** Tracks player/staff acknowledgement of events, tasks, travel, announcements.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| event_id | uuid | required | FK baseball_events(id) |
| user_id | uuid | required | auth user/profile |
| status | text | required | pending|acknowledged|declined |
| acknowledged_at | timestamptz | optional | ack timestamp |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_practices`

**Purpose:** Practice header connected to calendar event.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| event_id | uuid | optional | FK baseball_events(id) |
| title | text | required | practice name |
| focus | text | optional | main focus |
| status | text | required | draft|published|completed |
| published_at | timestamptz | optional | published timestamp |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_practice_blocks`

**Purpose:** Timed practice blocks and stations.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| practice_id | uuid | required | FK baseball_practices(id) |
| start_offset_min | integer | required | offset from practice start |
| duration_min | integer | required | block length |
| activity | text | required | activity/drill |
| location | text | optional | field/cage/bullpen |
| coach_owner_id | uuid | optional | staff owner |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_practice_attendance`

**Purpose:** Attendance/participation by player.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| practice_id | uuid | required | FK baseball_practices(id) |
| player_id | uuid | required | FK baseball_players(id) |
| status | text | required | present|limited|absent|excused |
| reason | text | optional | reason |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_games`

**Purpose:** Game schedule/result source object.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| opponent | text | required | opponent |
| game_at | timestamptz | required | game time |
| venue | text | optional | home/away/site |
| result | text | optional | W/L/T |
| status | text | required | scheduled|final|cancelled |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_game_stats_hitting`

**Purpose:** Official hitting game lines separated from development metrics.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| game_id | uuid | required | FK baseball_games(id) |
| player_id | uuid | required | FK baseball_players(id) |
| pa | integer | optional | plate appearances |
| ab | integer | optional | at bats |
| h | integer | optional | hits |
| doubles | integer | optional | 2B |
| triples | integer | optional | 3B |
| hr | integer | optional | HR |
| bb | integer | optional | walks |
| k | integer | optional | strikeouts |
| rbi | integer | optional | RBI |
| source_import_run_id | uuid | optional | FK import run |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_game_stats_pitching`

**Purpose:** Official pitching game lines separated from development metrics.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| game_id | uuid | required | FK baseball_games(id) |
| player_id | uuid | required | FK baseball_players(id) |
| ip_outs | integer | optional | outs recorded |
| h | integer | optional | hits allowed |
| r | integer | optional | runs |
| er | integer | optional | earned runs |
| bb | integer | optional | walks |
| k | integer | optional | strikeouts |
| pitch_count | integer | optional | pitches |
| source_import_run_id | uuid | optional | FK import run |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_lift_assignments`

**Purpose:** Performance Lite workout assignment.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| player_id | uuid | required | FK baseball_players(id) |
| assigned_date | date | required | date |
| title | text | required | workout title |
| status | text | required | assigned|completed|modified|missed |
| due_at | timestamptz | optional | deadline |
| source | text | optional | manual/import |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_lift_results`

**Purpose:** Imported/manual lift results.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| assignment_id | uuid | required | FK baseball_lift_assignments(id) |
| exercise | text | required | exercise |
| set_no | integer | optional | set number |
| reps | numeric | optional | reps |
| weight | numeric | optional | weight |
| rpe | numeric | optional | RPE |
| completed | boolean | required | completion |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_wellness_checkins`

**Purpose:** Transparent readiness inputs; not medical diagnosis.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| player_id | uuid | required | FK baseball_players(id) |
| checkin_date | date | required | date |
| sleep_quality | integer | optional | 1-5 |
| soreness | integer | optional | 1-5 |
| stress | integer | optional | 1-5 |
| energy | integer | optional | 1-5 |
| notes | text | optional | player note |
| visibility | text | required | staff_restricted default |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_availability_statuses`

**Purpose:** Availability/limitation state with strict visibility.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| player_id | uuid | required | FK baseball_players(id) |
| status | text | required | available|limited|out|unknown |
| reason_code | text | optional | class|soreness|injury|travel|coach |
| start_at | timestamptz | required | start |
| end_at | timestamptz | optional | end |
| visibility | text | required | staff_only|player_visible|restricted |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_class_schedule_blocks`

**Purpose:** Class schedule import and conflict detection.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| player_id | uuid | required | FK baseball_players(id) |
| term | text | required | term |
| course_code | text | optional | course |
| days_of_week | text[] | required | meeting days |
| start_time | time | required | start |
| end_time | time | required | end |
| location | text | optional | building |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_travel_trips`

**Purpose:** Team travel trip header.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| name | text | required | trip name |
| opponent | text | optional | opponent |
| depart_at | timestamptz | optional | departure |
| return_at | timestamptz | optional | return |
| status | text | required | draft|published|completed |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_travel_itinerary_items`

**Purpose:** Travel itinerary items.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| trip_id | uuid | required | FK baseball_travel_trips(id) |
| item_type | text | required | bus|flight|hotel|meal|game|meeting |
| title | text | required | item title |
| starts_at | timestamptz | required | start |
| location | text | optional | where |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_import_runs`

**Purpose:** Import batch lifecycle.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| import_type | text | required | roster|schedule|stats|metrics|lift|wellness|class|travel|prospect|custom |
| filename | text | required | file name |
| status | text | required | uploaded|mapped|validated|committed|rolled_back|failed |
| mapping | jsonb | optional | field mapping |
| created_by | uuid | required | user |
| committed_at | timestamptz | optional | commit time |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_import_rows`

**Purpose:** Row-level import validation/commit state.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| import_run_id | uuid | required | FK baseball_import_runs(id) |
| row_number | integer | required | row number |
| raw_data | jsonb | required | raw row |
| mapped_data | jsonb | optional | mapped row |
| status | text | required | pending|valid|warning|error|committed|skipped |
| target_table | text | optional | created/updated table |
| target_id | uuid | optional | created/updated id |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_import_row_issues`

**Purpose:** Warnings/blockers per import row.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| import_row_id | uuid | required | FK baseball_import_rows(id) |
| severity | text | required | warning|blocking |
| field | text | optional | field |
| message | text | required | issue message |
| resolution | text | optional | user resolution |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_ai_insights`

**Purpose:** Source-cited AI brief/flag/action card.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| insight_type | text | required | daily_brief|flag|summary|recommendation|recap |
| related_player_id | uuid | optional | FK player |
| related_event_id | uuid | optional | FK event |
| title | text | required | title |
| body | text | required | output |
| confidence | text | required | low|medium|high |
| source_refs | jsonb | required | source refs |
| visibility | text | required | staff_only|player_visible|restricted |
| status | text | required | new|reviewed|dismissed|converted_to_task |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.


## `baseball_audit_log`

**Purpose:** Sensitive write and system-action audit.

**Phase:** Phase 1 unless otherwise stated.

| Column | Type | Required | Notes |
|---|---|---|---|
| id | uuid | required | primary key |
| team_id | uuid | required | FK baseball_teams(id) |
| created_at | timestamptz | required | default now() |
| updated_at | timestamptz | optional | trigger updated |
| actor_user_id | uuid | optional | user |
| action | text | required | create|update|delete|import|ai_generate|permission_change |
| object_table | text | required | table |
| object_id | uuid | optional | record |
| before | jsonb | optional | before |
| after | jsonb | optional | after |
| metadata | jsonb | optional | context |

**Foreign keys:** use current `baseball_teams`, `baseball_players`, auth/profile, and source-specific objects.

**Indexes:** `team_id`, important foreign keys, date/time fields, status, and unique source identifiers where applicable.

**Unique constraints:** prevent duplicate player external IDs, duplicate import rows per run/row number, duplicate game-stat line per game/player/source.

**RLS considerations:** team-scoped; player-visible only where `visibility='player_visible'` or direct player ownership permits it; staff roles require capability checks.

**Example row:** include a realistic demo record connected to the seeded demo team.

**Features using it:** Command Center, Player Today, Player Profile/Timeline, Reports, AI.

**Imports feeding it:** depends on object; all imported records should carry import/source references.

**AI modules reading it:** daily brief, weekly staff report, player development brief, risk flags, practice recommendation.

**Reports using it:** staff meeting, player meeting, season review, availability/compliance reports.

**Edge cases:** duplicate players, inactive transfers, partial data, same file imported twice, restricted visibility, rollback.
