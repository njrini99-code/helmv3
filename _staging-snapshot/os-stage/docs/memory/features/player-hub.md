# Feature: Player Hub

- feature_id: player_hub
- status: active
- criticality: high
- last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
- last_verified_at: 2026-08-21
- history_backfill: not_started (memory/ledgers/{changes,tests,operations}/player_hub.md do not exist yet; no incident/ADR records exist for this feature)

## Purpose

Give a player a single "what needs my attention" surface: upcoming travel,
assigned tasks, event RSVPs, and recent announcements, plus the current top
CoachHelm signal, without having to visit four separate pages.

## User Contract

A logged-in player sees near-term action items scoped to their own team and
assignments — nothing from other teams, nothing generic. RSVP and task
actions taken from this surface must be reflected immediately (no stale
"pending" state after a successful write).

## Current Behavior — this is not a standalone page anymore

**The `/golf/dashboard/hub` route is dead.** Wave W2 nav consolidation
(2026-07-09, `PRODUCTION_READINESS_MISSION_2026-07-09.md`) merged the
standalone Hub into the main player dashboard. `src/app/golf/(dashboard)/
dashboard/hub/page.tsx` is now only a `redirect('/golf/dashboard')` fallback
component; `next.config.mjs` `redirects()` intercepts the path at the
framework layer first so the fallback rarely even executes (belt-and-braces
added 2026-07-22 to dodge a React #310 "rendered more hooks" crash on
client-side navigation into bare `redirect()` shims). `surface-registry.ts`
has no rail entry for a standalone hub any more.

The real surface today is an "Action center" section rendered inline on
`/golf/dashboard` itself:

- Route: `src/app/golf/(dashboard)/dashboard/page.tsx` fetches
  `getPlayerHubSummaryData(teamId, playerId)` from
  `src/app/golf/actions/player-hub-data.ts` in parallel with the main
  dashboard payload, then passes it as the `hubData` prop.
- Component: `src/components/fairway/pages/dashboard/FairwayPlayerDashboard.tsx`
  renders the action-center block and, for the "top CoachHelm signal" card
  specifically, still imports the pre-redesign
  `src/components/golf/player-hub/HubInsightSignalCard.tsx` (this one old
  file survived the Fairway migration; the others below did not).
- The three other files the prior-generation doc named as live components —
  `PlayerHub.tsx`, `PlayerHubWrapper.tsx`,
  `PlayerHubAnnouncementsSection.tsx` — **do not exist on disk.** Verified by
  direct path check against HEAD.

## Invariants

- Action-center content is scoped to the authenticated player's team and
  assignments only (enforced the same way as the rest of the player
  dashboard — team/player id resolved server-side before any query).
- Task completion has exactly one source of truth: `golf_task_assignments`.
  RSVP state has exactly one source of truth: `golf_event_attendance`.
- A read failure on any one action-center leg (travel/tasks/events/
  announcements) must not silently render an empty hub as if there were
  nothing pending — `player-hub-data.ts` logs
  `[getPlayerHubSummaryData] <leg> read failed — refusing to render an empty
  hub` rather than swallowing the error (verified in source, line ~203).

## Primary Journeys

```txt
Player opens /golf/dashboard
  -> dashboard/page.tsx calls getPlayerDashboardData() AND
     getPlayerHubSummaryData(teamId, playerId) in parallel
  -> FairwayPlayerDashboard renders the action-center section from hubData:
     upcoming travel, assigned/overdue tasks, events awaiting RSVP,
     recent announcements, top CoachHelm insight (HubInsightSignalCard)
  -> inline RSVP/task actions call attendance.ts / tasks.ts, then revalidate
```

## Architecture / Data Flow — the corrected picture

The prior-generation doc's "Known high-risk mismatch: Hub reads
`golf_task_completions`, while `completeTask()` writes
`golf_task_assignments`" **is stale and no longer true.** `golf_task_completions`
does not exist in `src/lib/types/database.ts` (confirmed missing from the
generated schema) and no longer appears anywhere in
`src/app/golf/actions/dashboard-data.ts`. `completeTask()`
(`src/app/golf/actions/tasks.ts`) writes exclusively to
`golf_task_assignments`, and the current hub read path
(`player-hub-data.ts`, plus `dashboard-data.ts` lines ~993–1189 for the
coach-side task view) reads the same table. The single-source-of-truth
mismatch this doc used to warn about has been fixed since the doc was
written; it is now an invariant worth protecting, not an open bug.

## Permissions / Tenancy

Team/player scoping is resolved server-side in `player-hub-data.ts` before
any table read; there is no client-supplied team id. RLS on
`golf_task_assignments`, `golf_event_attendance`, `golf_travel_itineraries`,
and `golf_announcements` provides the second layer — not independently
re-verified in this pass, see Known Debt.

## Dependencies

Team Operations (`golf_tasks`/`golf_task_assignments`), Calendar/Events
(`golf_events`, `golf_event_attendance`), Team Communications
(`golf_announcements`), and CoachHelm AI (top insight signal).

