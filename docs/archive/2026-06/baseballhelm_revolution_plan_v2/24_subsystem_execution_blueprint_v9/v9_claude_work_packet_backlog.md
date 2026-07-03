# V9 Claude Work Packet Backlog

Generated: 2026-06-23

This document translates the V9 subsystem plan into a Claude Ultracode work backlog. It is designed to keep the build efficient, sequenced, and implementation-grade. Claude should not jump directly into UI. It should first verify current code, then create the minimum shared foundations that let every tab and integration connect cleanly.

V12 adds a new required packet before this V9 backlog begins. Claude must create the fully wired cream/green no-black Agent City BaseballHelm Ultracode Command Center, open it in Chrome, and log `command_center_verified` before Packet 0 below.

## Non-Negotiable Workflow

Claude must complete each packet with:

- files changed
- tables touched
- routes affected
- tests added or run
- known risks
- remaining work
- command center events logged

Claude must not skip repo verification. V9 planning is detailed, but the live repo remains authoritative for exact file paths, existing schema, and reusable components.

## Packet -1: Live Ultracode Command Center

### Goal

Create the owner-facing live build command center before main implementation starts.

### Build

- local dashboard server
- event logger
- hook receiver and hook bridge
- git/repo watcher or polling
- deterministic risk classifier
- `.ultracode/baseballhelm/` telemetry files
- seeded agent lanes
- seeded work packets
- Chrome-open verification
- Agent City
- Factory Floor
- Agent Cockpit
- Codebase City
- Control Tower
- QA Lab
- Context Reactor
- Decision Ledger
- Memory Library
- Flight Recorder
- feature completion/confidence tracking
- repo pulse
- Supabase/migration tower
- test/proof lab
- CoachHelm/integration/performance/practice build rooms

### Acceptance

- Dashboard is running on localhost.
- Dashboard is open in Google Chrome.
- `command_center_verified` event is logged.
- Ten agent lanes are visible.
- V12/V11/V10/V9/V8/V7/V6 work packets are visible.
- Claude continues to log packet progress through the rest of the build.

## Packet 0: Current Repo Audit

### Goal

Verify the live `Downloads/helmv3` or `njrini99-code/helmv3` repo before edits.

### Inspect

- app routes under `src/app`
- baseball routes
- sidebar/nav component
- auth hooks
- Supabase middleware
- baseball server actions
- baseball query utilities
- existing baseball components
- current migrations
- generated Supabase types
- RLS tests
- CoachHelm golf/baseball code
- CSV/import utilities
- old recruiting/watchlist surfaces

### Deliverable

Write a short audit note inside the repo or as a build log before edits.

### Acceptance

- Current route list is known.
- Current baseball table list is known.
- Existing components to reuse are known.
- Schema conflicts are called out.
- Phase 1 safe edit boundaries are defined.

## Packet 1: Capability, Program Mode, and Navigation Foundation

### Goal

Create a role/capability model and final navigation registry.

### Roles

- head coach
- assistant coach
- pitching coach
- hitting coach
- strength staff
- director of ops
- academic viewer
- scorekeeper/SID
- video coordinator
- player
- guardian where enabled
- scout/showcase viewer where enabled
- admin

### Program Modes

- college
- high school
- showcase
- JUCO
- academy/club if current repo needs fallback

### Build

- capability constants
- role-to-capability map
- program-mode feature flags
- staff nav registry
- player nav registry
- route guards
- visibility helpers

### Acceptance

- Staff and player nav are separate.
- Program mode changes defaults without deleting data.
- Player cannot access staff routes.
- Academic viewer cannot see private performance notes.
- Strength staff can see performance but not private academic detail.

## Packet 2: Source Registry and External Identity Foundation

### Goal

Create the shared source and external-ID model used by every integration.

### Tables

- `baseball_sources`
- `baseball_player_external_ids`
- `baseball_source_credentials` or safe placeholder table if secrets remain outside database
- `baseball_source_settings`
- `baseball_audit_events` if not already sufficient

### Build

- source registry query/actions
- external ID CRUD
- provider namespace constants
- source trust enums
- source drawer component
- source badge component

### Acceptance

- Every source can be enabled/disabled.
- Player can have multiple external IDs.
- Source badge can render on stats, signals, imports, AI, video, and performance data.

## Packet 3: Import Dossier Foundation

### Goal

Build the universal import run/file/row/mapping/review model.

### Tables

