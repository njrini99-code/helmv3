# BaseballHelm Canonical Spec — Single Source of Truth

> **Generated:** 2026-06-24  
> **Precedence:** V12 > V11 > V10 > V9 > earlier. Where versions conflict, later version wins; conflict calls noted inline.  
> **Repo:** `~/Downloads/helmv3` — all new work extends this codebase, not a parallel product.  
> **DB rule:** Supabase is SHARED with live GolfHelm production. Every change is purely additive — no ALTER/DROP of any `golf_*` object; REVOKE anon after every new table.

---

## 1. Product Definition + Scope

### What BaseballHelm IS

A premium, data-dense coaching intelligence platform for baseball programs (college, JUCO, high school, showcase). It is:

- A **coach operations command center** — signals, practice planning, roster ops, decision ledger, import trust.
- A **player development passport** — source-backed development plans, daily contract, stat history, video evidence.
- A **performance/lifting management system** (the "Helm Lifting Lab") — unified cross-sport lifting model, live weight room, readiness, workload.
- A **source-traceable stat engine** — all stats have source chips, import lineage, confidence, and context (official/scrimmage/practice/sensor).
- A **staff collaboration layer** — staff invites, capability matrix, staff decision room, action lifecycle.

### Phase 0 (Task 0 Gate — V12 OVERRIDES all earlier phases)

**Hard prerequisite:** The BaseballHelm Ultracode Command Center (`scripts/baseballhelm-command-center.mjs`) must be running at `127.0.0.1:4877`, opened in Google Chrome, and the `command_center_verified` event must be logged before any product code (routes, migrations, auth, actions, lifting, stats, CoachHelm) is written.

**Acceptance gate checklist:**
- `GET /api/health` returns `{ ok: true, agents_loaded >= 10, packets_loaded >= 18 }`
- `index.html`, `styles.css`, `app.js` all load; cream/parchment + deep-green palette renders (no black)
- All 13 named agent lanes seeded in `agents.json`
- All 20 named work packets seeded in `work-packets.json` with weights and checklists
- At least one event in `events.ndjson`
- `command_center_verified` event logged
- Chrome opened via `open -a 'Google Chrome' 'http://127.0.0.1:4877'`

### Phase 1 In-Scope Features

All features in sections 2–11 below. Prioritized delivery order: migrations + type safety → Lifting Lab (the largest incomplete block) → nav registry fix → announcements/dev-plan wiring → role-permission enforcement → final UX polish.

### Explicitly Out of Scope (do not build)

- **No separate auth identity for lifting coaches.** A lifting coach is a `baseball_coaches` or `helm_lifting_coaches` row attached via `helm_lifting_coach_assignments`; NOT a new entry in any `coach_type` enum.
- **No `coach_type` as job title.** `coach_type` is program market type (college/high_school/juco/showcase) only.
- **No generated meeting summaries, talking points, or meeting narrative recaps.** These are replaced by the Staff Decision Room (section 9).
- **No practice narrative summaries.** Replaced by Practice Effectiveness Review (section 6).
- **No direct live API sync with Rapsodo/TrackMan/GameChanger in Phase 1.** All integrations are file-import first; direct sync deferred and labeled "deferred / settings only."
- **No separate Tauri desktop shell.** Web-only for the product; command center uses local Node + HTML.
- **No building for other sports** (golf gets the Helm Lifting Lab via unified schema; no dedicated golf practice, golf stats, or golf coach-insight features in this scope).
- **No medical diagnoses anywhere.** Language is: readiness risk, reported soreness, training modification recommended, review with staff.
- **No AI-generated content without source refs and confidence.** Every CoachHelm signal must include source drawer, confidence, and limitation before rendering.
- **No confetti in staff/lifting workflows.** Celebration reserved for successful team join or first onboarding completion.

---

## 2. Canonical IA / Navigation Map

### 2.1 Coach (Desktop) — Primary Nav

| Nav Item | Route | Notes |
|---|---|---|
| Command Center | `/baseball/dashboard/command-center` | Default landing; 20-second status cockpit |
| Signals | `/baseball/dashboard/signals` | Feed/Compact/Grouped/Board views |
| Roster | `/baseball/dashboard/players` | Table/Card/Position/Dev/Status views |
| Practice | `/baseball/dashboard/practice` | Planner + scrimmage workspace |
| Stats Lab | `/baseball/dashboard/stats-center` | 11 sub-views |
| Video | `/baseball/dashboard/videos` | Library/Player/Event/Tagged/Evidence |
| Performance | `/baseball/dashboard/performance` | Lifting Lab entry; first-class nav — NOT nested under team ops |
| Calendar / Ops | `/baseball/dashboard/calendar` | Events, travel, announcements, tasks |
| Reports | `/baseball/dashboard/analytics` | Transfer-to-baseball, export |
| Settings | `/baseball/dashboard/settings` | Staff, program, season, integrations |

**Secondary / Command Palette reachable:**
`/import`, `/decision-room`, `/lineups`, `/documents`, `/travel`, `/announcements`, `/dev-plans`, `/journey`, `/lift`, `/college-interest`, `/colleges`, `/compare`, `/pipeline`, `/discover`, `/scout-packets`, `/watchlist`, `/academics`, `/camps`, `/events`, `/organization`, `/program`, `/readiness`, `/teams`, `/activate`

> **P0 gap:** 28 routes are currently orphaned from `nav-registry.ts`. Every route in the secondary list must be registered with correct `role`, `requiredCapability`, and `section` or have an explicit deep-link entry point.

### 2.2 Player (Mobile-First) — Bottom Nav

| Tab | Route |
|---|---|
| Today | `/baseball/(player-dashboard)/player/today` |
| Schedule | `/baseball/dashboard/calendar` (player view) |
| Training | `/baseball/dashboard/lift` (player lift UX) |
| Stats | `/baseball/dashboard/my-stats` |
| Profile / Passport | `/baseball/(player-dashboard)/player/passport` |

