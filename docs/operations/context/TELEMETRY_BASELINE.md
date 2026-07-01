# Helm Production Telemetry Baseline

> **Purpose:** A point-in-time production-health baseline for Helm Sports Labs, built from a Sentry + Vercel snapshot. It tells a non-technical partner "what is broken right now, how bad, and what we're doing about it," and gives an AI agent / n8n automation a structured, machine-readable inventory to triage against.
>
> **Audience:** Business partners (plain-English impact) **and** AI agents / n8n workflows (structured issue → GitHub → Huly routing).
>
> **Related docs:** [docs/operations/HELM_MISSION_CONTROL_OS.md](../HELM_MISSION_CONTROL_OS.md) · [docs/operations/GIT_ACTIVITY_TIMELINE.md](../GIT_ACTIVITY_TIMELINE.md) · [docs/operations/N8N_WORKFLOW_SPECS.md](../N8N_WORKFLOW_SPECS.md) · [docs/operations/HULY_WORKSPACE_SETUP.md](../HULY_WORKSPACE_SETUP.md) · [CLAUDE.md](../../../CLAUDE.md) (Sentry Session Replay + integrations)

---

## 0. Snapshot provenance (read this first)

| Field | Value |
|---|---|
| Snapshot pulled | **2026-07-01** |
| Sentry | org `helm-xs`, project `javascript-nextjs` (us.sentry.io), **unresolved issues, 30-day window**, ranked by event count |
| Vercel | project `helmv3`, **runtime error clusters, 7-day window** |
| Nature of counts | **Point-in-time. All event/user counts drift** as new events arrive, issues auto-resolve, or fixes deploy. Treat every number below as "as of the pull," not a running total. |
| What is / isn't verifiable | The **event/user counts and Sentry/Vercel issue IDs are external observations** from the dashboards at pull time — they are not independently checkable against the repo. The **table names, routes, and tool/function names** referenced below **have** been checked against the codebase; where a name could not be confirmed it is marked **unverified**. |
| Sentry issue IDs | Short-IDs come from the `helm-xs/javascript-nextjs` project, so full IDs are prefixed `JAVASCRIPT-NEXTJS-…`; the `NEXTJS-…` entries below are shorthand for the same project. Treat them as illustrative point-in-time references. |
| Instrumentation note | Session Replay is wired in `src/instrumentation-client.ts` (`replaysOnErrorSampleRate: 1.0` = 100% on errors, `replaysSessionSampleRate: 0.1` = 10% session sample in prod / 0% in dev, `maskAllText` on) per [CLAUDE.md](../../../CLAUDE.md) — most Sentry issues below should have a linked replay. |

> **Blast radius ≠ priority.** The table in §1 is ordered by **event volume** (how loud an issue is). The findings in §2 are ordered by **business risk** (core-flow breakage, data-write failures, security-shaped bugs). A quiet issue (few events) can still be the #1 fix — e.g. `golf_rounds` permission-denied.

---

## 1. Top issues by blast radius (point-in-time)

Ordered by event volume across the snapshot window. "Users" is shown only where the snapshot reported it; `—` = not reported in this pull.