- `baseball_import_runs`
- `baseball_import_files`
- `baseball_import_rows`
- `baseball_import_mappings`
- `baseball_import_player_matches`
- `baseball_import_commits`
- `baseball_import_rollbacks`
- `baseball_import_warnings`

### Build

- upload action
- raw file storage
- detection interface
- mapping UI
- player matching UI
- validation report UI
- preview commit UI
- rollback UI
- audit event writes

### Acceptance

- Every uploaded file creates import run and raw file record.
- Rows are traceable.
- Import can be previewed before commit.
- Low-confidence imports hold for review.
- Rollback is possible for committed rows where table support exists.

## Packet 4: Adapter Registry MVP

### Goal

Implement adapter interfaces and initial parser profiles.

### Build Adapter Interface

- detect
- parse
- normalize
- validate
- matchPlayers
- previewCommit
- commit
- rollback

### Initial Adapters

- generic CSV/XLSX
- GameChanger college XML if sample exists
- StatCrew/Presto XML if sample exists
- Teamworks class CSV
- TeamBuildr lift CSV
- TrackMan pitch/batted-ball CSV
- Rapsodo CSV/report profile
- video index CSV
- PDF review placeholder
- manual entry source

### Acceptance

- Adapter registry can list available profiles.
- Upload shows detected source and grain.
- At least one official stats sample and one development sample can complete full preview.

## Packet 5: Event, Calendar, and Team Ops Foundation

### Goal

Make events the shared backbone for games, practices, lifts, travel, meetings, classes, and player assignments.

### Tables

- extend or create event tables as needed
- event attendees
- event acknowledgements
- event documents
- event messages
- event tasks
- class conflicts

### Build

- calendar/list UI
- event detail drawer
- acknowledgement action
- class conflict surface
- document attachment
- event-linked task creation

### Acceptance

- Practice plan can attach to event.
- Import can attach to game/practice/scrimmage/event.
- Player sees relevant events only.
- Staff can see acknowledgement status.

## Packet 6: Player Timeline and Player Profile Foundation

### Goal

Make the player profile the source-aware hub of the product.

### Tables

- `baseball_player_timeline_events`
- player profile visibility settings
- player status history if missing

### Build

- player profile shell
- timeline component
- source-linked timeline events
- staff note visibility controls
- player snapshot cards
- external ID panel
- role-aware profile read model

### Acceptance

- Player-affecting imports/actions can create timeline events.
- Staff-only and player-visible items are separated.
- Profile shows stats, practice, performance, video, tasks, availability, and development sections.

## Packet 7: Command Center and Signals Foundation

### Goal

Create the daily staff cockpit and operational signal lifecycle.

### Tables

- `baseball_signals`
- `baseball_signal_sources`
- `baseball_signal_actions`
- `baseball_staff_actions`

### Build

- Command read model
- Command UI cards
- Signal Inbox
- signal status lifecycle
- assign owner
- convert to task/practice/video/lift/meeting
- source drawer integration

### Acceptance

- Command gives daily operating picture.
- Signals can be assigned and converted.
- Player cannot access staff signals.
- Every signal has source or manual reason.

## Packet 8: Player Today and Player Mobile Action Stack

### Goal

Create the simple player-facing app surface.

### Build

- Today route
- schedule cards
- practice assignment cards
- lift card
- soreness/check-in card
- task list
- video task card
- acknowledgement card
- approved development focus

### Acceptance

- Player can complete assigned actions.
- Player cannot see staff-only context.
- Staff sees completion in relevant staff surfaces.

## Packet 9: Practice Planner, Scrimmage Builder, and Practice Recap

### Goal

Build practice as the signature workflow.

### Tables

- `baseball_practices`
- `baseball_practice_blocks`
- `baseball_practice_block_assignments`
- `baseball_practice_attendance`
- `baseball_practice_metrics`
- `baseball_scrimmage_lineups`
- `baseball_scrimmage_lineup_slots`
- `baseball_scrimmage_events`

### Build

- plan list
- builder
- time slots
- required headline
- optional description
- staff/player assignments
- linked signal
- linked video
- measurement target
- publish to calendar
- drag/drop lineup builder
- completion capture

### Acceptance

- Practice plan can be created and published.
- Player Today shows assigned blocks.
- Scrimmage lineup has positions labeled.
- Scrimmage stats are not official stats.

## Packet 10: Stats Foundation and Postgame Action Review

### Goal

Separate official stats, scrimmage stats, practice metrics, and development data.

### Tables

- official box score extensions
- `baseball_plate_appearances`
- `baseball_pitch_events`
- `baseball_batted_ball_events`
- `baseball_swing_events`
- `baseball_development_facts`
- stat source links

