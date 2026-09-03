<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Sentry Monitors, Detectors, Workflows, Uptime & Dashboards

This is the Phase E "control plane" build for Sentry org `helm-xs`
(project `javascript-nextjs`, project id `4510825486548992`, org id
`4510780033794048`). It covers what actually got created through the
Sentry REST API, the exact payloads that worked (not the GET shapes — those
are a different, read-only representation), what the API refused and how
that was recorded instead, and how to roll each object back.

Related: `docs/operations/SENTRY_ADMIN_READ_API.md` covers a completely
different thing — the app's own `/admin/errors` panel reading Sentry issues
at runtime via `SENTRY_READ_TOKEN`. This doc is about the Sentry **org's**
alerting and dashboard configuration, done directly against the Sentry API
with an admin-scoped Personal Token, not app code.

## The model: MONITOR vs ALERT/WORKFLOW

Sentry's current UI is built on a "workflow engine": a **detector** is the
condition (a query + threshold, or an uptime check, or the built-in error
detector) and a **workflow** is the routing (who gets notified, on what
cadence, filtered how). A detector can be linked to zero or more workflows
via `detectorIds`/`workflowIds` on each side. One detector firing can
therefore page through more than one workflow if it's linked to more than
one — that's the double-paging risk this build was told to avoid.

Read paths:
- `GET /organizations/helm-xs/detectors/` and `/detectors/<id>/`
- `GET /organizations/helm-xs/workflows/` and `/workflows/<id>/`

**The write path for a `metric_issue` detector is NOT `POST
/organizations/helm-xs/detectors/`** — that collection only allows `GET,
PUT, DELETE, HEAD, OPTIONS` (verified via `OPTIONS`; `POST` returns
`405 Method Not Allowed`). Detector creation for metric alerts actually
happens through the **legacy metric alert-rules endpoint**:

```
POST /organizations/helm-xs/alert-rules/
```

