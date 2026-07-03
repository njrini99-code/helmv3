# V12 Chrome Open Acceptance Gate

## Gate Rule

Claude must not start the main BaseballHelm implementation until the live command center is:

1. created
2. running locally
3. opened in Google Chrome
4. rendering the cream/green no-black Agent City / Factory Floor interface
5. rendering seeded BaseballHelm work packets
6. receiving at least one telemetry event
7. health-checked
8. verified by a logged `command_center_verified` event

## Exact First Work Order For Claude

Claude's first response in Ultracode should execute this order:

1. Inspect the repo package scripts and tooling only enough to avoid conflicts.
2. Create the local command center files.
3. Create `.ultracode/baseballhelm/` telemetry files with seeded agents and packets.
4. Create the hook receiver and hook bridge.
5. Create Agent City, Factory Floor, Control Tower, QA Lab, Codebase City, Agent Cockpit, Context Reactor, Flight Recorder, Memory Library, and Handoff Ledger modes.
6. Start the local command center server.
7. Open the dashboard in Google Chrome.
8. Verify the page loads, no-black cream/green styling renders, and seeded data appears.
9. Log `command_center_verified`.
10. Report the dashboard URL.
11. Continue into reading V11, V10, V9, V8, V7, and V6.

No migrations, product route edits, auth edits, dashboard edits, stats edits, lifting edits, or CoachHelm edits happen before step 9.

## Minimum Shell Commands

Claude may adapt commands to the repo, but the flow should look like:

```bash
node scripts/baseballhelm-build-event.mjs --type command_center_started --agent orchestrator --packet task_0_command_center --title "Command Center started"
node scripts/baseballhelm-command-center.mjs
open -a "Google Chrome" "http://127.0.0.1:4877"
curl -fsS "http://127.0.0.1:4877/api/health"
node scripts/baseballhelm-build-event.mjs --type command_center_verified --agent qa_visibility --packet task_0_command_center --title "Command Center verified in Chrome" --detail "Dashboard is reachable and seeded packets render."
```

If the command center server is long-running, Claude should keep it running in a background/session-safe way and continue work in another shell.

## Health Endpoint

`GET /api/health` should return JSON:

```json
{
  "ok": true,
  "name": "BaseballHelm Ultracode Command Center",
  "url": "http://127.0.0.1:4877",
  "events_loaded": 1,
  "agents_loaded": 10,
  "packets_loaded": 18,
  "last_event_at": "2026-06-23T19:30:00.000Z"
}
```

## Verification Requirements

Claude should verify:

- `index.html` loads
- CSS loads
- JS loads
- cream/green no-black visual system renders
- Agent City renders
- Factory Floor renders
- Control Tower renders
- QA Lab renders
- Flight Recorder renders
- agents render
- packets render
- Mission Control renders
- live event stream renders
- health endpoint returns OK
- Chrome open command did not fail

If browser automation is available, capture a screenshot:

```text
.ultracode/baseballhelm/screenshots/command-center-initial.png
```

If browser automation is not available, record the limitation in `qa.json` and continue only after health check passes and Chrome is opened.

## Required Gate Card

The dashboard must include a visible gate card on Mission Control:

Title:

`Task 0 Gate`

Fields:

- Server: running/not running
- Chrome: opened/not confirmed
- Telemetry: connected/disconnected
- Seeded packets: count
- Last event: timestamp
- Gate: open/closed

When the gate is closed, it should clearly state what is missing.

When the gate is open, it should clearly say:

`BaseballHelm build may proceed.`

## Failure Handling

If Chrome cannot be opened:

- try `open -a "Google Chrome"` once
- if unavailable, try `open` with the URL
- log `command_center_error`
- show the URL in the terminal and dashboard health output
- do not continue until the owner can open it or Claude records a clear blocker

If the server cannot bind:

- try the next port: 4878, 4879, 4880
- update state with actual URL
- open the actual URL

If telemetry files are malformed:

- show parse error in dashboard
- preserve bad file as evidence
- write corrected state file
- log `command_center_error` and `command_center_recovered`

## First Chrome View Acceptance Checklist

The first Chrome view must show:

- BaseballHelm branding
- cream/green premium design
- no black/dark control-room theme
- Mission Control tab
- Agent City tab
- Factory Floor tab
- Agent Field tab
- Agent Cockpit tab or inspector
- Codebase City tab
- Control Tower tab
- Feature Scoreboard tab
- Repo Pulse tab
- Supabase Tower tab
- Build Timeline tab
- Test and Proof Lab tab
- QA Lab / repair bay state
- Context Reactor tab
- Decision Ledger / Memory Library tab
- Flight Recorder tab
- CoachHelm Intelligence Monitor tab
- Integration Radar tab
- Performance Build Room tab
- Practice and Game Ops Room tab
- Handoff Ledger tab
- active Task 0 packet
- ten seeded agent lanes
- weighted packet progress
- no-tests-run honest state
- no-migrations-changed honest state
- live event stream with at least one event

## Operator-Facing Statement

After the command center is open, Claude should say something like:

```text
BaseballHelm Ultracode Command Center is running at http://127.0.0.1:4877 and is open in Chrome. I logged the command_center_verified event. I am now reading V11, V10, and V9 before starting the repo audit.
```

Then it should continue working.

## What Claude Should Not Do

Do not:

- ask the user to manually build the dashboard
- build a static screenshot instead of a live artifact
- use a remote SaaS dashboard
- expose environment variables or Supabase secrets
- skip the Chrome-open step
- mark Task 0 complete without evidence
- move into app implementation with the dashboard broken

## Final Acceptance For V12

V12 is satisfied when the final build report can point to:

- command center files
- command center URL
- command center verification event
- no-black cream/green Agent City evidence
- seeded and updated work packets
- event log
- hook receiver and hook bridge
- replay state
- test/proof state
- handoff ledger

The command center should remain useful through the full BaseballHelm build, not just during setup.
