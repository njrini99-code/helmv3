# V2 Data Contracts Expanded

This file defines the minimum implementation contract for Phase 1 schema. Exact SQL should be written only after live Supabase type/schema verification.

## Table Design Principles

- Every team-scoped table includes `team_id`.
- Every imported object includes `source_type`, `source_label`, `import_run_id` when applicable.
- Every player-linked object uses canonical `player_id`; raw imported name is preserved on the import row.
- Sensitive records include `visibility`.
- AI records include source references and disposition.
- Rollback deletes or marks all objects created by an import run.
- Historical facts are not destroyed when a player becomes inactive.

## Required Tables Or Extensions

### `baseball_player_external_ids`

Purpose: match players across CSVs/vendors/manual imports.

Columns:

- `id uuid primary key`
- `team_id uuid not null references baseball_teams(id)`
- `player_id uuid not null references baseball_players(id)`
- `source text not null`
- `external_id text not null`
- `source_display_name text`
- `confidence numeric default 1.0`
- `verified boolean default false`
- `created_by uuid`
- `created_at timestamptz default now()`
- `updated_at timestamptz`

Constraints:

- unique `(team_id, source, external_id)`
- index `(team_id, player_id)`

### `baseball_import_runs`

Purpose: durable import audit and rollback anchor.

Columns:

- `id uuid primary key`
- `team_id uuid not null`
- `import_type text not null`
- `source_label text not null`
- `original_filename text`
- `file_hash text`
- `status text not null check status in ('uploaded','mapped','validated','committed','rolled_back','failed')`
- `row_count integer default 0`
- `valid_row_count integer default 0`
- `warning_count integer default 0`
- `error_count integer default 0`
- `committed_at timestamptz`
- `rolled_back_at timestamptz`
- `created_by uuid not null`
- `created_at timestamptz default now()`

Constraints:

- unique warning on `(team_id, import_type, file_hash)` to detect same-file imports.

### `baseball_import_rows`

Purpose: preserve row-level provenance and validation.

Columns:

- `id uuid primary key`
- `team_id uuid not null`
- `import_run_id uuid not null references baseball_import_runs(id) on delete cascade`
- `row_number integer not null`
- `raw_data jsonb not null`
- `mapped_data jsonb`
- `matched_player_id uuid`
- `match_confidence numeric`
- `status text not null check status in ('pending','valid','warning','error','committed','skipped')`
- `errors jsonb default '[]'::jsonb`
- `warnings jsonb default '[]'::jsonb`
- `created_object_table text`
- `created_object_id uuid`

Constraints:

- unique `(import_run_id, row_number)`
- index `(team_id, matched_player_id)`

### `baseball_player_timeline_events`

Purpose: unified player story.

Columns:

- `id uuid primary key`
- `team_id uuid not null`
- `player_id uuid not null`
- `event_at timestamptz not null`
- `event_type text not null`
- `title text not null`
- `summary text`
- `source_table text`
- `source_id uuid`
- `visibility text not null check visibility in ('staff_only','player_visible','restricted')`
- `importance text check importance in ('low','normal','high','critical')`
- `created_by uuid`
- `created_at timestamptz default now()`

Constraints:

- index `(team_id, player_id, event_at desc)`
- unique nullable source identity `(team_id, player_id, source_table, source_id, event_type)` where source fields are not null.

### `baseball_event_acknowledgements`

Purpose: event/task/travel acknowledgement tracking.

Columns:

- `id uuid primary key`
- `team_id uuid not null`
- `event_id uuid not null`
- `user_id uuid not null`
- `player_id uuid`
- `status text not null check status in ('pending','acknowledged','declined','needs_help')`
- `response_note text`
- `acknowledged_at timestamptz`
- `created_at timestamptz default now()`

Constraints:

- unique `(event_id, user_id)`
- index `(team_id, status)`

### Practice Lite Tables

`baseball_practices`:

- `id`, `team_id`, `event_id`, `title`, `focus`, `status`, `published_at`, `created_by`, timestamps.

`baseball_practice_blocks`:

- `id`, `team_id`, `practice_id`, `sort_order`, `start_offset_min`, `duration_min`, `activity`, `location`, `group_label`, `coach_owner_id`, `visibility`, timestamps.

`baseball_practice_attendance`:

- `id`, `team_id`, `practice_id`, `player_id`, `status`, `limitation`, `reason`, `marked_by`, timestamps.

Required practice statuses:

- `draft`
- `published`
- `completed`
- `cancelled`

Required attendance statuses:

- `present`
- `limited`
- `absent`
- `excused`
- `rehab_only`

### Performance Lite Tables

Use existing tables if present. If not, add:

`baseball_lift_assignments`:

- assigned workout/date/player/group/source/status.

`baseball_lift_results`:

- exercise/result/completion/RPE/source/import row.

`baseball_wellness_checkins`:

- sleep, soreness, energy, stress, throwing_arm_status, notes, visibility.

`baseball_availability_statuses`:

- player/date/status/limitation/source/expires_at.

Important: wellness and availability are not medical diagnosis tables.

### AI Source Contract

Either extend `baseball_coach_insights` or add:

`baseball_ai_insight_sources`:

- `id`
- `team_id`
- `insight_id`
- `source_table`
- `source_id`
- `source_label`
- `source_excerpt`
- `source_generated_at`

AI insight required fields:

- title
- summary
- recommended action
- confidence
- visibility
- status/disposition
- generated_by_model/provider
- generated_at
- expires_at
- created_for_role or created_for_user

## RLS Minimums

- Team staff can read team-scoped operational data if capability allows.
- Players can read their own player-visible records.
- Players cannot read staff-only timeline events, staff AI flags, import rows, or audit logs.
- Academic private records require explicit academic capability.
- Import commit/rollback requires import capability.
- AI insight visibility is enforced in SQL or server action layer, not only UI.

## Migration Sequencing

1. Add tables with RLS disabled only inside migration transaction setup if required.
2. Add indexes and constraints.
3. Enable RLS.
4. Add policies.
5. Add helper functions only if needed and with pinned `search_path`.
6. Revoke unsafe anon grants.
7. Add RLS tests before UI depends on the tables.
8. Regenerate Supabase types.
