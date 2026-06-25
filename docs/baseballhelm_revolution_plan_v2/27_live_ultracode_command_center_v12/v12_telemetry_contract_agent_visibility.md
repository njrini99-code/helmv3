# V12 Telemetry Contract And Agent Visibility

## Purpose

The command center only works if Claude records structured progress. This file defines the telemetry contract.

The telemetry must be simple enough that Claude can log it during the build, but structured enough that the dashboard can show useful live visibility.

## Storage

Use local files under:

```text
.ultracode/baseballhelm/
```

Recommended files:

```text
events.ndjson
state.json
agents.json
work-packets.json
risks.json
qa.json
screenshots.json
repo-cache.json
handoff.json
```

The artifact may derive all summary state from `events.ndjson`, but storing summary JSON files is acceptable and usually simpler for a live dashboard.

## Event Envelope

Every event line in `events.ndjson` should be valid JSON.

Required fields:

```json
{
  "id": "evt_20260623_153000_001",
  "timestamp": "2026-06-23T19:30:00.000Z",
  "type": "packet_started",
  "agent": "orchestrator",
  "packet": "task_0_command_center",
  "title": "Started live command center",
  "detail": "Creating local Node server, telemetry files, and Chrome-open gate.",
  "severity": "info"
}
```

Recommended optional fields:

```json
{
  "phase": "task_zero",
  "feature": "Live Ultracode Command Center",
  "files": ["scripts/baseballhelm-command-center.mjs"],
  "routes": [],
  "tables": [],
  "tests": [],
  "risk_id": null,
  "screenshot": null,
  "confidence_delta": 3,
  "completion_delta": 5,
  "duration_ms": 1200,
  "metadata": {}
}
```

## Event Types

### Command Center Events

- `command_center_started`
- `command_center_files_created`
- `command_center_server_started`
- `command_center_chrome_opened`
- `command_center_health_checked`
- `command_center_verified`
- `command_center_error`

### Plan Reading Events

- `plan_read_started`
- `plan_file_read`
- `plan_read_completed`
- `plan_conflict_found`
- `plan_scope_guardrail_added`

### Audit Events

- `repo_audit_started`
- `route_audit_completed`
- `auth_audit_completed`
- `schema_audit_completed`
- `component_audit_completed`
- `repo_audit_completed`

### Work Packet Events

- `packet_started`
- `packet_progress`
- `packet_blocked`
- `packet_unblocked`
- `packet_completed`
- `packet_deferred`

### Code Change Events

- `file_changed`
- `route_touched`
- `component_touched`
- `server_action_touched`
- `hook_touched`
- `test_file_touched`
- `docs_touched`

### Supabase Events

- `migration_planned`
- `migration_added`
- `table_touched`
- `policy_touched`
- `rls_test_started`
- `rls_test_passed`
- `rls_test_failed`
- `types_generated`
- `schema_risk_added`

### Test And Browser Events

- `test_started`
- `test_passed`
- `test_failed`
- `test_skipped`
- `browser_check_started`
- `browser_check_passed`
- `browser_check_failed`
- `screenshot_captured`

### Risk Events

- `risk_added`
- `risk_updated`
- `risk_resolved`
- `risk_accepted`

### Handoff Events

- `handoff_note`
- `final_packet_summary`
- `final_quality_gate_started`
- `final_quality_gate_completed`

## Agent Schema

`agents.json` should contain a list like:

```json
[
  {
    "id": "orchestrator",
    "name": "Orchestrator",
    "role": "Controls ordering, guardrails, and final acceptance.",
    "status": "active",
    "current_packet": "task_0_command_center",
    "current_focus": "Opening the live command center in Chrome.",
    "queue": ["plan_read", "repo_audit"],
    "files_touched": [],
    "tables_touched": [],
    "routes_touched": [],
    "last_event_at": "2026-06-23T19:30:00.000Z",
    "heartbeat_at": "2026-06-23T19:30:00.000Z",
    "blockers": []
  }
]
```

Allowed statuses:

- `idle`
- `reading`
- `auditing`
- `designing`
- `building`
- `testing`
- `reviewing`
- `blocked`
- `done`

## Work Packet Schema

`work-packets.json` should contain:

```json
[
  {
    "id": "task_0_command_center",
    "title": "Task 0 - Live Ultracode Command Center",
    "subsystem": "Visibility",
    "owner_agent": "orchestrator",
    "status": "active",
    "weight": 8,
    "completion_percent": 30,
    "confidence_percent": 70,
    "current_focus": "Creating local dashboard and telemetry event stream.",
    "checklist": [
      {
        "id": "files_created",
        "label": "Command center files created",
        "status": "complete",
        "evidence": ["tools/baseballhelm-command-center/index.html"]
      },
      {
        "id": "chrome_opened",
        "label": "Chrome opened",
        "status": "pending",
        "evidence": []
      }
    ],
    "files": [],
    "routes": [],
    "tables": [],
    "tests": [],
    "risks": [],
    "last_update_at": "2026-06-23T19:30:00.000Z"
  }
]
```

