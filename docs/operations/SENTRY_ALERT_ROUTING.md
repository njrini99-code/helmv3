<!-- markdownlint-disable MD013 MD022 MD032 MD040 MD060 -->
# Sentry Alert Routing — Severity, Dedupe, Owner Actions

Companion to `docs/operations/SENTRY_MONITORS.md`, which has every object's
id, query, and exact create payload. This doc is the routing map: what pages
whom, why nothing double-pages, and what's left for a human to decide.

## Severity groups

| Group | Workflow | Frequency | What lands here |
|---|---|---|---|
| **P1 — page now** | `3937972` "Helm — notify owner on metric monitor incidents" | 60 min cooldown | The pre-existing error-volume detector (`7702315`) plus four new ones: production unhandled-error rate, Postgres privilege errors (`42501`), CoachHelm errors, golf round submit/autosave terminal failures |
| **P2 — digest** | `3937991` "Helm — P2 digest" | 1440 min (daily) cooldown | Push `BadDeviceToken` spike (`9711165`) |
| **Default issue routing** | `3021134` + `3653843` (Sentry-installed defaults, unmodified) | — | The generic built-in "Issue Stream" detector (`6533345`) — ordinary new/regressed/reassigned issues that aren't one of the specific metric detectors above |

All P1/P2 actions are `email` to the org owner (user `4202373`,
`njrini99@gmail.com`) — there is no Slack or other chat integration on this
org, verified by the absence of any non-email action across every
workflow/detector read during this build.

## Dedupe reasoning — why one root cause won't page four times

The failure mode this was built to avoid: a single underlying incident
(say, a spike in `42501` Postgres privilege errors) triggering separate
notifications from (a) a metric detector's own trigger action, (b) a
workflow it's linked to, (c) the default "high-priority issues" workflow
picking up the same error as a generic issue, and (d) an uptime monitor
flapping because the app is unhealthy — four emails for one problem.

What actually prevents that here:

1. **Every P1 metric detector has exactly one workflow link
   (`3937972`).** Metric-alert creation via the legacy `alert-rules`
   endpoint auto-provisions a bespoke one-off workflow with its own email
   action (see "How detector creation actually works" in
   `SENTRY_MONITORS.md`) — if left alone, that's already a second path
   per detector. Every detector in this build was explicitly re-pointed
   to `3937972` and its auto-created workflow was deleted, verified by
   `GET /workflows/3937972/` showing all five detector ids and by
   `GET /workflows/<orphan-id>/` returning `detectorIds: []` before each
   deletion. **If a new metric detector is ever added by following the same
   `alert-rules` POST pattern, this cleanup step must be repeated or it
   silently reintroduces double-paging.**
2. **Metric detectors and the generic issue-stream default workflows watch
   different detectors.** `3021134`/`3653843` are linked only to the
   built-in `6533345` "Issue Stream" detector — not to any of `7702315`,
   `9711158`, `9711163`, `9711164`, `9711165`, `9711170`. A metric-issue
   event (e.g. the error-rate detector firing) is a different event type
   from a generic issue event, so it does not also flow through the
   issue-stream detector and re-trigger the defaults. This was not modified
   in this build — it's how the two detector types already behave — but it
   is exactly why the defaults were left alone rather than touched "just in
   case."
3. **Uptime is a separate signal on purpose, not merged into P1.** Neither
   uptime monitor (`6574284`, `9711171`) is linked to any workflow — uptime
   incidents surface as their own alert type in Sentry's UI/monitor page,
   not through the email workflows built here. This is a deliberate
   narrowing, not an oversight: an app-level error spike and an
   infrastructure-level downtime event usually need different first
   responses, and merging them would mean a single flapping health check
   pages through the same channel as a code-level P1. If the owner wants
   uptime failures to also email through `3937972` or a dedicated uptime
   workflow, that's a one-line `PUT` on the uptime detector adding
   `workflowIds` — deliberately not done here without asking, since it
   changes what pages the owner and by how much.