Player sub-routes by type:
- College: `/player/college`, `/player/juco`, `/player/high-school`, `/player/showcase`
- Timeline: `/player/timeline`

### 2.3 Staff / Lifting Coach — Helm Lifting Lab

Separate portal at `/lifting` alongside `/golf` and `/baseball`.

| Surface | Route |
|---|---|
| Lab Home (coach) | `/lifting/dashboard` |
| Athletes | `/lifting/dashboard/athletes` |
| Today Board | `/lifting/dashboard/today` |
| Readiness Queue | `/lifting/dashboard/readiness` |
| Programs | `/lifting/dashboard/programs` |
| Groups | `/lifting/dashboard/groups` |
| Import | `/lifting/dashboard/import` |
| Settings | `/lifting/dashboard/settings` |
| Accept Invite | `/lifting/join/[token]` |
| Lifting Coach Onboarding | `/lifting/onboarding` |

Baseball coach views lifting via `/baseball/dashboard/performance` (rewired to `helm_lifting_*` adapter).

### 2.4 Auth / Onboarding Routes

| Route | Purpose |
|---|---|
| `/baseball/(auth)/login` | Login with role-aware redirect; restores invite return path |
| `/baseball/(auth)/signup` | Signup with role cards (Create Program / Join Staff / Join Player) |
| `/baseball/(auth)/complete-signup` | Invite context preserved |
| `/baseball/(auth)/forgot-password` | Does NOT reveal whether email exists |
| `/baseball/(auth)/reset-password` | |
| `/baseball/(auth)/demo` | Demo login gate |
| `/baseball/(onboarding)/coach-onboarding` | Head coach program creation; includes lifting Yes/No step |
| `/baseball/(onboarding)/coach` | Coach profile setup |
| `/baseball/(onboarding)/player` | Player profile setup |
| `/baseball/join/[code]` | Team join — polished invite states |
| `/baseball/staff/join/[code]` | Staff invite acceptance |

---

## 3. Subsystem Feature Contracts

### 3.1 Onboarding / Auth

**Extend, never replace.** Do not touch `loginAction`, `signupAction`, `requestPasswordResetAction`, `useBaseballAuth`, or `BaseballDashboardShell` structure.

| Feature | Done when... |
|---|---|
| Login role-aware redirect | Login returns invite users to invite flow, not dashboard; multi-team users route to team switcher on stale cookie |
| Signup paths (3) | (1) organic with role cards; (2) player invite with pre-selected role + team context; (3) staff invite with role + access explanation |
| Staff invite accept flow | `baseball_staff_invitations` row written; `baseball_team_coach_staff` row created with correct `staff_role` + capabilities; revoked invite rejected; role changes audited |
| Program creation | Creates: users, `baseball_coaches`, `organizations`, `baseball_teams` (with `join_code`), `baseball_team_coach_staff` (head coach, primary), 6 default player groups, 4 default lifting groups |
| Player join | All invite states (valid/expired/inactive/maxed/already-member/blocked-eligibility) polished; `baseball_team_members` written; check-animation success state |
| Team context cookie | `active_role`, `active_team_id`, `active_staff_role`, `active_player_id`, `active_coach_id`, `active_season_id` — server-validated; stale cookie routes to team switcher; server actions NEVER trust cookie alone |
| Lifting coach onboarding | Name/title, certifications, training style, sports covered, primary groups, load preference, readiness inputs, visibility settings |
| `baseball_players` auto-seeded on signup | `20260624001500_baseball_signup_creates_profile_row.sql` must be applied — currently UNAPPLIED (P0 blocker: player golden path is broken) |

### 3.2 Roster / Player Profiles

| Feature | Done when... |
|---|---|
| Roster views | Table (dense staff), Card grid, Position board (depth by position), Development board, Status board (active/limited/unavailable/missing-check-in/class-conflict/lift-restriction) |
| Roster columns | Player, jersey, class/grad year, positions, handedness, H/W, status, availability, readiness, latest action/signal, source freshness; baseball perf columns; ops columns |
| Row peek panel | Opens without full page jump; shows snapshot, signals, today, dev plan, latest video, recent stats, lift/readiness, timeline |
| Player profile (10 tabs) | Snapshot, Timeline, Stats, Video, Practice, Performance, Academics/Availability, Notes, Recruiting/Showcase (when enabled), Settings/Permissions |
| Timeline | Accepts 15 event types; import correction events show before/after diff; filters are role-aware; staff-private notes never leak to player |
| Role-safe player view | Player sees only player-safe fields; staff with `can_manage_lifting` sees full perf context; staff without `can_view_private_notes` cannot see private notes |
| Coach notes | Stored in `baseball_coach_notes`; visibility enum (staff/performance_staff/head_coach_only); player can NEVER see staff-only notes |

### 3.3 Stats Center

| Feature | Done when... |
|---|---|
| 11 top-level views | Team Overview, Player Stats, Games, Scrimmages, Practice Metrics, Pitching Lab, Hitting Lab, Catching/Defense, Baserunning, Source Health, Import History |
| Context separation | Official game, scrimmage, practice, showcase, bullpen, cage, sensor, video, lift/performance, readiness/wellness, class/availability — NEVER merged without labeled context filter |
| Stat source chips | Every chart and stat row shows source name, import run, confidence, reviewed/unreviewed status |
| Premium chart set | EV/LA Contact Quality Matrix, Zone Chase/Damage Heatmap, Spray Chart, Approach Count Ladder, Game-vs-Practice Contact Gap, Pitch Shape Map, Command Heatmap, Velocity/Command Decay, Pitch Mix/Outcome Board, Release Consistency Plot, Catcher Workload Board, Battery Performance Matrix, Defensive Event Map, Arm Board, Speed/Decision Board |
| Chart requirements | SVG for small/medium; Canvas for >500-point scatter; every chart has table fallback, empty/loading/error state, source drawer on click, sample-size warning, role-safe visibility |
| Saved stat views | `baseball_stat_visual_views` table; per-user, never global; coach pinned views do not leak to players |
| Zero-stat honesty | Starved metric never renders as a real 0; "sample too small" is a first-class state |