Allowed packet statuses:

- `planned`
- `active`
- `blocked`
- `testing`
- `review`
- `done`
- `deferred`

Allowed checklist statuses:

- `pending`
- `active`
- `complete`
- `blocked`
- `skipped`

## Risk Schema

`risks.json` should contain:

```json
[
  {
    "id": "risk_auth_return_to",
    "title": "Invite return path could be lost during auth redirect",
    "category": "auth",
    "severity": "high",
    "status": "open",
    "owner_agent": "auth_staff_access",
    "related_packet": "auth_team_join_staff_invite",
    "detail": "Player and staff invite links must survive login/signup.",
    "evidence": ["src/app/baseball/join/[code]/page.tsx"],
    "resolution": null,
    "created_at": "2026-06-23T19:30:00.000Z",
    "updated_at": "2026-06-23T19:30:00.000Z"
  }
]
```

Allowed categories:

- `task_zero`
- `auth`
- `schema`
- `rls`
- `ui`
- `stats`
- `imports`
- `performance`
- `practice`
- `coachhelm`
- `qa`
- `repo`

Allowed severity:

- `critical`
- `high`
- `medium`
- `low`

Allowed status:

- `open`
- `watching`
- `mitigated`
- `resolved`
- `accepted`

## QA Schema

`qa.json` should contain:

```json
{
  "typecheck": {
    "status": "not_run",
    "last_run_at": null,
    "command": null,
    "summary": null
  },
  "lint": {
    "status": "not_run",
    "last_run_at": null,
    "command": null,
    "summary": null
  },
  "tests": [],
  "browser_checks": [],
  "role_visibility": [],
  "screenshots": []
}
```

Allowed QA statuses:

- `not_run`
- `running`
- `passed`
- `failed`
- `skipped`

## Browser Check Schema

```json
{
  "id": "browser_command_center_opened",
  "title": "Command Center opened in Chrome",
  "url": "http://127.0.0.1:4877",
  "status": "passed",
  "checked_at": "2026-06-23T19:30:00.000Z",
  "evidence": [
    ".ultracode/baseballhelm/screenshots/command-center.png"
  ],
  "notes": "Health endpoint returned OK and dashboard rendered seeded packets."
}
```

## Handoff Schema

`handoff.json` should become the final build ledger source:

```json
{
  "started_at": "2026-06-23T19:30:00.000Z",
  "command_center_url": "http://127.0.0.1:4877",
  "current_phase": "task_zero",
  "packets_completed": [],
  "files_changed": [],
  "tables_changed": [],
  "routes_changed": [],
  "tests_run": [],
  "browser_checks": [],
  "open_risks": [],
  "deferred_items": []
}
```

## Completion Math

The dashboard should calculate:

### Overall Completion

```text
sum(packet.completion_percent * packet.weight) / sum(packet.weight)
```

### Overall Confidence

```text
sum(packet.confidence_percent * packet.weight) / sum(packet.weight)
```

### Packet Confidence Penalties

Apply visible confidence penalties when:

- no tests have run for a packet: minus 10
- browser check missing for a visual packet: minus 10
- RLS not tested for a schema/security packet: minus 15
- source refs missing for stats/AI packets: minus 20
- role visibility unchecked for auth/staff/player packets: minus 20
- migration added but generated types not updated: minus 10
- risk severity high or critical remains open: minus 10 to 25

Do not let confidence exceed completion by more than 20 points unless the packet is a planning/audit packet.

## Truthfulness Rules

The command center must never pretend:

- a feature is complete because the plan exists
- an agent is working if no event has been logged recently
- tests passed when they were not run
- a direct vendor integration exists when only import settings exist
- a migration is safe when RLS has not been checked
- an AI insight is grounded when source refs are missing

Use honest labels:

- planned
- scaffolded
- parser-ready
- sample-parsed
- DB-committed
- QA-verified
- deferred
- blocked

## Required Real-Time Signals

The command center should update from:

- file-based events
- summary JSON
- git status and diff stat
- test events emitted by Claude
- browser check events
- risk events

It does not need external services or production observability.

## Security And Privacy

The local server must:

- bind to localhost only
- avoid printing secrets
- avoid reading `.env` values into the UI
- avoid exposing auth tokens
- avoid uploading telemetry anywhere
- avoid writing outside the repo except optional screenshots if the environment requires it

## Claude Logging Discipline

Claude must log an event:

- before starting a major packet
- after reading a controlling plan folder
- before adding migrations
- after adding migrations
- before and after tests
- when browser verification starts/passes/fails
- when a risk is found
- when a risk is resolved
- when a packet is completed

This logging is part of the build, not extra paperwork.