which the platform mirrors into a brand-new `metric_issue` detector under
the workflow-engine model. This was discovered empirically (see "How
detector creation actually works" below) — the assignment's assumption that
`POST /detectors/` was the create path was wrong for this org/API version.

Workflow creation, by contrast, **does** support `POST
/organizations/helm-xs/workflows/` directly (`OPTIONS` returns `GET, POST,
PUT, DELETE, HEAD, OPTIONS`).

## How detector creation actually works (the gotcha every future edit needs)

1. `POST /organizations/helm-xs/alert-rules/` with the classic metric-alert
   schema (`dataset`, `query`, `aggregate`, `thresholdType`, `timeWindow` in
   **minutes**, `resolveThreshold`, `triggers[]`). **Each trigger requires at
   least one action** — `POST` without one 400s with `"Each trigger must
   have an associated action for this alert to fire."` There is no way to
   create a trigger-less/action-less alert rule.
2. That POST auto-provisions a **brand-new, bespoke workflow** carrying
   whatever action you put on the trigger (e.g. email to the token owner),
   and links only the new detector to it. It does **not** attach the new
   detector to any existing workflow, and there is no parameter on the
   `alert-rules` POST to ask it to.
3. To route the new detector through a shared workflow instead (this build's
   single P1 routing point, `3937972`), you must:
   - `GET /organizations/helm-xs/detectors/?query=<name substring>` to find
     the new detector's id (the response for the POST above returns the
     **legacy alert-rule id**, not the new detector id — they are different
     numbers; cross-reference via the detector's `alertRuleId` field).
   - `PUT /organizations/helm-xs/detectors/<id>/` with
     `{"workflowIds": ["3937972"]}` — this **replaces** the detector's
     workflow list, which both attaches it to the target workflow and
     detaches it from the auto-created one in a single call.
   - `DELETE /organizations/helm-xs/workflows/<orphaned-id>/` to remove the
     now-empty auto-created workflow. Confirmed empty first via
     `GET .../workflows/<id>/` → `"detectorIds": []`.

Every P1/P2 detector below went through this exact four-step sequence. If
you create another detector via `alert-rules` POST later, expect the same
orphan workflow and repeat steps 3–4, or you will end up with duplicate
notification paths (the exact "one root cause pages four times" failure
mode this build was told to avoid).

## Detectors

### P1 — routed through workflow `3937972` ("Helm — notify owner on metric monitor incidents")

| Detector id | Alert-rule id | Name | Query | Window | Critical | Warning | Resolve |
|---|---|---|---|---|---|---|---|
| `7702315` | `10007702315` (pre-existing) | Number of errors above 50 over past 1 hour | `is:unresolved` | 1h | 50 | 20 | 20 |
| `9711163` | `451027` | Helm P1 — production unhandled error rate | `environment:production handled:no` | 1h | 25 | 10 | 10 |
| `9711158` | `451026` | Helm P1 — Postgres privilege errors (42501) | `environment:production pg_error_code:42501` | 1h | 5 | 1 | 1 |
| `9711164` | `451028` | Helm P1 — CoachHelm errors | `environment:production feature:coachhelm*` | 1h | 10 | 3 | 3 |
| `9711170` | `451030` | Helm P1 — golf round submit/autosave terminal failure rate | `action:golf_round_submit` on `dataset: events_analytics_platform`, `aggregate: sum(helm.workflow.failure)` | 1h | 10 | 3 | 3 |

Verification: `GET /organizations/helm-xs/workflows/3937972/` →
`"detectorIds": ["7702315", "9711163", "9711158", "9711164", "9711170"]`.

**All thresholds above are PROVISIONAL.** They were set from a short lookback
window at build time (2026-09-02/03) and must be revisited after ~2 weeks
of real production volume:

- `handled:no` (detector `9711163`): 173 events over the trailing 30 days as
  measured at build time (`environment:production handled:no`, via
  `events-stats`). The assignment's stated baseline was "~227 errors/7d
  total" (a different, broader query); the 30d/handled-only figure above is
  what the threshold was actually set against. Critical=25/warning=10 per
  hour is a guess at "clearly abnormal" against that baseline, not a
  statistically derived control limit.
- `pg_error_code:42501` (detector `9711158`): 20 events over the trailing 30
  days at build time. Critical=5/warning=1 per hour.
- `feature:coachhelm*` (detector `9711164`): the literal tag value
  `coachhelm` alone had only 7 events/30d, but the tag `feature` also carries
  `coachhelm_ai_engine`, `coachhelm_effectiveness`, and
  `coachhelm/v2/mining/course-management` as distinct values — all clearly
  CoachHelm but none matching the literal string. The wildcard
  `feature:coachhelm*` was verified via `events-stats` to return 13 events/30d
  vs. 7 for the literal, and — critically — the **live subscription query
  itself accepts the wildcard** (confirmed by the successful `201` on
  creation, not just the preview). Critical=10/warning=3 per hour.
- `action:golf_round_submit` / `sum(helm.workflow.failure)` (detector
  `9711170`): **this metric has zero data as of build time** — Phase C/D
  code that emits `helm.workflow.*` metrics has not shipped to production
  yet. The subscription was still accepted (`201`) because
  `events_analytics_platform` (EAP/spans) is schema-flexible and does not
  validate that an attribute name has ever been seen. The query
  `action:golf_round_submit` is a **best guess** at the tag value Phase
  C/D's code will actually emit for golf round submit/autosave — cross-check
  against the shipped code's `action` values once Phase C/D lands, and edit
  the detector's `dataSources[0].queryObj.snubaQuery.query` if the real value
  differs (there is no rename-safe way to detect this from the API alone).
  Thresholds (critical=10/warning=3) are placeholders with no baseline
  behind them at all — revisit as soon as real data exists.

**`environment` handling**: every query above embeds `environment:production`
directly in the query text rather than using the separate `environment`
field (which is left `null`, matching the pre-existing detector `7702315`'s
pattern). This was a deliberate choice, verified via `events-stats` before
creating each detector: the combined query text returns exactly the same
counts as the equivalent tag/environment breakdown, and the live
`alert-rules` POST accepted it without complaint. If a query is ever edited
to remove the `environment:production` clause, the detector will match
across **all** environments (dev/preview/local-production-build/etc.), not
just production — there is no separate safety net.

### P2 — routed through workflow `3937991` ("Helm — P2 digest")

| Detector id | Alert-rule id | Name | Query | Window | Critical | Warning | Resolve |
|---|---|---|---|---|---|---|---|
| `9711165` | `451029` | Helm P2 — push BadDeviceToken spike | `environment:production BadDeviceToken` | 24h | 5 | 2 | 2 |

The assignment flagged this as "only if a tag/query can identify it (search
issues for BadDeviceToken first), else document as deferred." The org-level
and project-level classic issue-search endpoints
(`/organizations/helm-xs/issues/`, `/projects/helm-xs/javascript-nextjs/issues/`)
both return `403 {"detail":"You do not have permission to perform this
action."}` for this token regardless of query — that looks like a token-scope
gap (`event:read` on the issue-stream specifically), not evidence the events
don't exist. The **Discover events endpoint**
(`GET /organizations/helm-xs/events/`) worked with the same token and found
real signal: two distinct APNs push-token issues, `BadDeviceToken`, 4 and 1
events respectively over the trailing 90 days. So this detector is **not**
deferred — the query is a free-text match on the issue title
(`environment:production BadDeviceToken`), not a structured tag, because
there's no dedicated tag for this failure mode. Thresholds are a rough
"more than a couple in a day is unusual" guess given the tiny volume (5
events total across 90 days) — revisit if volume changes materially.

