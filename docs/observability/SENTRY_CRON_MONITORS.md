<!-- markdownlint-disable MD013 -->
# Sentry Cron Monitor check-ins

What emits a Sentry Cron Monitor check-in today, what the monitor slug and
expected schedule are, and — per job — what breaks silently if it stops and
nobody is watching a dashboard.

Anchor SHA for the "current" claims below:
`git rev-list --count fea6a6035..HEAD -- 'src/**' 'scripts/**'` to see how far
the code has moved since this was written (Phase C, cron-monitoring
deliverable).

---

## 1. Why this exists

Phase A (`SENTRY_PHASE_A_FINDINGS.md` §(d)) found `automaticVercelMonitors: true`
configured in `next.config.mjs` but structurally inert — it lived in an
argument position the installed `withSentryConfig` never read (fixed
separately, `src/lib/sentry-build-options.mjs`) — and **zero** manual
`captureCheckIn`/`withMonitor` call sites anywhere in the repository.

`recordJobRun` (`src/lib/admin/job-log.ts`) already catches a job that RUNS
and FAILS: it writes a `background_job_logs` row and, on failure, an
`admin_events` row via `logServerEvent`. What it could never catch is a job
that never runs at all — Vercel's scheduler silently failing to invoke it,
the deployment paused, a crash before `recordJobRun`'s own try/catch even
starts. That is exactly the case a Sentry Cron Monitor's missed check-in
alert exists for, and exactly the gap this deliverable closes.

## 2. Mechanism, by trigger type