### 3.4 CoachHelm AI Engine

**Rule:** Every signal must have source drawer, confidence, limitation, and source refs stored BEFORE the signal is surfaced. No signal ships without these.

| Feature | Done when... |
|---|---|
| Generator families | 8 named families: two-strike chase, game-vs-practice contact quality gap, pitcher velocity/command decay, workload/readiness risk, class/lift/practice conflict, postgame-to-practice focus, performance-to-field transfer, import cleanup suggestions |
| Signal schema | `baseball_signals` table: title, player/team/event context, severity, category, source chips, confidence, why it matters, evidence, recommended action, owner, due, status, visibility, created_at, expires_at |
| Signal categories | 17 domains: hitting, pitching, catching, defense, baserunning, workload, readiness, lift/performance, import-quality, practice-focus, video-evidence, academic, availability, team-trend, position-group, composite, admin |
| Ranking | `rank_score` column on `baseball_coach_insights`; multi-factor model in `src/lib/coachhelm/baseball/ranking.ts`; all surfaces (Command Center, Signals, Player Profile) order identically |
| Action lifecycle | `baseball_actions` with outcome-attribution columns: `target_metric`, `baseline_value`, `observed_value`, `metric_movement` — tracks whether the metric the action targeted actually moved |
| Insight maturity | `baseball_coachhelm_insight_maturity_counters` — maturity gating prevents premature signal publication |
| AI audit log | `baseball_ai_audit` — logs every signal generation run with inputs and outputs |
| Operational signal rules | `baseball_operational_signal_rule_config` — deterministic rule config (not hardcoded) |

### 3.5 Practice Planner + Scrimmage Workspace

| Feature | Done when... |
|---|---|
| 5 practice views | Calendar/list, Builder, Generator, Scrimmage workspace, Published player view |
| Practice builder | Left time rail (5-min drag increments), required headline, optional description, block type, staff owner, station/location, player groups, equipment, video capture requirement, signal link, player action link, attendance/check-in |
| Conflict logic | Checks 6 conditions: workload, readiness, class conflict, availability, pitch count, coach override |
| Scrimmage workspace | Batting order Team A/B, defensive diamond with position labels, battery selector, pitching plan (by inning/pitch count), defensive rotation, 6 named situational scripts, live score/inning tracker, stat collection mode selector, video markers |
| Practice plan generator | AI-assisted prescription outputs: proposed headline, time, station, staff, player group, data reason, source objects, expected measurable outcome, confidence, risks |
| Practice effectiveness review | NOT a narrative recap; shows: focus, players, date, source signal, target metric, next data window, movement, confidence, next action; `too early` and `not enough sample` as first-class states |
| Practice blocks source | `baseball_practice_blocks_source_postgame` — practice blocks can be sourced from postgame review candidates |
| Scrimmage stat separation | Scrimmage stats stored separately from official game stats; never merged without explicit context filter |

### 3.6 Performance / Lifting Lab (Deep — V11 + Lifting Lab Blueprint)

**Architecture decision (FINAL):** ONE unified `helm_lifting_*` cross-sport schema, org-scoped. Baseball `baseball_lift_*` data is COPIED (not moved) into it via additive backfill. Baseball performance dashboard is REWIRED to read `helm_lifting_*` via an adapter layer that keeps component props stable. `baseball_lift_*` kept as read-only legacy.

**Lifting Lab portal lives at `/lifting` (separate from `/baseball` and `/golf`).**