### Deferred — no detector created, reasoning recorded

- **Cron missed check-ins**: `GET /organizations/helm-xs/detectors/` shows no
  `cron_monitor`-type detectors and the org currently has **zero** cron
  monitors (confirmed by the Phase E brief and not contradicted by anything
  found here — Phase C, which ships the check-in calls, had not deployed as
  of this build). A cron monitor's missed/failed check-in alerting is
  automatic once the monitor exists (Sentry creates the monitor and its
  issue-based alerting together on first check-in), and those issues will
  already route through the two default workflows (`3021134` "high-priority
  issues", `3653843` "suggested assignees") since they're ordinary issue
  events, not metric-issue events. **Action once Phase C ships**: verify with
  `GET /organizations/helm-xs/monitors/` (or the Sentry MCP `find_monitors`)
  that the expected slugs (cron path with `/` replaced by `-`, e.g.
  `api-cron-log-retention`) appear, and decide whether the default routing is
  sufficient or a dedicated P1 workflow attachment is wanted.
- **Readiness (`GET /api/health` degraded)**: not a separate detector. The
  new uptime monitor (below) already asserts a `2xx` status on that exact
  URL, so once Phase C ships the 503-on-degraded behavior, the uptime
  monitor's existing assertion will catch it without any additional
  configuration. Documented here so nobody builds a redundant metric
  detector for the same signal later.

## Notification workflow hygiene

| Workflow id | Name | Frequency | Action | Detectors attached |
|---|---|---|---|---|
| `3937972` | Helm — notify owner on metric monitor incidents | 60 min | email → user `4202373` (njrini99@gmail.com) | `7702315`, `9711163`, `9711158`, `9711164`, `9711170` (all P1) |
| `3937991` | Helm — P2 digest | 1440 min (daily) | email → user `4202373` | `9711165` |
| `3021134` | Send a notification for high priority issues (Sentry default) | — | email → issue owners | `6533345` (Issue Stream, built-in) |
| `3653843` | Notify Suggested Assignees (Sentry default) | — | email → suggested assignees | `6533345` (Issue Stream, built-in) |

**Exactly one workflow (`3937972`) carries P1 email routing** — every P1
detector's `workflowIds` was verified to contain only `3937972` after the
repoint-and-cleanup sequence described above. `3937991` is the equivalent
single routing point for P2. The two Sentry-default workflows (`3021134`,
`3653843`) were left untouched — they route the built-in generic "Issue
Stream" detector (`6533345`), not any of the new metric detectors, so there
is no overlap with the P1/P2 routing above. Per instruction, these defaults
were **not deleted or disabled** even though deleting them was considered;
that's a destructive change outside this build's scope and belongs to the
owner if wanted (see `SENTRY_ALERT_ROUTING.md`).

No Slack (or any chat) integration exists on this org — verified via the
absence of any non-email action type on every workflow/detector read above,
and confirmed against the assignment's own note that none exists. Every
action created in this build is `type: "email"` targeting user `4202373`.

### Exact payloads used (reproducible)

**Detector (b), the first one proven — pg_error_code 42501** (the pattern
every other P1/P2 detector below follows exactly, with `name`, `query`,
`resolveThreshold`, `timeWindow`, and both `alertThreshold`s changed):

```json
POST /api/0/organizations/helm-xs/alert-rules/
{
  "name": "Helm P1 — Postgres privilege errors (42501)",
  "dataset": "events",
  "query": "environment:production pg_error_code:42501",
  "aggregate": "count()",
  "thresholdType": 0,
  "resolveThreshold": 1.0,
  "timeWindow": 60,
  "environment": null,
  "resolution": 3,
  "thresholdPeriod": 1,
  "projects": ["javascript-nextjs"],
  "triggers": [
    {"label": "critical", "thresholdType": 0, "alertThreshold": 5.0, "resolveThreshold": 1.0,
     "actions": [{"type": "email", "targetType": "user", "targetIdentifier": "4202373"}]},
    {"label": "warning", "thresholdType": 0, "alertThreshold": 1.0, "resolveThreshold": 1.0,
     "actions": [{"type": "email", "targetType": "user", "targetIdentifier": "4202373"}]}
  ]
}
```

Then, using the new detector id found via
`GET /organizations/helm-xs/detectors/?query=Postgres` (cross-referenced by
`alertRuleId`):

```
PUT /api/0/organizations/helm-xs/detectors/<new-detector-id>/
{"workflowIds": ["3937972"]}

DELETE /api/0/organizations/helm-xs/workflows/<orphaned-workflow-id>/
```

**Detector (e), the EAP/metrics one — golf round submit/autosave failure
rate** (differs only in `dataset`/`aggregate`, everything else follows the
same pattern):

```json
POST /api/0/organizations/helm-xs/alert-rules/
{
  "name": "Helm P1 — golf round submit/autosave terminal failure rate",
  "dataset": "events_analytics_platform",
  "query": "action:golf_round_submit",
  "aggregate": "sum(helm.workflow.failure)",
  "thresholdType": 0,
  "resolveThreshold": 3.0,
  "timeWindow": 60,
  "environment": null,
  "resolution": 3,
  "thresholdPeriod": 1,
  "projects": ["javascript-nextjs"],
  "triggers": [
    {"label": "critical", "thresholdType": 0, "alertThreshold": 10.0, "resolveThreshold": 3.0,
     "actions": [{"type": "email", "targetType": "user", "targetIdentifier": "4202373"}]},
    {"label": "warning", "thresholdType": 0, "alertThreshold": 3.0, "resolveThreshold": 3.0,
     "actions": [{"type": "email", "targetType": "user", "targetIdentifier": "4202373"}]}
  ]
}
```

Note: `"dataset": "generic_metrics"` was tried first and rejected —
`["Creation of transaction-based alerts is disabled, as we migrate to the
span dataset. Create span-based alerts (dataset: events_analytics_platform)
with the is_transaction:true filter instead."]` — hence
`events_analytics_platform`, which succeeded.

**Workflow — "Helm — P2 digest"**:

```json
POST /api/0/organizations/helm-xs/workflows/
{
  "name": "Helm — P2 digest",
  "triggers": {
    "logicType": "any-short",
    "conditions": [
      {"type": "first_seen_event", "comparison": true, "conditionResult": true},
      {"type": "regression_event", "comparison": true, "conditionResult": true},
      {"type": "reappeared_event", "comparison": true, "conditionResult": true}
    ]
  },
  "actionFilters": [
    {
      "logicType": "all",
      "conditions": [],
      "actions": [
        {"type": "email", "data": {"fallthroughType": "ActiveMembers"}, "config": {"targetType": "user", "targetIdentifier": "4202373"}}
      ]
    }
  ],
  "environment": "production",
  "config": {"frequency": 1440},
  "detectorIds": []
}
```

## Uptime monitors

| Detector id | Name | URL | Interval | Timeout | Downtime/Recovery threshold | Status |
|---|---|---|---|---|---|---|
| `6574284` | Uptime Monitoring for https://helmsportslabs.com | `https://helmsportslabs.com` | 60s | 10s | 3 / 1 | enabled (pre-existing, untouched) |
| `9711171` | Helm readiness /api/health | `https://helmsportslabs.com/api/health` | 300s | 10s | 3 / 1 | **created but DISABLED — see below** |

Created via the Sentry MCP `create_uptime_monitor` tool (method GET,
environment `production`, `responseCaptureEnabled: true`), which under the
hood is the same detector model — verified by
`GET /organizations/helm-xs/detectors/9711171/`.

**OWNER ACTION REQUIRED — billing blocks enabling the new monitor.** The
monitor was created successfully (`webUrl:
https://helm-xs.sentry.io/monitors/9711171/`) but came back
`"status": "disabled"`. Attempting to enable it —
`PUT /organizations/helm-xs/detectors/9711171/ {"enabled": true}` — returns:

```
400 {"enabled":["You don't have enough pay-as-you-go available to create a new seat"]}
```

This is a billing/quota limit on uptime-monitor seats under the org's
current plan, not an API or permissions problem — the existing monitor
(`6574284`) is unaffected and still `enabled: true`. **To finish this
deliverable**: either free up a seat (see the dashboard-cap note below for
one specific idea, though that's a different quota) or add pay-as-you-go
capacity in Sentry billing settings, then re-run the `PUT` above. Until
then, `/api/health` has no active uptime check — the object exists and is
fully configured, it just isn't checking anything yet.

Until Phase C ships, `/api/health` returns `200` even when the underlying
database check is failing — the route doesn't yet return `503` for a
degraded state. So even once enabled, this monitor currently only proves
the runtime answers HTTP requests at all, not that the app is healthy. It
will start proving the latter automatically once Phase C's `503` behavior
ships — no monitor reconfiguration needed.

## Dashboards

Widget shapes were reverse-engineered from three pre-existing non-prebuilt
dashboards in this org (`Frontend Template` id `308734`, `General Template`
id `260884`) — prebuilt dashboards (e.g. "Backend Overview") return empty
`widgets: []` from the detail GET, so they could not be used as a shape
reference. Confirmed valid `widgetType` values: `error-events`, `issue`,
`spans`, `metrics`, `logs`. Confirmed invalid: `transaction-like` (400:
`"The transactions dataset is being deprecated. Please use the spans
dataset with the is_transaction:true filter instead."`), `replay` (400:
`"replay" is not a valid choice.` — replay counts have no dashboard widget
type in this API version; view them on the Replays product page instead).
A widget with a non-empty `columns` (group-by) array requires a top-level
`limit` on the widget or the whole dashboard 400s.

Important finding on the `metrics` widgetType: unlike the `spans`
(EAP) dataset, which validates that a numeric aggregate's argument has a
known numeric type (`avg(helm.workflow.duration)` 400s right now with
`"helm.workflow.duration is invalid for parameter 1 in avg. Its a string
type field..."` because no event has defined its type yet), the `metrics`
widgetType accepts unknown custom counter/distribution names without
validation. This was proven with three throwaway probe dashboards (created,
verified, then deleted) before committing to the real dashboards, so **every
`helm.*` and `gen_ai.*` widget below is a real, live widget** — not a
"create after deploy" placeholder — even though none of those metrics have
data yet. They will populate automatically once Phase C/D ship.

| Dashboard | Id | URL | Widgets |
|---|---|---|---|
| Helm Production Health | `9931246` | https://helm-xs.sentry.io/dashboard/9931246/ | 8 |
| Golf Round Reliability | `9931247` | https://helm-xs.sentry.io/dashboard/9931247/ | 5 |
| CoachHelm AI | `9931248` | https://helm-xs.sentry.io/dashboard/9931248/ | 6 |
| Jobs & Integrations | `9931249` | https://helm-xs.sentry.io/dashboard/9931249/ | 4 |
| Client Experience | `9931306` | 5 | https://helm-xs.sentry.io/dashboard/9931306/ |

Verified each by `GET /organizations/helm-xs/dashboards/<id>/` and checking
widget count.

### Helm Production Health (`9931246`)
- Errors Over Time — `error-events`, area, `count()`, `environment:production`
- Affected Users — `error-events`, big_number, `count_unique(user)`
- Unresolved Issues — `error-events`, big_number, `count()`, `is:unresolved`
- Regressed Issues — `issue`, table, `is:regressed`
- Workflow Success vs Failure — `metrics`, line, `sum(helm.workflow.success)` / `sum(helm.workflow.failure)`
- Server Latency p50/p95 — `spans`, line, `p50(span.duration)` / `p95(span.duration)`, `span.op:http.server`
- Web Vitals p75 — `spans`, table, `p75(measurements.lcp/fcp/cls/ttfb)`, `is_transaction:true`
- Top Unresolved Issues — `issue`, table, `is:unresolved environment:production`, ordered by count

Deliberately **not** included: a release-marker widget and an uptime-status
widget. Release markers are a per-chart display toggle in the Sentry UI, not
a field this create API exposed anywhere I could find without guessing — no
`showReleaseAs`/similar key appeared in any read shape, so nothing was
fabricated. Uptime status has no dashboard `widgetType`; monitor status is
only visible on the monitor's own page (linked above).

### Golf Round Reliability (`9931247`)
- helm.workflow attempts by action/result (`sport:golf`) — `metrics`, table, grouped
- helm.workflow failures by action/result (`sport:golf`) — `metrics`, table, grouped
- helm.workflow duration p50/p95 (`sport:golf`) — `metrics`, line
- DB/RPC Failure Codes — `error-events`, table, grouped by `pg_error_code`
- DB Span Latency p50/p95 — `spans`, line, `span.op:db`

### CoachHelm AI (`9931248`)
- gen_ai.* Span Volume — `spans`, line, `count()`, `span.op:gen_ai*` (best-guess wildcard on span op naming — verify against the actual `gen_ai.*` span op Phase D emits once shipped, e.g. via `GET /organizations/helm-xs/spans/fields/` or a Discover query, and adjust if the real op string differs)
- CoachHelm Error Rate — `error-events`, line, `feature:coachhelm*`
- gen_ai Token Usage (input/output) — `metrics`, big_number ×2, `sum(gen_ai.usage.input_tokens)` / `sum(gen_ai.usage.output_tokens)`
- helm.ai Request Volume — `metrics`, line, `sum(helm.ai.request/success/failure)`
- helm.ai Duration p50/p95 by model — `metrics`, table, grouped by `model`

### Jobs & Integrations (`9931249`)
- helm.job Started/Completed/Failed by job_name — `metrics`, table, grouped
- helm.job Duration p50/p95 — `metrics`, line
- Errors on /api/cron and /api/inngest — `error-events`, table, `(transaction:/api/cron/* OR transaction:/api/inngest/*)`
- helm.push Delivery (attempt/delivered/failed) — `metrics`, line

No cron check-in widget: same reasoning as the deferred cron detector above
— zero cron monitors exist yet, and no dashboard `widgetType` for cron
check-in status was found (Crons has its own product page, not a dashboard
widget type in this API).

### Client Experience — created 2026-09-03 after freeing a slot

**Update (commander, 2026-09-03 ~02:45Z):** the owner granted admin authority for this build. `General Template copy` (`308736`) was verified widget-for-widget identical to `General Template` (`260884`) (same 14 widget titles, display types and query fields, never visited) and deleted, which freed the tenth slot; the payload below was then POSTed unchanged and came back as dashboard `9931306` with all five widgets (verified by GET). `General Template copy 1` (`308738`) and `Mobile Template copy` (`308733`) are still present and still look like duplicates; deleting them remains an owner choice. The original blocked-state record is kept below for provenance.

#### Original record

The org is at its **10-dashboard plan cap** for non-prebuilt dashboards.
Confirmed via `GET /organizations/helm-xs/dashboards/` and counting
`prebuiltId: null` entries — exactly 10, and creating a 5th new dashboard
returned:

```
400 "You may not exceed 10 dashboards on your current plan."
```

The 10 are: this build's 4 (`CoachHelm AI`, `Golf Round Reliability`, `Helm
Production Health`, `Jobs & Integrations`) plus 6 pre-existing: `Frontend
Template` (`308734`), `General Template` (`260884`), `General Template copy`
(`308736`), `General Template copy 1` (`308738`), `Mobile Template`
(`260885`), `Mobile Template copy` (`308733`).

**OWNER ACTION REQUIRED**: three of those six — `General Template copy`
(`308736`), `General Template copy 1` (`308738`), `Mobile Template copy`
(`308733`) — read as literal unused duplicates of their non-`copy`
counterparts (same generic name, no distinguishing content found). Deleting
one of them frees the slot. This build deliberately did **not** delete any
pre-existing dashboard — that's this org's data, not a Phase E artifact, and
removing something not obviously mine to remove is exactly the kind of
irreversible action to flag rather than just do. Once a slot is free, create
it with:

```json
POST /api/0/organizations/helm-xs/dashboards/
{
  "title": "Client Experience",
  "widgets": [
    {"title": "Web Vitals p75 (LCP/FCP/CLS/TTFB)", "displayType": "table", "widgetType": "spans", "interval": "5m",
     "queries": [{"name": "", "fields": ["p75(measurements.lcp)", "p75(measurements.fcp)", "p75(measurements.cls)", "p75(measurements.ttfb)"],
                  "aggregates": ["p75(measurements.lcp)", "p75(measurements.fcp)", "p75(measurements.cls)", "p75(measurements.ttfb)"],
                  "columns": [], "conditions": "is_transaction:true", "orderby": ""}],
     "layout": {"x": 0, "y": 0, "w": 3, "h": 2, "minH": 2}},
    {"title": "UI Interaction Spans", "displayType": "line", "widgetType": "spans", "interval": "5m",
     "queries": [{"name": "", "fields": ["count()"], "aggregates": ["count()"], "columns": [], "conditions": "span.op:ui.interaction", "orderby": ""}],
     "layout": {"x": 3, "y": 0, "w": 3, "h": 2, "minH": 2}},
    {"title": "Errors by Browser", "displayType": "table", "widgetType": "error-events", "interval": "5m",
     "queries": [{"name": "", "fields": ["browser.name", "count()"], "aggregates": ["count()"], "columns": ["browser.name"],
                  "conditions": "environment:production has:browser.name", "orderby": "-count()"}],
     "layout": {"x": 0, "y": 2, "w": 3, "h": 2, "minH": 2}, "limit": 10},
    {"title": "Errors by OS", "displayType": "table", "widgetType": "error-events", "interval": "5m",
     "queries": [{"name": "", "fields": ["os.name", "count()"], "aggregates": ["count()"], "columns": ["os.name"],
                  "conditions": "environment:production has:os.name", "orderby": "-count()"}],
     "layout": {"x": 3, "y": 2, "w": 3, "h": 2, "minH": 2}, "limit": 10},
    {"title": "helm.auth Attempts vs Failures", "displayType": "line", "widgetType": "metrics", "interval": "5m",
     "queries": [{"name": "", "fields": ["sum(helm.auth.attempt)", "sum(helm.auth.failure)"],
                  "aggregates": ["sum(helm.auth.attempt)", "sum(helm.auth.failure)"], "columns": [], "conditions": "", "orderby": ""}],
     "layout": {"x": 0, "y": 4, "w": 3, "h": 2, "minH": 2}}
  ]
}
```

(This exact payload is saved verbatim in the branch history of this file for
copy-paste; it was never POSTed since the cap blocked it, so it carries no
verification beyond the individual widget shapes it reuses, each of which
*was* proven working in the four dashboards that did get created.)

Replay counts were intentionally left out of this dashboard's widget list —
see the `replay` widgetType rejection above.

## Rollback

Every object created in this build can be removed with a `DELETE`:

```
DELETE /api/0/organizations/helm-xs/detectors/<id>/      # 9711158, 9711163, 9711164, 9711165, 9711170, 9711171
DELETE /api/0/organizations/helm-xs/workflows/<id>/       # 3937991 (P2 digest)
DELETE /api/0/organizations/helm-xs/dashboards/<id>/       # 9931246, 9931247, 9931248, 9931249, 9931306
```

Do **not** delete workflow `3937972` or detector `7702315` — both
pre-existed this build. Deleting a detector automatically removes it from
any workflow's `detectorIds` (observed behavior, not separately documented
by Sentry) — no need to unlink first.

Alert-rule ids (`451026`–`451030`) are the legacy-view identifiers for the
same objects as their detector ids above; deleting the detector removes both
views. There is no separate cleanup needed for the alert-rule id.
