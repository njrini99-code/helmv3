---
name: helm-sentry
description: "Investigate a Sentry issue, alert email, production error, or a 'what is breaking' question for Helm Sports Labs (org helm-xs). Use whenever the request points at a Sentry issue id/link, a paging alert, or unexplained production errors — walks issue lookup, code mapping, release classification, database cross-reference, and the grouping rules that determine what counts as one incident."
---

# helm-sentry

Read-only investigation path for a Sentry issue. Every step below names the
exact tool or file to use — do not re-derive any of this by hand or from
memory; the underlying implementations change and this skill can drift.

## 1. Issue: look it up

- `search_issues` (Sentry MCP, `mcp__7524981b-0003-40de-9f86-c5275420784a__search_issues`)
  to find the issue by query, then `get_sentry_resource` for the full record.
- Pull: title, culprit, event count, first/last seen, and tags — especially
  `sport`, `feature`, `pg_code`, and `supabase_key_error`. These four are the
  ones this codebase deliberately sets (see step 5); anything else is
  Sentry's own default tagging.
- `search_events` is the companion tool for raw event-level queries (e.g.
  "how many of these in the last hour") when the issue-level counts aren't
  enough.

## 2. Code: map the culprit to a file

- Do not re-derive a file path from a route string by hand. Use
  `resolveActionFilePath` and `extractActionName` in
  `src/lib/admin/incident-report.ts` — they already encode the routing
  conventions (sport-prefixed action dirs, the server-action naming scheme)
  that a manual guess will get wrong on anything but the simplest route.

## 3. Release: classify before blaming a deploy

- Use `ReleaseRelationship` from `src/lib/admin/incidents/release-context.ts`
  together with the deploy markers `src/lib/admin/deploy-marker.ts` writes
  (`recordDeployMarker`, one per production sha, written from
  `src/instrumentation.ts`'s Node-runtime `register()`).
- Do not claim "this release caused it" from the issue's first-seen
  timestamp alone — classify the relationship first. An issue that pre-dates
  the release, or that fires from a deploy-adjacent but unrelated cause
  (e.g. the Supabase legacy-key incident below, which was an owner config
  change, not a code deploy), looks superficially release-shaped without
  being it.

## 4. Database: cross-reference by the right trace id

- For `pg_code`-tagged issues or anything under a `db.*` span, join to
  `error_logs` / `admin_events` using the trace id conventions in
  `src/lib/observability/supabase/sentry-contract.ts`.
- That file documents THREE distinct trace ids that are not interchangeable:
  `helm.trace_id` (the flight-recorder workflow correlation id),
  `sentryTraceId` (Sentry's own distributed-trace id), and the Postgres
  trace id. State explicitly which of the three you used when reporting a
  join — the wrong one silently returns zero or the wrong rows rather than
  erroring.

## 5. Grouping: know what a "count" actually means

Two fingerprint rules run in `beforeSend` in `src/instrumentation.ts`, both
additive to Sentry's own default grouping (`{{ default }}` stays a secondary
axis, so two genuinely different underlying errors never collapse into one
issue just because they share a rule):

- **`pg:<code>`** (`fingerprintByPostgresCode`) — every event carrying a
  recognizable `PGRSTnnn` or 5-char SQLSTATE code groups onto that code,
  tag `pg_code`. Forty variously-worded RLS denials become one countable
  `pg:42501` issue instead of forty.
- **`supabase:legacy-keys-disabled`** / **`supabase:invalid-api-key`**
  (`fingerprintSupabaseKeyError`) — a Supabase auth-key rejection anywhere
  in the exception value or event message (including wrapped forms, e.g.
  the presence heartbeat's `msg=...` prefix), tag `supabase_key_error`.
  Added after the 2026-09-06 legacy-key incident split one root cause
  across four-plus issues (login, deploy marker, presence heartbeat,
  `bridge_write_failed`).

An issue's event count under either rule is "how many times this class of
failure fired," not "how many distinct bugs exist" — do not report the count
as if every occurrence were independently investigated.

## 6. What not to do

- **No mutators.** Never call `update_issue` or `analyze_issue_with_seer` —
  both are Sentry MCP write/analysis actions outside this skill's read-only
  scope. If a mutation is genuinely warranted, say so and let the owner run
  it.
- **No Seer.** Root-cause analysis via Seer is the owner's call, not
  something to trigger from this investigation.
- **No threshold edits.** Detector/workflow thresholds and routing
  (`docs/operations/SENTRY_MONITORS.md`, `docs/operations/SENTRY_ALERT_ROUTING.md`)
  are owner-run; the four-step detector dance documented there is not
  something to reproduce or modify here.
- **No `update_issue` without the owner** — resolving, ignoring, or
  reassigning an issue changes what pages next time; that decision belongs
  to whoever owns the alert routing, not to this investigation.