| Feature | Done when... |
|---|---|
| Helm Lifting Lab portal | `/lifting` route group with separate signup/login, accept-invite, onboarding, dashboard |
| Cross-sport identity | `helm_lifting_coaches` + `helm_lifting_coach_assignments` (org-scoped); NOT a new coach_type value |
| Athlete reference | `helm_lifting_athletes` — thin reference row pointing to `baseball_players` or `golf_players`; NOT a new user population |
| Strength groups | `helm_lifting_groups` + members; static and dynamic (rule builder with live preview); 12 named default groups |
| Exercise library | `helm_lifting_exercises`; seeded baseball-specific library across 9 categories; baseball constraint tags (pitcher-friendly, catcher-friendly, post/pre-throwing, low/high CNS, travel day, return-to-play, grip intense) |
| Program builder | Programs → weeks → days → sections → exercise prescriptions; drag/drop sections/exercises; duplicate week/day; save-as-template; 7 named preset templates |
| Assignment engine | `helm_lifting_program_assignments` + `helm_lifting_sessions`; materializes sessions for all in-scope athletes at publish time — NOT lazily computed in UI |
| Player lift execution | Today card (title, estimated duration, status, readiness check-in status, main lift target, coach note, Start button); pre-lift readiness required; during-lift: section-by-section, actual weight/reps/RPE, rest timer, previous best; post-lift summary |
| Live weight room mode | Full-width header; athlete grid (name, position, current exercise, prescribed/actual load, RPE, readiness badge, last update); right rail (needs-coach queue); bottom drawer (selected player set logger); bulk load modification; all icon buttons labeled |
| Readiness / soreness | `helm_lifting_readiness_checkins`; sleep/energy/stress/mood/arm/lower-body/soreness inputs; readiness_score computed; decision labels Green/Yellow/Orange-lower/Orange-upper/Red/Blue; NO medical diagnosis language |
| Soreness map | Per body region + severity + side; heatmap render by body region |
| Bodyweight entries | `helm_lifting_bodyweight_entries`; trend visible to staff and player |
| Availability statuses | `helm_lifting_availability_statuses`; reason category; visibility controls |
| Strength maxes + PRs | `helm_lifting_maxes` + `helm_lifting_prs`; estimated 1RM NEVER silently replaces training max; coach can set/edit training max; PRs auto-captured on session completion |
| Modification engine | Auto-suggests load reductions on: high pitch count, bullpen day, starter +1/+2, back-to-back catcher, hamstring soreness, low sleep/energy, bodyweight drop, missed previous lift, travel day, doubleheader; stores original + modified prescription + reason + source refs + player-safe explanation |
| CoachHelm performance signals | Source-backed signals (velocity down after high lower-body RPE, catcher pop time after high workload, PR followed by exit velocity increase); every signal has source drawer, confidence, limitation, recommended action, assignable owner, review date |
| Transfer-to-baseball analytics | Lift block vs EV/bat speed, lower body vs sprint, rotational power vs throwing velocity, readiness vs command, soreness vs chase rate; language is "associated with" not causal; every chart has table fallback |
| Import | TeamBuildr CSV, TrainHeroic CSV, Google Sheets export, generic CSV; `helm_lifting_import_runs`; preview with matched/unmatched athletes; committed rows never contaminate `baseball_player_stats` |
| Baseball dashboard rewire | `src/app/baseball/actions/lifting.ts` + `lifting-v11.ts` rewired to `helm_lifting_*` via resolver + adapter (`src/lib/lifting/adapters/baseball-view-adapter.ts`); component props unchanged; `baseball_lift_*` remains read-only legacy |
| Performance Command Center | `/baseball/dashboard/performance`; answers 7 diagnostic questions in first viewport; KPI strip (today completion, missed lifts, readiness risk, new PRs, pitcher red flags, load modifications pending, bodyweight alerts) |
| Today Weight Room Board | Dense ops table; optimistic status updates; row drawer opens player detail without page navigation; bulk select (load-reduce + reminder); keyboard navigation on desktop |

### 3.7 Staff Room / Decision Room (Deep)

**Replaces:** generated meeting points, AI talking points as standalone feature, meeting summary generation, narrative practice recaps.

| Feature | Done when... |
|---|---|
| Staff invite flow | Head coach creates email-bound or link-only invites with role preset + capability preview; staff signs up via `/baseball/staff/join/[code]`; acceptance writes `baseball_team_coach_staff` with audit event; revoked invite rejected |
| Capability matrix | `baseball_team_coach_staff` boolean columns: `can_manage_lifting`, `can_view_readiness`, `can_modify_availability`, `can_manage_practice`, `can_manage_lineups`, `can_manage_stats`, `can_manage_imports`, `can_view_private_notes`, `can_message_players`, `can_export_reports`, `can_invite_staff`, `can_manage_roster` |
| Staff settings surface | `/baseball/dashboard/settings/staff`: staff roster table (name, title, role, teams, scope, last active, open tasks, status, actions), pending invites, role preset editor, capability matrix, player/group scope, position scope, audit log, invite link management, owner controls |
| Decision room | Filter unresolved signals → group by player/position/owner/source/event/priority → build agenda from selected items → create staff actions → record decisions with source evidence → mark outcomes → export concise decision packet |
| Decision log | `baseball_decision_log` + `baseball_meeting_items`; every decision links back to a signal and source; no generated narrative |
| Staff action queue | `baseball_actions` with lifecycle: create from signal → assign owner → track status → record outcome → link to later practice/game/player data; visible in Command Center right column |
| Audit trail | `baseball_staff_audit_events` + `baseball_settings_audit_log`; role changes and invite events logged |
| Postgame action review | Source status + key stat deltas + player timeline updates + video evidence + workload updates + import warnings + staff actions + player actions + practice focus candidates + source confidence; NOT a long narrative |

### 3.8 Signals / Actions

| Feature | Done when... |
|---|---|
| Signal inbox views | Feed, Compact, Grouped (by player/position group/source/category/owner), Board (action lifecycle columns) |
| Signal interactions | Acknowledge, Dismiss, Resolve, Assign, Convert to practice block/player action/staff action, Attach to event/player timeline, Open source drawer, Open evidence video, Add coach note, Mark useful/wrong |
| Signal materialization | `baseball_signal_action_materialization` — signals can be materialized into actions with one click |
| Batch actions | Confirmation + undo; filter chips reflect URL state |
| Action queue | Actions visible in Command Center right column; owner, due date, status, source, conversion target |

### 3.9 Settings OS

| Feature | Done when... |
|---|---|
| Program settings | `baseball_program_settings` — season, identity, program-level config |
| Integration configs | `baseball_integration_configs` — per-provider adapter settings; direct sync clearly labeled deferred |
| Season settings | `baseball_team_season_settings` — active season, date ranges |
| Settings audit log | `baseball_settings_audit_log` — all settings changes logged with before/after |
| Stat visual views | `baseball_stat_visual_views` — per-user saved chart filter/tab state; upsert not delete-then-insert |

### 3.10 Player Today / Passport

