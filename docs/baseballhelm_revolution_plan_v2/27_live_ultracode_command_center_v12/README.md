# V12 Live Ultracode Command Center

This folder is the controlling Task 0 layer for the Claude Ultracode session.

Before Claude audits the repo, writes migrations, changes navigation, builds BaseballHelm screens, or starts any worker-style implementation, it must first create a live local command center that opens in Google Chrome and gives the owner full visibility into the build.

The command center is not a decorative progress page. It is a local build-operations cockpit for the BaseballHelm one-shot. It should show what every agent lane is doing, which files and tables are being touched, which features are complete, which work packets are blocked, which tests have passed, and where risk exists.

## Read Order

Claude should read these V12 files before V11, V10, V9, and all older plan layers:

1. `27_live_ultracode_command_center_v12/README.md`
2. `27_live_ultracode_command_center_v12/source_ultracode_agent_city_command_center_spec.md`
3. `27_live_ultracode_command_center_v12/v12_agent_city_baseballhelm_adaptation.md`
4. `27_live_ultracode_command_center_v12/v12_claude_task_zero_live_command_center.md`
5. `27_live_ultracode_command_center_v12/v12_command_center_ui_ux_and_tabs.md`
6. `27_live_ultracode_command_center_v12/v12_telemetry_contract_agent_visibility.md`
7. `27_live_ultracode_command_center_v12/v12_chrome_open_acceptance_gate.md`

Only after the Chrome-open acceptance gate is satisfied should Claude proceed to V11, V10, V9, and the BaseballHelm implementation work.

The Agent City source spec is binding for ambition and mechanics. The BaseballHelm adaptation file is binding for this project: cream/green, no black/dark theme, local wiring first, Chrome verification, and BaseballHelm-specific districts.

## Non-Negotiable Outcome

Claude must create a local artifact that:

- Runs locally from the `Downloads/helmv3` repo without requiring a production deployment.
- Opens in Google Chrome automatically.
- Uses the BaseballHelm/GolfHelm cream and green visual language.
- Uses no black or generic dark-control-room theme.
- Implements the Agent City / Factory Floor concept from the source spec as the owner-facing build view.
- Shows a live agent/work-packet board, not just a static checklist.
- Streams or polls local telemetry from the build session.
- Shows feature-specific percent complete, confidence, test state, and risk state.
- Shows touched files, touched Supabase tables, migrations, routes, and tests.
- Shows current Claude/agent focus in human-readable language.
- Contains multiple tabs designed for the BaseballHelm build specifically.
- Has seeded baseline work packets from V11, V10, V9, V8, V7, and V6 so the build is visible immediately.
- Requires Claude to log progress events during the rest of the build.
- Captures a verification event proving the dashboard opened in Chrome before the main work starts.

## Recommended Local Shape

The most reliable implementation is an isolated local Node server inside the existing `helmv3` repo:

- `scripts/baseballhelm-command-center.mjs` - local HTTP/SSE server, no external service needed.
- `scripts/baseballhelm-build-event.mjs` - tiny CLI helper for logging events.
- `tools/baseballhelm-command-center/index.html` - the dashboard shell.
- `tools/baseballhelm-command-center/styles.css` - cream/green premium visual system.
- `tools/baseballhelm-command-center/app.js` - tabs, live state, charts, filters.
- `scripts/baseballhelm-command-center-hook.mjs` - safe hook bridge for future Claude hook events.
- `.ultracode/baseballhelm/events.ndjson` - append-only local event stream.
- `.ultracode/baseballhelm/state.json` - current summarized state.
- `.ultracode/baseballhelm/work-packets.json` - weighted work packet backlog.
- `.ultracode/baseballhelm/agents.json` - agent lanes and current focus.
- `.ultracode/baseballhelm/qa.json` - tests, screenshots, role QA, failures.
- `.ultracode/baseballhelm/replay.json` - basic Flight Recorder state.
- `.ultracode/baseballhelm/decisions.json` - Decision Ledger/Memory Library state.

This can be built without adding a new framework. If the repo already has a better local tooling pattern, Claude may use it, but the acceptance criteria in V12 still apply.

## Why This Exists

The BaseballHelm plan is intentionally huge. Without a live cockpit, the owner cannot see whether Claude is:

- Auditing before editing.
- Respecting the V12, V11, V10, and V9 order.
- Separating game stats, scrimmage stats, development metrics, lifting data, video, and classes.
- Building the strength coach and player lift systems correctly.
- Preserving auth/team joins/staff invites.
- Avoiding shallow dashboards and unsourced AI.
- Running tests and role-visibility checks.

The command center turns the one-shot into something observable and governable.

## Hard Rule For Claude

No main BaseballHelm implementation work starts until this command center is running, opened in Chrome, visibly rendering the cream/green Agent City, and the `command_center_verified` event has been recorded.
