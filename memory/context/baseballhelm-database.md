# BaseballHelm Database Schema — Complete Reference

> Source: `supabase/migrations/*.sql` (repo, mined 2026-06-30) — NOT a live DB query.
> Anchor migration: `supabase/migrations/20260527000000_prod_public_baseline.sql` (~22,200-line
> prod schema dump; 47 `baseball_*` tables). All other `baseball_*`/`helm_lifting_*` tables were
> added by dated migrations under `supabase/migrations/` from `20260528*` through `20260630*`.
> Cross-checked against generated types in `src/lib/types/database.ts`.
>
> Total `baseball_*` tables confirmed via migrations: **119** (118 present in the current
> `src/lib/types/database.ts`; `baseball_demo_sessions` — added 2026-06-30 — is not yet in
> generated types; see Gotcha G7). A parallel, sport-agnostic **`helm_lifting_*`** family
> (40 tables) also exists — see Gotcha G1, it is NOT a baseball-prefixed rename, it's a second
> live system.
>
> Per `docs/audits/BASEBALLHELM_PRODUCTION_VERDICT.md` (2026-06-25), prod already had "118
> baseball + 26 lifting tables" applied via an out-of-band session **before** the file-list
> above was reconciled — i.e. the migrations directory and the actual applied state have
> disagreed at least once already this cycle. Treat "the migration exists in this repo" as
> **necessary, not sufficient**, evidence that a table/policy/function is live in prod. See
> Gotcha G8.
>
> For golf's mirror doc (same format) see `memory/context/golfhelm-database.md`.
> For table-name/enum quick lookup see `memory/glossary.md` (WARNING: as of this writing,
> glossary.md's baseball section only lists the 47 baseline tables — it is stale relative to
> `database.ts`; see Gotcha G7).

---

## 1. Tenancy Chain

```
organizations (shared, NOT sport-prefixed)
  id, name, type (organization_type enum: college | juco | high_school | showcase),
  division, conference, location_city, location_state, ...
  │
  │ organization_id (nullable FK, no NOT NULL constraint)
  ▼
baseball_teams
  id, organization_id, name, team_type (baseball_coach_type enum), join_code,
  logo_url, primary_color, secondary_color, created_by, ...
  │                                              │
  │ coach↔team join                              │ player↔team join
  ▼                                              ▼
baseball_team_coach_staff                baseball_team_members
  id, team_id, coach_id,                   id, team_id, player_id,
  role (text, default 'head_coach'),       status (team_member_status enum —
  is_primary (bool, default false),          SHARED with golf_team_members:
  -- added by 20260624000030 --               pending|active|inactive|removed),
  is_head_coach (bool), status (text,       jersey_number, position,
    default 'active'), title, capabilities  joined_at, approved_by, approved_at
    (jsonb), can_manage_roster/practice/
    lifting/imports/stats/settings/
    calendar (bool), can_view_academics/
    medical (bool), can_invite_staff (bool),
    can_message_team (bool)
```

- **`baseball_team_coach_staff`** is the exact analog of golf's `golf_team_coach_staff`
  (`memory/context/golfhelm-database.md` → `## golf_team_coach_staff`), but far richer: golf's
  join table is just `id, team_id, coach_id, role (text), is_primary (bool), created_at`.
  Baseball's started identical in the baseline (`supabase/migrations/20260527000000_prod_public_baseline.sql:8134-8141`
  — `id, team_id, coach_id, role, is_primary, created_at`, no `is_head_coach` column) and then grew
  a full capability model via `ADD COLUMN IF NOT EXISTS` in
  `supabase/migrations/20260624000030_baseball_staff_capabilities.sql:27-47` (12 boolean
  capability columns + `is_head_coach` + `capabilities` jsonb + `status` + `title`). Golf never
  grew this model — it's baseball-only. See "RLS Helper Functions" below for how the two
  head-coach signals (`is_primary`, `is_head_coach`) both resolve to "full capability set."
- **`baseball_team_members`** is the exact analog of `golf_team_members`, including reusing the
  **same shared enum** `team_member_status` (not a `baseball_`-prefixed enum) —
  `supabase/migrations/20260527000000_prod_public_baseline.sql:8177-8189`.
- **`baseball_players` has NO `organization_id` and NO `team_id` column.** A player only attaches
  to a team through the `baseball_team_members` join row — confirmed in the baseline table
  definition (`supabase/migrations/20260527000000_prod_public_baseline.sql:8003-8043`, 39
  columns, no team/org FK). `baseball_coaches` DOES carry `organization_id` directly (line
  7581) in addition to reaching teams via `baseball_team_coach_staff`.
- **`baseball_teams.team_type`** and **`baseball_coaches.coach_type`** both use the SAME enum
  `baseball_coach_type` (college | juco | high_school | showcase) — a team's type mirrors its
  owning organization's coach-facing type, not a separate `baseball_player_type`-style value.
- Confirmed programmatically by `src/lib/baseball/player-record-access.ts` and
  `src/lib/baseball/recruitability.ts`: the canonical coach→team resolution is
  `baseball_coaches.organization_id → baseball_teams.organization_id` (one org, looked up via
  `.single()` — i.e. the app code currently assumes **one team per organization**, even though
  nothing in the schema enforces that), and the canonical player→team resolution is
  `baseball_team_members.team_id = team.id AND baseball_team_members.player_id = playerId`.
- `organizations.type` (`organization_type` enum: `college | juco | high_school | showcase`)
  is the SAME shared table golf uses (`golf_teams.organization_id`/`golf_coaches.organization_id`
  both point at it too) — there is no `baseball_organizations` table. A college org can only
  ever recruit; `high_school`/`showcase`/`juco` orgs are what `assertCoachCanRecruitPlayer()`
  (`src/lib/baseball/recruitability.ts:23-38`) treats as "discoverable" for recruiting purposes.

---

## 2. Table Inventory (119 `baseball_*` tables)

Format per table: **Purpose** / **Key columns** / **FKs** / **RLS**.

### 2a. Identity / Roster / Tenancy / Settings / Import Infra (21 tables)

### baseball_teams
Purpose: A single coached roster — the core tenancy unit players and coaches attach to.
Key columns: id (uuid, PK), organization_id (uuid, nullable), name, team_type (baseball_coach_type enum), join_code, logo_url, primary_color, secondary_color, created_by, created_at, updated_at
FKs: organization_id → organizations.id (nullable, no NOT NULL)
RLS: SELECT — team coach/member OR any coach in the same organization_id (`baseball_teams_select`); INSERT — coach in same org; UPDATE/DELETE — head coach only (historically via a `head_coach_id` column that was DROPPED — see Gotcha G2; now resolved via `baseball_team_coach_staff.is_primary`/`is_head_coach`). [`supabase/migrations/20260527000000_prod_public_baseline.sql:8195-8208`]

### baseball_coaches
Purpose: A coach's profile, one row per `auth.users` coach account.
Key columns: id (uuid, PK), user_id (uuid, NOT NULL), organization_id (uuid, nullable), coach_type (baseball_coach_type enum, NOT NULL), full_name, email, phone, title, bio, onboarding_completed
FKs: user_id → auth.users.id; organization_id → organizations.id
RLS: SELECT — own row OR any authenticated coach (`baseball_coaches_select` + redundant `baseball_coaches_select_all USING (true)` — coaches are intentionally publicly visible platform-wide, per `docs/BASEBALL_RLS_SECURITY_AUDIT.md` §1); INSERT/UPDATE/DELETE — self only (`user_id = auth.uid()`). [`supabase/migrations/20260527000000_prod_public_baseline.sql:7578-7592`, policies at 17823-17838]

### baseball_players
Purpose: A player's profile — measurables, academics, recruiting-activation flag; one row per `auth.users` player account.
Key columns: id (uuid, PK), user_id (uuid, NOT NULL), player_type (baseball_player_type enum, NOT NULL), first_name, last_name, grad_year, primary_position, pitch_velo, exit_velo, sixty_time, gpa, sat_score/act_score, recruiting_activated (bool, default false), recruiting_activated_at, profile_completion_percent
FKs: user_id → auth.users.id
RLS: INSERT/UPDATE — self only (`user_id = auth.uid()`). **SELECT — `USING (true)` for ANY authenticated user, no scoping at all** — see Gotcha G1, this is the single highest-severity finding in this document. [`supabase/migrations/20260527000000_prod_public_baseline.sql:8003-8043`, policies at 18175-18183]