| Feature | Done when... |
|---|---|
| Player Today surface | Next event, required arrival/check-in, assigned practice blocks, lift assignment, readiness/soreness check-in, tasks/announcements, personal development action, recent visible stat/video feedback |
| Daily contract | `baseball_player_daily_contracts` — player-facing daily commitment; coach ack via `baseball_daily_contract_coach_ack` |
| Passport | Recruiting/development passport; share tokens via `baseball_player_passport_share_tokens`; public packet at `/baseball/(public)/packet/[token]` |
| Passport settings | `baseball_player_passport_settings` — player controls visibility of each section |
| Dev plan | `baseball_developmental_plans`; `getActiveDevPlan` must use `.in('status', ['sent', 'in_progress'])` NOT `.eq('status', 'active')` (V10 fix: current bug causes permanently empty player dev plan page) |
| Announcements | `baseball_announcements` + `baseball_announcement_acknowledgements`; action uses `content` column and `created_by_id` FK — NOT golf-schema columns `body`/`created_by` (P0 bug: current action writes wrong columns, always 500) |
| Player-facing content | Only explicitly approved content shown; no private staff notes; no uncited claims; no sensitive health/academic narrative without coach approval |

### 3.11 Import System (Source Trust Engine)

| Feature | Done when... |
|---|---|
| 11-step import dossier | Select source → Upload/ingest → Provider detection → Preview raw file + parsed structure → Map columns/entities → Match players → Validate rows → Review warnings + duplicates → Commit → Review affected objects → Rollback if needed |
| Source badges | On every import and derived object: source name, type, import run, confidence, reviewed/unreviewed, corrected/uncorrected, last updated |
| 15 provider profiles | GameChanger XML/CSV, StatCrew XML, Presto/SIDEARM/NCAA XML, TrackMan, Rapsodo, Blast, Diamond Kinetics, Synergy, 6-4-3, TeamBuildr, Teamworks/classes, ArmCare, OnForm, Google Sheets, generic CSV/XLSX/PDF/manual |
| Adapter contract | 14 required adapter fields: provider_id, source_type, raw_file_path, file_hash, parsed_rows, matched_players, unmatched_players, field_mappings, commit_status, rollback_status, source_confidence, lineage_refs, import_run_id, player_external_ids |
| Commit writes | Canonical stat facts, source refs, `baseball_import_runs`/rows, player timeline events, signal candidates, affected aggregates |
| Rollback | Reverts all rows from import run; preserves audit log |
| Raw file + hash | `baseball_import_raw_file_and_hash` — deduplication and corruption detection |
| Import registry | `baseball_import_registry` — load-bearing source of truth for all import runs |
| Player external IDs | `baseball_player_external_ids` — maps provider player IDs to `baseball_players.id` |
| Source coverage board | Visible in Import Center: which providers have been imported, last import date, confidence, pending review count |

---

## 4. Canonical DB Object List

### 4.1 Core Baseball Tables (existing, pre-V11 waves)

```
organizations                         -- shared cross-sport root
baseball_teams                        -- team with join_code, organization_id
baseball_coaches                      -- coach profile
baseball_players                      -- player profile
baseball_team_members                 -- team membership
baseball_team_coach_staff             -- staff roles + capability columns (extended V11)
baseball_staff_invitations            -- email/link invites
baseball_staff_audit_events           -- role changes + invite events
baseball_seasons                      -- season config
baseball_games                        -- game schedule
baseball_events                       -- calendar events
baseball_event_attendance             -- attendance tracking
baseball_event_acknowledgements       -- event acks by players/staff
baseball_timeline_event_acks          -- timeline-level acks
baseball_player_timeline_events       -- 15-type player timeline
baseball_announcements                -- team announcements (content + created_by_id cols)
baseball_announcement_acknowledgements
baseball_announcement_recipients
baseball_tasks                        -- tasks
baseball_task_assignments
baseball_task_templates
baseball_task_reminder_sent           -- reminder dedup
baseball_documents                    -- documents
baseball_document_versions
baseball_messages                     -- messaging
baseball_conversations
baseball_conversation_participants
baseball_notifications
baseball_watchlists
baseball_camps
baseball_camp_registrations
baseball_travel_itineraries
baseball_travel_expenses
baseball_videos                       -- video library
baseball_video_events                 -- granular video event model
baseball_player_settings
baseball_player_classes               -- class year tracking
baseball_academic_eligibility
baseball_class_conflicts              -- schedule conflicts from Teamworks
baseball_player_engagement_events
baseball_coach_philosophy
baseball_coach_recruiting_philosophy
baseball_recruiting_interests
baseball_player_comparisons
```

### 4.2 Import / Source Trust Tables

```
baseball_stat_uploads                 -- legacy upload tracking (reconciled)
baseball_import_runs                  -- import run registry
baseball_import_sources               -- source/provider registry
baseball_import_field_mappings        -- column mapping config
baseball_import_lineage               -- lineage refs from row to source
baseball_import_match_resolution      -- player match resolution state
baseball_import_source_external_id    -- provider player ID → baseball_players.id
baseball_player_external_ids          -- stable cross-provider player ID map
baseball_import_registry              -- load-bearing import dossier registry
baseball_import_raw_file_and_hash     -- raw file storage + hash dedup
baseball_stat_sources                 -- source metadata rows
baseball_integration_configs          -- per-provider adapter settings
```

### 4.3 Stat / Event Model Tables

```
baseball_stat_facts                   -- canonical stat facts with source refs
baseball_plate_appearances            -- granular PA event model
baseball_pitch_events                 -- pitch-level events
baseball_batted_ball_events           -- batted ball with EV/LA/direction
baseball_swing_events                 -- swing decisions
baseball_fielding_events
baseball_catching_events              -- catcher-specific events
baseball_baserunning_events
baseball_workload_events              -- pitch count + catcher workload
baseball_player_stats                 -- denormalized stat rows (all contexts)
baseball_player_season_stats          -- season-level aggregates
baseball_player_aggregates            -- cross-season aggregates
baseball_player_percentiles           -- team/cohort percentile ranks
baseball_player_development_metrics   -- sensor/performance metrics
baseball_box_score_batting
baseball_box_score_pitching
baseball_box_score_uploads
baseball_official_stat_breadth        -- extended official stat columns (migration 001000)
baseball_stat_visual_views            -- per-user saved chart state
```

