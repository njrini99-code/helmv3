# UltraCode Command Center — Agent City / Factory Floor Product Spec

> BaseballHelm V12 override: this source spec is binding for ambition, mechanics, wiring, visibility, replay, safety, and the Agent City / Factory Floor metaphor. It is not binding for its dark visual palette. For BaseballHelm, follow `v12_agent_city_baseballhelm_adaptation.md`: cream/green, no black/dark control-room theme, and fully wired before product work starts.

**Version:** 1.0  
**Purpose:** Build an ultra-visible, game-like command center for very long Claude Code / UltraCode sessions with full agent visibility, live progress, codebase observability, permission-aware execution, replay, and a “little working city” interface.  
**Design direction:** Not a basic dashboard. This should feel like a premium autonomous software factory: **SimCity + Factorio + StarCraft command view + NASA mission control + Vercel-grade SaaS polish**.

---

## 0. What this should become

The product should make a long Claude session feel like watching a tiny autonomous software company work inside your repo.

Not just:
> “Here are logs.”

But:
> “Here is the city of work. Every agent has a place, every file is a building, every task is a vehicle moving through the production network, every test failure is smoke from a QA lab, every risky command lights up the control tower, every commit leaves the shipping dock, and every decision is preserved in the city archive.”

The command center should provide three things at once:

1. **Cinematic visibility**  
   You can glance at the screen and understand what the session is doing.

2. **Operational control**  
   You can pause, redirect, replay, compare, approve, terminate, branch, and inspect.

3. **Trust and memory**  
   You can understand what happened, why it happened, what changed, what is risky, and what should happen next.

---

## 1. Research anchors

These are the current capabilities and market signals that make this possible.

### 1.1 Claude Code is instrumentable enough to power this

Claude Code exposes lifecycle hooks for events such as session start/end, prompts, tool use, permission requests, subagent start/stop, task creation/completion, file changes, worktree creation/removal, compaction, notifications, and streamed messages. Hook handlers can be shell commands, HTTP endpoints, or prompt/agent hooks. That means the UI can be wired to real events instead of fake progress.

Source: Claude Code Hooks Reference  
https://code.claude.com/docs/en/hooks

### 1.2 Claude Code can export telemetry

Claude Code supports OpenTelemetry export for metrics, logs/events, and traces. It can track usage, cost, tool activity, model requests, tool execution, and structured logs. This is the backbone for real-time cost, token, reliability, trace, and agent loop observability.

Source: Claude Code Monitoring / OpenTelemetry  
https://code.claude.com/docs/en/monitoring-usage

### 1.3 Worktree isolation is key for parallel agents

Claude Code supports worktrees for parallel sessions and subagent isolation. Subagents can run in their own temporary worktrees, reducing collisions and allowing parallel implementations or comparison runs.

Source: Claude Code Worktrees  
https://code.claude.com/docs/en/worktrees

### 1.4 The market is moving toward agent mission control

GitHub Agent HQ frames the future as a mission control surface where developers can choose from a fleet of agents, assign them work in parallel, and track progress across GitHub, VS Code, mobile, and CLI.

Source: GitHub Agent HQ  
https://github.blog/news-insights/company-news/welcome-home-agents/

### 1.5 OpenHands Agent Canvas is the closest existing pattern

OpenHands Agent Canvas is a local visual workspace for running multiple coding agents, with support for Claude Code, Codex, ACP-compatible harnesses, local/remote/cloud backends, worktree isolation, and automations. This validates the category but still leaves room for a much more cinematic “city/factory” visual layer.

Source: OpenHands Agent Canvas  
https://www.openhands.dev/product/canvas

### 1.6 Google Antigravity validates the “Manager Surface + Artifacts” pattern

Google Antigravity has an Editor View and a Manager Surface for spawning, orchestrating, and observing multiple agents asynchronously. It emphasizes artifacts such as task lists, implementation plans, screenshots, and browser recordings so users can verify work without reading raw logs.

Source: Google Developers Blog — Antigravity  
https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/

### 1.7 Agent safety and observability matter more with full autonomy

Recent Claude Code research describes the core agent loop as simple, but surrounded by systems for permissions, compaction, hooks, MCP, plugins, skills, subagents, worktree isolation, and append-oriented session storage. The lesson: the value is not just the model. The value is the operating system around the agent.

Source: “Dive into Claude Code: The Design Space of Today’s and Future AI Agent Systems”  
https://arxiv.org/abs/2604.14228

### 1.8 Code cleanliness affects agent efficiency

Research on Claude Code suggests cleaner code can reduce tokens and file revisitations. The dashboard should therefore show codebase “navigation drag”: files revisited, repeated searches, churn, complexity, failed build loops, and noisy architecture zones.

Source: “Does Code Cleanliness Affect Coding Agents?”  
https://arxiv.org/abs/2605.20049

---

## 2. Product name candidates

Pick a name that feels like a tool you want running on a second monitor.

### Best options

1. **UltraCode Command Center**
2. **Agent City**
3. **ForgeTower**
4. **ClaudeOps City**
5. **CodeFoundry**
6. **AgentWorks**
7. **Helm Control**
8. **MissionForge**
9. **WorkerCity**
10. **The Factory Floor**

### Recommended naming

Use:

# **UltraCode Command Center**

With the main view called:

# **Agent City**

That gives you both seriousness and the cool visual metaphor.

---

## 3. North-star product promise

**UltraCode Command Center gives you full visual command over autonomous coding sessions: every agent, task, tool call, file change, test, risk, cost, branch, and decision is visible as a living software city.**

The user should be able to answer these questions instantly:

- What is Claude doing right now?
- Which agents are active?
- Which task is each agent working on?
- What files are changing?
- What commands are running?
- What tests are failing?
- Where is the session stuck?
- What is risky?
- How much has it cost?
- How full is the context window?
- What decisions were made?
- What changed since the last checkpoint?
- Can I replay the entire session?
- Can I stop one agent without stopping the whole mission?
- Can I compare two branches/agent attempts?
- Is this thing actually getting closer to done?

---

## 4. The main metaphor: a little working city

The interface should not be a static admin dashboard. It should be an animated, data-driven city.

Each part of the software process becomes a district.

## 4.1 City districts

### 1. Prompt Plaza

Where the mission starts.

Visual:
- Large central monument showing the main objective.
- “Mission contract” carved into panels.
- Required outcomes, forbidden changes, success criteria, and constraints.

Data:
- Original prompt.
- Expanded plan.
- Clarifying assumptions.
- Definition of done.
- Scope boundaries.
- Autonomy level.
- Full-permission mode settings.

### 2. Planning Hall

Where the Architect Agent decomposes the mission.

Visual:
- Blueprint table.
- Holographic dependency graph.
- Milestone cards as construction permits.

Data:
- Milestones.
- Task DAG.
- Dependencies.
- Risk ratings.
- Agent assignments.
- Estimated blast radius.

### 3. Agent Residential Tower

Where all agents “live.”

Visual:
- A vertical tower of animated agent pods.
- Each pod lights up when active.
- Elevators move when agents switch tasks.
- Each agent has a name, role, state, worktree, and health.

Data:
- Agent ID.
- Agent role.
- Current status.
- Current task.
- Context usage.
- Tool usage.
- Cost.
- Worktree path.
- Current files.
- Last update.
- Blocker state.

### 4. Code Quarry

Where agents mine the repo for information.

Visual:
- Excavators scanning directories.
- Files pulled from the ground as glowing blocks.
- Repeated file reads create “worn paths.”

Data:
- Reads.
- Greps.
- Globs.
- File revisits.
- Navigation loops.
- Most-searched symbols.
- Areas of uncertainty.

### 5. Component Foundry

Where frontend work happens.

Visual:
- Components assembled on conveyor belts.
- UI panels stamped, painted, polished.
- Broken components go to QA rework.

Data:
- Components created/modified.
- CSS/Tailwind changes.
- Screens touched.
- Storybook status.
- Screenshot artifacts.
- Visual diff results.
- Accessibility results.

### 6. Backend Machine Shop

Where APIs, services, jobs, auth, and logic are built.

Visual:
- Gears, pipes, routers, and server racks.
- API endpoints as pipeline junctions.
- Database jobs as moving capsules.

Data:
- API route changes.
- Service changes.
- Server actions.
- Auth middleware changes.
- Jobs/cron changes.
- Errors and logs.

### 7. Data District

Where database/schema work lives.

Visual:
- Database towers.
- Migration cranes.
- Table blocks.
- Data flows between buildings.

Data:
- Migrations.
- Tables touched.
- Columns added/removed.
- RLS/policy changes.
- Seed data.
- Supabase/local DB status.
- Dangerous schema actions.

### 8. Integration Harbor

Where external services connect.

Visual:
- Docks.
- Ships arriving with GitHub, Supabase, Stripe, Sentry, Slack, Vercel, etc.
- Broken integrations create storm clouds over the harbor.

Data:
- MCP calls.
- API calls.
- Connector status.
- Webhook configuration.
- External errors.
- Rate limits.
- Secrets usage.

### 9. QA Lab

Where tests run.

Visual:
- Test machines.
- Green/red lights.
- Failed tests smoke or spark.
- Passing suites turn on city power.

Data:
- Unit tests.
- Integration tests.
- E2E tests.
- Typecheck.
- Lint.
- Build.
- Coverage.
- Test duration.
- Flaky test detection.
- Repeated failure loops.

### 10. Security / Permission Control Tower

Even with full permission, this should remain visible.