## Failure Modes

- A leg read failure (travel/tasks/events/announcements) is logged and
  should surface as a partial/degraded hub rather than a false "all clear."
  Not independently browser-verified this pass.
- Because the hub is now folded into the main dashboard fetch, a slow or
  failing `getPlayerHubSummaryData()` call is on the critical path for the
  whole `/golf/dashboard` load, not an isolated widget — worth confirming
  it can't block the primary dashboard payload (`Promise.all` semantics: a
  rejected `getPlayerHubSummaryData()` would fail both, not just the hub
  section — not verified this pass).

## Observability Contract

`logServerError` calls in `player-hub-data.ts` are the only structured
signal found for this feature; no dedicated Sentry breadcrumb or feature
tag was located in this pass.

## Test Contract

No dedicated unit test file for `player-hub-data.ts` exists
(`find src -iname "*player-hub-data*"` returns only the source file).
`src/app/golf/actions/__tests__/dashboard-data.test.ts` exists and covers
the adjacent `dashboard-data.ts` exports, not the hub summary function
itself. `src/lib/golf/nav-registry.test.ts` exists and is relevant to the
hub's removal from the rail. `e2e/roster.spec.ts`, named by
`memory/registry.yml`'s `roster_team` entry as a required check, **does not
exist on disk** (adjacent finding, flagged here because `roster_team` is a
sibling doc in this same wave).

## Known Debt / Unknowns

- **`memory/registry.yml`'s `player_hub` entry is stale on both routes and
  actions.** Its `code.routes` lists `src/app/golf/(dashboard)/dashboard/
  hub/**` — a dead redirect shim, not where the feature lives. Its
  `code.actions` lists `dashboard-data.ts`, `travel.ts`, `tasks.ts`,
  `attendance.ts` but omits `src/app/golf/actions/player-hub-data.ts`, the
  file that actually owns `getPlayerHubSummaryData`. Running
  `npm run knowledge:map -- --files src/app/golf/actions/player-hub-data.ts
  "src/app/golf/(dashboard)/dashboard/page.tsx"` returns
  `impactedFeatures: []` for **both** — the real, live hub code is
  currently invisible to the feature router. This matches the pattern the
  runtime `src/lib/admin/feature-registry.ts` audit already flagged
  (2026-08-21 note in `memory/system/golfhelm-engineering-os.md`): `player_hub`
  is one of 4 ids where the two registries' file/action ownership disagrees.
  This is a router gap, not a doc gap — fixing the prose here doesn't fix
  `knowledge:map`'s answer.
- **This is likely a repo-wide pattern, not unique to player_hub.** Every
  UI path this doc's prior generation named under `src/components/golf/**`
  that hasn't survived the Fairway migration is gone (confirmed: `PlayerHub.tsx`,
  `PlayerHubWrapper.tsx`, `PlayerHubAnnouncementsSection.tsx`). Fairway has
  been the *only* dashboard tree since Wave W1 (2026-07-09,
  `src/lib/redesign/flag.ts` header comment) — there is no legacy fallback
  left to fall into. Any registry `components:` list still pointing at
  `src/components/golf/**` for a redesigned surface should be assumed stale
  until checked.
- RLS policies on the tables this feature reads were not independently
  re-verified against the live database in this pass (checked against
  generated types only, per the source-of-truth hierarchy in
  `memory/system/golfhelm-engineering-os.md`).
- Whether `getPlayerHubSummaryData()` failing can take down the whole
  `/golf/dashboard` `Promise.all` (see Failure Modes) is unconfirmed.

## Incident History

None recorded in `memory/incidents/player_hub/`. Registry lists
`docs/operations/2026-05-17-p0-runbook.md` as a related incident doc —
predates the Wave W2 hub consolidation, so its route-level detail (if any)
should be assumed superseded.

## ADR Links

None. No `memory/decisions/ADR-*.md` exists for this feature's Wave W2
consolidation into the main dashboard — that is a real architecture
decision with no recorded ADR.

## Verification Evidence

Files read in full: `src/app/golf/(dashboard)/dashboard/hub/page.tsx`,
`src/app/golf/actions/player-hub-data.ts` (grep + targeted read),
`src/components/fairway/pages/dashboard/FairwayPlayerDashboard.tsx` (grep),
`src/app/golf/(dashboard)/dashboard/page.tsx` (grep). Tables confirmed
against `src/lib/types/database.ts`: `golf_travel_itineraries`,
`golf_tasks`, `golf_task_assignments` (exists), `golf_task_completions`
(confirmed absent), `golf_events`, `golf_event_attendance`,
`golf_announcements`. Registry divergence confirmed by running
`npm run knowledge:map -- --files <path>` directly, not by reading prose
about it. Prior-generation doc's `golf_task_completions` schema-drift
banner (dated 2026-08-19) re-checked and still holds; its "known high-risk
mismatch" claim was re-checked against current source and found resolved.