### 4.4 CoachHelm AI Tables

```
baseball_coach_insights               -- signals; rank_score col (V10 additive)
baseball_signals                      -- V10 signal model with full field set
baseball_actions                      -- action lifecycle + outcome-attribution cols (V10 additive)
baseball_signal_action_materialization -- convert signal → action in one step
baseball_ai_audit                     -- every signal generation run logged
baseball_coachhelm_insight_maturity_counters -- maturity gating
baseball_operational_signal_rule_config -- deterministic rule config
baseball_decision_log                 -- staff decisions with source evidence
baseball_meeting_items                -- agenda items (not generated; sourced from signals)
baseball_coach_player_notes           -- coach notes with visibility controls
baseball_coach_notes                  -- coach notes (second table; visibility enum)
```

### 4.5 Practice Tables

```
baseball_practices                    -- practice plan header
baseball_practice_blocks              -- time blocks with type/staff/station/groups
baseball_practice_block_objectives    -- measurable objectives per block
baseball_practice_attendance          -- block-level attendance
baseball_practice_scrimmages          -- scrimmage metadata attached to practice
baseball_practice_lineup_slots        -- batting order + defensive positions per scrimmage
baseball_practice_effectiveness_reviews -- evidence-backed effectiveness card
baseball_postgame_reviews             -- postgame action review
baseball_postgame_review_items        -- individual items in review
```

### 4.6 Lifting Tables (Legacy Baseball — V11)

```
baseball_strength_groups
baseball_strength_group_members
baseball_strength_group_audit         -- dynamic group rule audit trail
baseball_lift_exercises
baseball_lift_exercise_substitutions
baseball_lift_programs
baseball_lift_weeks
baseball_lift_days
baseball_lift_sections
baseball_lift_prescriptions
baseball_lift_program_assignments
baseball_lift_assignments             -- earlier model (retained as legacy)
baseball_lift_sessions
baseball_lift_session_exercises
baseball_lift_set_results
baseball_lift_results                 -- earlier model (retained as legacy)
baseball_lift_import_runs
baseball_lift_import_rows
baseball_exercises                    -- earlier exercise model
baseball_readiness_checkins           -- (baseball-scoped; will coexist with helm version)
baseball_soreness_maps
baseball_bodyweight_entries
baseball_availability_statuses
baseball_strength_maxes
baseball_strength_prs
```

### 4.7 Helm Lifting Lab Tables (NEW — Cross-Sport Unified Schema)

All purely additive. REVOKE anon after every table. RLS enabled on all.

```
helm_lifting_coaches                  -- cross-sport lifting-coach identity (org-scoped)
helm_lifting_coach_invites            -- org-scoped invite (mirrors baseball_staff_invitations)
helm_lifting_coach_assignments        -- coach ↔ org assignments
helm_lifting_org_viewers              -- head coach / sport coach view grant
helm_lifting_athletes                 -- thin ref: organization_id + sport + sport_player_id

helm_lifting_exercises                -- cross-sport exercise library
helm_lifting_groups                   -- org-scoped strength groups
helm_lifting_group_members            -- (athletes → groups)
helm_lifting_programs                 -- cross-sport programs
helm_lifting_program_weeks
helm_lifting_program_days
helm_lifting_program_sections
helm_lifting_program_prescriptions    -- exercise prescriptions + legacy_baseball_id
helm_lifting_program_assignments      -- program → athlete/group/team
helm_lifting_sessions                 -- materialized athlete lift sessions + legacy_baseball_id
helm_lifting_session_exercises        -- per-exercise session rows + legacy_baseball_id
helm_lifting_set_results              -- actual sets logged + legacy_baseball_id
helm_lifting_readiness_checkins       -- cross-sport readiness + legacy_baseball_id
helm_lifting_soreness_maps
helm_lifting_bodyweight_entries
helm_lifting_availability_statuses
helm_lifting_maxes                    -- strength maxes per athlete + legacy_baseball_id
helm_lifting_prs                      -- PRs + legacy_baseball_id
helm_lifting_import_runs              -- lift imports into unified schema
```

### 4.8 Passport / Daily Contract Tables

```
baseball_player_passport_settings     -- player visibility controls per section
baseball_player_passport_share_tokens -- share tokens for public packet page
baseball_player_daily_contracts       -- daily commitment
baseball_daily_contract_coach_ack     -- coach acknowledgements
baseball_daily_contract_missed_rollover -- rollover for missed contracts
```

### 4.9 Settings OS Tables

```
baseball_program_settings             -- program-level config
baseball_team_season_settings         -- season-level settings
baseball_settings_audit_log           -- settings change log
```

### 4.10 RLS Helper Functions

```sql
-- Baseball
get_my_baseball_coach_id()
get_my_baseball_player_id()
is_baseball_team_member(team_id)
is_baseball_team_member_v2(team_id)
is_baseball_team_staff(team_id)
is_baseball_team_coach(team_id)
is_baseball_team_coach_v2(team_id)
is_baseball_team_player(team_id)
is_baseball_primary_coach(team_id)
has_baseball_staff_capability(team_id, capability)
can_view_baseball_player(team_id, player_id)
can_view_baseball_player(player_id)           -- overload
can_manage_baseball_lift_group(team_id, group_id)
baseball_can_invite_staff(team_id)
baseball_staff_has_note_capability(team_id)
baseball_log_staff_change(...)
baseball_replace_lineup_positions(...)
baseball_accept_staff_invite(...)
baseball_stat_visual_views_touch(...)
get_baseball_public_player_stats(...)
recalculate_baseball_season_stats(...)
recalculate_team_baseball_season_stats(...)
get_admin_baseball_rollup(...)
get_baseball_conversations_with_details(...)
get_my_baseball_conversation_ids()

-- Helm Lifting Lab (NEW)
helm_lifting_coach_for_org(org_id)
helm_lifting_can_edit_org(org_id)
helm_lifting_can_view_org(org_id)
helm_lifting_is_my_athlete(athlete_id)
helm_lifting_accept_invite(token)
helm_lifting_assign_team(...)
helm_lifting_sync_org_athletes(org_id)
```