Visual:
- Tall control tower with radar.
- Risk rings sweep across the city.
- Dangerous commands appear as red aircraft.
- Protected files are restricted zones.

Data:
- Permission mode.
- Risky commands.
- Protected path access.
- `.env` reads.
- Delete commands.
- Package installs.
- Network calls.
- Secrets exposure risk.
- Auth/RLS edits.
- Blast radius alerts.

### 11. Git Depot

Where branches, commits, diffs, and worktrees live.

Visual:
- Rail yard.
- Branches are tracks.
- Worktrees are parallel platforms.
- Commits are cargo containers.
- Merge conflicts are train collisions.

Data:
- Current branch.
- Worktrees.
- Changed files.
- Diff size.
- Commits.
- Merge status.
- Untracked files.
- Rebase/merge activity.
- PR readiness.

### 12. Shipping Dock

Where completed work leaves the city.

Visual:
- Release ship / launch pad.
- Build green = ship fueled.
- PR created = cargo loaded.
- Deploy ready = countdown.

Data:
- PR summary.
- Release notes.
- CI status.
- Deployment status.
- Rollback plan.
- Final artifact bundle.

### 13. Memory Library

Where session memory is preserved.

Visual:
- Library/archive.
- Important decisions are books.
- Compactions are sealed capsules.
- Context summaries are stored scrolls.

Data:
- Decision ledger.
- Context compactions.
- Mission summaries.
- Agent handoffs.
- Known constraints.
- Past task outcomes.
- Reusable project knowledge.

### 14. Observatory

The high-level metrics district.

Visual:
- Telescope, radar, star map.
- Cost and token trails in the sky.
- Reliability charts as constellations.

Data:
- Cost.
- Tokens.
- Time.
- Tool calls.
- Agent utilization.
- Context pressure.
- Failure rate.
- Retry rate.
- Productivity velocity.

### 15. Broadcast Center

The narrative feed.

Visual:
- News ticker / radio tower.
- Short updates in human language.
- Severity and event type filters.

Data:
- “Backend Agent started migration review.”
- “QA detected repeated failing test.”
- “Frontend Agent completed roster import screen.”
- “Context is 82%; recommend capsule.”
- “Scope drift detected: touched billing files outside mission.”

---

## 5. UI/UX design principles

## 5.1 Every animation must mean something

Do not animate for decoration only. The city should be beautiful, but the user should learn the system by watching it.

Examples:

- Agent walking = agent actively processing.
- Agent standing still = idle.
- Agent spinning around = stuck/retrying.
- Agent carrying a file crate = editing a file.
- Smoke from QA lab = failing tests.
- Train collision = merge conflict.
- Red radar ping = risky operation.
- Conveyor backlog = queued tasks.
- Dark district = no activity.
- Gold glow = task completed.
- Purple fog = context pressure.
- Blue lightning = tool execution.
- Green power grid = test/build pass.

## 5.2 Default view should be glanceable

The user should be able to walk past the monitor and understand:

- Active agents: 6
- Current milestone: Import Pipeline V2
- Progress: 62%
- Risk: Medium
- Tests: 142 passing / 3 failing
- Cost: $8.43
- Context: 71%
- Blockers: 2
- Last meaningful progress: 4 minutes ago

## 5.3 Depth should be progressive

The city is the overview. Clicking dives deeper.

1. **City view** — What is happening overall?
2. **District view** — What is happening in one domain?
3. **Building view** — What is happening to one subsystem/file?
4. **Agent cockpit** — What is one agent doing?
5. **Raw event trace** — What exactly happened?

## 5.4 Make raw logs optional, not primary

Raw logs should exist, but they should not be the UI.

Antigravity’s “verify with artifacts, not logs” principle is the right direction. The command center should convert logs into:
- Visual artifacts.
- Diffs.
- Screenshots.
- Replay cards.
- Decision cards.
- Test reports.
- Risk cards.
- Timeline events.

## 5.5 Full permission should not mean blind permission

You said this will have full permission. That is fine for power-user flow, but full permission should make visibility more important, not less.

The UI should assume:
- The agent can do almost anything.
- Therefore every important action must be visible.
- Every dangerous action must be recorded.
- Every destructive action should have a checkpoint before it.
- The dashboard should have a giant kill switch.
- The system should be able to replay and explain exactly what happened.

This is not “ask me every time.”  
This is **full throttle with aircraft instrumentation**.

---

## 6. Visual language

## 6.1 Aesthetic

Recommended style:

**Premium dark control room + isometric miniature city + translucent SaaS panels + game-grade motion.**

Avoid:
- Cheap neon cyberpunk.
- Toy-like cartoon UI.
- Generic admin dashboard.
- Overly dense Grafana wall.
- Too much terminal text.
- Random badges.

Use:
- Deep navy/black background.
- Subtle grid floor.
- Soft glows.
- Glass panels.
- Emerald/blue/gold state colors.
- Thin technical lines.
- Tiny animated workers.
- Isometric map.
- Premium data typography.
- Smooth microinteractions.

## 6.2 Palette

Suggested semantic colors:

| Meaning | Color Direction |
|---|---|
| Idle | Slate / muted gray |
| Thinking | Electric blue |
| Reading/searching | Cyan |
| Editing | Gold |
| Running command | Violet |
| Tests passing | Emerald |
| Tests failing | Red |
| Risk | Orange/red |
| Blocked | Crimson |
| Context pressure | Purple |
| Complete | Green/gold |
| Shipping | White/gold |
| Human input needed | Amber |

## 6.3 Typography

Use two font personalities:

1. **Primary UI font**  
   Inter, Geist, or SF Pro style.
   - Clean.
   - SaaS.
   - Readable.

2. **Telemetry/monospace font**  
   JetBrains Mono, IBM Plex Mono, or Berkeley Mono style.
   - Cost.
   - Logs.
   - IDs.
   - Diffs.
   - Terminal output.

## 6.4 Layout

Recommended full-screen desktop layout:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Mission Bar: Objective | Progress | Agents | Tests | Risk | Cost | Context │
├───────────────┬───────────────────────────────────────────────┬─────────────┤
│ Agent Tower   │                                               │ Control     │
│               │              AGENT CITY MAP                   │ Tower       │
│ Agent cards   │       districts, roads, conveyors, files       │ Risk/Perms  │
│               │                                               │ Tests       │
├───────────────┴───────────────────────────────────────────────┴─────────────┤
│ Timeline / Radio Feed / Replay Scrubber / Current Tool Calls                │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 6.5 Screen modes

### Mode 1: City Mode

The default cinematic view.

Best for:
- Watching a long session.
- Feeling progress.
- Seeing all agents at once.

### Mode 2: Factory Mode

A more process-heavy view.

Best for:
- Tracking task flow.
- Seeing bottlenecks.
- Managing queues.

### Mode 3: War Room Mode

A serious operations view.

Best for:
- Full permission execution.
- Dangerous operations.
- Debugging.

### Mode 4: Replay Mode

Time-lapse playback of the entire session.

Best for:
- Reviewing what happened.
- Finding when a bug was introduced.
- Sharing progress.

### Mode 5: Cockpit Mode

Deep dive into one agent.

Best for:
- Understanding an agent’s exact work.
- Killing or redirecting one agent.
- Inspecting files/commands/tests.

### Mode 6: Codebase Map Mode

Repo as city/buildings.

Best for:
- Seeing changed files.
- Tracking hotspots.
- Detecting scope drift.

---

## 7. The most important UI surfaces

## 7.1 Mission Launch Screen

Before the session starts, the user sees a cinematic launch sequence.

### Purpose

Transform a vague long prompt into a visible mission contract.

### UI elements

- Mission name.
- Objective.
- Definition of done.
- Required checks.
- Forbidden zones.
- Agents to spawn.
- Permission mode.
- Snapshot/backup settings.
- Worktree strategy.
- Max cost / max time / max context thresholds.
- Success artifacts.

### UX recommendation

Use a “pre-flight checklist” vibe.

Example:

```text
MISSION: Rebuild BaseballHelm Import System

✅ Repo scanned
✅ Git clean
✅ Snapshot created
✅ Worktree strategy: isolated subagents
✅ Test commands detected
✅ Risk zones mapped
✅ Full Permission Mode: enabled
✅ Audit recorder: enabled
✅ Kill switch: enabled
```

### Important

For full permission sessions, launch should automatically create:
- Git checkpoint.
- Optional local backup.
- Session ID.
- Event stream.
- Telemetry stream.
- Worktree root.
- Artifact folder.
- “restore instructions” note.

---

## 7.2 Mission Bar

Always visible at the top.

### Should show

- Mission title.
- Overall progress.
- Active milestone.
- Active agents.
- Tests.
- Build.
- Risk.
- Cost.
- Token/context pressure.
- Elapsed time.
- Last meaningful progress.
- Kill switch.

### Example

```text
ULTRACODE: BaseballHelm Import V2
Milestone 4/9: Stats Normalization | 7 Agents | 63% | Tests 184/192 | Risk Medium | $7.82 | Context 74%
```

### Visual recommendation

Use a sleek command bridge style:
- One-line critical telemetry.
- Animated progress strip.
- Red/amber/green health indicators.
- Click any metric to open details.

---

## 7.3 Agent City Map

This is the heart.

### Visual idea

A 2.5D isometric city where each district represents a type of work.

Agents are animated workers, drones, ships, carts, or vehicles.

### Agent movement

Agents move between districts based on their actual tool calls:

| Event | Visual Movement |
|---|---|
| Read/Grep/Glob | Agent moves to Code Quarry |
| Edit/Write | Agent moves to relevant building |
| Bash/test command | Agent moves to QA Lab / Terminal Plant |
| Git command | Agent moves to Git Depot |
| MCP/API | Agent moves to Integration Harbor |
| Subagent start | New worker leaves Agent Tower |
| Task created | New crate appears on conveyor |
| Task completed | Crate moves to Shipping Dock |
| File changed | Building lights up |
| Worktree created | New parallel city island appears |
| Compaction | Memory capsule moves into Library |

### Must-have interaction

Click:
- Agent.
- Building/file.
- District.
- Task crate.
- Test machine.
- Commit container.
- Alert/risk ping.

Hover:
- Show tooltip with current event and timestamp.

Double click:
- Open cockpit panel.

Right click:
- Pause agent.
- Redirect.
- Pin.
- Open transcript.
- Compare changes.
- Create checkpoint.

---

## 7.4 Agent Tower

A vertical stack of all agents.

### Each agent card shows

- Avatar/icon.
- Role.
- Current task.
- Status.
- Tool now.
- Files touched.
- Time active.
- Cost.
- Context usage.
- Worktree.
- Confidence/health.
- Last meaningful update.
- Kill/pause button.

### Status examples

- Planning
- Reading
- Editing
- Testing
- Debugging
- Waiting
- Blocked
- Reviewing
- Completed
- Failed
- Rogue/scope drift

### Cool UI idea

Each agent has a tiny “heartbeat” waveform:
- Smooth = healthy.
- Spiky = many errors/retries.
- Flat = idle/stuck.
- Red = failing commands.

---

## 7.5 Agent Cockpit

Deep dive for one agent.

### Layout

```text
┌──────────────────────── Agent Cockpit ─────────────────────────┐
│ Agent: Backend Machinist | Worktree: import-v2-backend          │
│ Current State: Editing | Current Task: Normalize stat rows       │
├─────────────────────┬──────────────────────┬───────────────────┤
│ Current Plan        │ Files / Diffs         │ Tool Calls         │
│ - Parse CSV         │ stats/import.ts       │ Read: 12           │
│ - Validate rows     │ schema.sql            │ Edit: 5            │
│ - Write tests       │ import.test.ts        │ Bash: 3            │
├─────────────────────┴──────────────────────┴───────────────────┤
│ Live narrative: “Found duplicate stat mapping in legacy import.”│
├─────────────────────────────────────────────────────────────────┤
│ Buttons: Pause | Redirect | Snapshot | Open Diff | Kill Agent    │
└─────────────────────────────────────────────────────────────────┘
```

### Must show

- Mission assigned.
- Prompt given to the subagent.
- Tools allowed.
- Worktree.
- Files read.
- Files edited.
- Commands run.
- Errors encountered.
- Test results.
- Output artifacts.
- Final summary.
- Current blocker.

### UX requirement

Do not expose private chain-of-thought. Show:
- Work journal.
- Event summaries.
- Tool calls.
- Diffs.
- Test results.
- Agent-authored final summaries.
- Decision ledger entries.

---

## 7.6 Task Conveyor Belt

A visual production line.

### Columns

1. Backlog
2. Ready
3. Claimed
4. In progress
5. Code changed
6. Tests running
7. Review
8. Complete
9. Shipped

### Visual

Tasks are crates moving across belts.
Each crate has:
- Title.
- Owner agent.
- Milestone.
- Risk.
- Files touched.
- Progress.
- Test status.

### Smart features

- Bottleneck detection.
- WIP limit.
- Stale task warning.
- Scope creep warning.
- Dependency blocked state.
- Merge conflict warning.

---

## 7.7 Codebase City / Repo Map

Turn the repository into a city.

### Mapping options

| Repo Concept | City Concept |
|---|---|
| Folder | Neighborhood |
| File | Building |
| Function/component | Room |
| API route | Road/pipe |
| DB table | Data tower |
| Tests | QA station |
| Config | Utility plant |
| Auth/RLS | Security gate |
| Package.json | Supply warehouse |

### File building states

- Gray = untouched.
- Blue = read.
- Gold = edited.
- Green = tested/passed.
- Red = failing.
- Orange = high risk.
- Purple = context hotspot.
- White pulse = currently being edited.

### Lenses

1. **Activity lens**  
   What is being touched now?

2. **Risk lens**  
   Auth, database, permissions, env, billing, destructive changes.

3. **Churn lens**  
   Files repeatedly edited/read.

4. **Ownership lens**  
   Which agent owns which area.

5. **Blast radius lens**  
   How wide the current change is.

6. **Test coverage lens**  
   What changed without tests.

7. **Scope drift lens**  
   What changed outside the mission.

8. **Complexity lens**  
   Files with too many revisits, errors, or cascading changes.

### Cool idea: city weather

- Sunny = healthy build.
- Rain = active debugging.
- Lightning = failing tests.
- Fog = context pressure.
- Fire = repeated failures.
- Sirens = risky full-permission action.
- Dawn = mission complete.

---

## 7.8 QA Lab

A dedicated visual testing center.

### Test machines

- TypeScript machine.
- Lint machine.
- Unit test machine.
- Integration test machine.
- E2E machine.
- Build machine.
- Migration machine.
- Visual QA machine.
- Accessibility machine.
- Performance machine.

### Each machine shows

- Last run.
- Duration.
- Pass/fail.
- Failure count.
- Failure trend.
- Agent responsible.
- Files likely responsible.
- Suggested next action.

### Best UI moment

When tests fail, a red crate gets routed to the “Repair Bay.”  
A Bug Hunter agent can claim it.  
When fixed, the crate returns to the QA belt.

---

## 7.9 Full-Permission Control Tower

You said full permission. This should be treated as a powerful “turbo mode,” not hidden.

### Visual

A giant tower with radar rings and alert lanes.

### Shows

- Current permission mode.
- Protected files touched.
- Risky shell commands.
- Package installs.
- File deletes.
- Network calls.
- Secrets reads.
- Auth/RLS changes.
- Database destructive operations.
- Commands with broad scope.
- Unusual activity.
- Scope escalation.

### Full-permission actions should still be logged as cards

Examples:

```text
RISK CARD
Agent: Backend Machinist
Action: rm -rf .next/cache
Risk: Low
Reason: Clearing build cache inside project
Checkpoint: Not required
Status: Executed
```

```text
RISK CARD
Agent: Migration Crane
Action: Modified supabase/migrations/20260623_import.sql
Risk: High
Reason: Schema change affects production-like data model
Checkpoint: Created before edit
Status: Executed
```

```text
RISK CARD
Agent: Cleanup Drone
Action: Deleted 12 files
Risk: High
Reason: Multi-file deletion
Checkpoint: Created
Status: Executed
Undo: git restore available
```

### Kill switch

Always visible:
- Stop all agents.
- Stop one agent.
- Freeze file writes.
- Freeze shell commands.
- Freeze external calls.
- Revert to checkpoint.
- Save session and exit.

---

## 7.10 Context / Token Reactor

Long Claude sessions fail when context gets messy. Make this highly visible.

### Visual

A reactor core or fuel tank.

### Shows

- Context used.
- Context trend.
- Compaction history.
- Important memory capsules.
- Active constraints.
- Forgotten-risk warnings.
- Files that should be re-read.
- Decisions since last compaction.
- Prompt drift score.

### Events

- PreCompact = reactor preparing to compress.
- PostCompact = memory capsule created.
- Context > 70% = purple warning.
- Context > 85% = recommend milestone checkpoint.
- Context > 95% = hard warning.

### Memory Capsules

Each milestone generates a capsule:

```text
Capsule #4 — Import Pipeline Normalization
- Completed schema mapping.
- Player matching now uses normalized names.
- Known issue: doubleheaders need validation.
- Tests added: import-normalizer.test.ts
- Next: wire UI import preview.
```

---

## 7.11 Decision Ledger

A beautiful timeline of decisions.

### Why it matters

Long agent sessions make tons of architectural decisions. The user needs to know why.

### Card structure

```text
Decision
Title: Use staging tables before writing official stats
Why: Prevent corrupting live stat records during import validation
Chosen by: Architect Agent
Alternatives:
- Direct upsert into stats table
- Temp in-memory parse only
Evidence:
- Existing schema has team/player relationships
- Import errors need row-level review
Impact:
- Safer imports
- More code
- Easier rollback
```

### UI idea

A marble/metal “city archive” where each decision is stamped and filed.

---

## 7.12 Flight Recorder / Replay Mode

This is one of the killer features.

### Replay should show

- Agent creation.
- Task creation.
- File reads.
- File edits.
- Commands.
- Test failures.
- Fix attempts.
- Worktree changes.
- Risk events.
- Compactions.
- Commits.
- Final result.

### Controls

- Timeline scrubber.
- Speed: 0.5x, 1x, 4x, 20x.
- Filter by agent.
- Filter by file.
- Filter by task.
- Filter by risk.
- Jump to failure.
- Jump to checkpoint.
- Jump to first edit of a file.
- Compare before/after.

### UX power

When something breaks, user can ask:
> “When did this file first go wrong?”

The replay should show:
- First edit.
- Agent responsible.
- Related task.
- Previous tests.
- Next failure after edit.

---

## 8. Agent roster

Make the agents feel like a real team. They should have names, roles, icons, visual homes, and permissions.

## 8.1 Core agents

### Mayor / Orchestrator

Role:
- Owns the mission.
- Decomposes work.
- Assigns tasks.
- Resolves conflicts.
- Updates the mission contract.