### baseball_team_coach_staff
Purpose: Coach↔team join with a full staff-capability model (analog of `golf_team_coach_staff`, see Tenancy Chain above).
Key columns: id, team_id, coach_id, role (text, default 'head_coach'), is_primary (bool), is_head_coach (bool), status (text, default 'active'), title, capabilities (jsonb), can_manage_roster/practice/lifting/imports/stats/settings/calendar (bool ×7), can_view_academics/can_view_medical (bool), can_invite_staff (bool), can_message_team (bool)
FKs: team_id → baseball_teams.id; coach_id → baseball_coaches.id
RLS: SELECT — team coach OR own record; INSERT/UPDATE/DELETE — head coach only (`docs/BASEBALL_RLS_SECURITY_AUDIT.md` §5, pre-dates the 0030 capability columns — verify current predicate against `is_baseball_primary_coach`/`has_baseball_staff_capability` before relying on the audit doc's exact wording). [`supabase/migrations/20260527000000_prod_public_baseline.sql:8134-8141`; capability columns added by `supabase/migrations/20260624000030_baseball_staff_capabilities.sql:27-47`]

### baseball_team_members
Purpose: Player↔team roster join (analog of `golf_team_members`).
Key columns: id, team_id, player_id, status (team_member_status enum — SHARED with golf), jersey_number, position, joined_at, approved_by, approved_at
FKs: team_id → baseball_teams.id; player_id → baseball_players.id
RLS: SELECT — team coach, team member, or own record; INSERT/UPDATE — team coaches only; DELETE — team coach OR self (player can leave a team). [`supabase/migrations/20260527000000_prod_public_baseline.sql:8177-8189`; `docs/BASEBALL_RLS_SECURITY_AUDIT.md` §4]

### baseball_team_invitations
Purpose: A shareable join code/link for players to join a team (distinct from staff invitations below).
Key columns: id, team_id, code (varchar(8)), created_by_coach_id, max_uses, used_count, expires_at, is_active
FKs: team_id → baseball_teams.id; created_by_coach_id → baseball_coaches.id
RLS: coach-managed (team coach CRUD); redemption goes through the dedicated RPCs `try_redeem_baseball_team_invitation` / `release_baseball_team_invitation_redemption` (`supabase/migrations/20260630180200_baseball_team_invitation_redeem_rpc.sql`) rather than a direct table write, so a joining player never needs a permissive INSERT policy on `baseball_team_members`. [`supabase/migrations/20260527000000_prod_public_baseline.sql:8147-8158`]

### baseball_staff_invitations
Purpose: Invitation for a NEW coach/staff member to join a team's coaching staff (parallel to `baseball_team_invitations` but for staff, not players), carrying pre-set capabilities so the invitee lands with the right permissions on accept.
Key columns: id (uuid, PK), team_id (uuid FK), email, role/title, capabilities (jsonb, pre-assigned), status (pending/accepted/revoked/expired), invited_by_coach_id, accepted_by_user_id (added by a later migration), token
FKs: team_id → baseball_teams.id; invited_by_coach_id → baseball_coaches.id
RLS: INSERT/manage gated by `baseball_can_invite_staff(team_id)` (primary coach OR `is_head_coach`/`can_invite_staff` capability — `supabase/migrations/20260624000030_baseball_staff_capabilities.sql:72-92`); acceptance flows through the dedicated `baseball_accept_staff_invite` RPC (`supabase/migrations/20260624000062_baseball_accept_staff_invite_rpc.sql`). [`supabase/migrations/20260624000030_baseball_staff_capabilities.sql:98+`]

### baseball_staff_audit_events
Purpose: Append-only audit trail of staff-role/capability changes (who changed what capability on which staff row, and when) — the compliance answer to `docs/BASEBALL_RLS_SECURITY_AUDIT.md`'s §11 gap "No audit trail for sensitive actions."
Key columns: id, team_id, staff_id (→ baseball_team_coach_staff), actor_coach_id, change_type, before/after snapshot (jsonb)
FKs: team_id → baseball_teams.id; actor_coach_id → baseball_coaches.id
RLS: staff-only SELECT (team staff); INSERT is system-written via the `baseball_log_staff_change` trigger function, not a direct client write. [`supabase/migrations/20260624000081_baseball_staff_roles_scope_audit.sql:104+`]

### baseball_player_classes
Purpose: A player's academic class schedule entry (course name, meeting days/times) — feeds the class-conflict engine.
Key columns: id, player_id, course_name, days (array/text), start_time, end_time, term
FKs: player_id → baseball_players.id
RLS: player owns own rows; coaches on the player's team can SELECT (academic visibility, per `docs/BASEBALL_RLS_SECURITY_AUDIT.md` §12 "Academic"). [`supabase/migrations/20260527000000_prod_public_baseline.sql`]

### baseball_player_settings
Purpose: Per-player app preferences, notably `profile_visibility` (public/private) which gates recruiting discoverability alongside `recruiting_activated`.
Key columns: id, player_id (unique), profile_visibility (text), notification prefs
FKs: player_id → baseball_players.id
RLS: player-owned only (self CRUD). Read by `src/lib/baseball/recruitability.ts:97-100` as part of the recruitability gate (`profile_visibility === 'private'` → denied). [`supabase/migrations/20260527000000_prod_public_baseline.sql`]

### baseball_academic_eligibility
Purpose: Coach-entered NCAA/academic eligibility tracking record for a player (GPA checkpoints, eligibility status).
Key columns: id, player_id, team_id, status, notes, recorded_by_coach_id
FKs: player_id → baseball_players.id; team_id → baseball_teams.id
RLS: coach INSERT/manage; player + team coaches SELECT own/team records. [`supabase/migrations/20260527000000_prod_public_baseline.sql`; `docs/BASEBALL_RLS_SECURITY_AUDIT.md` §12]

### baseball_class_conflicts
Purpose: Detected overlap between a player's class schedule (`baseball_player_classes`) and a team event/practice — feeds `src/lib/baseball/class-conflict-engine.ts`.
Key columns: id, team_id, player_id, event_id or practice reference, conflict_window, resolved (bool)
FKs: team_id → baseball_teams.id; player_id → baseball_players.id
RLS: team-staff visibility; player sees own conflicts. [`supabase/migrations/20260624000221_baseball_video_links_and_class_conflicts.sql:218+`]

### baseball_seasons
Purpose: A team's season definition (year/name/date range) — the anchor for season-scoped stats and settings.
Key columns: id, team_id, name, start_date, end_date, is_active
FKs: team_id → baseball_teams.id
RLS: team-staff manage; team members SELECT. [`supabase/migrations/20260624000095_baseball_team_and_season_settings.sql:78+`]

### baseball_program_settings
Purpose: Per-team "Settings OS" configuration root (program identity, feature toggles) — the umbrella settings row a team's other settings hang off.
Key columns: id, team_id (unique), program_name/identity fields, feature flags (jsonb)
FKs: team_id → baseball_teams.id
RLS: coach-only manage (`can_manage_settings` capability); team members may SELECT read-only subset. [`supabase/migrations/20260624000090_baseball_settings_os.sql:101+`]

### baseball_settings_audit_log
Purpose: Append-only log of changes to program/team settings (parallel to `baseball_staff_audit_events` but for the Settings OS surface).
Key columns: id, team_id, changed_by_coach_id, setting_key, before/after (jsonb)
FKs: team_id → baseball_teams.id
RLS: staff-only SELECT; system-written INSERT. [`supabase/migrations/20260624000090_baseball_settings_os.sql:264+`]

### baseball_demo_sessions
Purpose: Tracks active demo-account login sessions (parallel to golf's `golf_demo_sessions`) so demo coach/player accounts can be safely reset/expired.
Key columns: id, user_id or session_token, demo_kind, started_at, expires_at
FKs: none declared (references auth.users loosely)
RLS: UNVERIFIED in depth — table is new (added 2026-06-30) and NOT yet reflected in `src/lib/types/database.ts` (see Gotcha G7); migration is idempotent (`CREATE TABLE IF NOT EXISTS`, policy guards in a `DO` block). [`supabase/migrations/20260630220000_create_baseball_demo_sessions.sql:16+`]

### baseball_import_sources
Purpose: Per-team registry of external stat/data vendors (GameChanger, TrackMan, Rapsodo, manual, etc.) enabled for import — drives trust tier and default visibility for imported rows.
Key columns: id, team_id, source_key, source_name, source_category, trust_tier, is_enabled, ai_can_use, expected_cadence_days
FKs: team_id → baseball_teams.id
RLS: SELECT any team staff; INSERT/UPDATE/DELETE gated by `has_baseball_staff_capability(team_id, 'can_manage_imports')`. [`supabase/migrations/20260624000090_baseball_settings_os.sql:192+`] — note this table is functionally near-identical to `baseball_stat_sources` (created separately by the elite-stat-event-model migration); see Gotcha G6.

### baseball_integration_configs
Purpose: Per-team third-party integration credentials/config (API keys, webhook URLs) for connected vendors.
Key columns: id, team_id, integration_key, config (jsonb, may hold secrets — verify no client-readable secret fields before exposing to authenticated SELECT), is_active
FKs: team_id → baseball_teams.id
RLS: staff-only, gated by `can_manage_imports`/`can_manage_settings`. [`supabase/migrations/20260624000090_baseball_settings_os.sql:230+`]

### baseball_import_runs
Purpose: Header row for a bulk import batch (box scores, roster, external player IDs) — general-purpose import lineage tracker, distinct from the lifting-specific `baseball_lift_import_runs`.
Key columns: id, team_id, source, import_kind, status, row_count, matched_count, created_by_coach_id
FKs: team_id → baseball_teams.id
RLS: staff-only (`can_manage_imports`). [`supabase/migrations/20260624000020_baseball_import_lineage.sql:23+`]

### baseball_import_field_mappings
Purpose: Saved CSV-header→canonical-field mapping profile per source/team, for repeatable imports.
Key columns: id, team_id, source_id, mapping_name, csv_header, canonical_field, transform_rule, unit
FKs: team_id → baseball_teams.id; source_id → baseball_stat_sources.id
RLS: staff-only (`can_manage_imports`). [`supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql:112+`]

### baseball_player_external_ids
Purpose: Maps a `baseball_players` row to its external-vendor identifier(s) (GameChanger player ID, etc.) so repeated imports match the same player deterministically.
Key columns: id, player_id, source_key, external_id, confidence
FKs: player_id → baseball_players.id
RLS: staff-only manage (import matching is a coach/staff operation). [`supabase/migrations/20260624000020_baseball_import_lineage.sql:78+`]

**Organizations note:** `organizations` is a shared, non-sport-prefixed table — the SAME table
golf uses for `golf_teams.organization_id`/`golf_coaches.organization_id`. Its `type` column
uses the `organization_type` enum (`college | juco | high_school | showcase`), which is the
organization-level counterpart to `baseball_coach_type`/`baseball_player_type` (same four
string values, three separate enum objects in Postgres — not literally the same enum, see
§3 Enums). `src/lib/baseball/recruitability.ts:23-38` treats only `high_school`, `showcase`,
and `juco` organizations as "discoverable" for recruiting; `college` orgs never appear as
recruitable targets (only as the recruiting coach's own org).

### 2b. Recruiting / Pipeline (10 tables)

### baseball_recruiting_interests
Purpose: Player-side log of organizations/programs the player has expressed interest in (player-initiated, NOT the coach-driven pipeline — see the disambiguation note below).
Key columns: id, player_id, organization_id, interest_level, status (default 'interested')
FKs: player_id → baseball_players.id; organization_id → organizations.id
RLS: player-owned only — SELECT/INSERT/UPDATE/DELETE all require `baseball_players.user_id = auth.uid()`. **No coach-side policy exists at all — coaches cannot read this table via RLS.** [`supabase/migrations/20260527000000_prod_public_baseline.sql:8049-8058`, policies ~18190-18211]

### baseball_watchlists
Purpose: THE coach-driven recruiting pipeline table — one row per (coach, player) a coach is tracking, carrying the pipeline stage.
Key columns: id, coach_id, player_id, pipeline_stage (baseball_pipeline_stage enum, default 'watchlist'), priority, tags (text[]), fit_score, source, last_contact, added_at
FKs: coach_id → baseball_coaches.id; player_id → baseball_players.id
RLS: fully coach-owned — SELECT/INSERT/UPDATE/DELETE all require `baseball_coaches.user_id = auth.uid()`. Not team-shared among staff; not visible to the player. [`supabase/migrations/20260527000000_prod_public_baseline.sql:8278-8292`, policies ~18480-18500]

> **Disambiguation:** `baseball_recruiting_interests` and `baseball_watchlists` are two
> distinct, non-overlapping tables. `baseball_recruiting_interests` is player-owned, has no
> `pipeline_stage` column, and zero coach-side RLS access. `baseball_watchlists` is coach-owned
> and IS the pipeline table carrying `baseball_pipeline_stage` — this is what CoachHelm/Discover
> almost certainly renders as "the pipeline." Verify which (if either) is dead code with
> `grep -rn "from('baseball_recruiting_interests')" src/` before building on it.

### baseball_coach_recruiting_philosophy
Purpose: Per-coach configurable scoring weights/thresholds for ranking recruiting prospects (exit velo, pitch velo, 60-time, GPA, arm strength) plus preferred states/grad years.
Key columns: id, coach_id, weight_exit_velocity/weight_pitch_velocity/weight_sixty_time/weight_gpa/weight_arm_strength (int), min_gpa/min_exit_velocity/min_pitch_velocity/max_sixty_time, preferred_states (jsonb), target_grad_years (jsonb), is_active
FKs: coach_id → baseball_coaches.id
RLS: single ALL-command policy scoped to own coach_id. [`supabase/migrations/20260527000000_prod_public_baseline.sql:7551-7570`]

### baseball_player_engagement_events
Purpose: Event log of recruiting engagement (profile views, watchlist adds) — source of "A coach viewed your profile" notifications; drives the anonymous-vs-identified activation UX from CLAUDE.md.
Key columns: id, player_id, coach_id (nullable), engagement_type, metadata (jsonb), created_at
FKs: player_id → baseball_players.id; coach_id → baseball_coaches.id (nullable)
RLS: INSERT restricted to the acting coach; SELECT allowed to either the subject player or the coach who generated the event. INSERT additionally requires the target player have `recruiting_activated = true` (`docs/BASEBALL_RLS_SECURITY_AUDIT.md` §9). [`supabase/migrations/20260527000000_prod_public_baseline.sql:7856-7864`]

### baseball_player_comparisons
Purpose: Coach-saved side-by-side comparison sets of multiple prospects.
Key columns: id, coach_id, name, player_ids (uuid[]), notes
FKs: coach_id → baseball_coaches.id (player_ids is an array, no formal FK)
RLS: fully coach-owned CRUD. [`supabase/migrations/20260527000000_prod_public_baseline.sql:7842-7850`]

### baseball_camps
Purpose: Coach/program-hosted recruiting camp or showcase event players can register for.
Key columns: id, coach_id, organization_id (nullable), name, location, start_date/end_date, registration_deadline, capacity, price_cents, is_free, status (default 'draft')
FKs: coach_id → baseball_coaches.id; organization_id → organizations.id
RLS: owning coach full CRUD; SELECT additionally opens to any authenticated user when `status = 'published'` (public listing). [`supabase/migrations/20260527000000_prod_public_baseline.sql:7486-7501`]

### baseball_camp_registrations
Purpose: A player's registration for a specific camp.
Key columns: id, camp_id, player_id, status (default 'registered'), payment_status (default 'pending')
FKs: camp_id → baseball_camps.id; player_id → baseball_players.id
RLS: INSERT — subject player only; SELECT/UPDATE — subject player OR the camp's owning coach. No DELETE policy found (effectively immutable outside service_role). [`supabase/migrations/20260527000000_prod_public_baseline.sql:7472-7480`]

### baseball_player_passport_settings
Purpose: Per-(player, team) visibility configuration for the "Player Passport" — staff_only / player_visible / public_profile / scout_packet, plus per-field visibility overrides.
Key columns: id, player_id, team_id, visibility_state (CHECK: staff_only/player_visible/public_profile/scout_packet, default 'staff_only'), field_visibility (jsonb), headline, updated_by; UNIQUE(player_id, team_id)
FKs: player_id → baseball_players.id (CASCADE); team_id → baseball_teams.id (CASCADE); updated_by → auth.users.id
RLS: SELECT/INSERT/UPDATE — team coaches (`is_baseball_team_coach_v2`) OR the subject player; DELETE — team coaches only. anon explicitly revoked. [`supabase/migrations/20260624000220_baseball_player_passport_and_daily_contract.sql:56-146`]

### baseball_player_daily_contracts
Purpose: One row per (player, team, date) — the player's daily commitment loop (draft → committed → completed/missed), with a jsonb list of intention items and an optional private reflection.
Key columns: id, player_id, team_id, contract_date, status (CHECK: draft/committed/completed/missed, default 'draft'), items (jsonb), reflection, visibility (CHECK: player_only/team/staff_only, default 'player_only'); UNIQUE(player_id, team_id, contract_date)
FKs: player_id → baseball_players.id (CASCADE); team_id → baseball_teams.id (CASCADE)
RLS: SELECT — subject player always; coaches only when `visibility <> 'player_only'` (private reflections stay private unless shared). INSERT/UPDATE/DELETE — subject player only. [`supabase/migrations/20260624000220_baseball_player_passport_and_daily_contract.sql:164-273`]

### baseball_player_passport_share_tokens
Purpose: Opaque, revocable share-link tokens letting staff export a player's Passport as an external "scout packet" viewable by an unauthenticated college coach, without granting anon table access — a server route resolves the token with the service role.
Key columns: id, player_id, team_id, token (unique), recipient_label, packet_kind (CHECK: scout/transfer, default 'scout'), status (CHECK: active/revoked, default 'active'), expires_at, view_count, created_by
FKs: player_id → baseball_players.id (CASCADE); team_id → baseball_teams.id (CASCADE); created_by → auth.users.id
RLS: SELECT — team coaches or the subject player (transparency); INSERT (minting) — team coaches only. **No policy targets anon** — public viewing deliberately bypasses RLS via a server-role route rather than a permissive anon policy. [`supabase/migrations/20260624000420_baseball_passport_scout_packet_share_tokens.sql:48-131`]

### 2c. Stats / Performance — Games, Box Scores, Elite Stat Event Model (23 tables)

### baseball_games
Purpose: A scheduled/played game or scrimmage for a team.
Key columns: id, team_id, event_id (optional calendar link), game_date, game_type (game|scrimmage), opponent_name, our_score/opponent_score, status
FKs: team_id → baseball_teams.id (CASCADE); event_id → baseball_events.id (SET NULL); created_by → baseball_coaches.id
RLS: SELECT — team members + coaches; INSERT/UPDATE/DELETE — coach only (`is_baseball_team_coach_v2`). [baseline]

### baseball_box_score_batting
Purpose: Per-player batting line for one game (AB/H/HR/RBI/etc, computed AVG/OBP/SLG/OPS).
Key columns: id, game_id, player_id, team_id, ab/r/h/doubles/triples/hr/rbi/bb/k/sb/cs, batting_order, avg/obp/slg/ops
FKs: game_id → baseball_games.id (CASCADE); player_id → baseball_players.id (CASCADE); team_id → baseball_teams.id (CASCADE)
RLS: SELECT — player sees own row OR coach of team; INSERT/UPDATE/DELETE — coach only. Writes go through the SECURITY DEFINER RPC `save_baseball_full_box_score` (atomically writes batting+pitching+updates `baseball_games` score). [baseline + `supabase/migrations/20260630000000_baseball_save_full_box_score_rpc.sql`]

### baseball_box_score_pitching
Purpose: Per-player pitching line for one game (IP/H/R/ER/BB/K/HR, computed ERA/WHIP/K9/BB9, decision W/L/S/H/BS/ND).
Key columns: id, game_id, player_id, team_id, ip, h/r/er/bb/k/hr, pitch_count, result, era/whip/k9/bb9
FKs: game_id → baseball_games.id (CASCADE); player_id → baseball_players.id (CASCADE); team_id → baseball_teams.id (CASCADE)
RLS: same shape as batting — player sees own, coach manages all; written via `save_baseball_full_box_score` RPC. [baseline + 20260630000000]

### baseball_box_score_uploads
Purpose: Raw upload record (CSV/PDF/manual) driving box-score parsing/matching, with player-matching results.
Key columns: id, team_id, game_id (nullable), coach_id, filename, upload_type, raw_content, parsed_data (jsonb), status, matched_players/unmatched_players (jsonb)
FKs: team_id → baseball_teams.id (CASCADE); game_id → baseball_games.id (SET NULL); coach_id → baseball_coaches.id
RLS: single ALL-command policy scoped to `coach_id = <own baseball_coaches.id>` — only the uploading coach sees their own uploads, not team-wide. [baseline]

### baseball_stat_uploads
Purpose: Older/parallel generic stat-file upload tracker (filename, row/processed counts) — predates or runs alongside `baseball_box_score_uploads`; see Gotcha G6.
Key columns: id, coach_id, team_id, filename, file_url, status, row_count, processed_count, error_message
FKs: coach_id → baseball_coaches.id (CASCADE); team_id → baseball_teams.id (CASCADE)
RLS: `baseball_stat_uploads_insert`/`_select` gated by a team-coach EXISTS check; no separate UPDATE/DELETE policy found. [baseline]

### baseball_player_stats
Purpose: Ad-hoc/session-level stat entry (practice or game), one row per stat session per player — the older manual-entry stat table, distinct from box-score and elite-event tables.
Key columns: id, player_id, team_id, coach_id, stat_type (practice|game|other), session_date, batting/pitching/fielding counting stats, exit_velocity, pitch_velocity, source
FKs: player_id → baseball_players.id (CASCADE); team_id → baseball_teams.id (CASCADE); coach_id → baseball_coaches.id
RLS: "Coaches can manage player stats" (team-staff EXISTS, ALL); "Players can view their own stats" (SELECT, own player_id). [baseline]

### baseball_player_season_stats
Purpose: One row per player per season_year — aggregated official season batting+pitching line (mirrors box-score columns but season-summed) plus computed rate stats.
Key columns: id, player_id, team_id, season_year, g/ab/r/h/... (batting), g_p/gs/w/l/sv/ip/... (pitching), avg/obp/slg/ops/era/whip/k9/bb9
FKs: player_id → baseball_players.id (CASCADE); team_id → baseball_teams.id (CASCADE)
RLS: "Coaches can manage season stats" (`is_baseball_team_coach_v2`); SELECT — own player_id OR team coach. Also the source table for the public recruiting-profile RPC `get_baseball_public_player_stats` (SECURITY DEFINER, re-enforces its own gate: staff-or-self, OR `recruiting_activated=true AND profile_visibility='public'` AND team discoverable) — the only path an anonymous/public viewer can read season stats, since direct-table RLS blocks anon entirely. [baseline + `supabase/migrations/20260624001401_baseball_public_player_stats_rpc.sql`]

### baseball_player_aggregates
Purpose: Rolling trend/aggregate cache per player (career/last-5/last-10/practice/game averages, pressure_gap, trend_data) — a derived analytics cache feeding CoachHelm.
Key columns: id, player_id, team_id (nullable), career_avg/last_5_avg/last_10_avg/practice_avg/game_avg/pressure_gap, total_at_bats/total_hits/total_sessions, trend_data (jsonb)
FKs: player_id → baseball_players.id (CASCADE); team_id → baseball_teams.id (SET NULL)
RLS: INSERT/UPDATE — `is_baseball_team_coach(team_id)`; SELECT — broader EXISTS-based read (team members + coaches). [baseline]

### baseball_player_percentiles
Purpose: Grad-year-cohort percentile rankings for measurables (exit velo, pitch velo, 60-time, GPA) plus composite scores — recruiting benchmarking.
Key columns: id, player_id, grad_year, percentile_exit_velocity/percentile_pitch_velocity/percentile_sixty_time/percentile_gpa (0-100), composite_athletic/composite_academic, is_stale, calculated_at
FKs: player_id → baseball_players.id (CASCADE)
RLS: **"Anyone can view percentiles" — SELECT `TO authenticated USING (true)`, no team-scoping at all** — any authenticated coach or player can read any player's percentile row (writes are service_role-only). This is presumably intentional (platform-wide recruiting benchmarking data) but is a deviation from the team-scoped pattern used everywhere else — flag alongside Gotcha G1. [baseline]

### baseball_lineup_positions
Purpose: One batting-order slot + fielding position within a saved lineup.
Key columns: id, lineup_id, batting_order (1-9, CHECK), player_id, position
FKs: lineup_id → baseball_team_lineups.id (CASCADE); player_id → baseball_players.id (CASCADE)
RLS: coach manage (EXISTS-based, ALL); players SELECT. Also see the `baseball_replace_lineup_positions` RPC (`supabase/migrations/20260624001600_baseball_replace_lineup_positions_rpc.sql`) — used to atomically swap a lineup's positions rather than delete-then-insert. [baseline]

### baseball_team_lineups
Purpose: A named, saved lineup for a team (container for `baseball_lineup_positions` rows).
Key columns: id, team_id, created_by_coach_id, name
FKs: team_id → baseball_teams.id (CASCADE); created_by_coach_id → baseball_coaches.id (CASCADE)
RLS: coach manage (EXISTS-based, ALL); players SELECT. [baseline]

> The remaining 12 tables in this group were ALL created by one migration,
> `supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql` — the "elite,
> source-aware EVENT model" (V6/V10 stat-universe spec). Architecture: raw per-event tables
> (pitch/swing/batted-ball/fielding/catching/baserunning/workload/video) are the atomic truth;
> `baseball_plate_appearances` is the plate-appearance grain tying pitch/batted-ball events
> together; `baseball_stat_facts` is a generic derived/computed metric table;
> `baseball_player_development_metrics` is a computed, confidence-scored rollup. Every event row
> carries `data_context` (official_game|scrimmage|practice|bullpen|cage|showcase|sensor|video|
> lift|readiness|manual), `trust_tier` (official|verified_vendor|coach_reviewed|
> player_submitted|unverified|inferred), and `visibility` (staff_only|player_visible|
> restricted) — a provenance/trust layer on top of (not replacing) the older box_score/
> player_stats tables. **The migration's own header states "This file is WRITTEN, NOT
> APPLIED"** — do not assume these 12 tables exist on the live DB without verifying against
> `information_schema` (see Gotcha G8).

### baseball_stat_sources
Purpose: Per-team registry of configured data sources (GameChanger, TrackMan, Rapsodo, manual, etc.) — drives trust tier, default visibility, AI-use gate, import cadence.
Key columns: id, team_id, source_key (CHECK, ~25 vendor keys), source_category, trust_tier, is_enabled, ai_can_use, expected_cadence_days, field_mapping_profile (jsonb); UNIQUE(team_id, source_key, source_name)
FKs: team_id → baseball_teams.id (CASCADE)
RLS: SELECT — any team staff; INSERT/UPDATE/DELETE — `has_baseball_staff_capability(team_id, 'can_manage_imports')`.

### baseball_import_field_mappings
(see §2a — created by this same migration for the elite event model; also referenced from settings-os import config)

### baseball_plate_appearances
Purpose: One plate appearance — the join grain linking pitch events, batted-ball events, and the batter/pitcher, count/base-state context, and result.
Key columns: id, team_id, game_id, practice_id, batter_id, pitcher_id, data_context, inning/half, outs_before/balls_before/strikes_before, base_state_before, result, rbi, is_quality_at_bat, trust_tier, visibility
FKs: team_id → baseball_teams.id (CASCADE); game_id → baseball_games.id (SET NULL); batter_id/pitcher_id → baseball_players.id (SET NULL); import_run_id → baseball_import_runs.id (SET NULL); source_id → baseball_stat_sources.id (SET NULL)
RLS: shared generic policy (see below), keyed on `batter_id`.

### baseball_pitch_events
Purpose: Single pitch (velocity, spin, movement, location, call/result) — the most granular tracking-data row.
Key columns: id, team_id, game_id, plate_appearance_id, pitcher_id, batter_id, catcher_id, pitch_type, velocity, spin_rate, induced_vertical_break, horizontal_break, zone, is_swing/is_whiff/is_chase/is_called_strike
FKs: plate_appearance_id → baseball_plate_appearances.id (SET NULL); pitcher_id/batter_id/catcher_id → baseball_players.id (SET NULL)
RLS: shared generic policy, keyed on `pitcher_id`.

### baseball_batted_ball_events
Purpose: Contact/exit data for a batted ball (exit velo, launch angle, spray angle, hard-hit/barrel flags).
Key columns: id, team_id, game_id, plate_appearance_id, pitch_event_id, batter_id, pitcher_id, exit_velocity, launch_angle, spray_angle, batted_ball_type, is_hard_hit/is_barrel/is_sweet_spot, result
FKs: plate_appearance_id → baseball_plate_appearances.id (SET NULL); pitch_event_id → baseball_pitch_events.id (SET NULL); batter_id/pitcher_id → baseball_players.id (SET NULL)
RLS: shared generic policy, keyed on `batter_id`.

### baseball_swing_events
Purpose: Bat-sensor swing mechanics (bat speed, attack angle, connection/power scores) — developmental only; `trust_tier` is CHECK-constrained to never be 'official'.
Key columns: id, team_id, player_id, game_id, pitch_event_id, bat_speed, attack_angle, vertical_bat_angle, on_plane_efficiency, connection_score, power_score, trust_tier (CHECK <> 'official')
FKs: player_id → baseball_players.id (SET NULL); pitch_event_id → baseball_pitch_events.id (SET NULL)
RLS: shared generic policy, keyed on `player_id`.

### baseball_fielding_events
Purpose: One fielding chance (position, event type, result, error type, throw velocity/accuracy, grades).
Key columns: id, team_id, game_id, player_id, position, event_type, chance_difficulty, result, error_type, throw_velocity, arm_accuracy, route_grade
FKs: player_id → baseball_players.id (SET NULL)
RLS: shared generic policy, keyed on `player_id`.

### baseball_catching_events
Purpose: Catcher-specific event (receive/block/throwdown/game_call/mound_visit) — pop time, exchange time, framing/block results.
Key columns: id, team_id, game_id, catcher_id, pitcher_id, pitch_event_id, event_type (CHECK: receive|block|throwdown|game_call|mound_visit), pop_time, exchange_time, framing_result
FKs: catcher_id/pitcher_id → baseball_players.id (SET NULL); pitch_event_id → baseball_pitch_events.id (SET NULL)
RLS: shared generic policy, keyed on `catcher_id`.

### baseball_baserunning_events
Purpose: One baserunning event (steal/lead/jump/sprint splits, decision quality).
Key columns: id, team_id, game_id, runner_id, event_type, result, lead_size, jump_time, home_to_first, sprint_speed, decision_quality
FKs: runner_id → baseball_players.id (SET NULL)
RLS: shared generic policy, keyed on `runner_id`.

### baseball_workload_events
Purpose: Throwing/lifting/sprint workload log entry (pitch counts, bullpen/long-toss volume, RPE) for arm-care/load monitoring.
Key columns: id, team_id, player_id, game_id, practice_id, event_date, event_type (CHECK: game_pitches|bullpen|flat_ground|long_toss|catch_play|position_throwing|lift|sprint|recovery), count, intensity, rpe
FKs: player_id → baseball_players.id (SET NULL)
RLS: shared generic policy, keyed on `player_id`.

### baseball_video_events
Purpose: Video clip metadata linked to a plate appearance/pitch/swing, with coach annotation and tags.
Key columns: id, team_id, player_id, video_id, external_video_url, game_id, plate_appearance_id, pitch_event_id, swing_event_id, clip_start_time/clip_end_time, tags (jsonb), coach_annotation, linked_task_id, linked_insight_id, trust_tier (default 'coach_reviewed')
FKs: player_id → baseball_players.id (SET NULL); game_id/plate_appearance_id/pitch_event_id/swing_event_id (all SET NULL)
RLS: shared generic policy, keyed on `player_id`.

### baseball_stat_facts
Purpose: Generic key/value derived-metric fact table (metric_key + numeric/text/json value) — a catch-all for computed stats that don't warrant their own column/table.
Key columns: id, team_id, player_id, game_id, event_id, practice_id, video_id, metric_key, metric_value_numeric/metric_value_text/metric_value_json, unit, context (jsonb), measured_at
FKs: player_id → baseball_players.id (SET NULL); game_id (SET NULL); `event_id` has no FK — loosely typed pointer into any event table
RLS: shared generic policy, keyed on `player_id`.

### baseball_player_development_metrics
Purpose: Computed, honesty-scored development-metric snapshot per player/date (percentile, confidence, sample size) — the rollup layer CoachHelm/dev-plan surfaces likely read from.
Key columns: id, team_id, player_id (NOT NULL, unlike sibling event tables), metric_key, metric_group (CHECK: hitting|pitching|catching|fielding|baserunning|swing|readiness|workload|composite), as_of_date, value_numeric, sample_size, confidence (CHECK: high|medium|low|insufficient, default 'low' — designed to never overstate confidence), trust_tier (default 'inferred'), percentile; UNIQUE(team_id, player_id, metric_key, data_context, as_of_date)
FKs: team_id → baseball_teams.id (CASCADE); player_id → baseball_players.id (CASCADE)
RLS: dedicated policy set (not the shared generic emitter) — SELECT: staff `can_view_baseball_player` OR player sees own row; INSERT/UPDATE/DELETE staff-only.

> **Shared RLS pattern for the 10 event tables** (`baseball_plate_appearances`,
> `baseball_pitch_events`, `baseball_batted_ball_events`, `baseball_swing_events`,
> `baseball_fielding_events`, `baseball_catching_events`, `baseball_baserunning_events`,
> `baseball_workload_events`, `baseball_video_events`, `baseball_stat_facts`) — emitted by one
> dynamic-SQL loop in the migration, keyed per-table on a "player column" (e.g. `batter_id`/
> `pitcher_id`/`player_id`/`catcher_id`/`runner_id`):
> - SELECT: `(get_my_coach_id() IS NOT NULL AND can_view_baseball_player(team_id, <pcol>)) OR
>   (<pcol> = get_my_baseball_player_id() AND visibility <> 'staff_only')`
> - INSERT/UPDATE/DELETE: staff-only, same `can_view_baseball_player(team_id, <pcol>)` gate.
> - Every table: RLS enabled, no anon grants (per migration header).

### baseball_stat_visual_views
Purpose: Per-user (coach or player) saved chart filter/tab state for the stat-visual chart library, plus which charts a player "pinned" to their profile.
Key columns: id, team_id, owner_user_id (→ auth.users, NOT baseball_coaches/players), visual_key (e.g. 'ev_la_matrix', 'pitch_shape_map'), player_id (nullable scope), view_state (jsonb), is_pinned; UNIQUE(owner_user_id, visual_key, player_id) — the documented upsert target so writes never delete-then-insert
FKs: team_id → baseball_teams.id (CASCADE); owner_user_id → auth.users.id (CASCADE); player_id → baseball_players.id (CASCADE)
RLS: per-user rows only, team-scoped via `is_baseball_team_member`; table uses **`FORCE ROW LEVEL SECURITY`** (even the table owner role is subject to RLS) — the only table in this group with FORCE RLS. No anon grants. [`supabase/migrations/20260624000083_baseball_stat_visual_views.sql`]

### 2d. Lift Lab — Strength & Conditioning (25 tables, `baseball_*` family)

> **Read Gotcha G1 before using any table in this group** — there is a SECOND, parallel,
> sport-agnostic `helm_lifting_*` table family (40 tables, not counted in the 119) that is a
> live, unsynced twin of this one, not a superseding rename.

There are two generations of the `baseball_lift_*`/`baseball_strength_*` schema:

**Generation 1 ("Lite")** — `supabase/migrations/20260624000061_baseball_lifting_performance.sql`:

### baseball_exercises
Purpose: Lite exercise library (global rows + per-team rows) used by the original Lite lifting surface.
Key columns: id, team_id (nullable for global rows), name, category, is_global, created_by_coach_id
FKs: team_id → baseball_teams.id
RLS: SELECT — global rows readable by any staff, team rows by that team's staff/players; writes gated by `has_baseball_staff_capability(team_id,'can_manage_lifting')`.

### baseball_lift_assignments
Purpose: Staff-prescribed lift assignment for a player or a scoped group (jsonb prescription payload); Lite surface.
Key columns: id, team_id, player_id (nullable), group_scope (uuid[]), exercise_id, prescription (jsonb), status (assigned/in_progress/completed/skipped/archived)
FKs: team_id → baseball_teams.id; player_id → baseball_players.id; exercise_id → baseball_exercises.id
RLS: SELECT — own player row OR staff via `can_manage_baseball_lift_group(team_id, player_id)`; writes staff-only via same helper.

### baseball_lift_results
Purpose: Player-logged set results (sets/reps/weight/RPE) for Lite assignments, with import lineage.
Key columns: id, team_id, player_id, assignment_id, sets/reps/weight/rpe, source (manual/import/system), import_run_id
FKs: player_id → baseball_players.id; assignment_id → baseball_lift_assignments.id; import_run_id → baseball_import_runs.id
RLS: player owns full CRUD on own rows only; staff via `can_manage_baseball_lift_group`; teammates can never read another player's loads.

### baseball_readiness_checkins
Purpose: Daily player wellness/readiness self-report (sleep, energy, soreness, arm status, mood); later extended with stress/lower-body/illness/readiness score+band/visibility by V11.
Key columns: id, team_id, player_id, check_date (unique per player/day), sleep_hours/energy_level/soreness_level, arm_status, readiness_score/readiness_band (V11), visibility (staff/performance_staff/head_coach_only, V11)
FKs: player_id → baseball_players.id
RLS: player owns full CRUD on own rows; staff SELECT requires `has_baseball_staff_capability(team_id,'can_view_readiness')` AND `can_view_baseball_player` — V11 corrected the capability gate from the originally-wrong `can_view_medical`. Never framed as medical diagnosis.

**Generation 2 ("V11 Premium")** — `supabase/migrations/20260624000063_baseball_v11_premium_lifting.sql`,
a full periodized program model: `programs → weeks → days → sections → prescriptions →
program_assignments → sessions → session_exercises → set_results`:

### baseball_strength_groups
Purpose: How the strength coach organizes athletes into training groups (static/dynamic/imported/temporary), with a `rule_json` for dynamic auto-membership.
Key columns: id, team_id, name, group_type, rule_json (jsonb), is_active
FKs: team_id → baseball_teams.id
RLS: SELECT — `is_baseball_team_staff(team_id)`; writes — `can_manage_lifting`. No player access.

### baseball_strength_group_members
Purpose: Membership rows linking a player into a strength group.
Key columns: id, group_id, player_id, source (manual/rule/import), starts_at/ends_at; UNIQUE(group_id, player_id)
FKs: group_id → baseball_strength_groups.id; player_id → baseball_players.id
RLS: staff-scoped (SELECT via `is_baseball_team_staff`, writes via `can_manage_lifting`) — not directly player-visible.

### baseball_strength_group_audit
Purpose: Append-only ledger of strength-group lifecycle/membership-delta events (created/rule_changed/member_added/member_removed/recomputed) for traceability.
Key columns: id, team_id, group_id, event_type, player_id (nullable), source, detail, meta_json
FKs: team_id → baseball_teams.id; group_id → baseball_strength_groups.id (CASCADE); player_id → baseball_players.id; actor_coach_id → baseball_coaches.id
RLS: SELECT — `is_baseball_team_staff`; INSERT only, gated by `can_manage_lifting` + a check that the group belongs to the asserted team. **No UPDATE/DELETE policy exists — immutable by design.** [`supabase/migrations/20260624000440_baseball_strength_group_audit.sql`]

### baseball_lift_exercises
Purpose: V11 "premium" typed exercise library (distinct from Lite `baseball_exercises`) — full biomechanical/tracking metadata (pattern, body region, unit, tracked metrics, coaching cues).
Key columns: id, team_id (nullable=global), category/primary_pattern/body_region, default_unit, track_load/reps/velocity (bool), coaching_cues (text[]), is_global
FKs: team_id → baseball_teams.id
RLS: SELECT — global readable by team staff, team-scoped readable by that team's staff (same pattern as `baseball_exercises`); writes gated by `can_manage_lifting`.

### baseball_lift_exercise_substitutions
Purpose: Declares one lift exercise as a valid substitute for another (used when materializing sessions if a prescribed exercise is unavailable).
Key columns: id, team_id, exercise_id, substitute_exercise_id, reason
FKs: team_id → baseball_teams.id; exercise_id/substitute_exercise_id → baseball_lift_exercises.id
RLS: SELECT — `is_baseball_team_staff`; writes — `can_manage_lifting`.

### baseball_lift_programs
Purpose: Top of the periodized program hierarchy — a named strength program with phase (in_season/postseason/etc), goal, visibility, draft/active/archived status.
Key columns: id, team_id, phase/goal, visibility (staff_only/assigned_players), status (draft/active/archived), is_template, start_date/end_date
FKs: team_id → baseball_teams.id
RLS: SELECT — `is_baseball_team_staff`; writes — `can_manage_lifting`. Programs are staff-only; players see materialized `baseball_lift_sessions` instead.

### baseball_lift_weeks
Purpose: One week within a lift program (week_number, optional deload flag).
Key columns: id, program_id, week_number (unique per program), theme, deload
FKs: program_id → baseball_lift_programs.id (CASCADE)
RLS: single `FOR ALL` policy, staff of the owning team.

### baseball_lift_days
Purpose: One training day within a program week (day_type: lower/upper/full_body/recovery/etc, plus a baseball-specific `baseball_context` like bullpen_day/starter_plus_1/travel_day).
Key columns: id, week_id, day_number (unique per week), day_type, baseball_context, estimated_minutes
FKs: week_id → baseball_lift_weeks.id (CASCADE)
RLS: `FOR ALL` policy, staff-scoped via week→program→team chain.

### baseball_lift_sections
Purpose: A named block within a lift day (warmup/movement_prep/power/main_strength/accessory/arm_care/mobility/conditioning), ordered by section_order.
Key columns: id, lift_day_id, section_order, section_type, instructions
FKs: lift_day_id → baseball_lift_days.id (CASCADE)
RLS: `FOR ALL` policy, staff-scoped.

### baseball_lift_prescriptions
Purpose: A single prescribed exercise slot within a section — sets/reps/load (fixed, %1RM, RPE, velocity, coach_load, or player_select), rest, tempo, optional substitution group.
Key columns: id, section_id, exercise_id, prescription_type, sets/reps/load_value/percent_1rm/target_rpe/target_velocity_min/max, rest_seconds
FKs: section_id → baseball_lift_sections.id (CASCADE); exercise_id → baseball_lift_exercises.id; substitution_group_id → baseball_lift_exercise_substitutions.id
RLS: `FOR ALL` policy, staff-scoped via section→day→week→program→team chain.

### baseball_lift_program_assignments
Purpose: Turns a program day into a scheduled assignment for a team/group/player on a specific date — the publish step that later materializes into `baseball_lift_sessions`.
Key columns: id, team_id, program_id, lift_day_id, assignment_type (team/group/player), group_id (nullable), player_id (nullable), event_id (nullable), scheduled_date, status (draft/published/cancelled), player_visible_at
FKs: team_id → baseball_teams.id; program_id → baseball_lift_programs.id; lift_day_id → baseball_lift_days.id; group_id → baseball_strength_groups.id; player_id → baseball_players.id; event_id → baseball_events.id
RLS: SELECT — `is_baseball_team_staff`; writes — `can_manage_lifting`. Staff-only; players never query this directly.

### baseball_lift_sessions
Purpose: MATERIALIZED per-player workout session created at publish time (spec explicitly forbids on-the-fly template math) — the surface the player app actually reads.
Key columns: id, program_assignment_id, team_id, player_id, event_id (nullable), scheduled_date, status (assigned/started/completed/missed/excused/modified), readiness_checkin_id, coach_review_status; UNIQUE(program_assignment_id, player_id)
FKs: program_assignment_id → baseball_lift_program_assignments.id (CASCADE); team_id → baseball_teams.id; player_id → baseball_players.id; readiness_checkin_id → baseball_readiness_checkins.id
RLS: SELECT/UPDATE/DELETE — owning player OR staff via `can_manage_baseball_lift_group`; INSERT staff-only via same helper.

### baseball_lift_session_exercises
Purpose: A materialized exercise slot within a session, snapshotting exercise/section name at publish time plus prescribed vs. modified values.
Key columns: id, session_id, prescription_id (nullable), exercise_id (nullable), exercise_name_snapshot, prescribed_sets/reps/load/rpe, status (assigned/completed/skipped/substituted)
FKs: session_id → baseball_lift_sessions.id (CASCADE); prescription_id → baseball_lift_prescriptions.id; exercise_id → baseball_lift_exercises.id
RLS: SELECT via EXISTS join to parent session (owning player or managing staff); writes similarly scoped.

### baseball_lift_set_results
Purpose: A single logged set (actual reps/load/RPE/RIR/velocity) against a materialized session exercise.
Key columns: id, session_exercise_id, team_id, player_id, set_number (unique per session_exercise), actual_reps/actual_load/rpe/rir/velocity, coach_observed
FKs: session_exercise_id → baseball_lift_session_exercises.id (CASCADE); player_id → baseball_players.id
RLS: SELECT — owning player OR staff via `can_manage_baseball_lift_group`; no peer-player read.

### baseball_soreness_maps
Purpose: Body-region soreness detail attached to a readiness check-in (region, side, 0-10 severity).
Key columns: id, checkin_id, team_id, player_id, body_region, side (left/right/both/center), severity (0-10)
FKs: checkin_id → baseball_readiness_checkins.id (CASCADE); player_id → baseball_players.id
RLS: SELECT — owning player OR staff with `can_view_readiness`; writes player-own only.

### baseball_bodyweight_entries
Purpose: Daily bodyweight log entry per player.
Key columns: id, team_id, player_id, entry_date (unique per player/day), weight_lbs (0-700 check), source (player/coach/import)
FKs: player_id → baseball_players.id
RLS: same pattern as soreness maps — owning player full access; staff SELECT requires `can_view_readiness`.

### baseball_availability_statuses
Purpose: Staff-authored player availability status for strength training (available/limited/hold/return_to_play/unavailable) with a reason category and visibility tier.
Key columns: id, team_id, player_id, status, reason_category, visibility (staff/performance_staff/head_coach_only), starts_at/ends_at
FKs: player_id → baseball_players.id
RLS: staff-authored writes (`can_manage_lifting`); SELECT — owning player OR staff with `can_view_readiness`.

### baseball_strength_maxes
Purpose: Tracked 1RM/training-max/velocity-profile values per player per exercise.
Key columns: id, team_id, player_id, exercise_id, max_type (estimated_1rm/tested_1rm/training_max/velocity_profile), value/unit, source
FKs: player_id → baseball_players.id; exercise_id → baseball_lift_exercises.id (CASCADE)
RLS: SELECT — owning player OR staff via `can_manage_baseball_lift_group`; INSERT/UPDATE/DELETE staff-scoped only (no player self-entry path in policy).

### baseball_strength_prs
Purpose: Personal-record ledger per player per exercise (load/reps/estimated_1rm/velocity/volume PR types), optionally tied to the session it was set in and coach-verified.
Key columns: id, team_id, player_id, exercise_id, pr_type, value/unit, achieved_at, lift_session_id (nullable), verified_by_coach_id
FKs: player_id → baseball_players.id; exercise_id → baseball_lift_exercises.id (CASCADE); lift_session_id → baseball_lift_sessions.id
RLS: SELECT — owning player OR staff; INSERT — player-own OR managing staff; UPDATE/DELETE staff-scoped only.

### baseball_lift_import_runs
Purpose: Audited, rollback-able bulk import batch header for lift data (source: TeamBuildr/TrainHeroic/Bridge/Volt/Google Sheets/CSV/manual), tracking match/unmatch counts and status lifecycle.
Key columns: id, team_id, source, import_kind (lift_assignment/lift_result/testing/wellness/attendance), file_hash, mapping_json/units_json, status (staged/validated/committed/rolled_back/failed), source_confidence
FKs: team_id → baseball_teams.id
RLS: fully staff-only — SELECT `is_baseball_team_staff`; write/update/delete `can_manage_lifting`.

### baseball_lift_import_rows
Purpose: Per-row staged import data (raw JSON payload) for a lift import run, with match status against a resolved player.
Key columns: id, import_run_id, team_id, row_number, raw_json (jsonb), matched_player_id (nullable), match_status (matched/unmatched/ambiguous/skipped), validation_error
FKs: import_run_id → baseball_lift_import_runs.id (CASCADE); matched_player_id → baseball_players.id
RLS: single `FOR ALL` policy — SELECT via `is_baseball_team_staff`, write via `can_manage_lifting`.

### 2e. Messaging / Calendar / Tasks / Travel / Documents (19 tables)

### baseball_conversations
Purpose: A DM or team-chat thread container.
Key columns: id, team_id (nullable), is_team_chat, title, created_by
FKs: team_id → baseball_teams.id (implicit); created_by → auth.users.id (implicit)
RLS: INSERT requires `created_by = auth.uid()`; SELECT requires being a participant or team member. Helper `get_my_baseball_conversation_ids()` used to scope related tables.

### baseball_conversation_participants
Purpose: Join table — which users are in a conversation.
Key columns: id, conversation_id, user_id, joined_at, last_read_at
FKs: conversation_id → baseball_conversations.id; user_id → auth.users.id
RLS: SELECT — own row OR conversation in `get_my_baseball_conversation_ids()`; INSERT — self or conversation creator; UPDATE — own row only.

### baseball_messages
Purpose: Individual chat messages within a conversation.
Key columns: id, conversation_id, sender_id, content, read (default false)
FKs: conversation_id → baseball_conversations.id; sender_id → auth.users.id
RLS: INSERT requires `sender_id = auth.uid()` AND participant of conversation; SELECT requires participant; UPDATE for read-status by any participant. Duplicate/legacy-named policies from an earlier wave ("Users can view/send/update baseball messages") coexist with the newer `baseball_messages_*` policies — same intent, redundant naming (see Gotcha G5).

### baseball_notifications
Purpose: Per-user notification feed (profile views, team invites, messages, etc.).
Key columns: id, user_id, type, title, body, data (jsonb), read_at
FKs: user_id → auth.users.id
RLS: SELECT/UPDATE restricted to `auth.uid() = user_id`. **INSERT policy is `WITH CHECK (true)` — unconditional, any authenticated user can insert a notification row for ANY user_id — this is still true today** (only the separate anon table-level GRANT was later revoked; the permissive `WITH CHECK (true)` policy itself was never tightened). See Gotcha G3. [baseline policy at `supabase/migrations/20260527000000_prod_public_baseline.sql:18078`; anon GRANT closed by `supabase/migrations/20260626000030_baseball_notifications_revoke_anon.sql`]

### baseball_announcements
Purpose: Team-wide announcement posts (coach-authored, urgency-leveled).
Key columns: id, team_id, title, content, urgency (CHECK: low/normal/high/urgent), is_pinned, published_at, created_by_id
FKs: team_id → baseball_teams.id; created_by_id → baseball_coaches.id
RLS: coach CRUD via `is_baseball_team_coach(team_id)`; player SELECT via `is_baseball_team_member` + must be a listed recipient.

### baseball_announcement_recipients
Purpose: Explicit per-player targeting list for an announcement.
Key columns: id, announcement_id, player_id
FKs: announcement_id → baseball_announcements.id; player_id → baseball_players.id
RLS: coach manages, scoped to announcements they own; player SELECT own rows.

### baseball_announcement_acknowledgements
Purpose: "Player has read this announcement" receipt.
Key columns: id, announcement_id, player_id, acknowledged_at
FKs: announcement_id → baseball_announcements.id; player_id → baseball_players.id
RLS: player INSERT/SELECT own; coach SELECT scoped to their announcements.

### baseball_events
Purpose: Calendar event (practice, game, team meeting, etc.) for a team.
Key columns: id, team_id, title, event_type, location, start_time/end_time, all_day, is_recurring, recurrence_rule, is_mandatory, rsvp_deadline, metadata (jsonb), created_by_id
FKs: team_id → baseball_teams.id; created_by_id → baseball_coaches.id
RLS: coach CRUD via `is_baseball_team_coach(team_id)`; player SELECT via `is_baseball_team_player(team_id)`.

### baseball_event_attendance
Purpose: Per-player RSVP/attendance status for a calendar event.
Key columns: id, event_id, player_id, status (going/maybe/not_going/pending), check_in_at, absence_reason, responded_at
FKs: event_id → baseball_events.id; player_id → baseball_players.id
RLS: coach select/update/delete scoped via event's team; player select/update own row.

### baseball_event_acknowledgements
Purpose: Per-user "seen/acknowledged this calendar event" read-receipt (distinct from RSVP attendance) — one row per (event, user).
Key columns: id, event_id, user_id, acknowledged_at; UNIQUE(event_id, user_id)
FKs: event_id → baseball_events.id (CASCADE); user_id → auth.users.id (CASCADE)
RLS: originally defined in `supabase/migrations/20260624000040_baseball_timeline_and_acks.sql` (self-or-team-coach via `is_baseball_team_coach_v2`/`is_baseball_team_member_v2`), then a second differently-named policy set was added by `supabase/migrations/20260624000050_baseball_rls_helpers_and_policies.sql`. `supabase/migrations/20260630165403_normalize_baseball_event_ack_policies.sql` explicitly DROPs the older `baseball_event_acks_*` policies so only the capability-aware `baseball_event_acknowledgements_*` set remains authoritative — that migration is the final contract.

### baseball_timeline_event_acks
Purpose: Acknowledgement of a `baseball_player_timeline_events` row (NOT a calendar event) — e.g. a coach marking "I've seen this stat milestone/AI insight." Deliberately a separate table from `baseball_event_acknowledgements` because the FK target and visibility scoping differ.
Key columns: id, timeline_event_id, user_id, acknowledged_at; UNIQUE(timeline_event_id, user_id)
FKs: timeline_event_id → baseball_player_timeline_events.id (CASCADE); user_id → auth.users.id (CASCADE)
RLS: RLS enabled, no anon grant; write invariant `user_id = auth.uid()`; visibility mirrors the underlying timeline event's own SELECT policy (a player can never ack a `staff_only` row they can't read). [`supabase/migrations/20260624000430_baseball_timeline_event_acks.sql`]

### baseball_tasks
Purpose: A to-do/assignment issued by a coach to the team (conditioning, academic, admin, practice, game-prep).
Key columns: id, team_id, title, due_date, status (pending/in_progress/completed/overdue/cancelled), category, priority (low/normal/high), reminder_at, is_recurring, created_by_id
FKs: team_id → baseball_teams.id; created_by_id → baseball_coaches.id
RLS: coach CRUD via `is_baseball_team_coach(team_id)`; player SELECT via `is_baseball_team_player(team_id)`.

### baseball_task_assignments
Purpose: Per-player instance of a task (completion tracking).
Key columns: id, task_id, player_id, status (pending/in_progress/completed), completed_at, notes
FKs: task_id → baseball_tasks.id; player_id → baseball_players.id
RLS: coach manages, scoped to task's team; player SELECT/UPDATE own.

### baseball_task_templates
Purpose: Reusable task blueprint a coach can spawn tasks from.
Key columns: id, team_id, title, category, created_by_id
FKs: team_id → baseball_teams.id; created_by_id → baseball_coaches.id
RLS: coach-only CRUD via `is_baseball_team_coach(team_id)` — no player policy, internal to coaching staff.

### baseball_travel_expenses
Purpose: An individual expense line item tied to a travel itinerary (or directly to a team).
Key columns: id, itinerary_id (nullable), team_id (nullable), category (CHECK: transport/lodging/meals/equipment/other), amount, paid_by, vendor_name, expense_date, receipt_url
FKs: itinerary_id → baseball_travel_itineraries.id; team_id → baseball_teams.id
RLS: coach CRUD scoped via itinerary's team or direct team_id + `is_baseball_team_coach`; player SELECT scoped via itinerary's team.

### baseball_travel_itineraries
Purpose: A trip record (event travel — dates, accommodation, transportation) for a team.
Key columns: id, team_id, event_name, departure_date/return_date, location, accommodation, transportation, notes
FKs: team_id → baseball_teams.id
RLS: coach CRUD via `is_baseball_team_coach(team_id)`; player SELECT via `is_baseball_team_player(team_id)`.

### baseball_documents
Purpose: Team document/file library (playbooks, rules, scouting, academic, admin, media).
Key columns: id, team_id, title, file_url, file_type, file_size, category, is_player_visible, uploaded_by, version_count, folder
FKs: team_id → baseball_teams.id; uploaded_by → baseball_coaches.id (implicit)
RLS: coach CRUD via `is_baseball_team_coach(team_id)`; player SELECT only when `is_player_visible = true` AND `is_baseball_team_player(team_id)`. `supabase/migrations/20260630180100_baseball_documents_capability.sql` adds a `can_manage_documents` boolean capability column to `baseball_team_coach_staff` (backfilled true for primary/head coaches and anyone with `can_manage_settings`) but **does not wire it into any RLS POLICY on `baseball_documents`** — no later migration references `can_manage_documents` in a `CREATE POLICY`. Write access is still gated purely by `is_baseball_team_coach` (any team coach); the capability column currently only has meaning at the application layer, if at all. See Gotcha G4.

### baseball_document_versions
Purpose: Version history for a `baseball_documents` row (re-uploads).
Key columns: id, document_id, file_url, version_number, uploaded_by, file_name, storage_path, change_notes
FKs: document_id → baseball_documents.id
RLS: SELECT/INSERT scoped through parent `document_id` membership (coach/player visibility inherited via subquery to `baseball_documents`).

### baseball_videos
Purpose: Player video library (swing/pitch clips), supports primary + derived clip rows.
Key columns: id, player_id, team_id (nullable), title, video_type, url, thumbnail_url, is_primary, is_clip, parent_video_id (self-FK, for clips), clip_start_time/clip_end_time
FKs: player_id → baseball_players.id; team_id → baseball_teams.id; parent_video_id → baseball_videos.id (self)
RLS: owner (player) INSERT/UPDATE/DELETE own videos; SELECT — own OR `is_baseball_team_coach(team_id)` OR `is_baseball_team_player(team_id)` OR `recruiting_activated=true AND player_type IN (high_school, showcase, juco)`. [full predicate at `supabase/migrations/20260527000000_prod_public_baseline.sql:18463-18467`]

### 2f. CoachHelm AI / Signals / Practice Planning / Postgame Review (20 tables)

### baseball_coach_insights
Purpose: AI/coach-generated insight or alert about a team or player (the CoachHelm "insight" object); V10 added ranking + attribution + maturity tracking.
Key columns: id, coach_id (NOT NULL), team_id, player_id, insight_type, title, content, priority (default 'medium'), status (default 'active'), metadata (jsonb); later additions: source_refs (jsonb), confidence, lifecycle_state (default 'detected'), player_visible (bool, default false), dedupe_key, rank_score, observation_count, first_detected_at/last_seen_at
FKs: coach_id/team_id/player_id reference baseball_coaches/baseball_teams/baseball_players but are NOT DB-level FK constraints — enforced only via RLS EXISTS checks
RLS: coach-owner-only (`baseball_coaches.id = coach_id AND user_id = auth.uid()`) for SELECT/INSERT/UPDATE — **no team-wide staff or player SELECT policy exists**, even though a `player_visible` boolean column was added in `supabase/migrations/20260624000070_baseball_coach_insights_attribution.sql`. No corresponding RLS grant for players was found — the column may be write-only/unused by policy, or gated only at the app layer. [`supabase/migrations/20260527000000_prod_public_baseline.sql:18025-18040`]

### baseball_coach_philosophy
Purpose: A coach's CoachHelm alert-tuning preferences (sensitivity thresholds, stat-priority weighting, recruiting "looking for" free text).
Key columns: id, coach_id (NOT NULL), alert_sensitivity (default 'balanced'), decline_threshold/pressure_gap_threshold/bubble_zone_range, priority_hitting/power/plate_discipline/speed/defense, looking_for_offense/defense/intangibles
FKs: coach_id → baseball_coaches (RLS-enforced, not a DB FK)
RLS: own-coach-only (identical pattern to `baseball_coach_insights`); no DELETE policy. [`supabase/migrations/20260527000000_prod_public_baseline.sql:17799-17815`]

### baseball_coach_notes
Purpose: Scoped staff notes on a player's profile with a 6-way visibility scope (`baseball_note_scope` enum); soft-deletable, edit-audited. Built for the "v7 Player Profile Snapshot System," explicitly documented as distinct from the append-only `baseball_player_timeline_events` AND from `baseball_coach_player_notes` below (see Gotcha G5 — two overlapping "note about a player" tables coexist).
Key columns: id, player_id, team_id, author_coach_id (nullable), body (NOT NULL), scope (baseball_note_scope enum, default 'staff_public'), edited_at, deleted_at (soft delete — never hard-deleted)
FKs: player_id → baseball_players.id (CASCADE); team_id → baseball_teams.id (CASCADE); author_coach_id → baseball_coaches.id (SET NULL)
RLS: scope-aware SELECT — the subject player sees only their own `player_visible` rows; staff see `staff_public`/`player_visible` unconditionally, `coach_group`/`hidden_from_player` require `baseball_staff_has_note_capability(team_id,'can_view_private_notes')`, `strength` requires `can_manage_lifting`, `academic` requires `can_view_academics`. INSERT — any team staff (author must be self). UPDATE — author or head/primary coach only (soft-delete, no hard-delete policy). [`supabase/migrations/20260624000900_baseball_coach_notes.sql:161-184`]

### baseball_coach_player_notes
Purpose: A SEPARATE, newer coach-note system tied into the Signals/Actions/Decision-Room pipeline — a note materialized from (or citing) a `baseball_signals`/`baseball_actions` row, with a simpler 3-way visibility model (`team`/`player_only`/`staff_only`). See Gotcha G5.
Key columns: id, team_id, player_id (NOT NULL), source_signal_id (nullable), source_action_id (nullable), title, body (NOT NULL), source_refs (jsonb, default []), visibility (CHECK: team/player_only/staff_only, default 'staff_only'), author_coach_id, created_by
FKs: team_id → baseball_teams.id (CASCADE); player_id → baseball_players.id (CASCADE); source_signal_id → baseball_signals.id (SET NULL); source_action_id → baseball_actions.id (SET NULL); author_coach_id → baseball_coaches.id (SET NULL); created_by → auth.users.id (SET NULL)
RLS: UNVERIFIED exact policy text — table has `ENABLE ROW LEVEL SECURITY` in `supabase/migrations/20260624000230_baseball_signal_action_materialization.sql`; almost certainly follows the same visibility-gated staff/player split as `baseball_signals`/`baseball_actions` (below) — confirm the literal `CREATE POLICY` block before relying on an exact predicate.

### baseball_ai_audit
Purpose: Append-only governance/audit log of every AI-generated output (signal, insight, or brief) and its downstream approval — a staff-only compliance surface, not a player-facing feature.
Key columns: id, team_id (NOT NULL), player_id (nullable — team-wide outputs allowed), output_kind (CHECK: signal/insight/brief, default 'signal'), generator
FKs: team_id → baseball_teams.id (CASCADE); player_id → baseball_players.id (SET NULL)
RLS: staff-only SELECT and INSERT; UPDATE staff-only (intended for review/approval columns, enforced at app layer not column-level RLS); **explicitly no DELETE policy — append-only**, retention/purge is out-of-band. anon revoked. [`supabase/migrations/20260624000450_baseball_ai_audit_log.sql:125-144`]

### baseball_signals
Purpose: The CoachHelm "operational signal" — a triaged, source-backed detection (from stats, imports, readiness data, scheduling conflicts, or an AI insight) that a coach can acknowledge, dismiss, or convert into one or more `baseball_actions`. Explicitly NOT a replacement for `baseball_coach_insights` — a signal may cite an insight via `source_refs` but is a broader, separate object.
Key columns: id, team_id (NOT NULL), player_id (nullable), signal_type, category (default 'operations'), severity (CHECK: critical/warning/info), evidence, source_refs (jsonb, NOT NULL default [] — "never empty for a real signal"), confidence (0-1), recommended_action_type, owner_coach_id, disposition (CHECK: new/acknowledged/sample_too_small/converted/dismissed/resolved/expired, default 'new'), visibility (CHECK: team/player_only/staff_only, default 'staff_only'), source_kind (CHECK: manual/csv_import/integration/ai/system/unknown), dedupe_key (team+generator+subject UPSERT key so re-runs never clone)
FKs: team_id → baseball_teams.id (CASCADE); player_id → baseball_players.id (CASCADE); owner_coach_id → baseball_coaches.id (SET NULL)
RLS: SELECT — `is_baseball_team_staff(team_id)` OR (`visibility IN ('team','player_only')` AND `player_id = get_my_baseball_player_id()`); INSERT/UPDATE — staff only (system/AI writes go through service_role, bypassing RLS); DELETE — primary coach only ("signals are append-mostly; dispositions, not deletes"). [`supabase/migrations/20260624000092_baseball_signals_and_actions.sql:263-294`]

### baseball_actions
Purpose: The assignable, convertible work item a `baseball_signals` row converts into (e.g. a practice block, a player task, a video request); tracks outcome after the fact (V10 Decision Room outcome ledger).
Key columns: id, team_id (NOT NULL), signal_id (nullable), player_id (nullable), action_type (CHECK: practice_block/player_task/video_request/lift_modification/meeting_item/message/player_note/import_review), target_table/target_id, owner_coach_id/assignee_coach_id/assignee_player_id, due_date, status (CHECK: open/in_progress/blocked/completed/cancelled, default 'open'), visibility (CHECK: team/player_only/staff_only, default 'staff_only'), outcome/outcome_recorded_at (V10)
FKs: team_id → baseball_teams.id (CASCADE); signal_id → baseball_signals.id (SET NULL); player_id → baseball_players.id (CASCADE); owner_coach_id/assignee_coach_id → baseball_coaches.id (SET NULL); assignee_player_id → baseball_players.id (SET NULL)
RLS: SELECT — staff see all team actions; a player sees an action ONLY if assigned to them AND `visibility IN ('team','player_only')` — never a `staff_only` action even if assigned to them. INSERT/UPDATE staff-gated; DELETE primary-coach-only (same pattern as `baseball_signals`). [`supabase/migrations/20260624000092_baseball_signals_and_actions.sql:296-345`]

### baseball_decision_log
Purpose: Append-only ledger of decisions made in the "Decision Room" over a `baseball_meeting_items` agenda item (discussed/actioned/deferred/etc.) — the audit trail behind the meeting-items workflow.
Key columns: id, team_id (NOT NULL), decision_kind, plus fields linking back to the meeting item and recording who/when
FKs: team_id → baseball_teams.id (CASCADE); (additional FKs to `baseball_meeting_items` — verify exact column list in the migration if precise schema is needed)
RLS: staff-only per migration header ("the Decision Room is coach-only"); append-only ledger — "no delete-then-reinsert" is called out explicitly even though a delete policy exists (likely primary-coach-only correction path). [`supabase/migrations/20260624000310_baseball_decision_log.sql:53+`, policies at 97-108]

### baseball_meeting_items
Purpose: A staff-only Decision Room agenda item — created from a signal or action conversion, tracked through an 'open' → 'discussed' → 'resolved'/'archived' lifecycle, resolvable with a recorded decision.
Key columns: id, team_id (NOT NULL), source_signal_id (nullable), source_action_id (nullable), player_id (nullable — single "affected player" subject), title, detail, source_refs (jsonb, default []), owner_coach_id, status (CHECK: open/discussed/resolved/archived, default 'open'), resolution, resolved_at/resolved_by; `discussed_at`/`discussed_by` added later by the decision-log migration
FKs: team_id → baseball_teams.id (CASCADE); source_signal_id → baseball_signals.id (SET NULL); source_action_id → baseball_actions.id (SET NULL); player_id → baseball_players.id (SET NULL); owner_coach_id → baseball_coaches.id (SET NULL)
RLS: UNVERIFIED exact policy text — table is `ENABLE ROW LEVEL SECURITY`'d in `supabase/migrations/20260624000230_baseball_signal_action_materialization.sql:56-81`; per the migration's header ("RLS ENABLED... anon REVOKEd explicitly... reuses existing SECURITY DEFINER helpers") almost certainly staff-only, matching `baseball_signals`/`baseball_actions`, but the literal `CREATE POLICY` block was not located — verify before citing a specific predicate.

### baseball_developmental_plans
Purpose: A coach-authored player development plan with goals and a date range (baseline table, distinct from the newer practice/signal-driven CoachHelm objects).
Key columns: id, coach_id (NOT NULL), player_id (NOT NULL), team_id (nullable), title (NOT NULL), status (default 'draft'), start_date/end_date, goals (jsonb, default [])
FKs: coach_id/player_id/team_id reference baseball_coaches/baseball_players/baseball_teams but are RLS-enforced only, not DB-level FKs, in the baseline
RLS: SELECT — owning coach OR the subject player; INSERT/UPDATE/DELETE — owning coach only. [`supabase/migrations/20260527000000_prod_public_baseline.sql:7624-7637`, policies at 17883-17910]

### baseball_player_timeline_events
Purpose: Append-only history of notable player events (the canonical "what happened and when" record for a player), with a 3-value visibility model — distinct from the editable `baseball_coach_notes`.
Key columns: id, player_id (NOT NULL), team_id (NOT NULL), event_type (NOT NULL), title (NOT NULL), body, source_type/source_id (provenance), confidence, occurred_at (default now()), visibility (default 'team', CHECK: team/staff_only/player_only)
FKs: player_id → baseball_players.id (CASCADE); team_id → baseball_teams.id (CASCADE)
RLS: visibility-gated — 'team' visible to all team members, 'staff_only' to coaches/staff only, 'player_only' to the subject player + coaches, via `is_baseball_team_coach_v2()`/`is_baseball_team_member_v2()`. Same migration creates `baseball_event_acknowledgements` (acks on calendar events, §2e) — NOT to be confused with `baseball_timeline_event_acks` (acks on THIS table, added later by a different migration); verify which is the live path before building on either. [`supabase/migrations/20260624000040_baseball_timeline_and_acks.sql:94-122`]

### baseball_practices
Purpose: One row per planned practice session (draft → published → completed), optionally linked to a `baseball_events` calendar entry.
Key columns: id, team_id (NOT NULL), event_id (nullable), title (NOT NULL), focus, status (CHECK: draft/published/completed, default 'draft'), published_at
FKs: team_id → baseball_teams.id; event_id → baseball_events.id
RLS: defined in the LATER `supabase/migrations/20260624000050_baseball_rls_helpers_and_policies.sql:597-618` — the practices migration itself enables RLS with no policies, so the table is unreadable until 0050 lands. SELECT — team staff OR any team member when `status='published'`; INSERT/UPDATE/DELETE — staff with `can_manage_practice` capability.

### baseball_practice_blocks
Purpose: A timed activity/station block within a practice (start offset + duration + activity + location + owning coach).
Key columns: id, team_id (NOT NULL), practice_id (NOT NULL), start_offset_min/duration_min, activity (NOT NULL), location, coach_owner_id
FKs: team_id → baseball_teams.id; practice_id → baseball_practices.id (CASCADE); coach_owner_id → baseball_coaches.id
RLS: SELECT — staff, or a team member when the parent practice is published; INSERT/UPDATE/DELETE — `can_manage_practice`. [`supabase/migrations/20260624000050_baseball_rls_helpers_and_policies.sql:624-658`]

### baseball_practice_attendance
Purpose: Per-player attendance status for a practice (present/limited/absent/excused); UNIQUE(practice_id, player_id) supports idempotent upsert.
Key columns: id, team_id (NOT NULL), practice_id (NOT NULL), player_id (NOT NULL), status (CHECK: present/limited/absent/excused), reason
FKs: team_id → baseball_teams.id; practice_id → baseball_practices.id (CASCADE); player_id → baseball_players.id
RLS: SELECT — staff with `can_manage_practice`, OR the player themself; INSERT/UPDATE/DELETE — staff `can_manage_practice` only. [`supabase/migrations/20260624000050_baseball_rls_helpers_and_policies.sql:663-690`]

### baseball_practice_block_objectives
Purpose: The "what was practiced" objective attached to a practice block — a measurable focus area with a target CoachHelm metric id and the specific players it targeted, and a completion status.
Key columns: id, team_id (NOT NULL), practice_id (NOT NULL), block_id (nullable), focus_area (NOT NULL), objective, target_metric (nullable — "metric not tracked" is an honest null, not an error), player_ids (uuid[], default {}), completion_status (default 'planned')
FKs: team_id → baseball_teams.id; practice_id → baseball_practices.id (CASCADE); block_id → baseball_practice_blocks.id (CASCADE)
RLS: staff manage fully (`bpbo_staff_manage`); players get a read-only policy scoped to published practices (`bpbo_player_read_published`). [`supabase/migrations/20260624000094_baseball_practice_effectiveness.sql:220-245`]

### baseball_practice_effectiveness_reviews
Purpose: A staff-only "did this objective move the intended metric" review — CoachHelm's practice-effectiveness output; explicitly blends game/scrimmage/practice scopes that must stay labeled and never leak un-labeled to players.
Key columns: id, team_id (NOT NULL), practice_id (NOT NULL), objective_id (nullable — null = practice-level rollup), focus_area (NOT NULL), metric_id (nullable), player_ids (uuid[], default {}), linked_signal_ids (uuid[], default {} — despite the name, links to `baseball_coach_insights` ids)
FKs: team_id → baseball_teams.id; practice_id → baseball_practices.id (CASCADE); objective_id → baseball_practice_block_objectives.id (SET NULL)
RLS: staff-only by default (read + write, `bpe_staff_read`/`bpe_staff_write`); a separate `bpe_player_read_visible` policy exists for explicitly-marked-visible rows. [`supabase/migrations/20260624000094_baseball_practice_effectiveness.sql:257-290`]

### baseball_practice_lineup_slots
Purpose: A per-player defensive/batting-order assignment within a `baseball_practice_scrimmages` row (intrasquad team split, defensive position, batting order, innings played).
Key columns: id, team_id (NOT NULL), scrimmage_id (NOT NULL), player_id (NOT NULL), side (CHECK: blue/white), defensive_position (CHECK, incl. bench/bullpen), batting_order (1-9 or NULL), inning_start/inning_end
FKs: team_id → baseball_teams.id; scrimmage_id → baseball_practice_scrimmages.id (CASCADE); player_id → baseball_players.id
RLS: pattern mirrors `baseball_practice_blocks` — staff manage; player visibility gated on the parent published/non-staff_only scrimmage. [`supabase/migrations/20260624000200_baseball_practice_deepening.sql:243-273`]

### baseball_practice_scrimmages
Purpose: A scrimmage realized from (or independent of) a practice block, with a defined mode (intrasquad/situational/pitcher_live_ab/defense_only/bullpen_live) and its own draft/published/completed lifecycle.
Key columns: id, team_id (NOT NULL), practice_id (nullable), block_id (nullable), title (NOT NULL), mode (CHECK, 5 fixed values, default 'intrasquad'), status (CHECK: draft/published/completed, default 'draft'), notes
FKs: team_id → baseball_teams.id; practice_id → baseball_practices.id (CASCADE); block_id → baseball_practice_blocks.id (SET NULL)
RLS: same staff-manage / player-sees-published pattern as `baseball_practices`. [`supabase/migrations/20260624000200_baseball_practice_deepening.sql:201-223`]

### baseball_postgame_reviews
Purpose: An AI-assisted postgame review tied to a `baseball_games` row, tracking the completeness of the box-score import it was built from (official/partial/imported/manual/missing) and carrying a confidence + visibility contract per item.
Key columns: id, team_id (NOT NULL), game_id (nullable), coach_id (nullable — "AI rows are coach-attributed, like baseball_coach_insights"), source_status (CHECK: official/partial/imported/manual/missing, default 'official'), batting_lines_n/pitching_lines_n (default 0), import_warnings (jsonb, default [])
FKs: team_id → baseball_teams.id; game_id → baseball_games.id (SET NULL); coach_id → baseball_coaches.id
RLS: staff/player split enforced inline in this migration — "staff-only decision items are never exposed to players; players see only their own player-visible timeline-candidate items" (mirrors the `baseball_signals`/`baseball_actions` visibility model). [`supabase/migrations/20260624000093_baseball_postgame_reviews.sql:195-227`]

### baseball_postgame_review_items
Purpose: An individual item within a postgame review, typed by what it proposes (timeline_update/staff_decision/practice_focus/workload_update/video_evidence) — the per-player or team-level output rows of a review; UNIQUE dedupe key per (review, item key) so re-generation upserts in place rather than delete-then-insert.
Key columns: id, team_id (NOT NULL), review_id (NOT NULL), player_id (nullable — null for team-level items), item_kind (CHECK: timeline_update/staff_decision/practice_focus/workload_update/video_evidence)
FKs: team_id → baseball_teams.id; review_id → baseball_postgame_reviews.id (CASCADE); player_id → baseball_players.id
RLS: same staff/player-visible split as the parent `baseball_postgame_reviews`, scoped per-item by `item_kind`/visibility. [`supabase/migrations/20260624000093_baseball_postgame_reviews.sql:233-260`]

> `supabase/migrations/20260624000210_baseball_coachhelm_v10_ranking_and_outcome_ledger.sql`
> creates NO new table — it's purely additive columns: `baseball_coach_insights.rank_score`
> (materialized multi-factor ranking used by Command Center/Signals/Player Profile to sort
> consistently) and outcome-attribution columns on `baseball_actions` (target-metric baseline
> value at conversion, later observed value, signed movement) extending the existing
> `outcome`/`outcome_recorded_at` columns — the V10 "did the action actually move the metric"
> ledger.

---

## 3. Enums

Confirmed from the `Enums` block of `src/lib/types/database.ts` (public schema), cross-checked
against `CREATE TYPE`/`::type` casts in `supabase/migrations/20260527000000_prod_public_baseline.sql`.
This is the COMPLETE list of baseball-relevant enums — there are no others.

| Enum | Values | Used by |
|------|--------|---------|
| **`baseball_pipeline_stage`** | `watchlist` \| `high_priority` \| `offer_extended` \| `committed` \| `uninterested` | `baseball_watchlists.pipeline_stage` |
| `baseball_coach_type` | `college` \| `juco` \| `high_school` \| `showcase` | `baseball_coaches.coach_type`, `baseball_teams.team_type` |
| `baseball_player_type` | `college` \| `juco` \| `high_school` \| `showcase` | `baseball_players.player_type` |
| `baseball_note_scope` | `staff_public` \| `coach_group` \| `strength` \| `academic` \| `player_visible` \| `hidden_from_player` | `baseball_coach_notes.scope` |
| `organization_type` (shared, not baseball-prefixed) | `college` \| `juco` \| `high_school` \| `showcase` | `organizations.type` |
| `team_member_status` (shared with golf) | `pending` \| `active` \| `inactive` \| `removed` | `baseball_team_members.status`, `golf_team_members.status` |

Note `baseball_coach_type`, `baseball_player_type`, and `organization_type` are three SEPARATE
Postgres enum objects that happen to share the identical four string values — they are not
interchangeable at the type-system level even though they always agree in practice.

**`PipelineStage` (canonical TypeScript type):** `src/lib/types/index.ts:49` —
```ts
export type PipelineStage = Enums['baseball_pipeline_stage'];
```
i.e. the TypeScript type is generated directly from the DB enum, so it is (by construction)
always exactly `'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested'`
— 5 values, matching `CLAUDE.md`'s "Pipeline Stages (Baseball - only 5 valid)" note verbatim.
**See Gotcha G0 — `src/lib/recruiting/stages.ts` does NOT respect this.**

Every `visibility`/`status`/`disposition`/`trust_tier`/`data_context` field described in §2 above
(e.g. on `baseball_signals`, `baseball_actions`, the elite-event tables) is a plain `text` column
with a `CHECK` constraint, NOT a Postgres enum — confirmed by their absence from the `Enums`
block in `database.ts`. Don't look for e.g. a `baseball_signal_visibility` enum; it doesn't exist.

---

## 4. RLS Helper Functions

All are `SECURITY DEFINER`, most `SET search_path = public, pg_temp`. Defined across the
baseline and `supabase/migrations/20260624000050_baseball_rls_helpers_and_policies.sql` (the
dedicated "Wave 1" helpers file).

**Identity primitives (baseline, shared building blocks):**
- `get_my_coach_id()` — `SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1`. Still `GRANT ALL ... TO anon` in the baseline with no later REVOKE found (see Gotcha G3).
- `get_my_player_id()` — same shape for `baseball_players`. Also still anon-granted (Gotcha G3).
- `get_my_baseball_player_id()` — sport-prefixed alias of `get_my_player_id()`, added by the 0050 helpers migration "so the baseball policy set is self-describing." REVOKEd from anon in that same migration, and again defensively in `supabase/migrations/20260630170248_harden_baseball_phase1_rls_rollup.sql:7`.

**Team-membership checks (note the v1/v2 duplication — see Gotcha G3):**
- `is_baseball_team_coach(team_uuid)` — any staff row for the team. Still anon-granted, no REVOKE found (Gotcha G3).
- `is_baseball_team_coach_v2(p_team_id)` — functionally identical rewrite; anon REVOKEd in the baseline itself (line 20557).
- `is_baseball_team_member(team_uuid)` — active roster membership (`baseball_team_members.status = 'active'`). Re-affirmed (identical body) by the 0050 migration "so the baseball policy set is self-contained and re-runnable."
- `is_baseball_team_member_v2(p_team_id)` — parallel rewrite. Still anon-granted, no REVOKE found (Gotcha G3).
- `is_baseball_team_player(team_uuid)` — **body-for-body identical to `is_baseball_team_member(team_uuid)`** (same active-roster EXISTS check). A true duplicate, not a semantic variant. Still anon-granted, no REVOKE found (Gotcha G3).
- `is_baseball_primary_coach(p_team_id)` — `baseball_team_coach_staff.is_primary = true` for the caller.
- `is_baseball_team_staff(p_team_id)` — any staff row at all (head coaches are NOT separate — a head coach IS a staff row with `is_head_coach`/`is_primary` set). 0050 migration's header explicitly notes there is no `baseball_teams.head_coach_id` column to reference (see Gotcha G2).

**Capability-aware helpers (all from the 0050 migration, gate the staff-capability model on `baseball_team_coach_staff`):**
- `has_baseball_staff_capability(p_team_id, p_capability)` — resolution order: (1) primary coach → all capabilities, (2) `is_head_coach` → all capabilities, (3) dedicated boolean column (e.g. `can_manage_imports`) == true, (4) `capabilities` jsonb — object form `{"<cap>": true}` OR array form `["<cap>", ...]`. Suspended/removed/invited staff get `false` unconditionally.
- `can_view_baseball_player(p_team_id, p_player_id)` (two-arg) — true if viewer IS the player, else requires team staff whose `player_scope`/`position_scope` (if configured) admits the player; no scope configured → team-wide staff visibility.
- `can_view_baseball_player(p_player_id)` (one-arg convenience) — derives the player's team then defers to the two-arg form.
- `can_manage_baseball_lift_group(p_team_id, p_player_id)` — `has_baseball_staff_capability(team_id, 'can_manage_lifting')` AND (`p_player_id IS NULL` OR `can_view_baseball_player`).
- `baseball_can_invite_staff(p_team_id)` — primary coach OR (`is_head_coach = true` OR `can_invite_staff = true`) on the caller's staff row. [`supabase/migrations/20260624000030_baseball_staff_capabilities.sql:72-89`]
- `baseball_staff_has_note_capability(p_team_id, p_capability)` — the note-scope-specific variant used by `baseball_coach_notes` (see §2f). [`supabase/migrations/20260624000900_baseball_coach_notes.sql:62+`]
- `baseball_log_staff_change(...)` — trigger function writing `baseball_staff_audit_events`, not a policy predicate.

**RPCs (not RLS predicates, but SECURITY DEFINER data-mutating/reading entry points worth knowing):**
- `get_baseball_public_player_stats(...)` — the sole anon-safe path to `baseball_player_season_stats`; re-checks `recruiting_activated`/`profile_visibility`/discoverability itself rather than relying on table RLS. [`supabase/migrations/20260624001401_baseball_public_player_stats_rpc.sql`]
- `save_baseball_full_box_score(...)` — atomic multi-table write (batting + pitching + game score) with its own coach/team check, used instead of direct table INSERTs. [`supabase/migrations/20260630000000_baseball_save_full_box_score_rpc.sql`]
- `baseball_replace_lineup_positions(...)` — atomic swap of a lineup's positions (avoids delete-then-insert). [`supabase/migrations/20260624001600_baseball_replace_lineup_positions_rpc.sql`]
- `try_redeem_baseball_team_invitation(...)` / `release_baseball_team_invitation_redemption(...)` — invitation-code redemption pair. [`supabase/migrations/20260630180200_baseball_team_invitation_redeem_rpc.sql`]
- `baseball_accept_staff_invite(...)` — staff-invitation acceptance. [`supabase/migrations/20260624000062_baseball_accept_staff_invite_rpc.sql`]
- `recalculate_baseball_season_stats(p_player_id, p_team_id, p_season_year)` / `recalculate_team_baseball_season_stats(p_team_id, p_season_year)` — season-stat rollup; a body-level `is_baseball_team_coach_v2(p_team_id)` guard was added by `supabase/migrations/20260528000000_baseball_recalc_body_guards.sql` after `docs/operations/2026-05-27-baseball-tables-scope.md` found the RPCs were `GRANT`ed to `authenticated` with **no in-body coach check**, so any authenticated caller could invoke them directly via PostgREST.
- `get_baseball_conversations_with_details(p_user_id)` / `get_my_baseball_conversation_ids()` / `get_admin_baseball_rollup(...)` — messaging/admin rollups. `get_admin_baseball_rollup` had its `PUBLIC` grant revoked by `supabase/migrations/20260602165152_harden_search_path_and_revoke_anon_admin_fns.sql`; the other two still carry `GRANT ALL ... TO anon` from the baseline with no later REVOKE found (Gotcha G3).

---

## 5. Known Drift / Gotchas

**G0 — `src/lib/recruiting/stages.ts` defines 2 pipeline-stage values that DO NOT EXIST in the DB enum.**
`src/lib/recruiting/stages.ts` exports `PIPELINE_STAGES`, a 7-entry array including `'contacted'`
and `'campus_visit'`, each force-cast `as PipelineStage`. The DB enum `baseball_pipeline_stage`
(and therefore the generated `PipelineStage` type at `src/lib/types/index.ts:49`) has only 5
values: `watchlist | high_priority | offer_extended | committed | uninterested`. The `as
PipelineStage` casts silence TypeScript, but writing `'contacted'` or `'campus_visit'` into
`baseball_watchlists.pipeline_stage` will fail at the DB with an invalid-enum-value error at
runtime. Anything driven by `PIPELINE_STAGES` (a stage-picker UI, `getNextStage()`) is
currently offering 2 stages that cannot be persisted. Matches `CLAUDE.md`'s explicit "Pipeline
Stages (Baseball - only 5 valid)" callout — this file is the one place that violates it.

**G1 — Two live, unsynced "Lift Lab" schemas coexist: `baseball_lift_*`/`baseball_strength_*` vs `helm_lifting_*`.**
Neither family is deprecated; both are actively used by *different* app surfaces and are NOT
kept in sync going forward. `baseball_lift_*`/`baseball_strength_*`/`baseball_exercises`/
`baseball_readiness_checkins`/`baseball_soreness_maps`/`baseball_bodyweight_entries`/
`baseball_availability_statuses` (built by `supabase/migrations/20260624000061_baseball_lifting_performance.sql`
"Lite" and `supabase/migrations/20260624000063_baseball_v11_premium_lifting.sql` "V11
Premium") are the write path for BaseballHelm's embedded Lift Lab under
`src/app/baseball/(dashboard)/dashboard/performance/*`. Separately,
`supabase/migrations/20260625000000_helm_lifting_identity.sql` through
`supabase/migrations/20260625000090_helm_lifting_soreness_weight_nutrition.sql` built a
**sport-agnostic, standalone "Helm Lifting Lab" product** with its own identity model
(`helm_lifting_coaches`/`helm_lifting_athletes`, NOT FK'd to `baseball_coaches`/
`baseball_players`) powering a separate top-level route tree at `src/app/lifting/*`.
`supabase/migrations/20260625000080_helm_lifting_backfill_from_baseball.sql` did a **one-time,
one-directional** copy of existing `baseball_lift_*` data into `helm_lifting_*` (idempotent via
a `legacy_baseball_id` unique key) — historical data matches as of cutover, but a set logged
today in BaseballHelm's Lift Lab does NOT appear in `/lifting`, and vice versa. No
cross-references exist between the two table families or route trees in `src/`. This is a
live, unresolved schema/product split, not a completed migration. Also: `src/lib/supabase/untyped.ts`
allowlists every `helm_lifting_*` table under a `fromUntyped()` escape hatch with a comment
claiming they are "not yet in generated Database types" — but `src/lib/types/database.ts`
DOES contain all 40 `helm_lifting_*` tables as of this mining pass, so that comment (and
possibly the whole untyped-cast pattern for this table family) is now stale.

**G2 — `docs/BASEBALL_RLS_SECURITY_AUDIT.md` (dated 2026-02-21) describes a schema that no longer exists.**
The audit doc's §3/§5 describe `baseball_teams` UPDATE/DELETE as "Head coach only," resolved via
a `baseball_teams.head_coach_id` column, and its Executive Summary lists `is_baseball_team_coach()`/
`is_baseball_team_member()` as "the" security helpers. The `head_coach_id` column was DROPPED by
`supabase/migrations_archive/pre_20260527/20260222220100_drop_head_coach_id.sql`
(`"head_coach_id was incorrectly added to baseball_teams; the canonical team-coach relationship
is tracked via baseball_team_coach_staff (with is_primary flag)."`) — confirmed absent from the
current baseline (`supabase/migrations/20260527000000_prod_public_baseline.sql:8195-8208`, no
`head_coach_id` column; zero occurrences of the string `head_coach_id` anywhere in the current
baseline). The 0050 RLS-helpers migration's own header spells this out explicitly: *"The
head-coach identity now lives on `baseball_team_coach_staff.is_head_coach` ... NOT on a
`baseball_teams.head_coach_id` column — that column does not exist in the prod baseline, and
referencing it here would make every caller throw `column t.head_coach_id does not exist` at
query time."* Treat every policy description in `docs/BASEBALL_RLS_SECURITY_AUDIT.md` as a
snapshot of the pre-2026-05-27 schema, not the current one — verify against the actual
`CREATE POLICY` text before relying on it.

**G3 — Several baseball SECURITY DEFINER RPCs are still `GRANT ALL ... TO anon`, with no REVOKE found in any migration.**
Confirmed still anon-granted as of the newest migrations in this repo (grepped every
`supabase/migrations/*.sql` for a matching `REVOKE`/none found):
`get_my_coach_id()`, `get_my_player_id()`, `is_baseball_team_coach(uuid)`,
`is_baseball_team_member_v2(uuid)`, `is_baseball_team_player(uuid)`,
`get_baseball_conversations_with_details(uuid)`, `get_my_baseball_conversation_ids()`.
This matches `docs/audits/BASEBALLHELM_LIFTLAB_GAP_MAP_2026-06-25.md` Wave 2's flagged item
("8 baseball SECURITY DEFINER RPCs callable by anon") — a sibling hardening migration,
`supabase/migrations/20260630170248_harden_baseball_phase1_rls_rollup.sql`, DID revoke anon on
a different set (the 0050-file helpers: `get_my_baseball_player_id`, `is_baseball_team_staff`,
`has_baseball_staff_capability`, `can_view_baseball_player` ×2, `is_baseball_team_member`,
`can_manage_baseball_lift_group`) but left the older baseline-era functions listed above
untouched. Calling any of these as `anon` just returns `NULL`/`false` (since `auth.uid()` is
NULL for unauthenticated requests) so it is not a direct data leak by itself, but it is exactly
the class of finding Supabase's security advisor flags (`anon_security_definer_function_executable`)
and was called out as still-open in the 2026-06-25 gap map.

**G4 — `baseball_documents.can_manage_documents` capability column exists but is not wired into any RLS policy.**
`supabase/migrations/20260630180100_baseball_documents_capability.sql` adds and backfills a
`can_manage_documents` boolean on `baseball_team_coach_staff`, but no migration references it in
a `CREATE POLICY` on `baseball_documents` — write access there is still gated by the blunter
`is_baseball_team_coach(team_id)` (any team coach, not just document-capable staff). The column
currently has meaning only if read at the application layer (verify against `src/app/baseball/actions/documents.ts`
before assuming it's enforced anywhere).

**G5 — Duplicate/overlapping objects exist side-by-side; know which one a given surface reads before building on either:**
- `baseball_coach_notes` (6-scope `baseball_note_scope` enum, v7 Player Profile Snapshot System) vs `baseball_coach_player_notes` (3-way `team`/`player_only`/`staff_only`, Signals/Actions Decision Room pipeline) — both are "a coach note about a player," created by different migrations for different surfaces.
- `baseball_event_acknowledgements` (ack on a `baseball_events` calendar row) vs `baseball_timeline_event_acks` (ack on a `baseball_player_timeline_events` row) — different FK targets, easy to confuse by name.
- `is_baseball_team_member(team_uuid)` and `is_baseball_team_player(team_uuid)` are body-for-body **identical** functions (both check active `baseball_team_members` roster status) — a true duplicate, not a semantic distinction.
- `baseball_stat_uploads` (older, generic) vs `baseball_box_score_uploads` (newer, box-score-specific) — both are "a stat file upload," and `baseball_stat_sources` (elite-event-model registry) vs `baseball_import_sources` (Settings-OS registry) similarly overlap in purpose.
- `baseball_messages` carries both the current `baseball_messages_*` policy set and legacy `"Users can view/send/update baseball messages"`-named policies from an earlier wave, left in place rather than dropped.

**G6 — `baseball_players_select` and `baseball_player_percentiles`'s SELECT policy are unscoped (`USING (true)`).**
`baseball_players_select` (`supabase/migrations/20260527000000_prod_public_baseline.sql:18179`)
is `FOR SELECT TO authenticated USING (true)` — **any authenticated user (coach or player) can
read every column of every `baseball_players` row**, regardless of `recruiting_activated` or
team membership, and no later migration touches this policy (grepped every migration for
`baseball_players_select`/any `POLICY.*baseball_players` — none found outside the baseline).
This directly contradicts both `docs/BASEBALL_RLS_SECURITY_AUDIT.md` §2 (which describes a
multi-condition SELECT gated by `recruiting_activated`/team membership — that description is
stale, see G2) and the CLAUDE.md "opt-in recruiting activation" product model (players who have
NOT activated recruiting should be invisible to non-team coaches, but currently are not, at
least via direct table SELECT). Exposed columns include email, phone, city/state, GPA, SAT/ACT
scores. This is the single most consequential live finding in this document — verify against
`information_schema`/an actual Supabase security-advisor run before treating it as fixed.
`baseball_player_percentiles` has the same unscoped `USING (true)` SELECT pattern but is
lower-severity (percentile-only rows, no PII) and may be intentional platform-wide recruiting
data — see its entry in §2c.

**G7 — `memory/glossary.md`'s baseball section and `src/lib/types/database.ts` are at different freshness levels; both lag the migrations directory.**
`memory/glossary.md` (lines 251-297) lists only the 47 baseline `baseball_*` tables — it predates
every `baseball_*` migration after `20260527000000`. `src/lib/types/database.ts` is far more
current (118 of the 119 confirmed `baseball_*` tables), but is still missing
`baseball_demo_sessions` (added 2026-06-30, the newest migration found). Regenerate types
(`npm run docs:regen` per `CLAUDE.md`, plus a fresh `supabase gen types`) before trusting either
file as exhaustive for new work.

**G8 — Migration-file presence in this repo is not proof a table/policy is live in prod; verify against `information_schema`.**
Two contradictory signals exist in the docs for the same week: `docs/audits/BASEBALLHELM_LIFTLAB_GAP_MAP_2026-06-25.md`
(morning of 2026-06-25) states "59 pending migrations not applied to prod DB — all tables
gated," while `docs/audits/BASEBALLHELM_PRODUCTION_VERDICT.md` (same day, later) reports prod
already had "118 baseball + 26 lifting tables" applied via an out-of-band session that predated
the audit. Several individual migration file headers in this repo also say **"This file is
WRITTEN, NOT APPLIED"** verbatim (e.g. `supabase/migrations/20260624000050_baseball_rls_helpers_and_policies.sql:19`,
`supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql`). Do not assume a
table, column, enum value, RLS policy, or function described in this document — including
everything mined from migration files above — is actually live on the production database
without an `information_schema`/live-query check first. This mirrors the general project
pattern already captured in memory (`schema_migrations` table history is unreliable).
