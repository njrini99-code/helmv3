# Tables To Avoid


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
| created_at | timestamptz | required | default now(