Visual:
- City hall / command mayor.
- Holographic baton.

Tools:
- Read.
- Grep.
- Glob.
- Task creation.
- Git status.
- No direct risky writes unless necessary.

### Architect Agent

Role:
- Understands existing repo.
- Designs system plan.
- Creates implementation sequence.
- Defines data flows.

Visual:
- Blueprint table.

Outputs:
- Architecture notes.
- Dependency graph.
- Risk map.
- Definition of done.

### Frontend Artisan

Role:
- UI implementation.
- Components.
- Screens.
- Motion and polish.

Visual:
- Component foundry worker.

Outputs:
- Screens.
- Components.
- Screenshot artifacts.
- Visual QA notes.

### Backend Machinist

Role:
- APIs.
- Services.
- Jobs.
- Business logic.

Visual:
- Machine shop engineer.

Outputs:
- Routes.
- Server actions.
- Services.
- Tests.

### Database Crane Operator

Role:
- Schema.
- Migrations.
- Seeds.
- RLS.
- Data model.

Visual:
- Crane moving table blocks.

Outputs:
- Migration notes.
- Schema diffs.
- Seed data.
- Rollback strategy.

### QA Inspector

Role:
- Runs tests.
- Parses failures.
- Creates repair tickets.
- Validates final result.

Visual:
- Lab coat inspector.

Outputs:
- Test reports.
- Failure clusters.
- Reproduction steps.
- Pass/fail gate.

### Bug Hunter

Role:
- Fixes failing tests.
- Finds root causes.
- Minimizes blast radius.

Visual:
- Detective / drone.

Outputs:
- Fix PR/diff.
- Root cause summary.
- Regression test.

### Security Warden

Role:
- Monitors full permission actions.
- Watches secrets/auth/RLS/deletes.
- Enforces audit visibility.

Visual:
- Control tower operator.

Outputs:
- Risk cards.
- Scope drift warnings.
- Protected path alerts.

### Git Conductor

Role:
- Branches.
- Worktrees.
- Commits.
- Diffs.
- PR readiness.

Visual:
- Rail yard conductor.

Outputs:
- Commit plan.
- Merge conflict status.
- PR summary.
- Rollback plan.

### Memory Librarian

Role:
- Summaries.
- Compaction capsules.
- Decision ledger.
- Session continuity.

Visual:
- Archive keeper.

Outputs:
- Capsule summaries.
- Decision entries.
- Next-step briefs.

### Visual QA Scout

Role:
- Uses browser screenshots.
- Compares UI states.
- Validates responsive layout.

Visual:
- Camera drone.

Outputs:
- Screenshots.
- Browser recordings.
- UI issue cards.
- Accessibility notes.

### Release Captain

Role:
- Final checks.
- Release notes.
- Deployment readiness.
- Known issues.

Visual:
- Shipping dock captain.

Outputs:
- Final summary.
- Release checklist.
- Deployment instructions.
- Rollback notes.

---

## 9. Agent states and animations

## 9.1 Agent state machine

```text
idle
↓
assigned
↓
planning
↓
reading
↓
editing
↓
running_command
↓
testing
↓
reviewing
↓
complete
```

Exception states:

```text
blocked
stuck
risky_action
scope_drift
conflict
failed
paused
killed
handoff
```

## 9.2 Animation mapping

| State | Visual |
|---|---|
| idle | Agent pod dimmed |
| assigned | Agent receives glowing task crate |
| planning | Agent at blueprint table |
| reading | Agent scans file buildings |
| editing | Sparks/tools at building |
| running command | Agent at terminal generator |
| testing | Agent in QA lab |
| reviewing | Agent under magnifying glass |
| complete | Gold completion flare |
| blocked | Amber warning ring |
| stuck | Spinning loop icon / agent pacing |
| scope drift | Red boundary line |
| risky action | Radar ping |
| conflict | Collision sparks |
| failed | Smoke + red stripe |
| paused | Frozen blue overlay |
| killed | Agent pod powers down |
| handoff | Crate passed to another agent |

---

## 10. Full visibility event model

The UI should be event-sourced. Everything becomes an immutable event.

## 10.1 Event sources

### Claude Code hooks

Use hooks for:
- SessionStart.
- SessionEnd.
- UserPromptSubmit.
- PreToolUse.
- PostToolUse.
- PostToolUseFailure.
- PermissionRequest.
- PermissionDenied.
- SubagentStart.
- SubagentStop.
- TaskCreated.
- TaskCompleted.
- WorktreeCreate.
- WorktreeRemove.
- FileChanged.
- PreCompact.
- PostCompact.
- Notification.
- MessageDisplay.

### OpenTelemetry

Use OTel for:
- Token metrics.
- Cost metrics.
- Tool execution traces.
- Model request spans.
- Error events.
- Latency.
- Usage trends.

### Git watcher

Poll or watch:
- Branch.
- Status.
- Diff.
- Commits.
- Worktrees.
- Conflicts.
- Untracked files.

### File watcher

Use:
- Chokidar or similar.
- Watch changed files.
- Compute diff snapshots.
- Map changed files to city buildings.

### Test runner parser

Wrap:
- `npm test`
- `pnpm test`
- `npm run build`
- `npm run lint`
- `tsc`
- `playwright`
- `vitest`
- `jest`
- `supabase db diff`
- custom commands.

Parse:
- pass/fail.
- duration.
- changed tests.
- failure messages.
- likely file ownership.

### Terminal/process observer

Capture:
- command started.
- command completed.
- exit code.
- stdout/stderr.
- duration.
- cwd.
- agent owner.
- risk classification.

### Browser/visual artifacts

Capture:
- screenshots.
- browser recordings.
- Playwright traces.
- Lighthouse reports.
- visual diffs.

### MCP/integration observer

Capture:
- MCP server calls.
- external API calls.
- tool parameters.
- success/failure.
- latency.
- rate limits.

---

## 11. Data architecture

## 11.1 Recommended stack

### Best local-first stack

- **Desktop shell:** Tauri  
- **Frontend:** Next.js or Vite React  
- **Realtime UI:** WebSockets or SSE  
- **Animation:** Framer Motion + PixiJS or React Three Fiber  
- **Graph maps:** React Flow / XYFlow  
- **Terminal:** xterm.js  
- **Diff viewer:** Monaco editor  
- **Local DB:** SQLite with Drizzle ORM  
- **Event queue:** Local append-only JSONL + SQLite ingestion  
- **Telemetry:** OTel Collector locally, optional Prometheus/Grafana/ClickHouse  
- **File watch:** Chokidar  
- **CLI wrapper:** Node/Bun binary called `ultracode`  
- **Optional cloud sync:** Supabase/Postgres later

### Why Tauri

Tauri gives a premium desktop-app feel, lower memory use than Electron, native file/process capabilities, and a cleaner local-first story. Electron is easier if you want faster dev and heavier Node integration, but Tauri feels more premium.

### Why not only Grafana

Grafana is useful for metrics, but the Agent City needs custom spatial UI, event replay, diff context, and agent-task semantics. Use OTel/Grafana as optional observability backend, not the main experience.

---

## 11.2 High-level architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Claude / UltraCode Session                                  │
│ - Claude Code CLI                                           │
│ - Subagents                                                 │
│ - Worktrees                                                 │
│ - Tools                                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
 Claude Hooks      OpenTelemetry     Git/File Watchers
 JSON events       metrics/traces     diffs/status/tests
       │               │                │
       └───────────────┼────────────────┘
                       ▼
             UltraCode Event Ingestor
        HTTP endpoint + CLI hook receiver
                       │
                       ▼
              Event Store / SQLite
       sessions, agents, tasks, files, tools,
       commands, risks, tests, artifacts, metrics
                       │
                       ▼
              Realtime State Engine
        derives city state, progress, alerts,
        agent states, task conveyor, risk map
                       │
                       ▼
             Agent City Frontend
       city map, factory floor, cockpit, replay,
       QA lab, permission tower, git depot
```

---

## 12. Database schema

Use this as a starting point.

## 12.1 Core tables

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  mission_name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  branch TEXT,
  permission_mode TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  objective TEXT,
  definition_of_done TEXT,
  created_checkpoint_ref TEXT
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  worktree_path TEXT,
  parent_agent_id TEXT,
  current_task_id TEXT,
  started_at TEXT,
  ended_at TEXT,
  total_cost REAL DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  last_event_at TEXT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  assigned_agent_id TEXT,
  milestone_id TEXT,
  risk_level TEXT,
  progress REAL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  blocked_reason TEXT
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  agent_id TEXT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  severity TEXT,
  timestamp TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  raw_json TEXT NOT NULL
);
```

## 12.2 Tool and command tables

```sql
CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL,
  input_summary TEXT,
  output_summary TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_ms INTEGER,
  risk_level TEXT,
  raw_input TEXT,
  raw_output TEXT
);

CREATE TABLE commands (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  command TEXT NOT NULL,
  cwd TEXT,
  exit_code INTEGER,
  started_at TEXT,
  ended_at TEXT,
  duration_ms INTEGER,
  stdout_path TEXT,
  stderr_path TEXT,
  risk_level TEXT
);
```

## 12.3 File and diff tables

```sql
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  file_type TEXT,
  district TEXT,
  risk_level TEXT,
  read_count INTEGER DEFAULT 0,
  edit_count INTEGER DEFAULT 0,
  last_touched_at TEXT,
  current_owner_agent_id TEXT
);

CREATE TABLE file_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  lines_added INTEGER,
  lines_removed INTEGER,
  diff_summary TEXT,
  timestamp TEXT NOT NULL
);
```

