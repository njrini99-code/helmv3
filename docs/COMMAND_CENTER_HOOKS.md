# BaseballHelm Ultracode Command Center — Operator Hooks

A **local, cream/green "Agent City / Factory Floor"** build-observability dashboard for
the BaseballHelm one-shot build. It is **not** part of the shipped product — it is a
localhost-only tool that watches the build in real time by reading the telemetry under
`/.ultracode/baseballhelm/`.

- **Lives in:** `tools/baseballhelm-command-center/` (UI), `scripts/baseballhelm-*.mjs` (server + loggers).
- **Reads:** `/.ultracode/baseballhelm/*.json` + `events.ndjson` (state, agents, work-packets,
  risks, qa, decisions, artifacts, handoff, replay, plus `screenshots/`).
- **Renders:** Agent City, Factory Floor, Control Tower, QA Lab, Codebase City, Agent Cockpit,
  Flight Recorder, Memory Library, Handoff Ledger.
- **Honest by design:** never fabricates data, progress, token counts, or test results — missing
  slices degrade to explicit empty/loading/error states.
- **Safe by design:** binds only to `127.0.0.1`, stores nothing sensitive (see [Security](#security)).

---

## 1. Run it

```bash
# from the repo root
node scripts/baseballhelm-command-center.mjs
```

It prints a URL (default **http://127.0.0.1:4877**), then open it in Chrome:

```bash
open -a "Google Chrome" "http://127.0.0.1:4877"
```

The server serves the static UI from `tools/baseballhelm-command-center/`, exposes the
telemetry as JSON over HTTP, streams live events over SSE, and watches git/repo status.

---

## 2. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/health`    | Liveness probe (`{ ok, uptime, ... }`). |
| `GET`  | `/api/state`     | Aggregate state — product, mission, phase, `task0_gate`, agents, packets, risks, qa, decisions, counts. |
| `GET`  | `/api/events`    | Chronological events (asc). Supports `?limit=N` (UI uses `?limit=400`). |
| `GET`  | `/api/repo`      | Git/repo status — `{ branch, dirty[], changed_files[], diffstat, last_commit }`. |
| `GET`  | `/api/replay`    | Replay/timeline state — `{ cursor, speed, filters, ... }`. |
| `GET`  | `/api/artifacts` | Built artifacts — `[{ id, type, title, path, url, summary, created_at }]`. |
| `POST` | `/api/events`    | Append one build event (JSON body `{ type, agent, packet, title, detail, severity }`). |
| `POST` | `/hooks/claude`  | Claude Code hook receiver — translates tool lifecycle payloads into city events. |
| `GET`  | `/events`        | **SSE** stream of live events (the UI subscribes here; polls `/api/repo` every ~12s as a fallback). |

---

## 3. Logging build events

The hand-logger writes one event to `/.ultracode/baseballhelm/events.ndjson` (and notifies the
server so the city updates live):

```bash
node scripts/baseballhelm-build-event.mjs \
  --type packet_started \
  --agent <lane> \
  --packet <id> \
  --title "Short headline" \
  --detail "What happened, in one line." \
  --severity info        # info | warn | critical (optional)
```

### Event types

These drive the city's animations (crates, cranes, radar blips, QA machines, road lights):

| Event | What it does in the city |
|---|---|
| `packet_started`        | Task crate enters the Factory Floor. |
| `packet_progress`       | Crate advances along the conveyor. |
| `packet_completed`      | Crate ships to the dock + Memory Library. |
| `file_changed`          | Building pulses gold in Codebase City. |
| `migration_added`       | Data District crane moves. |
| `table_touched`         | Table tower lights up. |
| `route_touched`         | Road / pipe lights up. |
| `test_started`          | QA machine starts. |
| `test_passed`           | QA machine powers the district lights. |
| `test_failed`           | Repair Bay ticket appears. |
| `risk_added`            | Clay/amber radar blip. |
| `risk_resolved`         | Radar blip moves to archive. |
| `browser_check_started` / `browser_check_passed` / `browser_check_failed` | Screenshot/proof card moves through the QA Lab. |
| `handoff_note`          | Broadcast Center publishes an update. |
| `command_center_verified` | Opens the Task 0 gate (see [§6](#6-chrome-verification-gate)). |

> Other lifecycle events also exist in the seed (`command_center_started`, `plan_read_started`,
> `plan_read_completed`, `decision_added`, `command_center_files_created`, `city_district_activated`).
> Any unknown `type` still renders honestly in the Flight Recorder as a plain event row.

---

## 4. Claude Code hook (optional)

> **Optional / follow-up.** Manual event logging (§3) works without this. Installing the hook
> just makes live Claude tool activity flow into the city automatically.

Wire the hook so Claude Code tool lifecycle events POST to the receiver, which forwards them to
`/hooks/claude`. Add to your Claude Code settings JSON:

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "node /Users/ricknini/Downloads/helmv3/scripts/baseballhelm-command-center-hook.mjs" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node /Users/ricknini/Downloads/helmv3/scripts/baseballhelm-command-center-hook.mjs" }] }],
    "PreToolUse":       [{ "hooks": [{ "type": "command", "command": "node /Users/ricknini/Downloads/helmv3/scripts/baseballhelm-command-center-hook.mjs" }] }],
    "PostToolUse":      [{ "hooks": [{ "type": "command", "command": "node /Users/ricknini/Downloads/helmv3/scripts/baseballhelm-command-center-hook.mjs" }] }],
    "SubagentStart":    [{ "hooks": [{ "type": "command", "command": "node /Users/ricknini/Downloads/helmv3/scripts/baseballhelm-command-center-hook.mjs" }] }],
    "SubagentStop":     [{ "hooks": [{ "type": "command", "command": "node /Users/ricknini/Downloads/helmv3/scripts/baseballhelm-command-center-hook.mjs" }] }],
    "PreCompact":       [{ "hooks": [{ "type": "command", "command": "node /Users/ricknini/Downloads/helmv3/scripts/baseballhelm-command-center-hook.mjs" }] }],
    "PostCompact":      [{ "hooks": [{ "type": "command", "command": "node /Users/ricknini/Downloads/helmv3/scripts/baseballhelm-command-center-hook.mjs" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "node /Users/ricknini/Downloads/helmv3/scripts/baseballhelm-command-center-hook.mjs" }] }]
  }
}
```

The hook reads the event payload Claude Code passes on stdin, maps it to a city event
(e.g. an `Edit`/`Write` → `file_changed`, a migration write → `migration_added`), and POSTs it
to the running server. If the server isn't running, the hook fails quietly and your Claude
session is unaffected.

---

## 5. Chrome verification gate

Task 0 stays **`in_progress`** until the command center is provably running and visibly
rendering in Chrome. The gate is closed by logging one event:

```bash
node scripts/baseballhelm-build-event.mjs \
  --type command_center_verified \
  --agent qa_visibility \
  --packet task_0_command_center \
  --title "Command Center verified in Chrome" \
  --detail "Dashboard is reachable and seeded packets render."
```

Logging `command_center_verified`:

- flips `state.task0_gate` → `{ status: "complete", verified: true, verified_at: <iso> }`
  (Task 0 shows complete in the city), and
- flips the QA Lab's **`chrome-verification`** check (`status` → `passed`) — the dedicated check
  whose command is *"command center opened + verified in Chrome."*

Only verify after the dashboard is actually reachable at the printed URL and rendering the
cream/green Agent City — never log it speculatively.

---

## 6. Security

- Binds **only** to `127.0.0.1` (loopback) on port `4877` — not reachable off the machine.
- **Stores nothing sensitive:** only build telemetry (event titles/details, agent lanes,
  packet ids, git status) under `/.ultracode/baseballhelm/`. No secrets, tokens, or credentials.
- Read-only against the product: the command center observes the build; it does not edit
  product code (the Task 0 product-code guard is armed until verification).
