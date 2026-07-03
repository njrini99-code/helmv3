# V12 Command Center UI/UX And Tabs

## Visual Direction

The command center should look like BaseballHelm, not generic developer tooling.

Use a premium cream and green language inspired by GolfHelm but made more operational and baseball-specific.

The Agent City source spec is binding for concept and mechanics, but its dark-control-room palette is not binding. BaseballHelm must be cream/green with no black or generic dark theme.

### Brand Mood

- premium college program operations
- data-rich but calm
- cream paper surface, dark green structure, olive/turf accents
- small gold/tan highlights for active decisions
- technical enough to feel powerful
- readable enough that a coach or founder can understand it instantly
- a little living software city, not a log wall

### Color Tokens

Recommended CSS tokens:

```css
:root {
  --bh-cream-50: #fffdf6;
  --bh-cream-100: #fbf6e8;
  --bh-cream-200: #f1ead8;
  --bh-ink: #142019;
  --bh-ink-soft: #39483f;
  --bh-green-900: #0c2d1f;
  --bh-green-800: #123a29;
  --bh-green-700: #18543b;
  --bh-green-600: #23704d;
  --bh-turf: #2f8a57;
  --bh-mint: #d9eee1;
  --bh-gold: #c9a449;
  --bh-clay: #b66a3c;
  --bh-warning: #b88916;
  --bh-danger: #b64035;
  --bh-success: #23704d;
  --bh-info: #3c6e71;
  --bh-line: rgba(20, 32, 25, 0.12);
  --bh-shadow: 0 20px 60px rgba(12, 45, 31, 0.14);
}
```

Avoid one-note green. Use cream, ink, gold, clay, muted teal, and neutral lines to create hierarchy.

No-black rule:

- Page background cannot be black or near-black.
- Navigation shell cannot be black.
- Cards cannot default to black.
- Command output may use a small deep-green terminal surface, not a full black terminal theme.
- If a source spec says deep navy/black, replace that with cream canvas and deep green structure.

### Typography

Use the existing app typography if available. If the artifact is standalone, use system fonts first for reliability:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

For tiny telemetry labels, use:

```css
font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
```

Do not make everything monospace. Use monospace only for event IDs, file paths, table names, timestamps, and command output.

### Layout

Desktop-first, responsive down to laptop width.

Target layout:

- top header with build status, URL, branch, last heartbeat
- left rail with tabs
- main canvas with tab content
- right rail or collapsible inspector for selected agent/packet/event
- bottom live event ribbon or console drawer

The dashboard should fill the viewport. It should not be a centered marketing page.

Use cards only for discrete items: agent cards, packet cards, risk cards, proof cards. Avoid cards inside cards.

### Interaction Standards

- tabs must preserve selected state
- clicking an agent opens a detail inspector
- clicking a packet opens checklist, touched files, tables, routes, tests, risks
- clicking an event opens raw JSON and friendly summary
- clicking a file path should copy path or reveal it in the inspector
- filters should apply instantly
- live updates should never shift the whole layout violently
- progress changes should animate smoothly
- all controls should be keyboard reachable
- all icon-only buttons need labels or tooltips

## Required Tabs

The command center must have multiple tabs/modes. These tabs should be visible from the beginning.

### 0. Agent City

Purpose: The signature view. This is the "little working city" view from the source spec, adapted to BaseballHelm.

Required districts:

- Prompt Plaza
- Planning Hall
- Agent Residential Tower
- Code Quarry
- Component Foundry
- Backend Machine Shop
- Data District
- Integration Harbor
- QA Lab
- Permission Control Tower
- Git Depot
- Shipping Dock
- Memory Library
- Observatory
- Broadcast Center

Required behavior:

- Agents visibly move or highlight between districts based on event type.
- File reads reveal buildings in Codebase City.
- File edits pulse buildings gold.
- Tests activate QA machines.
- Test failures create repair bay items.
- Risk events ping the Control Tower.
- Completed packets move to Shipping Dock and Memory Library.
- The city has honest empty states before events exist.

Visual requirement:

- Cream map canvas.
- Deep green district outlines.
- Turf/olive activity paths.
- Gold task crates.
- Clay/amber risk pings.
- No black background.

### 0B. Factory Floor