## 12.4 Risk, tests, artifacts

```sql
CREATE TABLE risk_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  risk_level TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  affected_paths TEXT,
  command TEXT,
  checkpoint_ref TEXT,
  status TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE test_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  command_id TEXT,
  test_type TEXT,
  status TEXT NOT NULL,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  duration_ms INTEGER,
  started_at TEXT,
  ended_at TEXT,
  raw_output_path TEXT
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  artifact_type TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT,
  url TEXT,
  summary TEXT,
  created_at TEXT NOT NULL
);
```

## 12.5 Memory and decisions

```sql
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  title TEXT NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT,
  alternatives TEXT,
  impact TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE memory_capsules (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  milestone_id TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_files TEXT,
  decisions TEXT,
  next_steps TEXT,
  created_at TEXT NOT NULL
);
```

---

## 13. Hook wiring

## 13.1 Hook receiver concept

Create a local HTTP server:

```text
http://localhost:4387/hooks/claude
```

Every Claude hook posts JSON into this server.

The receiver:
1. Validates the event.
2. Normalizes it.
3. Stores it as raw event.
4. Updates derived state.
5. Broadcasts over WebSocket.
6. Creates city animation event.

## 13.2 Example hook script

`./scripts/ultracode-hook.js`

```js
#!/usr/bin/env node

import process from "node:process";

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { parse_error: true, raw };
  }

  await fetch("http://localhost:4387/hooks/claude", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ultracode-source": "claude-hook"
    },
    body: JSON.stringify({
      received_at: new Date().toISOString(),
      payload
    })
  }).catch(() => {
    // Hooks should not crash Claude if dashboard is closed.
  });

  process.exit(0);
}

main();
```

## 13.3 Claude settings example

The exact hook configuration should follow the current Claude Code settings schema, but the goal is:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/ultracode-hook.js"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/ultracode-hook.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/ultracode-hook.js"
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/ultracode-hook.js"
          }
        ]
      }
    ],
    "TaskCreated": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/ultracode-hook.js"
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/ultracode-hook.js"
          }
        ]
      }
    ],
    "FileChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/ultracode-hook.js"
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/ultracode-hook.js"
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/ultracode-hook.js"
          }
        ]
      }
    ]
  }
}
```

## 13.4 Do not rely on hooks alone

Hooks are the spine, but the command center should cross-check with:
- Git status.
- File watcher.
- Process watcher.
- OTel telemetry.
- Test command parsing.
- Browser artifacts.
- Worktree scans.

This prevents blind spots.

---

## 14. OpenTelemetry wiring

## 14.1 Local collector

Run an OTel Collector locally.

Claude exports:
- Metrics.
- Logs/events.
- Optional traces.

Command center ingests:
- Cost counters.
- Token counters.
- Model request spans.
- Tool execution spans.
- Errors.
- Latency.
- Session-level usage.

## 14.2 Environment wrapper

Create `ultracode run` that launches Claude with telemetry enabled:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

claude
```

## 14.3 Metrics to visualize

- Tokens per minute.
- Cost per minute.
- Cost by agent.
- Cost by task.
- Tool call count.
- Tool failure rate.
- Bash duration.
- Model latency.
- Edit/read ratio.
- Revisit rate.
- Failed command loop count.
- Context compaction events.
- Test cycles per milestone.

---

## 15. Git/worktree integration

## 15.1 Worktree visualization

Every worktree becomes a parallel city island.

### Visual

```text
Main City: main branch
Island A: frontend-agent/import-ui
Island B: backend-agent/import-normalizer
Island C: qa-agent/test-repair
Island D: experimental-agent/parser-alt
```

Bridges show:
- Shared base.
- Divergence.
- Files changed.
- Merge readiness.
- Conflicts.

## 15.2 Why this matters

If agents have full permission and parallel autonomy, worktrees prevent chaos. The dashboard can show:
- Which agent owns which worktree.
- Whether it has uncommitted changes.
- Whether it can be merged.
- Whether it conflicts with another agent.
- Whether it should be discarded.

## 15.3 Git Depot UI

Should show:
- Current branch.
- All worktrees.
- Each worktree status.
- Diff stats.
- Commits.
- Conflicts.
- PR readiness.
- Checkpoint refs.
- Restore buttons.

## 15.4 Auto-checkpoints

Before risky operations:
- `git status`
- if dirty: create snapshot branch or stash.
- record checkpoint ref.
- link risk event to checkpoint.

Example checkpoint names:

```text
ultracode/checkpoints/2026-06-23-1542-before-migration-edit
ultracode/checkpoints/2026-06-23-1550-before-delete
ultracode/checkpoints/2026-06-23-1604-before-package-install
```

---

## 16. Full-permission execution model

The user wants full permission. The product should support a mode called:

# Full Throttle Mode

## 16.1 What Full Throttle Mode means

The agent can execute without repeated manual approvals, but the command center provides:
- Visibility.
- Audit trail.
- Checkpoints.
- Rollback paths.
- Risk radar.
- Kill switch.
- Scope drift detection.
- Destructive action capture.
- Session replay.

## 16.2 Pre-flight requirements

Before starting:
- Git repo must be detected.
- Current branch must be recorded.
- Dirty state must be shown.
- Snapshot/checkpoint must be created.
- `.env` handling must be explicit.
- Worktree plan must be selected.
- Dangerous command classifier enabled.
- File delete watcher enabled.
- Event recorder enabled.
- Kill switch enabled.

## 16.3 Full permission risk categories

### Low risk

- Read files.
- Run tests.
- Edit isolated feature files.
- Add non-sensitive components.
- Clear project-local build cache.

### Medium risk

- Install package.
- Change config.
- Edit shared utilities.
- Modify routes.
- Add migrations.
- Change build settings.

### High risk

- Delete files.
- Modify auth.
- Modify RLS/policies.
- Modify production deploy config.
- Read secrets.
- Run network scripts.
- Run broad shell commands.
- Change package manager lockfile.
- Modify CI/CD.
- Change env templates.
- Force push or reset.

### Critical risk

- Commands outside repo.
- `rm -rf` outside safe paths.
- Deleting database data.
- Dropping tables.
- Exfiltrating secrets.
- Editing global system config.
- Disabling tests/security.
- Writing to unrelated repos.

## 16.4 The UI should never hide risky actions

Even if allowed automatically, show them as:
- Radar ping.
- Risk card.
- Timeline event.
- Checkpoint link.
- Replay marker.

## 16.5 The kill switch

Always visible and keyboard-accessible.

Recommended hotkey:

```text
⌘ + Shift + X
```

Actions:
- Freeze new tool calls.
- Stop running commands.
- Pause all agents.
- Save final state.
- Create emergency checkpoint.
- Show restore options.

---

## 17. Artifact system

The command center should create artifacts continuously.

## 17.1 Artifact types

- Plan artifact.
- Architecture artifact.
- Diff artifact.
- Test report artifact.
- Screenshot artifact.
- Browser recording artifact.
- Decision artifact.
- Risk artifact.
- Replay artifact.
- Milestone summary.
- Final handoff document.
- Rollback plan.
- PR summary.
- Known issues list.

## 17.2 Artifact UI

Artifacts should appear as collectible cards moving into the Memory Library.

Each artifact:
- Has owner agent.
- Has task link.
- Has timestamp.
- Has preview.
- Can be commented on.
- Can be pinned to mission contract.
- Can be exported.

## 17.3 Final artifact bundle

At mission end, generate:

```text
/ultracode-artifacts/{session-id}/
  mission-summary.md
  decision-ledger.md
  risk-log.md
  test-report.md
  changed-files.md
  rollback-plan.md
  screenshots/
  browser-recordings/
  diffs/
  event-log.jsonl
  replay.json
```

---

## 18. City mechanics that make it ultra cool

## 18.1 Agent traffic

Agents move through the city based on work.

- Architect travels between Planning Hall and districts.
- Frontend agents travel to Component Foundry.
- Backend agents travel to Machine Shop.
- QA agents travel to QA Lab.
- Git agents travel to Git Depot.
- Security agents patrol the whole city.

### Visual detail

Tiny roads light up when agents are moving.  
Heavy traffic means lots of related activity.  
A traffic jam means bottleneck.

## 18.2 Resource flows

Show flows like Factorio:

- Prompt energy flows into Planning Hall.
- Tasks flow into districts.
- Code crates flow to QA.
- Passed tests power Shipping Dock.
- Decisions flow to Memory Library.
- Commits leave by train.

## 18.3 City health

A living city health system:

| Metric | City Effect |
|---|---|
| Tests passing | Lights turn on |
| Tests failing | Smoke from QA |
| High context | Purple fog |
| High cost velocity | Meter sparks |
| Scope drift | Red border expands |
| Agent stuck | Worker pacing |
| Merge conflicts | Rail collision |
| Build pass | Shipping dock opens |
| Mission complete | Sunrise / launch animation |

## 18.4 Boss fights

For hard bugs, the UI can create a “boss fight” scene.

Trigger:
- Same test fails 3+ times.
- Same file edited 5+ times.
- Agent loops for 10+ minutes.
- Error appears after every fix.

Visual:
- Big red bug monster over affected district.
- Health bar = failing assertions remaining.
- Agents attack by trying fixes.
- QA confirms damage by passing tests.

This sounds silly, but it makes long sessions easier to understand.

## 18.5 Agent personalities