### 4.11 Materialized Views / Read-Model Views

```
baseball_stat_visual_views            -- (config table, not a SQL view — see §4.3)
-- Any SQL views referenced by CoachHelm engine in src/lib/coachhelm/baseball/
-- should be documented here as they are added
```

---

## 5. Premium UI/UX Bar + Motion + Honesty Rules

### 5.1 Visual System

- **No black or near-black backgrounds** on any page canvas, nav rail, card, or panel. Baseball uses BaseballDashboardShell which has its own color system (primary red, warm neutrals — not the GolfHelm cream/green).
- **No off-palette colors.** Replace any `indigo`, `sky`, `purple`, or `blue` generic SaaS chips with `warm-200/700` or `primary-50/700` from the baseball design token set.
- **No emoji in production UI** (nav, status indicators, signal categories, table rows). Use text labels or SVG icons only.
- **No cartoon baseball aesthetic.** Premium, data-dense ops surface.
- **Font:** Inter/system for UI text; `SFMono-Regular/Consolas/Menlo` ONLY for file paths, timestamps, IDs, table names, command output.
- **Contrast:** 4.5:1 minimum for all text. Status never conveyed by color alone.

### 5.2 Interaction Rules

- **Minimum 44px** touch targets on interactive elements.
- **Stable form height** — no layout jump on error; inline errors with recovery path.
- **Skeleton only for session checks** — not for every loading state; progress bar for imports; `<Skeleton>` component (already in codebase) NOT raw `animate-spin` divs.
- **Tab transitions:** Wrap tab panels in `<AnimatePresence mode="wait">` with `useReducedMotion` guard. `initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={{ duration:0.18 }}`. Currently missing in `CommandCenterClient.tsx` and `PlayerProfileClient.tsx` (P1 fix).
- **Optimistic UI** with rollback on all mutation-heavy surfaces (Today Weight Room Board, roster status changes).
- **Table fallback** required on every chart. No chart ships without one.

### 5.3 Shell Architecture

- **Three near-identical shell layouts** currently exist: `(dashboard)/layout.tsx`, `(coach-dashboard)/coach/layout.tsx`, `(player-dashboard)/player/layout.tsx`. Target: consolidate into single layout reading role from `useBaseballAuth()` dynamically. (P1 cleanup).
- **`useTeamRouteProtection`** is defined in `src/hooks/use-route-protection.ts` but never called. Must be wired into the consolidated shell. (P0 security gap).
- **Performance nav item** must be first-class in coach sidebar — NOT nested under Team Ops.
- **Player mobile nav** max 5 primary items; Today surfaces lift cards without adding tabs.

### 5.4 Data Honesty Rules

The product must never show:

| Prohibited | Honest alternative |
|---|---|
| Feature complete because a plan exists | `planned / scaffolded / not yet built` |
| Agent working if no recent event | Honest idle / stale state |
| Tests passed when not run | `not run` chip |
| Direct vendor integration when only file-import | `file-import (direct sync: deferred)` |
| Migration safe when RLS not checked | RLS must be verified before shipping |
| AI insight grounded when source refs missing | Signal must not render without source drawer |
| Practice summary narrative | Evidence card with data-backed movement only |
| Meeting points / talking points as AI output | Sourced signal agenda only |
| Stat from a starved metric as real 0 | `sample too small` chip |
| Trend magnitude card that is permanently invisible | Remove or wire |

### 5.5 Server Action Rules (every action must)

1. Get current user via Supabase auth
2. Resolve coach/player profile from DB
3. Resolve active team context (validate cookie server-side)
4. Check membership (`is_baseball_team_member`)
5. Check capability (`has_baseball_staff_capability`)
6. Validate input (zod or inline)
7. Write with explicit `team_id`, `player_id`, `coach_id`
8. Call `revalidatePath` on affected routes
9. Return safe, typed errors (never leak internal messages)

**Never:** accept `coachId` or `playerId` from client and trust it; use `raw_user_meta_data` for authorization.

### 5.6 Security / RLS Rules

- RLS enabled on every table. No exceptions.
- REVOKE anon EXECUTE on any new RPCs after creation.
- Views that use RLS-protected tables: `security_invoker = true`.
- Coach video uploads: requires server action, not direct client storage upload (current bug: always 403 because no INSERT policy — P0).
- `pg_class.relacl` verified for anon grants after every new table.

---

## 6. Prioritized Finish Checklist

### P0 — Ship Blockers (nothing is shippable until these are done)