| Trigger | Wired via | Slug convention | Monitor schedule |
| --- | --- | --- | --- |
| Vercel cron (`vercel.json`) | `recordJobRun` → `src/lib/observability/cron-monitors.ts` | `api-cron-<path>` (slashes to dashes), derived from the route path | The REAL crontab schedule, from `CRON_REGISTRY.schedule` — byte-identical to `vercel.json`, contract-tested |
| A `recordJobRun` call with no `CRON_REGISTRY` entry (manual-trigger-only route, or a sub-step inside another job's single invocation) | Same `cron-monitors.ts`, same `recordJobRun` | `job-<jobType>` | A deliberately generous 30-day fallback interval (see below) |
| Inngest function (`src/lib/inngest/functions.ts`) | The shared `withBridgeLogging(fnId, run)` wrapper every function routes through | `job-<function id>` (no `CRON_REGISTRY` entry — Inngest scheduling isn't `vercel.json`) | Same 30-day fallback |
| launchd Repair job (`scripts/run-selfheal-repair.mjs`) | `scripts/lib/sentry-cron-checkin.mjs` — a standalone, dependency-injectable equivalent of `cron-monitors.ts` (that module can't be imported from a bare Node script: no `@/` path alias / Next bundler outside `next build`/`next dev`) | `job-selfheal-repair` | Hand-built (`{type:'interval', value:1, unit:'day'}`, `checkinMargin:15`) matching `selfheal-registry.ts`'s `cadenceMinutes: DAILY` for this job |

**Every check-in carries a `monitorConfig` — never omitted.** Sentry's own
"upsert" mechanism only creates/attaches a monitor when `monitor_config` is
present on the check-in payload (per
`docs.sentry.io/product/monitors-and-alerts/monitors/crons/getting-started/http/`);
what happens to a check-in for a slug Sentry has never seen with NO config is
not documented, and that ambiguity is exactly the risk `cron-monitors.ts`
refuses to take — instrumentation that silently achieves nothing is worse
than none, because it reports success. So a `jobType` with a real
`CRON_REGISTRY` entry gets its actual crontab schedule (5-minute
`checkinMargin`, 30-minute `maxRuntime`); everything else gets a
deliberately GENEROUS fallback — a 30-day interval, 60-minute margin,
120-minute max runtime — wide enough that no legitimate gap in usage (an
Inngest function that goes quiet during an off-season, a manually-triggered
route nobody has run this week) should trip a false "missed check-in". The
fallback exists to guarantee the monitor gets created and the check-in
lands, not to assert a cadence nothing guarantees.

Every check-in call in all four paths is **fail-open**: a Sentry outage, a
malformed slug, a thrown SDK call — none of it can affect the wrapped job's
own outcome, timing, or exit code. See each module's own header comment for
the specific guarantee.

**Why `automaticVercelMonitors` is `false`, not `true`, in
`src/lib/sentry-build-options.mjs`.** Phase A named it among the casualties
of the `withSentryConfig` argument-position bug and its fix folded the option
name back into the second argument, as instructed — but read live against
the installed SDK's own build-time source
(`node_modules/@sentry/nextjs/build/cjs/server/vercelCronsMonitoring.js` and
`.../config/withSentryConfig/getFinalConfigObjectUtils.js`), turning it on
would inject a SECOND, independent Cron Monitor mechanism at Vercel build
time: span-wrapped around each cron route, gated on a `vercel-cron`
user-agent header, monitor slug = the RAW `vercel.json` path
(`/api/cron/log-retention`, not this file's dashed `api-cron-log-retention`),
`maxRuntime` hardcoded to 12 hours regardless of the job. That is a second
monitor covering the same job as `cron-monitors.ts`'s own per-job
`captureCheckIn` call — the exact duplicate-capture shape Phase A findings
#4-#6 (fixed elsewhere in this same deliverable set) exist to eliminate, not
recreate one option away. Kept `false` so `cron-monitors.ts` stays the
single, tested authority. See `src/lib/sentry-build-options.mjs`'s own header
for the full trace through the SDK source, and
`src/lib/__tests__/sentry-build-options.test.ts` for the pinning test.

**Gating.** `recordJobRun`/Inngest check-ins default OFF outside a real
Vercel production/preview deployment (`shouldEmitCronCheckIns()` in
`cron-monitors.ts`, keyed on the same `getRuntimeEnv()` the rest of the
Bridge pipeline trusts) — a local test run or CI job never writes fake
monitor history into the shared Sentry project. `HELM_SENTRY_CRON_CHECKINS=true`
forces them on to rehearse against a real project. The launchd script instead
defaults to ON whenever a Sentry DSN is configured (it never runs in CI/tests
except via the two `spawnSync` fixtures in `run-selfheal-repair.test.ts`,
which pass a bare env with no DSN and so no-op for free) —
`HELM_SENTRY_CRON_CHECKINS=false` is its manual kill-switch.

**Environment.** Every check-in inherits `Sentry.init()`'s own
`release`/`environment` — the SDK attaches those centrally
(`server-runtime-client.js`'s `captureCheckIn`, confirmed by reading the
installed source, not just its types). The launchd script is the one
exception: it runs its own minimal `Sentry.init()` (it isn't part of the
Next.js process at all) and deliberately tags `environment: 'launchd-repair'`,
never `'production'` — this repo treats "never mislabel a non-Vercel run as
production" as a hard invariant elsewhere (`src/lib/sentry-environment.ts`),
and a distinct tag keeps this job's Cron Monitor history visibly separate
from Vercel-hosted crons in the Sentry UI.

## 3. Job table — Vercel crons (`CRON_REGISTRY` / `vercel.json`)

Schedule strings are byte-identical to `vercel.json` (contract-tested,
`src/lib/admin/__tests__/cron-registry.test.ts`). `checkinMargin: 5`,
`maxRuntime: 30`, `timezone: 'UTC'` for every row in this table — sane
defaults; `CRON_REGISTRY` carries no separate expected-duration field per job,
so nothing here claims a more precise number than that. "What breaks
silently" is carried forward from `SENTRY_PHASE_A_FINDINGS.md` §(d), which
read each route where it says CONFIRMED and flagged the rest UNKNOWN rather
than guessing.

| Job (`jobType`) | Schedule | Monitor slug | What breaks if it silently stops |
| --- | --- | --- | --- |
| `coachhelm-validation` | `15 * * * *` (hourly) | `api-cron-coachhelm-validation` | UNKNOWN — not independently traced; name suggests CoachHelm insight validation. |
| `coachhelm-calibration` | `40 3 * * *` (daily) | `api-cron-coachhelm-calibration` | UNKNOWN — name suggests confidence-calibration model refresh. |
| `coachhelm-safety-net` | `*/30 * * * *` (every 30 min) | `api-cron-coachhelm-safety-net` | UNKNOWN — frequency suggests a fallback/catch-up sweep. |
| `coachhelm-insight-lifecycle` | `0 4 * * *` (daily) | `api-cron-coachhelm-insight-lifecycle` | UNKNOWN — likely insight expiry/archival. |
| `coachhelm-roster-sweep` | `0 2 * * *` (daily) | `api-cron-coachhelm-roster-sweep` | CONFIRMED: reads roster rows and reports per-player outcomes — a silent stop means roster-driven CoachHelm state drifts unnoticed. |
| `event-reminders` | `0 * * * *` (hourly) | `api-cron-event-reminders` | CONFIRMED: calendar event RSVP reminders, including push notifications — a silent stop means players/coaches stop getting event reminders with no signal anywhere. |
| `task-reminders` | `0 * * * *` (hourly) | `api-cron-task-reminders` | CONFIRMED: task due-date reminders, including push — same silent-stop risk as `event-reminders`. |
| `v3-standing-refresh` | `20 2 * * *` (daily) | `api-cron-v3-standing-refresh` | UNKNOWN — likely CoachHelm v3 standing/ranking recompute. |
| `v3-genome-nightly` | `40 2 * * *` (daily) | `api-cron-v3-genome-nightly` | CONFIRMED, and already happened: reported `completed` 47 times across six weeks while writing nothing (`golf_player_genome` frozen) — a job that did nothing was indistinguishable from a job that did everything until `extractOutcomeMetadata`'s whitelist-vocabulary bug was fixed separately. |
| `v3-causality-attribute` | `0 3 * * *` (daily) | `api-cron-v3-causality-attribute` | UNKNOWN. |
| `v3-goal-suggestions-write` | `20 3 * * *` (daily) | `api-cron-v3-goal-suggestions-write` | UNKNOWN. |
| `v3-goal-suggestions-evaluate` | `20 4 * * *` (daily) | `api-cron-v3-goal-suggestions-evaluate` | UNKNOWN. |
| `integrity-check` | `0 7 * * *` (daily) | `api-cron-integrity-check` | UNKNOWN, but name suggests data-integrity verification — a check that stopped checking looks identical to "nothing wrong", making its own silent failure especially high-consequence. |
| `log-retention` | `30 7 * * *` (daily) | `api-cron-log-retention` | Heaviest-instrumented route read this pass. Also runs `selfheal-close` as a sub-step (see §4) — Self-Heal's Close stage heartbeat rides on this job actually firing. |
| `admin-digest` | `0 11 * * *` (daily) | `api-cron-admin-digest` | CONFIRMED: builds and sends the daily "Cup of Helm" ops email — a silent stop means the owner's one daily digest of shipped PRs, Sentry issues, and deploy freshness never arrives, with nothing else surfacing that absence (the digest IS the alerting mechanism for several OTHER signals). |
| `refresh-engagement` | `10 */4 * * *` (every 4h) | `api-cron-refresh-engagement` | UNKNOWN. |
| `ingest-gmail-replies` | `*/30 * * * *` (every 30 min) | `api-cron-ingest-gmail-replies` | Best-covered of this table for the "degraded but still running" case (its own self-throttled daily alert on degraded auth state) — the pure "never invoked at all" case is exactly what this monitor now adds. |
| `helm-debug-prune` | `30 4 * * *` (daily) | `api-cron-helm-debug-prune` | UNKNOWN, but name suggests `helm_debug`/Flight Recorder retention cleanup — a silent stop would eventually degrade Flight Recorder correlation (`SENTRY_PHASE_A_FINDINGS.md` §(g)) via unbounded table growth, not an immediate user-facing break. |
| `reliability-triage` | `0 */3 * * *` (every 3h) | `api-cron-reliability-triage` | UNKNOWN specifics; likely feeds the admin reliability dashboard directly — a silent stop would make that dashboard stale without saying so. |

## 4. `recordJobRun` calls with no Vercel schedule

These still get a check-in (slug `job-<jobType>`), with the generous 30-day
fallback `monitorConfig` described in §2 — never no config at all.

| `jobType` | What it actually is |
| --- | --- |
| `selfheal-close` | A sub-step INSIDE `log-retention`'s single invocation (`runAutoResolve` in that route), not itself Vercel-scheduled — it is Self-Heal's Close-stage heartbeat, deliberately reported separately from `log-retention`'s own success so retention succeeding is never read as evidence about Close. |
| `v3-weekly-coach-email` | Not yet in `vercel.json` — the route's own header comment says "Schedule: configured in vercel.json (operational follow-up)", i.e. scheduling it is a known open item, not an oversight this deliverable should silently paper over. |
| `v3-genome-backfill-oneshot` | A deliberate one-shot manual backfill ("Used once after the schema lands to seed the vector for everyone") — accepted trade-off: Cron Monitors assume recurrence, so this job's monitor will eventually read "missed" once the fallback interval elapses after its one real run, and that is left as-is rather than adding more special-casing for a monitor nobody is expected to watch closely. `background_job_logs` (recordJobRun's own row) remains the primary record of whether it ran. |
| `v3-ingest-sync` | Not in `vercel.json`; no comment stating why. Flagged as an open question, same as Phase A left it — not resolved by this deliverable. |

## 5. Known gap this deliverable did NOT close

`SENTRY_PHASE_A_FINDINGS.md` §(d) named two routes with **zero**
`recordJobRun` references at all: `/api/cron/process-sequences` and
`/api/cron/v3/standing-backfill`. Neither is in `vercel.json` either. This
deliverable extends `recordJobRun` and therefore reaches every job that
already calls it — it does not add `recordJobRun` to these two, because
Phase A's own read left it genuinely unresolved whether they are dead code,
manually/Inngest-triggered by design, or an actual gap, and guessing which
would risk instrumenting something deliberately uninstrumented. Carried
forward as an open question, not silently dropped.

## 6. Inngest functions

| Function id (`inngest.createFunction`'s `id`) | Trigger | Monitor slug |
| --- | --- | --- |
| `weekly-health-ping` | `cron: '0 14 * * 1'` (Mondays 14:00 UTC) | `job-weekly-health-ping` |
| `inngest-health-probe` | event: `helm/health.ping` | `job-inngest-health-probe` |
| `coachhelm-round-submitted` | event: `coachhelm/round.submitted` | `job-coachhelm-round-submitted` |

Only `weekly-health-ping` has an actual cadence — it still resolves through
`resolveCronMonitorConfig`'s CRON_REGISTRY lookup only, so even it currently
gets the 30-day fallback rather than its real weekly cron, since
CRON_REGISTRY is Vercel-scoped by design (see §1's naming: it's
contract-tested against `vercel.json` and Inngest scheduling isn't
`vercel.json`). The other two Inngest functions are event-triggered and have
no expected schedule at all. All three get the same generous 30-day fallback
either way — see §2 — and all three route through the shared
`withBridgeLogging` wrapper, so the check-in and the existing Bridge error
logging stay in one place rather than being duplicated per function.

`isInngestConfigured()` failing (both `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`
have been rejected in production per this session's own tracked state — not
independently re-verified live by this deliverable) already has its own
separate detection path (`instrumentation.ts`'s
`reportInngestCredentialFault('startup')`) — these check-ins are additive to
that, not a replacement for it: a credential fault stops the SEND from ever
reaching Inngest, so the function never runs and never gets to start its own
check-in either. Both signals point at the same underlying problem from two
different places.

## 7. launchd Repair job

One check-in pair per invocation, around the whole run (`in_progress` at
start, resolved in `finish()`):

- `heartbeat-present` (Claude wrote its own final heartbeat — the run
  completed its contract, whatever that heartbeat itself says about the
  REPAIR work's own success) → `ok`.
- `fallback-written` / `fallback-failed` (a successful read proved no
  heartbeat exists — the run failed at the runner/outer level) → `error`.
- `heartbeat-state-unknown` (the heartbeat store itself was unreadable —
  genuinely unknown, not absent) → deliberately left `in_progress` rather
  than guessed either way, mirroring `reconcileRepairRun`'s own
  "unreadable != absent" rule. Sentry's own `maxRuntime` eventually flags an
  abandoned `in_progress` check-in as a problem on its own.

A silent stop here means Repair — the automated candidate-to-PR routine
described in `selfheal-registry.ts` — simply never runs, with no signal
beyond whatever `/admin/self-heal` shows once someone opens it. This was the
literal failure mode `scripts/lib/selfheal-repair-runner.mjs`'s own fallback
heartbeat exists to catch one layer down (a 30-minute hang that wrote
nothing); this check-in catches the layer above that: launchd never invoking
the script at all (machine asleep, launchd unloaded, plist misconfigured).