Give each role visual identity.

Examples:
- Architect = holographic blueprint cape.
- Backend Machinist = mechanical arm.
- QA Inspector = clipboard scanner.
- Security Warden = radar badge.
- Git Conductor = lantern and rail cap.
- Memory Librarian = archive key.
- Visual QA Scout = camera drone.

Keep it premium, not childish.

## 18.6 Cinematic milestone moments

When a milestone completes:
- District lights up.
- Artifact card goes to archive.
- Progress bar advances.
- Radio feed gives summary.
- QA Lab shows related tests.
- Shipping Dock receives cargo.

## 18.7 Progress should be earned, not guessed

Do not calculate progress only from agent vibes.

Use:
- Milestones completed.
- Tasks completed.
- Required checks passed.
- Files changed and reviewed.
- Tests passing.
- Artifacts delivered.
- Definition-of-done checklist.

---

## 19. Search, filtering, and control

A cool UI is useless if the user can’t find things.

## 19.1 Global command palette

Hotkey:

```text
⌘ + K
```

Actions:
- Find agent.
- Find task.
- Find file.
- Find command.
- Find decision.
- Find error.
- Jump to failing test.
- Pause all.
- Create checkpoint.
- Open replay.
- Open last risky event.
- Export summary.

## 19.2 Natural language queries

Example queries:
- “Show me what touched auth.”
- “Which agent changed the database?”
- “Why are tests failing?”
- “What did Frontend Artisan do?”
- “Show all risky commands.”
- “Show files edited outside the mission.”
- “Replay from first failing test.”
- “Summarize progress since checkpoint 3.”

The dashboard should answer using event data, not hallucination.

## 19.3 Filters

- Agent.
- Task.
- File.
- District.
- Risk level.
- Tool.
- Time range.
- Test status.
- Worktree.
- Milestone.
- Event type.

---

## 20. Implementation roadmap

## Phase 0 — Product spine

Goal:
Build the invisible foundation.

Features:
- Local app shell.
- Session creation.
- Hook receiver.
- Event store.
- WebSocket stream.
- Basic event timeline.
- Git watcher.
- File watcher.
- Claude launcher wrapper.

Deliverable:
A boring but functional event console.

## Phase 1 — Mission Control MVP

Goal:
Make it useful.

Features:
- Mission bar.
- Agent list.
- Task list.
- Tool call feed.
- File change feed.
- Test run parser.
- Cost/context metrics.
- Risk events.
- Checkpoints.
- Kill switch.

Deliverable:
A real command center, still mostly 2D.

## Phase 2 — Factory Floor

Goal:
Make progress visual.

Features:
- Task conveyor.
- Agent state animations.
- QA Lab.
- Git Depot.
- Permission Control Tower.
- Context Reactor.
- Decision Ledger.
- Artifact cards.

Deliverable:
The first “wow” version.

## Phase 3 — Agent City

Goal:
Make it unforgettable.

Features:
- Isometric city.
- Districts.
- Agent movement.
- File buildings.
- City weather.
- Worktree islands.
- Resource flows.
- Risk radar.
- Mission milestone animations.

Deliverable:
The little working city.

## Phase 4 — Replay / Flight Recorder

Goal:
Make it trustworthy.

Features:
- Timeline scrubber.
- Session replay.
- Jump to event.
- Compare checkpoints.
- Before/after city state.
- Export replay package.

Deliverable:
Full auditability.

## Phase 5 — Agent OS

Goal:
Make it deeply integrated.

Features:
- Agent templates.
- Subagent launch control.
- Worktree orchestration.
- Natural language query over events.
- Artifact comments.
- Auto-stuck detection.
- Scope drift detection.
- AI-generated milestone summaries.
- Multi-repo support.

Deliverable:
A full agent operating system.

---

## 21. Detailed implementation recommendations

## 21.1 Build a CLI wrapper first

Command:

```bash
ultracode start
```

It should:
1. Start the local dashboard server.
2. Start OTel collector.
3. Create session ID.
4. Start git watcher.
5. Start file watcher.
6. Create checkpoint.
7. Export telemetry env vars.
8. Launch Claude Code.
9. Open dashboard.

This makes adoption simple.

## 21.2 App process model

```text
ultracode-daemon
  ├─ hook receiver
  ├─ websocket server
  ├─ sqlite db
  ├─ file watcher
  ├─ git watcher
  ├─ test parser
  ├─ otel collector bridge
  └─ claude process wrapper
```

## 21.3 Frontend stores

Use Zustand or Jotai.

Stores:
- sessionStore.
- agentStore.
- taskStore.
- cityStore.
- timelineStore.
- riskStore.
- testStore.
- gitStore.
- artifactStore.
- replayStore.

## 21.4 Derived state engine

Do not make components calculate everything.

Create a state engine:

```ts
type CityState = {
  districts: DistrictState[];
  agents: AgentVisualState[];
  tasks: TaskVisualState[];
  files: FileBuildingState[];
  alerts: AlertState[];
  flows: FlowState[];
  weather: CityWeather;
};
```

Events enter. City state comes out.

## 21.5 Event normalizer

Different sources emit different structures. Normalize into:

```ts
type UltraCodeEvent = {
  id: string;
  sessionId: string;
  source: "claude-hook" | "otel" | "git" | "file-watch" | "test" | "process";
  type: string;
  timestamp: string;
  agentId?: string;
  taskId?: string;
  filePath?: string;
  commandId?: string;
  severity: "info" | "success" | "warning" | "error" | "critical";
  title: string;
  summary?: string;
  raw: unknown;
};
```

## 21.6 Risk classifier

Start deterministic.

Rules:
- Command contains `rm -rf` = high/critical.
- Path contains `.env` = high.
- Path contains `auth`, `middleware`, `rls`, `policies` = high.
- Path contains `migration` = medium/high.
- Command contains `git reset --hard` = high.
- Command contains `sudo` = critical.
- Command outside repo = critical.
- Delete more than N files = high.
- Modify package lock = medium.
- Modify CI = high.

Later add AI summarization, but deterministic first.

## 21.7 Stuckness detector

Rules:
- Same command fails 3 times.
- Same test failure persists through 3 edits.
- Same file read > 10 times without edit.
- Agent active > 10 minutes with no state change.
- Cost increases with no file/test/task progress.
- Same file edited repeatedly by multiple agents.
- Build fails after 3 attempts.

UI:
- Amber stuck alert.
- Suggested actions.
- Option to spawn Bug Hunter.
- Option to summarize and reset context.
- Option to pause/kill agent.

## 21.8 Scope drift detector

Mission contract contains allowed areas.

Monitor:
- Files touched outside allowed folders.
- New dependency unrelated to mission.
- Auth/billing/database touched unexpectedly.
- Large diff outside task.
- Agent starts refactoring unrelated code.

UI:
- Red boundary line around city district.
- “Scope Drift” card.
- Ability to mark as acceptable.

## 21.9 Progress engine

Progress should come from weighted checklist:

```text
Mission progress =
  30% milestone completion
  20% task completion
  20% required checks passing
  15% artifact completion
  10% diff review status
  5% release checklist
```

Allow per-mission customization.

## 21.10 Agent summaries

Every agent should produce:
- Start summary.
- Periodic status.
- Blocker summary.
- Completion summary.
- Files changed.
- Tests run.
- Risk notes.
- Next recommended task.

Do this through:
- Hook summarizer.
- Agent prompt requirements.
- Final task completion artifact.

---

## 22. UI component inventory

## 22.1 Core components

- `<MissionBar />`
- `<AgentCity />`
- `<District />`
- `<AgentSprite />`
- `<AgentTower />`
- `<AgentCard />`
- `<AgentCockpit />`
- `<TaskConveyor />`
- `<TaskCrate />`
- `<QALab />`
- `<TestMachine />`
- `<ControlTower />`
- `<RiskRadar />`
- `<RiskCard />`
- `<GitDepot />`
- `<WorktreeIsland />`
- `<CodebaseMap />`
- `<FileBuilding />`
- `<ContextReactor />`
- `<MemoryLibrary />`
- `<ArtifactCard />`
- `<DecisionLedger />`
- `<RadioFeed />`
- `<TimelineScrubber />`
- `<ReplayController />`
- `<CommandPalette />`
- `<KillSwitch />`

## 22.2 Animation components

- `<AgentPath />`
- `<TrafficFlow />`
- `<CityWeather />`
- `<SmokeEffect />`
- `<PulseRing />`
- `<ConveyorBelt />`
- `<TrainBranch />`
- `<ShippingLaunch />`
- `<MilestoneCeremony />`
- `<ContextFog />`
- `<RiskPing />`

---

## 23. Specific “ultra cool” feature ideas

## 23.1 City pulse

The whole city has a subtle heartbeat.

- Faster heartbeat = high activity.
- Slow heartbeat = idle/stuck.
- Red heartbeat = failing/risk.
- Gold heartbeat = near completion.

## 23.2 Agent trails

Agents leave trails:
- Blue trail = reading.
- Gold trail = editing.
- Purple trail = command execution.
- Green trail = test pass.
- Red trail = failure.

This makes activity patterns visible.

## 23.3 Fog of war

At session start, parts of the repo are covered in fog.  
As agents read files, districts become visible.  
This makes code understanding visible.

## 23.4 Build power grid

Tests and builds power the city.

- If typecheck passes, utility grid turns on.
- If lint passes, streetlights turn on.
- If build passes, skyline lights up.
- If E2E passes, shipping dock opens.

## 23.5 Dependency subway