| # | Item | Location |
|---|---|---|
| P0-1 | **Apply 21 unapplied migrations** in dependency order and regenerate `src/lib/types/database.ts` | `supabase/migrations/` — migrations 000050, 000060, 000063, 000070, 000080, 000090, 000092–000095, 000200, 000210, 000221, 000230, 000310, 000450, 000470, 001000, 001300, 001500, 001800 |
| P0-2 | **Fix player signup — `baseball_players` row never seeded** | Migration `001500_baseball_signup_creates_profile_row.sql` must be applied; golden path is broken for every new player |
| P0-3 | **Fix announcements schema mismatch** — action writes `body`/`created_by` (golf columns) to baseball table | `src/app/baseball/actions/announcements.ts` lines 97–105; correct to `content` + `created_by_id`; every announcement create/read is currently broken |
| P0-4 | **Fix dev plan status filter** — `getActiveDevPlan` uses `.eq('status','active')` but status is `sent` or `in_progress` | Causes player dev plan page to be permanently empty despite coach creation working |
| P0-5 | **Build the Helm Lifting Lab** — 5 migrations (identity, data-library-programs, data-sessions-readiness, accept-invite-RPC, backfill), types, actions, portal routes, adapter layer, baseball performance rewire | Per Blueprint `docs/lifting-lab/HELM_LIFTING_LAB_BLUEPRINT.md`; not yet started |
| P0-6 | **Register 28 orphaned nav routes** in `src/lib/baseball/nav-registry.ts` | pipeline, discover, announcements, dev-plan, journey, lift, travel, documents, academics, events, organization, program, readiness, teams, players, activate, team, stats, analytics, college-interest, colleges, compare, comparisons, scout-packets, watchlist, videos, camps, and more |
| P0-7 | **Wire `useTeamRouteProtection`** — hook is defined but never called; college players can reach recruiting surfaces without authorization | `src/hooks/use-route-protection.ts`; must be called in shell layout |
| P0-8 | **Fix coach video upload — always 403** | `src/components/baseball/team/BatchVideoUpload.tsx` line 149; add INSERT RLS policy for `baseball_videos`; move to server action; orphaned storage objects accumulate |

### P1 — Functional Gaps (product is confusing/broken without these)

| # | Item |
|---|---|
| P1-1 | Add college player `recruiting_activated` DB CHECK + `coach_type` gate on college-interest page — bypass possible at DB level |
| P1-2 | Academics page hardcodes zeros — real `baseball_academic_eligibility` table and action layer exist and are unused |
| P1-3 | Wipe raw CSS `animate-spin` spinners from 9+ loading states; replace with `<Skeleton>` or progress bar |
| P1-4 | Fix off-palette `indigo`/`sky` chips in `PlayerNotesSection.tsx` and anywhere else in baseball components |
| P1-5 | Add `<AnimatePresence>` tab transitions to `CommandCenterClient.tsx` and `PlayerProfileClient.tsx` |
| P1-6 | Consolidate 3 near-identical shell layouts into single layout with role-aware sidebar from `useBaseballAuth()` |
| P1-7 | Demo data: extend `scripts/seed-baseball-demo.ts` with lifting data + lifting-coach demo login |
| P1-8 | `trend_magnitude` card permanently invisible — wire or remove (data honesty rule) |
| P1-9 | Events page bypasses server actions — wired directly to Supabase client; rewrite to use server action |
| P1-10 | `demo_mode_enabled` setting does nothing — wire to demo data gate or remove |

### P2 — Polish / Coverage (quality bar)

| # | Item |
|---|---|
| P2-1 | Role-permission matrix browser walkthrough — assert each role's allowed/denied surfaces against actual routes + RLS |
| P2-2 | `baseball_stat_visual_views` saved chart state — upsert on conflict (not delete-then-insert) must be enforced |
| P2-3 | Every chart must have table fallback rendering the same data; audit stat-visuals surface |
| P2-4 | Source drawer must exist on every CoachHelm signal (source chips, confidence, limitation) |
| P2-5 | Practice builder conflict logic wired for all 6 conditions (currently partially wired) |
| P2-6 | Staff Decision Room: confirm `baseball_decision_log` and `baseball_meeting_items` are wired to the UI; no generated narrative should surface |
| P2-7 | Postgame Action Review: confirm 9 content areas render (not a narrative recap) |
| P2-8 | Import Center: 15 provider profiles present in adapter settings; commit flow writes lineage + player timeline events + signal candidates |
| P2-9 | Player Passport share token flow: public packet page at `/baseball/(public)/packet/[token]` confirmed working end-to-end |
| P2-10 | REVOKE anon on all new tables post-Lifting-Lab migrations; verify via `pg_class.relacl` |

---

## 7. Build Order (Non-Negotiable)

```
Migrations → Type generation → RLS helpers → Server actions → Route guards → Simple UI → Premium polish → Tests
```

For the Lifting Lab specifically (per Blueprint §8):

```
Wave 1 (blocking): identity migration + types + lib/lifting/* + adapters
→ Migration review + apply (golf-safety check: ADDITIVE ONLY)
→ Wave 2 (parallel, file-disjoint): invites | Lab portal shell | Lab program/session/readiness UIs | athletes/roster | onboarding | backfill migration + baseball dashboard rewire
→ Apply backfill migration (copy-only, idempotent on legacy_baseball_id)
→ Verify: adversarial check + golf-safety verify + typecheck + build
```

Golf-safety constraint (hard rule): EVERY Lifting Lab migration must be verified as:
- Purely additive (no ALTER/DROP of any `golf_*` or `baseball_*` object)
- New `helm_lifting_*` tables only
- Backfill is a COPY, not a move
- `handle_new_user` function left UNTOUCHED
- REVOKE anon issued after every new table

---

## 8. Out-of-Scope Confirmation (What This Product Should Not Try to Be)

- **Not a generic SaaS dashboard** with vague KPI tiles, purple/blue palette, or identical-size card grids.
- **Not a chatbot.** No conversational AI interface; no generated meeting summaries; no "AI is working" copy.
- **Not a landing page** inside utility pages (no hero sections, marketing copy, or promotional content inside the coach dashboard).
- **Not a medical system.** No diagnoses, no injury records, no medical terminology — only readiness risk and training modification language.
- **Not a multi-sport product in Phase 1.** Golf gets lifting access via the unified schema; everything else is baseball-scoped.
- **Not a direct API integration product in Phase 1.** All 15 provider profiles are file-import first; direct sync is deferred and must be labeled as such.
- **Not a social or communication-first product.** Messaging exists for operational coordination, not as a primary surface.
- **Not a video-first product.** Video is evidence infrastructure linked to signals, player development, and coaching decisions — not a primary media player.
