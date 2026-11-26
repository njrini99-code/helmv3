# Bridge spaces: building the redesign

Owner approval: "Plan this all out and implement. I approve" (2026-11-26, the design-canvas conversation).
That covers the plan, the build and merging. It does not cover a deploy: every deploy, preview included,
still needs the owner to say so in that conversation (AGENTS.md "Production").

Design source: the canvas "Bridge redesign options" (owner's private artifact), pages **Redesign** and
**Errors & teams**. The page "First pass (Clubhouse copy)" was rejected by the owner and is out of scope.

## What changes

The admin rail has about 30 tabs in four sections. The redesign puts six **spaces** in front of them:

| Space | Question it answers | New route | Built from (existing readers) | Tabs grouped under it |
| --- | --- | --- | --- | --- |
| Today | What is happening with Helm right now? | `/admin/spaces/today` | `overview.ts`, `pulse-grid.ts`, `live-model.ts`, `release-ledger.ts`, HELD count | Pulse, Activity |
| People | Who uses Helm, and who is slipping? | `/admin/spaces/people`, `/admin/spaces/people/[teamId]` | `pulse-grid.ts`, `team-detail.ts`, `team-page-extras.ts`, `users.ts`, `auth.ts`, `activity.ts`, `clubhouse_sessions` | Teams pulse, Users & Teams, Activity, Auth |
| Product | Which parts of the app are alive? | `/admin/spaces/product` | `feature-adoption.ts`, `feature-health.ts` | Golf, Baseball, Lift Lab, Utilization, Health |
| Reliability | What is breaking, for whom, and why? | `/admin/spaces/reliability`, `/rules`, `/speed` | `live-model.ts`, `screens.ts`, `rules.ts`, the graph, `clubhouse_session_events` + `clubhouse_sessions`, `clubhouse_signal_hourly`, `bridge-notes.ts` | Incidents, Clubhouse B01-B13, Flight Recorder |
| Ship | What is live, what is next, is the platform OK? | `/admin/spaces/ship` | `release-ledger.ts`, `feature-flags.ts`, `jobs.ts` | Deploys, Releases, Database, Jobs |
| Desk | What is waiting on me? | `/admin/spaces/desk` | HELD rows, `jobs.ts`, `helm-jobs.ts` | Engineering OS, Work log, Ben + Leah, CRM |

Rules that do not move (admin-nav.ts):

- Every space lives under `/admin/spaces/` (`/admin/reliability` is a retired route that redirects to Incidents,
  so a fresh prefix avoids every collision). One registry glob, `src/app/admin/spaces/**`, maps them.
- No route is renamed or removed. `/admin/errors/<fp>` and every other stored link keeps working.
- Shortcut keys never move. The spaces carry no keys (no letter is free); they are on the rail and in ⌘K.
- The rail gains a **Spaces** section at the top. This replaces owner decision D3 ("Clubhouse leads") in
  `2026-11-18-clubhouse-bridge-redesign.md` §7.1; that section is updated in the same PR.

## Data checks done before planning (2026-11-26)

| Claim on the design | Checked against | Result |
| --- | --- | --- |
| People are counted once inside a cause | `clubhouse_signal_hourly.user_ids` (an array per row), `live-model.ts usersOf()` (a set union) | True |
| Database errors by code, complete | `clubhouse_session_events.server_code`; ingest keeps every failure in the timeline, only `admin_events` is capped at 5 per batch | True when read from session events, not `admin_events` |
| Team on every error row | `clubhouse_sessions.team_id`, joined by `session_id` | True |
| Page-switch time needs schema work | `ingest.ts addHourly()` buckets `durationMs` for any kind | No migration: the client only has to send it |
| "Active this week" per team | `users.ts activePlayers` is 30-day only | Gap: new reader (PR D) |
| Table a database error touched | Not stored; the action's tables in the Bridge graph | Derived, labelled "from the Bridge map" |

## Pull requests

Fewer, larger PRs (owner preference): one merge-train PR, `agent/bridge-spaces`, plus PR A on its own because it
touches Clubhouse, not the admin.

| Branch | Scope | Built by |
| --- | --- | --- |
| **A** `agent/bridge-switch-time` (own PR) | `src/clubhouse/shell/use-signals.ts` sends `durationMs` on every view after the first; tests; signal doc | helm-worker |
| **B** `agent/bridge-spaces` (the train) | Scoped tokens (light and dark) and primitives in `src/app/admin/spaces/_ui/`, the Spaces rail section, every BR code for B16 to B24, placeholder pages | this session |
| **C** `agent/bridge-reliability` → B | Error feed with coach and player cards and the detail panel (Where, What they did, How it counts, Server), the counting-rules page, Speed | helm-ui-worker |
| **D** `agent/bridge-people` → B | Teams activity and one team (coach and player split, people, activity, errors) | helm-ui-worker, then security-reviewer |
| **E** `agent/bridge-today` → B | Today, and the Product, Ship and Desk landings | helm-ui-worker |

C, D and E branch from B's foundation commit and touch disjoint folders (`spaces/reliability`, `spaces/people`,
`spaces/{today,product,ship,desk}`) plus their own new readers. They are merged into B, checked together, and B is
landed with `pr:land`.

## Bridge IDs

| Screen | Range |
| --- | --- |
| Today | BR-16xx |
| People: teams | BR-17xx |
| People: one team | BR-18xx |
| Reliability: error feed | BR-19xx |
| Reliability: counting rules | BR-20xx |
| Reliability: speed | BR-21xx |
| Product | BR-22xx |
| Ship | BR-23xx |
| Desk | BR-24xx |

xx90 to xx93 stay the four states (loading, empty, failed, no signal yet).

## Honesty rules for every space

- A value the canvas showed as an example becomes real data or an explicit "not measured yet". `null`, never `0`.
- With the switch off or no signal for 15 minutes, nothing says "all clear" (R-09).
- Numbers that are derived (a table from the Bridge map, a 7-day count rebuilt from timestamps) say so.
- Players may be minors: no new personal data in signals; team detail shows what the existing admin pages
  already show, to super-admins only.

## Verification

- Targeted tests next to each new reader and screen; `npm run check:changed`; `npm run build` when a
  `'use server'` file changes.
- Playwright WebKit (tier W) against local dev on staging data, both themes, 1440 and 390 wide. Admin needs a
  super-admin session; if `scripts/clubhouse/audit/session.mjs` cannot mint one, the screens are checked with the
  readers' fixtures and that is said in the PR.
- `memory/registry.yml` maps every new file; the feature map and World Model are regenerated in each PR.

## Follow-ups landed after the build

- Speed shows the slowest database queries per 15-minute window (`helm_debug.db_stat_deltas` through
  `fetchQueryPerformance`, the app's own requests only, query shapes not text).
- Today's "Teams active" uses People's `teamState()` on the pulse halo, so the two spaces count teams the same way.
- A team page counts only its own sport's messages and says they cover every conversation in that sport.

## Not in this build

- Retiring old tabs. They stay until the owner decides, after living with the spaces.
- Deploying.