Show dependency graph as subway lines.

- Components connect to hooks.
- Hooks connect to services.
- Services connect to database.
- Tests connect to covered code.
- Broken dependency = subway line blocked.

## 23.6 Risk radar sweep

Every few seconds, the Control Tower radar sweeps the city.  
Risky buildings pulse.  
Recent risky events appear as blips.

## 23.7 Worktree islands

Each isolated agent worktree gets an island.  
When ready to merge, a bridge extends to the main city.  
If conflict appears, the bridge breaks.

## 23.8 Commit trains

Commits are trains leaving the Git Depot.  
Each car represents:
- frontend.
- backend.
- tests.
- docs.
- migrations.
- config.

## 23.9 Test repair bay

Failed tests become broken machines.  
Bug Hunter agents carry tools to repair them.  
When passing, the machine lights green.

## 23.10 Context storms

When context gets high, purple storm clouds roll in.  
Memory Librarian creates capsules to clear the sky.

## 23.11 Scope wall

The mission contract creates a glowing boundary wall.  
If an agent touches files outside scope, the wall flashes red.

## 23.12 Boss bug

Repeated failure becomes a boss.  
Its health equals unresolved failing tests.  
Agents reduce health by making tests pass.

## 23.13 City replay timelapse

At the end, generate a 30-second visual replay:
- city starts dark.
- agents spawn.
- districts light.
- tests fail/pass.
- commits ship.
- sunrise at completion.

This would be insanely shareable.

## 23.14 Agent trading cards

Each agent gets a card after the mission:

```text
Backend Machinist
Tasks completed: 7
Files edited: 14
Tests fixed: 11
Cost: $2.41
Risk events: 2
MVP moment: Fixed stat normalization doubleheader bug
```

## 23.15 Mission scoreboard

At the end:

- Total tasks completed.
- Total files changed.
- Total tests passed.
- Total bugs fixed.
- Total decisions recorded.
- Total artifacts created.
- Total cost.
- Total time.
- Biggest risk avoided.
- Most valuable agent.
- Final readiness grade.

---

## 24. Screens and wireframes

## 24.1 Home / Session list

Purpose:
- Show past sessions.
- Resume/replay.
- Compare missions.

Cards:
- Mission name.
- Repo.
- Date.
- Status.
- Cost.
- Agents.
- Progress.
- Final result.
- Replay button.

## 24.2 Launch screen

Purpose:
- Configure mission.
- Choose autonomy level.
- Confirm full-throttle settings.

Sections:
- Mission prompt.
- Definition of done.
- Agents.
- Worktree strategy.
- Test commands.
- Risk zones.
- Checkpoint settings.
- Start button.

## 24.3 Main city

Purpose:
- Full-screen living view.

Panels:
- Mission bar.
- Agent tower.
- City map.
- Control tower.
- Radio feed.
- Timeline.

## 24.4 Factory floor

Purpose:
- Task progress.

Panels:
- Task conveyor.
- Bottlenecks.
- Agent assignments.
- QA status.
- Repair bay.

## 24.5 Agent cockpit

Purpose:
- Deep agent inspection.

Panels:
- Current state.
- Current task.
- Tool calls.
- Files/diffs.
- Commands.
- Tests.
- Artifacts.
- Controls.

## 24.6 Codebase map

Purpose:
- Repo visibility.

Panels:
- File city.
- Heatmap.
- Risk lens.
- Churn lens.
- Ownership lens.
- Search.

## 24.7 Replay

Purpose:
- Audit.

Panels:
- Timeline.
- Event filters.
- City state replay.
- Diff preview.
- Jump markers.

---

## 25. How to wire with Claude sessions

## 25.1 Three levels of integration

### Level 1: Passive observer

- Hooks.
- File watcher.
- Git watcher.
- OTel.
- Does not control Claude.
- Fastest to build.

### Level 2: Session launcher

- `ultracode start` wraps Claude.
- Sets env vars.
- Starts hooks.
- Starts telemetry.
- Creates checkpoints.
- Opens dashboard.

### Level 3: Agent OS

- Uses Claude Agent SDK.
- Programmatically launches agents.
- Creates subagents.
- Controls worktrees.
- Assigns tasks.
- Tracks outputs.
- Can pause/redirect.
- Can create artifacts.

### Recommendation

Build in this order:
1. Passive observer.
2. Session launcher.
3. Agent OS.

Do not start with the hardest version. The UI can still look incredible in Level 1/2.

---

## 26. UltraCode prompt requirements

For every long session, the launch prompt should require structured outputs.

## 26.1 Add this to the mission prompt

```md
You are operating inside UltraCode Command Center.

You must keep the command center updated by producing concise status summaries at milestone boundaries.

For every major task:
1. State the task title.
2. State the files you expect to touch.
3. State the tests or validation you will run.
4. State the risk level.
5. Complete the task before moving to unrelated work.
6. Record key decisions.
7. Record blockers immediately.
8. Create or update artifacts when work is completed.

Use subagents for separable work.
Use worktree isolation for parallel subagents where appropriate.
Do not silently expand scope.
When full permission is active, proceed efficiently, but keep all risky actions visible and checkpointed.
```

## 26.2 Agent completion summary format

```md
## Agent Completion Summary

Agent:
Task:
Status:
Files changed:
Commands run:
Tests run:
Result:
Risks:
Decisions:
Remaining issues:
Recommended next step:
```

## 26.3 Milestone summary format

```md
## Milestone Summary

Milestone:
Completed:
Not completed:
Files changed:
Tests passing:
Tests failing:
Decisions:
Risks:
Next milestone:
```

These summaries should become artifacts in the Memory Library.

---

## 27. Specific UI stack recommendation

## 27.1 Recommended for fastest premium build

```text
Tauri
Vite React
TypeScript
Tailwind
Framer Motion
PixiJS for city canvas
React Flow for graphs
Monaco for diffs
xterm.js for terminal
SQLite + Drizzle
Fastify backend
WebSockets
Chokidar
simple-git
OpenTelemetry Collector
```

## 27.2 Alternative if you want web-only

```text
Next.js App Router
TypeScript
Tailwind
Framer Motion
React Three Fiber or PixiJS
Supabase/Postgres
Node worker process
WebSocket server
```

## 27.3 Animation strategy

Start with 2D/2.5D.

Do not start with full 3D. Full 3D can become slow and hard to make useful.

Best path:
- Phase 1: flat dashboard.
- Phase 2: 2D animated factory.
- Phase 3: isometric city.
- Phase 4: optional 3D hero/replay.

## 27.4 Rendering recommendation

Use **PixiJS** for the city map if you want lots of animated sprites smoothly.

Use **React Flow** for:
- Task DAG.
- Dependency graph.
- Agent handoff graph.
- Worktree merge graph.

Use **Framer Motion** for:
- Panels.
- Cards.
- Microinteractions.
- Transitions.

Use **Monaco** for:
- Diffs.
- File previews.

Use **xterm.js** for:
- Command output.
- Terminal replay.

---

## 28. File/folder structure

```text
ultracode-command-center/
  apps/
    desktop/
      src/
        main/
        renderer/
    web/
      app/
      components/
      lib/
  packages/
    core/
      events/
      state-engine/
      risk/
      progress/
      replay/
    daemon/
      hook-server/
      git-watcher/
      file-watcher/
      process-watcher/
      telemetry/
    ui/
      city/
      factory/
      cockpit/
      charts/
    db/
      schema.ts
      migrations/
    cli/
      src/
  scripts/
    ultracode-hook.js
  docs/
    architecture.md
    hook-events.md
    visual-system.md
    implementation-plan.md
```

---

## 29. Event-to-city mapping

## 29.1 Mapping table

| Event | City action |
|---|---|
| SessionStart | City boots up |
| UserPromptSubmit | Mission monument updates |
| TaskCreated | Task crate appears |
| SubagentStart | Agent leaves tower |
| PreToolUse Read | Agent moves to Code Quarry |
| PreToolUse Edit | Agent moves to file building |
| PostToolUse success | Building lights up |
| PostToolUse failure | Smoke/error blip |
| FileChanged | Building pulses |
| Bash command start | Terminal plant activates |
| Test command | QA machine starts |
| Test pass | QA machine green |
| Test fail | Repair ticket created |
| PermissionRequest | Control tower radar ping |
| WorktreeCreate | New island appears |
| WorktreeRemove | Island dissolves |
| PreCompact | Context reactor warning |
| PostCompact | Memory capsule archived |
| TaskCompleted | Crate ships |
| SessionEnd | City powers down / final report |

---

## 30. Example normalized event

```json
{
  "id": "evt_01",
  "sessionId": "sess_20260623_001",
  "source": "claude-hook",
  "type": "tool.pre_use",
  "timestamp": "2026-06-23T20:15:30.000Z",
  "agentId": "agent_backend_machinist",
  "taskId": "task_import_normalizer",
  "severity": "info",
  "title": "Backend Machinist is editing import normalizer",
  "summary": "Agent is about to modify src/lib/import/normalizeStats.ts",
  "filePath": "src/lib/import/normalizeStats.ts",
  "city": {
    "district": "backend-machine-shop",
    "animation": "agent_editing_file",
    "buildingId": "file_src_lib_import_normalizeStats"
  },
  "raw": {}
}
```

---

## 31. Security and safety recommendations for full permission

This is not to slow you down. It is to make full permission survivable.

## 31.1 Must-have protections