| # | Issue (Sentry/Vercel) | Source | Product | Surface | Events | Users | Likely cause |
|---|---|---|---|---|---|---|---|
| 1 | `JAVASCRIPT-NEXTJS-86` browser build/module error | Sentry 30d | Platform (all apps) | Browser bundle / any route | 1426 | — | Stale or failed chunk/module load in the client bundle — typically a bad or mid-flight deploy serving old chunks |
| 2 | `NEXTJS-3W` React hydration mismatch | Sentry 30d | GolfHelm | `/golf/dashboard/recruiting` | 934 | — | Server-rendered markup diverges from client (non-deterministic render — dates, random, `window`, conditional client-only content) |
| 3 | `NEXTJS-5H` + `5J` at `insight-delivery.ts:245` | Sentry 30d | CoachHelm | `/golf/dashboard/stats` (insight delivery) | 498 + 449 | — | Null/undefined access in the CoachHelm insight-delivery path (`src/app/golf/actions/insight-delivery.ts`) at a single hot line |
| 4 | `NEXTJS-81` build error on `GET /` | Sentry 30d | Platform | Root `/` (landing) | 812 | — | Server/build error on the root route — RSC render or build-output failure |
| 5 | `NEXTJS-3V` / `8S` / `4C` "Functions cannot be passed" / "only plain objects can be passed to Client Components" | Sentry 30d + Vercel 7d | GolfHelm | ~14 golf dashboard routes + `POST /golf/dashboard/rounds/new` | 249 + 248 + 141 (Sentry); 27 events / 8 users (Vercel) | 8 (Vercel) | RSC serialization leak — a Server Component is passing a function or non-plain object across the server→client boundary |
| 6 | `NEXTJS-P` + `88` "unexpected response from server" | Sentry 30d | GolfHelm | `/golf/dashboard` | 309 + 298 | — | Server action / RSC returning a non-OK payload (an unhandled server error surfacing to the client) |
| 7 | `NEXTJS-9x` realtime `postgres_changes` callbacks added after `subscribe()` | Sentry 30d | BaseballHelm | Baseball settings / messages | ~5 groups, ~69–89 each | — | Supabase Realtime channel misuse — `.on('postgres_changes', …)` registered after the channel already subscribed |
| 8 | `NEXTJS-4E` `TimeoutError` | Sentry 30d | GolfHelm | `/golf/login` | 98 | — | Login request timing out — slow auth round-trip or blocked RSC on the login path |
| 9 | `NEXTJS-50` + `4Z` **"permission denied for table golf_rounds"** | Sentry 30d | GolfHelm | `POST /golf/dashboard/rounds/new` (round auto-save) | 92 | **3** | RLS / GRANT bug on `golf_rounds` blocking the round auto-save write |
| 10 | `NEXTJS-8F` `getCoachEngagement` failed | Sentry 30d | GolfHelm | `/golf/admin/crm` | 81 | — | CRM engagement query (`getCoachEngagement`, `src/app/golf/actions/crm-engagement.ts`) failing — bad query, missing column, or data-shape mismatch |
| 11 | APNs push failed **410 Unregistered** | Sentry 30d (`NEXTJS-60`) + Vercel 7d | CoachHelm / Platform push | cron `coachhelm-roster-sweep` (`/api/cron/coachhelm-roster-sweep`) | 72 (Sentry); 49 events / 7 users (Vercel) | 7 (Vercel) | Dead/expired APNs device tokens not pruned — cron keeps retrying unregistered tokens |
| 12 | `AuthApiError` Invalid Refresh Token (Not Found + Already Used) | Vercel 7d | Platform | `middleware` | ~34 | ~6 | Mostly expired/rotated sessions — **low concern** (expected auth churn, not a code defect) |
| 13 | "command-center roster pulse could not be loaded" | Vercel 7d | BaseballHelm | `/baseball/dashboard/command-center` | 5 | 2 | Command-center roster-pulse data load failing (query/permission/shape) |
| 14 | RLS violation creating `baseball_conversations` | Vercel 7d | BaseballHelm | `/baseball/dashboard/messages` | 3 | 2 | RLS policy blocks inserting a baseball conversation — messaging broken for affected users |
| 15 | Schema drift: `baseball_stat_visual_views.owner_user_id` does not exist | Vercel 7d | BaseballHelm | Baseball stats visuals | 1 | — | Code (`src/app/baseball/actions/stat-visual-views.ts`) references this column, so a migration is unapplied in prod / code is ahead of the DB |
| 16 | Schema drift (**unverified**): `baseball_coaches_2.first_name` does not exist | Vercel 7d | BaseballHelm | Baseball coach data | 1 | — | **No table `baseball_coaches_2` exists in the current code** — the canonical table is `baseball_coaches` (which does have `first_name`). Likely stale deployed code or a mis-transcribed Sentry/Vercel label. Confirm against a fresh pull before filing. |