Purpose: Process-heavy view for packet flow and bottlenecks.

Show a task conveyor with columns:

- Planned
- Ready
- Claimed
- In Progress
- Code Changed
- Tests Running
- Review
- Complete
- Shipped

Each crate shows:

- packet title
- owner agent
- risk
- completion
- confidence
- files/tables/routes touched
- test status
- last event

Smart features:

- stale task warning
- blocked dependency warning
- test failure repair bay
- high-risk checkpoint reminder
- product-code-before-Task-0 warning

### 0C. Agent Cockpit

Purpose: Deep dive into one agent.

Show:

- mission assigned
- current state
- current task
- files read
- files edited
- commands/events
- tests
- risks
- decisions
- artifacts
- blockers
- pause/freeze/checkpoint buttons where available

Do not expose private chain-of-thought. Show work journal, event summaries, tool calls, diffs, tests, decisions, and completion summaries.

### 0D. Codebase City

Purpose: Repo as a city.

Map:

- folders as neighborhoods
- files as buildings
- routes as roads
- DB tables as towers
- tests as QA stations
- config as utility plants
- auth/RLS as guarded gates

Required lenses:

- activity
- risk
- churn/revisits
- ownership
- blast radius
- test coverage
- scope drift
- complexity/navigation drag

### 0E. Control Tower

Purpose: Full-throttle risk and permission visibility.

Show:

- risk radar
- dangerous commands
- auth/RLS/migration changes
- deletes
- package installs
- file scope drift
- secret/env risk
- checkpoint status
- kill/freeze controls

Controls may initially log intent if direct process control is unavailable, but the UI must clearly distinguish active control from logged intent.

### 0F. Context Reactor

Purpose: Context/memory pressure visibility.

Show:

- token/context metrics if available
- unavailable state if not available
- plan-read capsules
- milestone capsules
- compaction events if available
- file revisit count
- prompt drift/scope drift warnings when derivable

Do not invent token usage.

### 0G. Flight Recorder

Purpose: Replay/audit.

Show:

- event scrubber
- filters by agent, packet, file, risk, test
- jump to first failure
- jump to first edit of file
- major milestone markers
- replay export JSON

Full cinematic replay can come later, but the mode and data structure must exist in Task 0.

### 1. Mission Control

Purpose: The executive view.

Show:

- overall build completion weighted by work packet weight
- overall confidence
- active packet
- active agent lane
- V12 gate status
- current phase: Task 0, Plan Read, Repo Audit, Schema, Product Build, QA, Final Handoff
- next three actions
- newest risk
- newest test status
- newest file changed
- live heartbeat

Required modules:

- `Build Scoreboard`
- `Task 0 Gate`
- `Now Working`
- `Next Three Actions`
- `Confidence Ledger`
- `What Changed Since Last Glance`
- `Critical Risk Strip`

Premium detail:

- Show progress as a weighted arc or segmented rail, not a single flat bar.
- Show "completion" and "confidence" separately.
- Include short human-readable reasons behind confidence.

### 2. Agent Field

Purpose: Visualize all Claude/worker lanes.

Show each agent lane:

- name
- role
- current focus
- status: idle, reading, auditing, building, testing, blocked, done
- current packet
- queue depth
- files touched
- tables touched
- last event time
- heartbeat
- blockers

Required agent lanes:

- Orchestrator
- Agent City Systems Agent
- Repo Cartographer
- Auth and Staff Access Agent
- Supabase and RLS Agent
- UI Systems Agent
- Stats and Integrations Agent
- Practice and Team Ops Agent
- Performance and Lifting Agent
- CoachHelm Engine Agent
- QA and Visibility Agent
- Risk and Scope Warden
- Memory Librarian

Premium detail:

- Use a baseball-field inspired spatial layout without becoming childish. For example, place agent cards around a subtle diamond grid, with the active lane highlighted.
- Include tiny "work motion" visuals: pulsing status rings, recent-file ticks, checklist dots.
- Do not use emojis for agents.

### 3. Feature Scoreboard

Purpose: Feature-specific completion and confidence.

Group packets by BaseballHelm subsystem:

- Task Zero and Visibility
- Foundation and Repo Audit
- Auth, Team Join, Staff Roles
- Supabase, RLS, Data Model
- Stats, Imports, Integrations
- Practice and Team Ops
- Performance and Lifting
- Coach Command Center
- Player Experience
- CoachHelm Intelligence
- Demo and QA

Each row/card shows:

- feature title
- owner agent
- completion percent
- confidence percent
- status
- checklist dots
- tests
- screenshots
- risks
- touched files/tables/routes
- last update

Required advanced behavior:

- allow sorting by risk, completion, confidence, owner, last update
- allow filtering to blocked, active, untested, migration-related, UI-related, auth-related
- show "planned but untouched" as an explicit honest state

### 4. Repo Pulse

Purpose: Live local code visibility.

Show:

- git branch
- last commit
- dirty file count
- changed file list
- diff stat
- files changed by subsystem
- routes touched
- server actions touched
- components touched
- tests touched
- docs touched

Required panels:

- `Changed Files`
- `Route Touch Map`
- `Component Touch Map`
- `Server Action Touch Map`
- `Test Touch Map`
- `Diff Stat`

Premium detail:

- group files by source tree:
  - `src/app/baseball`
  - `src/components/baseball`
  - `src/hooks`
  - `src/lib`
  - `supabase/migrations`
  - `supabase/tests`
  - `tools/baseballhelm-command-center`
  - `scripts`
- show a warning if product code changes before Task 0 is verified.

### 5. Supabase Tower

Purpose: Schema/RLS/migration visibility.

Show:

- migrations added
- tables touched
- policies touched
- generated types status
- RLS test status
- schema risks
- current table ownership
- data privacy risk flags

Required sections:

- `Migration Queue`
- `Existing Tables Verified`
- `New Tables Proposed`
- `RLS Policy Matrix`
- `Role Visibility Checks`
- `Data Safety Risks`

Must highlight the V11/V10/V9 critical areas:

- `users`
- `baseball_coaches`
- `baseball_players`
- `baseball_teams`
- `baseball_team_members`
- `baseball_team_coach_staff`
- `baseball_team_invitations`
- staff invitations
- import/source tables
- stats/source-ref tables
- lifting/performance tables
- AI source and confidence tables

Premium detail:

- Use a tower or stacked ledger visual where foundations are identity/team membership, middle floors are imports/stats/performance, and top floors are CoachHelm/AI outputs.
- Always distinguish planned tables from actual migrations.

### 6. Build Timeline

Purpose: Chronological truth.

Show:

- live event stream
- filters by type, agent, packet, file, table, route, risk, test
- raw JSON drawer
- friendly event summaries
- timestamp and relative time

Required event categories:

- command center
- plan read
- audit
- schema
- UI
- server action
- migration
- test
- browser check
- risk
- handoff

Premium detail:

- Include a "major moments" lane above the detailed log.
- Include pause/resume for live scrolling.
- If reduced motion is enabled, disable row entrance motion.

### 7. Test and Proof Lab

Purpose: Show evidence that work is real.

Show:

- typecheck status
- lint status
- unit/integration test status
- RLS/supabase test status
- Playwright/browser checks
- screenshots
- route verification
- role visibility walkthrough
- failed tests with short cause
- not-run tests as honest gaps

Required proof cards:

- Command Center opened in Chrome
- Coach Command Center loaded
- Player Today loaded
- Practice Planner loaded
- Performance/Lifting loaded
- Import Center loaded
- Staff invite flow checked
- Player join flow checked
- Role visibility checked

Premium detail:

- Use proof cards with evidence attachments or paths.
- Use status chips: not run, running, passed, failed, skipped with reason.
- Do not hide skipped tests.

### 8. CoachHelm Intelligence Monitor

Purpose: Show whether the AI/data engine is being built as planned.

Show:

- source-backed signal generators planned/started/done
- source citation coverage
- confidence model status
- AI output tables/actions
- decision ledger status
- practice prescription status
- Postgame Action Review status
- Practice Effectiveness Review status
- Staff Decision Room status

Required signal groups:

- two-strike chase
- game-vs-practice contact quality gap
- pitcher velocity/command decay
- workload/readiness risk
- class/lift/practice conflict
- postgame-to-practice focus
- performance-to-field transfer
- import cleanup suggestions

Premium detail:

- Show "AI without source refs" as a red risk.
- Show each generator's input sources and output action target.

### 9. Integration Radar

Purpose: Track import adapter coverage.

Show:

- GameChanger college XML
- GameChanger season CSV
- StatCrew XML
- NCAA/Presto/SIDEARM XML
- TrackMan
- Rapsodo
- 6-4-3 Charts
- Synergy
- TRAQ exports
- TeamBuildr
- Teamworks classes
- ArmCare
- OnForm
- Google Sheets
- generic CSV/XLSX/PDF/manual

Each integration row should show:

- status: planned, setting only, parser scaffold, sample parsed, committed to DB, QA verified
- source type
- expected file/feed type
- parser ownership
- player matching status
- rollback status
- confidence model status
- direct integration deferred reason if applicable

Premium detail:

- Use radar rings or grouped lanes: Official Stats, Player Development, Strength/Wellness, Academics/Ops, Video.
- Clearly separate "import-ready" from "direct API sync."

### 10. Performance Build Room

Purpose: Track the strength/lifting subsystem as a serious module.

Show:

- strength coach dashboard
- groups
- exercise library
- program builder
- training blocks
- live weight room mode
- player lift execution
- readiness check-ins
- soreness map
- bodyweight
- PRs/maxes
- pitcher/two-way modifications
- TeamBuildr/TRAQ/import readiness
- CoachHelm performance signals

Premium detail:

- Show workflow chain:
  `Coach creates group -> assigns program -> player completes lift -> readiness changes -> CoachHelm signal -> practice adjustment`
- Show the current implementation state for every part of that chain.

### 11. Practice and Game Ops Room

Purpose: Track the team-management/practice/scrimmage/game systems.

Show:

- practice plan generator
- time-slot builder
- headline and optional description model
- stations/groups
- staff assignments
- calendar attachment
- drag/drop scrimmage lineup
- defensive position labels
- scrimmage stat separation
- game schedule
- acknowledgements/tasks
- practice effectiveness measurement

Premium detail:

- Show a mini practice timeline mock with time slots as the packet becomes active.
- Show whether practice data can flow into stats, CoachHelm, player profile, and calendar.

### 12. Handoff Ledger

Purpose: Make final reporting easy.

Show:

- work packets completed
- files changed
- tables changed
- routes changed
- tests run
- screenshots captured
- known risks
- deferred items
- follow-up commands
- final status by subsystem

This tab should function as the final build report source.

## Inspector Drawer

Clicking any agent, packet, file, table, route, event, or risk should open an inspector drawer.

Inspector should show:

- friendly title
- current status
- owner
- related events
- touched files
- touched tables
- related routes
- tests
- risks
- raw JSON
- last update time

## Empty, Loading, Error States

This artifact must have polished route states too:

- loading skeleton for first state fetch
- empty state when no events exist
- disconnected state if SSE drops
- server unreachable state with retry instructions
- malformed telemetry state with file path and parse error
- Chrome gate blocked state if verification not logged

## Responsiveness

Primary target is desktop Chrome. Still support:

- 1440px desktop
- 1280px laptop
- 1024px tablet landscape
- 768px tablet

At narrow widths:

- collapse left rail into top segmented tabs or drawer
- stack right inspector below content
- preserve readable event logs
- avoid horizontal page scroll

## Accessibility

Required:

- keyboard tabs
- visible focus rings
- contrast 4.5:1 for text
- status not conveyed by color only
- aria-live polite region for major status changes
- pause live event stream
- reduced-motion support
- table/list fallback for chart visuals

## Animation

Use motion only for meaning:

- heartbeat pulse for connected live status
- smooth progress interpolation
- event row entrance
- inspector open/close
- tab transition
- active agent focus glow

Do not animate layout dimensions heavily. Prefer transform and opacity.

## Prohibited UI Patterns

Do not:

- use emojis as icons
- make a landing page
- make a static PDF-like overview
- use vague "AI is working" copy
- use fake generated agent chatter
- hide failures
- show completion without evidence
- bury critical risk below the fold
- use black or near-black as the primary visual system
- use a purple/blue generic SaaS palette
- make all cards the same size with no hierarchy
- use a cartoon baseball aesthetic

The goal is premium operations intelligence, not sports clip art.