- Auto-checkpoint before high-risk actions.
- Project-root boundary detection.
- Command outside repo warning.
- Delete detection.
- Secret file detection.
- `.gitignore` sensitive file detection.
- Kill switch.
- Emergency pause.
- Session replay.
- Risk log.
- Rollback instructions.

## 31.2 Never allow silent critical actions

Even in full permission, critical actions should become bright visible city events.

Examples:
- Delete files.
- Drop database tables.
- Modify `.env`.
- Exfiltrate data.
- Run commands outside project.
- Force push.
- Disable tests.
- Change deployment config.
- Modify auth/security policy.

## 31.3 Recommended rule

Full permission is fine, but **full invisibility is not**.

---

## 32. “Wow” onboarding flow

When the user starts the app:

1. App scans repo.
2. City appears as dark blueprint.
3. Districts generate from folder structure.
4. Git branch becomes rail line.
5. Test commands become QA machines.
6. Env/config files become utility plants.
7. Auth/db files become restricted zones.
8. User enters mission.
9. Pre-flight checklist runs.
10. Agents spawn from tower.
11. Session begins.

This first 30 seconds should feel incredible.

---

## 33. Example mission flow

## Mission

“Rebuild BaseballHelm stats import so a team can upload a game file and the system automatically normalizes players, validates rows, previews changes, imports safely, and updates dashboards.”

## Visual flow

1. Prompt Plaza receives mission.
2. Planning Hall creates milestones.
3. Architect Agent scans repo.
4. Code Quarry lights up around import files.
5. Data District maps tables.
6. Backend Machine Shop builds parser.
7. Component Foundry builds preview UI.
8. QA Lab runs tests.
9. Bug Hunter fixes failures.
10. Security Tower flags migration.
11. Git Depot creates commit train.
12. Shipping Dock generates PR summary.
13. Memory Library archives decisions.
14. Replay exported.

---

## 34. Claude/UltraCode command examples

## 34.1 Start session

```bash
ultracode start --repo . --mode full-throttle --city
```

## 34.2 Start with mission file

```bash
ultracode start --mission ./missions/baseballhelm-import-v2.md
```

## 34.3 Open replay

```bash
ultracode replay sess_20260623_001
```

## 34.4 Export report

```bash
ultracode export sess_20260623_001 --format md
```

## 34.5 Emergency stop

```bash
ultracode stop --all
```

---

## 35. Build quality bar

This product should feel elite.

## 35.1 Performance

- City runs at 60 FPS.
- Timeline handles 100k+ events.
- Event ingestion never blocks Claude.
- Dashboard can be closed without breaking session.
- Replay loads quickly.
- SQLite writes are batched.
- Raw logs are stored on disk, not all in memory.

## 35.2 Reliability

- Hook failures should not kill Claude.
- If dashboard crashes, session continues.
- If event receiver is down, hooks write JSONL fallback.
- If telemetry unavailable, UI degrades gracefully.
- If file watcher misses event, git scanner reconciles.

## 35.3 Data integrity

- Raw event preserved.
- Normalized event stored.
- Derived state rebuildable.
- Replay generated from event log.
- Artifacts linked to event IDs.
- Checkpoints linked to risk events.

## 35.4 UX polish

- No jittery charts.
- No unreadable tiny text.
- No endless raw logs.
- No random animation.
- Every panel has a purpose.
- Hover/click always reveals more.
- Keyboard navigation works.
- Panic/kill controls obvious.

---

## 36. Agent City MVP scope

If building this now, I would start with:

### Must-have V1

- Session launcher.
- Hook ingestion.
- Event timeline.
- Agent list.
- Task conveyor.
- File heatmap.
- Test lab.
- Risk radar.
- Git status.
- Cost/context metrics.
- Checkpoints.
- Kill switch.

### Must-have V2

- Isometric city.
- Agent movement.
- District mapping.
- Worktree islands.
- Decision ledger.
- Memory capsules.
- Replay.

### Must-have V3

- Natural language queries.
- Artifact comments.
- Browser recordings.
- Multi-agent comparison arena.
- Final timelapse export.

---

## 37. The “not basic” features I would prioritize

If you want this to stand out, build these:

1. **Living isometric city**
2. **Agent sprites with real state**
3. **Task conveyor belt**
4. **Codebase buildings that light up by file activity**
5. **Risk radar for full permission mode**
6. **Context reactor / memory capsules**
7. **Worktree islands**
8. **QA lab with repair bay**
9. **Flight recorder replay**
10. **Mission contract wall**
11. **Decision ledger archive**
12. **Commit trains and shipping dock**
13. **Scope drift boundary wall**
14. **Boss fight for repeated failing tests**
15. **End-of-session cinematic timelapse**

That is the difference between “dashboard” and “holy shit this is alive.”

---

## 38. Final implementation prompt for an AI coding agent

Use this prompt to have an agent build the plan.

```md
# Build UltraCode Command Center: Agent City

You are building UltraCode Command Center, a local-first command center for long Claude Code sessions.

The goal is not a basic dashboard. Build a premium, cinematic, highly visible Agent City / Factory Floor experience that shows every agent, task, tool call, file change, test, risk, cost, context event, worktree, artifact, and decision.

## Core concept

The UI should feel like a little working city:
- Agents are workers/drones.
- Folders are neighborhoods.
- Files are buildings.
- Tasks are crates on conveyors.
- Tests are QA machines.
- Risk events are control tower radar pings.
- Worktrees are islands.
- Commits are trains.
- Completed work ships from a dock.
- Context/memory is a reactor/library.

## Implementation priorities

1. Create local app shell.
2. Create hook receiver.
3. Create event store.
4. Create session launcher wrapper.
5. Add Git/file watchers.
6. Add WebSocket realtime state.
7. Build Mission Bar.
8. Build Agent Tower.
9. Build Event Timeline.
10. Build Task Conveyor.
11. Build QA Lab.
12. Build Risk Control Tower.
13. Build Codebase Map.
14. Build Agent Cockpit.
15. Build Decision Ledger.
16. Build Context Reactor.
17. Build Replay Mode.
18. Build isometric Agent City.

## Suggested stack

- Tauri or Electron desktop shell.
- React + TypeScript.
- Tailwind.
- Framer Motion.
- PixiJS for city rendering.
- React Flow for graphs.
- Monaco for diffs.
- xterm.js for terminal output.
- SQLite + Drizzle.
- Fastify local backend.
- WebSocket realtime stream.
- Chokidar file watcher.
- simple-git.
- OpenTelemetry collector bridge.

## Data model

Create tables for:
- sessions
- agents
- tasks
- events
- tool_calls
- commands
- files
- file_events
- risk_events
- test_runs
- artifacts
- decisions
- memory_capsules

## Hook integration

Create a hook receiver at localhost.
Create a script that Claude Code hooks can call.
Capture:
- SessionStart
- SessionEnd
- UserPromptSubmit
- PreToolUse
- PostToolUse
- PermissionRequest
- SubagentStart
- SubagentStop
- TaskCreated
- TaskCompleted
- FileChanged
- WorktreeCreate
- WorktreeRemove
- PreCompact
- PostCompact
- Notification
- MessageDisplay

## UI quality bar

The product must look premium and cinematic.
Avoid generic admin dashboard visuals.
Use an isometric city/factory metaphor.
Every animation must map to real session data.
Every agent must be visible.
Every risky action must be recorded.
Every file change must be traceable.
Every task should move through a visible production pipeline.
The user must always know what is happening and be able to pause/kill/replay.

## Full permission mode

Support Full Throttle Mode.
Do not require constant approvals, but create:
- auto-checkpoints
- risk cards
- kill switch
- session replay
- scope drift alerts
- dangerous command detection
- rollback notes

Full permission does not mean blind execution.

## Deliverables

- Working local app.
- Claude hook scripts.
- Event ingestion backend.
- Realtime dashboard.
- Agent City view.
- Factory Floor view.
- Agent Cockpit.
- QA Lab.
- Risk Tower.
- Git Depot.
- Replay Mode.
- Final session export to Markdown.
```

---

## 39. Source list

- Claude Code Hooks Reference: https://code.claude.com/docs/en/hooks
- Claude Code Monitoring / OpenTelemetry: https://code.claude.com/docs/en/monitoring-usage
- Claude Code Worktrees: https://code.claude.com/docs/en/worktrees
- Claude Code Agent SDK Overview: https://code.claude.com/docs/en/agent-sdk/overview
- Claude Code Permissions: https://code.claude.com/docs/en/permissions
- GitHub Agent HQ: https://github.blog/news-insights/company-news/welcome-home-agents/
- OpenHands Agent Canvas: https://www.openhands.dev/product/canvas
- Google Antigravity: https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/
- Dive into Claude Code: https://arxiv.org/abs/2604.14228
- Does Code Cleanliness Affect Coding Agents?: https://arxiv.org/abs/2605.20049

---

# Final recommendation

Build this as **UltraCode Command Center**, with the main visual interface called **Agent City**.

The product should not be a log viewer. It should be a live operating system for autonomous coding:

- **Agent City** for cinematic visibility.
- **Factory Floor** for task progress.
- **Control Tower** for full-permission risk.
- **QA Lab** for validation.
- **Git Depot** for worktrees/branches/commits.
- **Memory Library** for decisions and context.
- **Flight Recorder** for replay.

The key design rule:

> If Claude can do it, the city should show it.

And for full permission mode:

> Full permission is acceptable only when paired with full visibility, checkpoints, replay, and a kill switch.

That is how this becomes more than a dashboard. It becomes a command center you actually trust during ultra-long autonomous coding sessions.