**Reading it as a partner:** GolfHelm carries the loudest user-facing noise (hydration, serialization, "unexpected response"). CoachHelm has one hot crash line in insight delivery. BaseballHelm's issues are low-volume but structurally serious (RLS + schema drift = features that simply don't work for the people who hit them). Platform-level bundle/build errors (#1, #4) sit under everything and can amplify the rest.

---

## 2. Top actionable findings (prioritized by risk, not volume)

Ranked by business risk. This is the list an agent should turn into GitHub issues first.

| Rank | Finding | Why it's ranked here | Snapshot signal | Suggested labels ([Mission Control OS §6.1](../HELM_MISSION_CONTROL_OS.md)) | Claude-ready? |
|---|---|---|---|---|---|
| **1** | **`golf_rounds` permission-denied on round auto-save = RLS/GRANT bug** | Flagship GolfHelm core flow (recording a round) silently fails to save. Data-loss shaped, security-adjacent. | `NEXTJS-50` + `4Z`, 92 events, **3 users**, `POST /golf/dashboard/rounds/new` | `product:golfhelm` `surface:database` `severity:p0` `source:sentry` `demo-blocker` | **No — human review** (RLS/GRANT, touches security) |
| **2** | **"Functions → Client Components" serialization leak across ~14 golf routes** | Broad GolfHelm breakage; crashes/blank states on many dashboard routes and round creation. | `NEXTJS-3V/8S/4C`, 249+248+141 events; Vercel 27 events / 8 users | `product:golfhelm` `surface:dashboard` `severity:p1` `source:sentry` | **Yes** (RSC boundary fix, non-destructive) |
| **3** | **BaseballHelm schema drift — code ahead of prod DB** | `baseball_stat_visual_views.owner_user_id` is referenced by code but reported missing in prod — a migration is unapplied. (The paired `baseball_coaches_2.first_name` signal is **unverified** — see §1 #16 — so treat the *confirmed* drift as the actionable one.) | Vercel, 1 event (owner_user_id) | `product:baseballhelm` `surface:database` `severity:p1` `source:sentry` | **No — human review** (migration / prod DB) |
| **4** | **`baseball_conversations` RLS blocks messaging** | BaseballHelm messaging insert is denied by RLS — a whole feature is unusable for affected users. | Vercel, 3 events / 2 users, `/baseball/dashboard/messages` | `product:baseballhelm` `surface:database` `severity:p1` `source:sentry` | **No — human review** (RLS) |
| **5** | **Realtime `postgres_changes`-after-`subscribe()` misuse in Baseball** | Realtime updates (settings/messages) silently break; recurring across ~5 issue groups. | `NEXTJS-9x`, ~5 groups, ~69–89 events each | `product:baseballhelm` `surface:database` `severity:p2` `source:sentry` | **Yes** (client-side channel wiring fix) |
| **6** | **APNs 410 "Unregistered" dead push tokens not pruned; cron keeps retrying** | Wasted cron work + noisy errors; not user-blocking, but pollutes telemetry and the roster-sweep job. | `NEXTJS-60` 72 events; Vercel 49 events / 7 users, `coachhelm-roster-sweep` | `product:coachhelm` `surface:telemetry` `severity:p2` `source:sentry` | **No — human review** (production cron; token pruning is a data write) |

> **Deliberately down-ranked:** the `AuthApiError` refresh-token cluster (#12 in §1) is **expected session churn**, not a defect. Mark it `Ignored / Expected` in the Huly Telemetry space rather than opening an issue. The high-volume Platform bundle errors (#1/#4 in §1) are worth a **separate investigation** (likely deploy/chunk hygiene) but are not in the top-6 fix list because the root cause is "deploy state," not a discrete code bug — confirm against a clean production deploy before filing.

---

## 3. Which command-center questions this baseline answers

Mission Control's partner home is designed to answer ~10 partner questions ([HELM_MISSION_CONTROL_OS.md §5.1](../HELM_MISSION_CONTROL_OS.md), [HULY_WORKSPACE_SETUP.md §3](../HULY_WORKSPACE_SETUP.md)). This telemetry baseline directly feeds a subset:

| # | Command-center question | Answered here? | How |
|---|---|---|---|
| 1 | **What is broken in production?** | Yes — fully | §1 blast-radius table + §2 findings |
| 2 | **Is the app demo-ready?** | Partially | §2 flags `demo-blocker` candidates (golf_rounds auto-save, serialization leak) — inputs to the demo-readiness score ([OS §11.4](../HELM_MISSION_CONTROL_OS.md)) |
| 3 | **What is the current state of each product (Baseball / Golf / Coach / Train)?** | Partially | §1 is grouped by product; TrainHelm (a.k.a. Lift Lab) has no telemetry in this snapshot |
| 4 | **What is blocked / at risk?** | Partially | Schema-drift + RLS findings mark structurally blocked features |
| 5 | **What is Nick / Claude fixing now?** | Feeds it | §2 is the input queue; actual "in progress" state comes from GitHub/Huly once issues are opened |
| 6 | **What needs partner input / decisions?** | Feeds it | Human-review findings (#1, #3, #4, #6) surface decisions (apply migration? change RLS?) |
| 7 | What shipped this week? | Not this doc | Git Activity Timeline / Shipped view |
| 8 | What's on the roadmap (now/next/later)? | Not this doc | Product Roadmap space |
| 9 | What are customers / coaches saying? | Not this doc | Customer / Coach Intelligence space |
| 10 | What are competitors doing? | Not this doc | Competitive Intel space (also mirrored in the Notion command center) |

**Bottom line:** this document is the authoritative point-in-time answer to **"What is broken in production?"** and a primary feeder for demo-readiness and blocker questions.

---

## 4. How this feeds Mission Control

This baseline is a **snapshot**; the living version is the automation loop. The same signals flow into three surfaces:

### 4.1 Huly — Telemetry / App Health space
Each row in §1 maps to a Telemetry card ([HULY_WORKSPACE_SETUP.md §11](../HULY_WORKSPACE_SETUP.md)) using its fields: `Source` (Sentry/Vercel), `Product`, `Metric or error`, `Severity`, `Status`, `First seen` / `Last seen`, `Related GitHub issue`, `Related PR`, `Business impact`, `Next action`.
- Route §1 rows to the **Production Issues** view; the schema-drift + failed-deploy items to the **Failed Deploys** and **Broken Checks** views; the golf_rounds + serialization items to **Demo Risks**.
- Set status per finding: `New` for §2 top-6, `Ignored / Expected` for the refresh-token cluster.

### 4.2 n8n — Sentry → Fix Pipeline & Vercel Failed Deployment → Issue
- **Workflow C — Sentry to Fix Pipeline** ([N8N_WORKFLOW_SPECS.md §4](../N8N_WORKFLOW_SPECS.md)): classifies each Sentry issue (new/regression/spike), enriches with route/environment/release/commit, de-dupes against GitHub, opens a `source:sentry` issue, and decides `agent:ready` vs. `agent:needs-human-review`. Findings #1/#3/#4/#6 must route to **human review** (RLS, migration, cron); #2/#5 are **agent-ready**.
- **Workflow D — Vercel Failed Deployment to Issue** ([N8N_WORKFLOW_SPECS.md §5](../N8N_WORKFLOW_SPECS.md)): the schema-drift rows and the roster-pulse / `baseball_conversations` failures are the runtime clusters this workflow captures — it links the likely PR/commit, marks the related PR blocked in Huly, drops a **"Failed Deploys"** Telemetry entry, and redacts any log excerpt so no secret is posted into the issue.
- Every action produces a plain-English **Git Activity Timeline** event ([GIT_ACTIVITY_TIMELINE.md](../GIT_ACTIVITY_TIMELINE.md), event types `Sentry Issue Created` / `Vercel Deploy Failed`).

### 4.3 Notion command center (existing mirror)
A live Notion command center already mirrors these signals: **Incidents DB** (Sentry + Vercel), **Deploys DB** (Vercel), **PRs DB** (GitHub), **Roadmap**, **Competitors**, **CRM**. This baseline is a human-readable checkpoint of the same Incidents feed — the §1 table should reconcile 1:1 with open Incidents rows tagged `production`. Treat Notion Incidents and the Huly Telemetry space as **two views of one truth** (GitHub issues), not two truths.

---

## For Mission Control

How the three automation consumers should use this document:

- **n8n** — Treat this as a **reconciliation baseline, not a trigger source**. On the next scheduled Sentry/Vercel pull, diff live counts against §1: new clusters → run **Workflow C/D** ([N8N_WORKFLOW_SPECS.md §4–§5](../N8N_WORKFLOW_SPECS.md)) to open GitHub issues; clusters absent from a fresh pull → mark the matching Huly Telemetry card `Resolved` and emit a timeline event. Enforce the routing in §2 (`agent:ready` for #2/#5, `agent:needs-human-review` for #1/#3/#4/#6). Never auto-`agent:ready` anything touching RLS, migrations, or production cron ([OS §12.2](../HELM_MISSION_CONTROL_OS.md)). Keep the refresh-token cluster suppressed (`Ignored / Expected`).
- **Huly** — Seed/update the **Telemetry / App Health** space from §1 (one card per row) and mirror §2 into **Demo Risks**. Show partners the §2 findings and the §3 answer to "What is broken in production?" in the Mission Control home. Link each card to its GitHub issue so status stays single-sourced.
- **Greptile** — Use §2 as review context. When PRs touch `src/app/golf/actions/**` (golf_rounds writes), the RSC server→client boundary in golf dashboard routes, baseball migrations/RLS, or `src/app/golf/actions/insight-delivery.ts`, cross-check against these known production failures and against the **Hard rules** in `.greptile/rules.md` (sport-prefixed table names, `SUPABASE_SERVICE_ROLE_KEY` restricted to admin server paths, and every `CREATE TABLE` shipping with RLS + a policy). Flag any PR that would reintroduce finding #1 (missing GRANT/RLS on `golf_rounds`), #2 (passing functions/non-plain objects to Client Components), or #3 (code referencing columns not present in the production DB).

> **Freshness rule:** regenerate this baseline on each telemetry pull. If it is older than the last production deploy, treat it as **stale** — the live Huly Telemetry space and Notion Incidents DB are authoritative; this markdown is the point-in-time checkpoint. No secrets, tokens, or PII belong in this file — pointers and aggregate counts only.