### Build

- Stats Center tabs
- official games view
- scrimmage view
- development metrics view
- player splits
- source badges
- postgame action review

### Acceptance

- Official and development stats are visibly separate.
- Import can create postgame action review.
- CoachHelm can generate stat-backed signals with scope labels.

## Packet 11: Performance OS Foundation

### Goal

Build the strength coach and player lift workflows.

### Tables

- performance templates
- sessions
- assignments
- results
- exercises
- bodyweight
- check-ins
- baseball workload overlays

### Build

- strength dashboard
- lift assignments
- player lift UX
- readiness/soreness check-in
- bodyweight trend
- missed/modified reasons
- workload warnings

### Acceptance

- Strength staff can assign/review lifts.
- Player can complete lift on mobile.
- Soreness/readiness feeds Command and Practice.

## Packet 12: Video Intelligence Foundation

### Goal

Create the video evidence layer.

### Tables

- `baseball_video_events`
- `baseball_video_sources`
- `baseball_video_annotations`
- `baseball_video_tasks`

### Build

- video library
- native upload where supported
- URL/vendor link entry
- player/event/pitch/swing/lift/practice links
- annotation
- video-to-task action
- player-visible task completion

### Acceptance

- Vendor video can be linked without copying protected media.
- Native upload creates evidence object.
- Video can be cited by CoachHelm only if viewer has permission.

## Packet 13: CoachHelm Baseball Engine Foundation

### Goal

Implement source-backed structured AI cards and baseball-specific generators.

### Tables

- AI insights
- insight source links
- dispositions
- generated reports

### Generators

- daily staff brief
- postgame report
- two-strike chase signal
- game/practice contact gap
- pitcher velocity/command decay
- workload/readiness risk
- class/lift/practice conflict
- practice recommendation
- import cleanup
- meeting agenda
- player development brief

### Acceptance

- AI output cites source objects.
- AI output stores confidence and visibility.
- AI output can convert to action.
- AI output does not expose restricted data.

## Packet 14: Reports and Staff Decision Room

### Goal

Create staff operating rhythm around reports, decisions, and source-backed action follow-through.

### Tables

- `baseball_reports`
- `baseball_meetings`
- `baseball_meeting_items`
- `baseball_staff_actions`

### Build

- meeting agenda generator
- meeting item owner/due date/status
- postgame report view
- weekly staff report
- import health report
- practice effectiveness report

### Acceptance

- Meeting item can become task/action.
- Report sources are visible.
- Staff follow-ups return to Command.

## Packet 15: AutoSync Settings and Monitoring

### Goal

Prepare official file automation without requiring every direct integration immediately.

### Build

- AutoSync endpoint settings
- SID setup wizard
- test file status
- postgame email setting
- local agent placeholder/status
- source health dashboard
- expected game file alerts

### Acceptance

- Program can configure official-file destination.
- Test file creates import run.
- Missing/failed file creates signal.

## Packet 16: Program Mode Demos and Seed Data

### Goal

Make the app demo like a real product.

### Seed Programs

- college demo
- high school demo
- showcase demo
- JUCO demo if time allows

### Seed Data

- realistic roster
- pitchers/hitters/catchers/two-way players
- games
- scrimmages
- practices
- lifts
- check-ins
- class conflicts
- imports
- video clips
- CoachHelm signals
- staff meeting
- player tasks
- source trust examples

### Acceptance

- Demo proves the product story without manual setup.
- Program mode differences are visible.

## Packet 17: QA, RLS, Visual, and Role Testing

### Required Tests

- role visibility
- player route protection
- staff route protection
- import run creation
- import rollback
- source drawer rendering
- signal conversion
- practice publish
- player task completion
- lift completion
- class conflict detection
- CoachHelm source references
- video permission

### Required Manual QA

- Command loads with demo data.
- Player Today mobile layout is usable.
- Practice builder works.
- Import review is understandable.
- Strength dashboard is role-appropriate.
- Staff meeting mode creates follow-ups.

## Final Claude Checklist

Before final answer, Claude must verify:

- all touched routes have loading/error/empty states
- all sensitive data is role-gated
- source trust appears on stats/imports/signals/AI/video/performance where applicable
- official and development data are not mixed without labels
- every implemented AI output has sources/confidence
- every import row traces to import run
- rollback/audit paths exist for committed imports
- player mobile app is not the staff app squeezed onto phone
- high school/college/showcase defaults are not just copy changes
- no direct vendor integration is claimed without actual credentials