4. **P1 vs. P2 frequency does the rest of the deduping.** A flapping P2
   condition (rare — `BadDeviceToken` is 5 events/90d at build time) can't
   re-page more than once a day even if it keeps firing, because the
   workflow's own `frequency: 1440` cooldown suppresses repeats org-wide for
   that workflow, independent of Sentry's per-detector resolve/re-trigger
   logic.

## Owner action items

These are genuine decisions or blockers for the owner, not follow-up work
Phase E could resolve on its own — each one has the exact command it needs
already written in `SENTRY_MONITORS.md`.

1. **Enable the `/api/health` uptime monitor.** Created (`9711171`) but
   stuck `disabled` — the org's pay-as-you-go plan has no available uptime
   seat. `PUT /organizations/helm-xs/detectors/9711171/ {"enabled": true}`
   400s with `"You don't have enough pay-as-you-go available to create a
   new seat"`. Needs either a billing change or freeing capacity elsewhere;
   this build has no visibility into what else consumes that quota.
2. **Free a dashboard slot for "Client Experience."** The org is at its
   10-dashboard plan cap. Three pre-existing dashboards —
   `General Template copy` (`308736`), `General Template copy 1`
   (`308738`), `Mobile Template copy` (`308733`) — read as unused literal
   duplicates. This build did not delete anyone else's objects
   unilaterally; deleting one of those three (or upgrading the plan) frees
   the slot, and the ready-to-run payload is in `SENTRY_MONITORS.md`.
3. **Slack (or other chat) integration, if wanted.** Nothing routes to
   Slack today — email-only. If the owner wants P1 in a channel instead of
   (or in addition to) email, that's a Sentry integration install first
   (Settings → Integrations), then an additional `action` on the `3937972`
   workflow's `actionFilters[0].actions` array. Not attempted here since no
   integration exists to attach to.
4. **Seer / AI issue-analysis budget.** Not configured or investigated in
   this build — out of scope for the detector/workflow/dashboard work
   above, but flagged since "maximum observability" implies it's worth a
   deliberate yes/no from the owner rather than silence. `Sentry MCP`
   exposes `analyze_issue_with_seer` already, so tooling exists whenever
   the owner decides to turn on the budget.
5. **Verify `feature:coachhelm*` and the golf `action:golf_round_submit`
   guess once real code ships.** Both are documented in detail in
   `SENTRY_MONITORS.md` under the relevant detector — the wildcard was
   verified against current data, but the golf metric detector's query is a
   guess at a tag value that doesn't exist in production yet. Neither is a
   blocker (both detectors are live and will simply produce zero incidents
   until then), but both should be sanity-checked against the actual
   shipped code rather than left to silently under- or over-match forever.
6. **Cron monitors, once Phase C ships.** No cron monitors exist yet in this
   org. Once Phase C's check-ins start landing, confirm the expected slugs
   appear (`GET /organizations/helm-xs/monitors/`) and decide whether their
   default issue-stream routing is sufficient or whether they need
   attaching to `3937972`/`3937991` explicitly — see
   `SENTRY_MONITORS.md`'s "Deferred" section for the reasoning already
   worked through.

## Everything created in this build, at a glance

- **P1 workflow** `3937972` — unchanged pre-existing workflow, gained 4 new
  detector links.
- **P2 workflow** `3937991` — new.
- **5 detectors** — `9711158`, `9711163`, `9711164`, `9711165`, `9711170` —
  new, all verified attached to exactly one workflow each.
- **1 uptime monitor** `9711171` — new, created but disabled pending
  billing.
- **4 dashboards** — `9931246`, `9931247`, `9931248`, `9931249` — new,
  verified by widget count. A 5th ("Client Experience") is blocked on the
  dashboard plan cap; its payload is saved and ready.
- **Nothing pre-existing was deleted or disabled** — the two default
  workflows, the pre-existing error/uptime detectors, and every pre-existing
  dashboard were read but never mutated.

Full ids, queries, thresholds, and exact request/response bodies:
`docs/operations/SENTRY_MONITORS.md`.
