# Helm Bridge Command Center — Implementation Plan

> **For agentic workers:** execute this plan with `superpowers:subagent-driven-development` — one wave file per worker session, tasks in order, strict TDD, commit per task.

**Goal:** Build Helm Bridge — ONE Nick-only, server-rendered command center at `/admin` that unifies error triage (live Sentry pull + the mature `admin_events` pipeline), auth visibility, golf/baseball/Lift-Lab operations, cron/data-integrity monitoring, deploy visibility, read-only impersonation, and a daily ops digest — then retires the old non-CRM admin surfaces.

**Architecture:** A new `src/app/admin/*` route group of per-panel React Server Components behind a three-layer gate (middleware allowlist → shared `requireSuperAdmin()` first-line everywhere → deny-by-default RLS via new `is_super_admin()` + `admin_allowlist`). Reads go through a fail-soft server-only data layer (`src/lib/admin/**`: `sentry-api.ts`, `vercel-api.ts`, `data/*`) that extends — never forks — the existing `admin_events`/`error_logs` pipeline (additive columns, backward-compatible writers for ~230 importers) and calls the existing `get_admin_*_rollup` SECURITY DEFINER RPCs with the admin's user-scoped client. Presentation composes the existing Fairway kit (warm-black rail, StatTile, InstrumentPanel-style banner) with sport accent inks as wayfinding — golf green and a NEW baseball clay token (the `.living-annual` scope in older docs does not exist in code).

**Tech Stack:** Next.js ^16.0.10 (App Router, `next build --webpack`), React ^19.2.7, TypeScript ^5.9.3 strict, Tailwind ^3.4.19 (NO v4 syntax), @supabase/ssr ^0.10.3 + supabase-js ^2.107.0 (shared PROD DB), @sentry/nextjs ^10.56.0 (SDK ingest already complete; this project adds the READ side), Vercel REST v6, Resend ^6.7.0 (dedicated ops client only), Vitest ^4 (`unit` project), node >= 20.16.0.

**Binding inputs:** `docs/superpowers/specs/2026-07-01-helm-bridge-command-center-design.md` (reconciled spec — supersedes `_discovery/design.json` on every reground delta), `docs/superpowers/specs/helm-bridge/DECISIONS.md` (owner-locked; do not re-litigate).

---

## Global Constraints

Copied verbatim project rules — every wave obeys ALL of these:

**Commands (from `package.json` — use these exact scripts):**
```bash
npm run typecheck          # tsc --noEmit
npm run lint               # eslint "src/**/*.{ts,tsx}" --max-warnings 6000
npm run test:run           # vitest run --project unit  (fast gate, run per task)
npm run test:run -- <path> # single-file red/green loop
npm run test:all           # every vitest project (CI parity)
npm run build              # next build --webpack (needs env; run before PR)
npm run db:types           # regenerate src/lib/types/database.ts after ANY migration (needs SUPABASE_PROJECT_ID)
```

**Safety rails (non-negotiable, from DECISIONS.md — shared PROD DB serving live golf + baseball users):**
1. **Additive-only DDL.** Columns land BEFORE any emitter references them (schema-drift gotcha: fields silently drop otherwise).
2. **Every migration ends with `REVOKE ALL ... FROM anon, authenticated` on new objects + an ACL-assertion `DO` block** (`has_table_privilege`/`has_function_privilege`) that FAILS the migration on drift. Verify applied state via `information_schema`/`pg_proc` — `schema_migrations` is unreliable in this project. Migrations are applied to prod via Supabase MCP `apply_migration`.
3. **Call existing `get_admin_*_rollup` SECURITY DEFINER RPCs with the admin's USER-SCOPED client** (`createClient()` from `@/lib/supabase/server`), never `createAdminClient()` — they Forbid when `auth.uid()` is NULL (documented 509-storm, `admin-data.ts:35-44`).
4. **All new event emitters are fire-and-forget** (swallowed try/catch) — logging must NEVER fail or slow a live user request.
5. **`requireSuperAdmin()` is the FIRST LINE** of the `/admin` layout, every `/admin` page, every `src/app/admin/actions/*` export. Enforced by the W1 gate-coverage contract test. Only after it passes may code touch `createAdminClient()`, `SENTRY_READ_TOKEN`, or `VERCEL_API_TOKEN`.
6. **`import 'server-only'`** on every module that reads a token (`sentry-api.ts`, `vercel-api.ts`, `require-super-admin.ts`, `data/*`). Tokens are never `NEXT_PUBLIC_`.
7. **CRM is untouchable.** Never read/write/import: `src/app/golf/admin/crm/**`, the 14 `crm-*.ts` action files + `resend-activity.ts`, `src/lib/crm/**`, all `crm_*` DB objects + `emails`/`email_events`/`email_clicks`, `RESEND_*`/`GMAIL_SA_*`/`CRM_UNSUB_SECRET` env. The digest uses the dedicated transport (`OPS_DIGEST_RESEND_API_KEY`) only. No event-log hooks into CRM code paths.
8. **W0 ships before any `/admin` code** (`handle_new_user` fix is a hard precondition). **W1's route + middleware matcher + native-UA exclusion + AdminNativeGuard ship in ONE PR** (App Store 4.2.2/3.1.1).
9. **No Supabase Realtime in v1** — 30–60s visibility-aware polling only (SELECT-RLS leak risk on `admin_events` unverified).
10. **Never modify `src/components/fairway/**`** — compose the kit, don't fork it. Tailwind is v3.4: config-file extensions only.
11. **Writers stay backward-compatible:** `admin_events` changes are additive columns; `logServerError`/`logServerException`/`logServerEvent`/`admin-logger` signatures are frozen (≈230 importers). Readers change; writers don't break.
12. **`'use server'` files:** exported server actions must be async functions — if a `const`-export wrapper trips the build, use the async-delegation form (known gotcha, documented in W6 Task 2).
13. **Retention accompanies write volume:** any wave adding sustained new writes ships/depends on the retention cron (W11).
14. Repo conventions: types from `@/lib/types`, sport-prefixed table names, no `any`, no `console.log` in committed code, conventional-commit messages.

---

## File Structure

New or modified paths and their single responsibility (C=create, M=modify, D=delete):

```
supabase/migrations/
  20260701100000_fix_handle_new_user_role_cast.sql        C  W0  restrict signup role cast to player|coach + ACL assert
  20260701110000_admin_allowlist_is_super_admin.sql       C  W1  allowlist table + is_super_admin() + Nick seed + ACL assert
  20260701120000_admin_events_bridge_columns.sql          C  W2  sport/team_id/fingerprint/source + indexes + legacy-grant revoke
  20260701130000_bridge_rpcs_sessions_resolve.sql         C  W3  get_active_sessions() + resolve_admin_event()
  20260701140000_revoke_user_sessions_rpc.sql             C  W7  sign-out-everywhere RPC (audit-logged)
  20260701150000_run_integrity_checks_rpc.sql             C  W11 nightly checks incl. anon-grant-drift watchdog (service_role-only)
  20260701160000_harden_admin_definer_acls.sql            C  W14 revoke anon EXECUTE on get_admin_*/is_admin family

src/lib/admin/
  super-admin-shared.ts        C  W1  edge-safe pure gate helpers (parse/isAdminPath/evaluateAdminGate)
  require-super-admin.ts       C  W1  THE server gate: requireSuperAdmin() + checkSuperAdminAccess()
  fetch-result.ts              C  W3  AdminFetchResult<T> fail-soft envelope + ok/failed/unconfigured
  sentry-api.ts                C  W3  server-only Sentry READ client (issues/stats/sessions, 60s cache, 3-page cursor cap)
  vercel-api.ts                C  W3(+W12) server-only Vercel deployments + web-insights clients
  rls-denial.ts                C  W6  isRlsDenial + maybeCaptureRlsDenial (capture class #1)
  observed-action.ts           C  W6  withAdminObserved server-action wrapper (capture class #2)
  view-as.ts                   C  W10 HMAC-signed read-only impersonation token (15-min TTL)
  job-log.ts                   C  W11 recordJobRun → background_job_logs (capture class #4)
  cron-registry.ts             C  W11 code-defined cadence registry + OVERDUE classifier
  deploy-marker.ts             C  W12 idempotent event_type='deploy' row per prod sha
  digest/build-digest.ts       C  W13 pure digest email builder (reds-first)
  digest/transport.ts          C  W13 DEDICATED ops Resend client (own secret; zero CRM)
  data/triage.ts               C  W3  mergeTriage (users-first ranking) + fetchTriageQueue
  data/overview.ts             C  W5  KPI snapshot + banner state + watch-the-watcher staleness
  data/errors.ts               C  W6  errors-tab fetch + URL filter parsing + fingerprint detail
  data/auth.ts                 C  W7  auth feed/lockouts/burst/funnel + fetchActiveSessions (user-scoped RPC)
  data/golf.ts                 C  W8  golf rollup consumption + classifyTeamHealth + llm spend
  data/baseball.ts             C  W9  C5 rollup + Lift Lab + classifyReadiness zero-states
  data/users.ts                C  W10 directory/detail/at-risk (classifyAtRisk)
  data/jobs.ts                 C  W11 cron board + integrity grid + log-table health

src/app/admin/
  layout.tsx                   C  W1(+W4) probe-gated layout → AdminNativeGuard + motion + AdminShell
  _motion-provider.tsx         C  W1  LazyMotion(domAnimation) at the route root
  page.tsx                     C  W1(placeholder)→W5 Overview: banner/KPIs/triage/deploy rail/watcher
  errors/page.tsx              C  W6  errors drill-down (chips in URL)
  errors/[fingerprint]/page.tsx C W6  per-incident event list + stacks + user links
  auth/page.tsx                C  W7  sign-in feed / lockouts / sessions / funnel
  golf/page.tsx                C  W8  golf pulse + team health + llm spend + demo strip
  golf/tracer/page.tsx         C  W8  ported Tracer suite (read + gated fix)
  baseball/page.tsx            C  W9  clay-inked baseball + Lift Lab + readiness
  users/page.tsx               C  W10 directory + teams + at-risk (CRM link-out only)
  users/[id]/page.tsx          C  W10 per-user drill-down + sessions revoke + view-as entry
  users/[id]/view-as/page.tsx  C  W10 READ-ONLY impersonation surface (token + banner)
  jobs/page.tsx                C  W11 cron board / integrity grid / log health / Inngest state
  deploys/page.tsx             C  W12 deployments / current build / release health / traffic
  actions/triage.ts            C  W3  resolveTriageEvents (user-scoped RPC)
  actions/sessions.ts          C  W7  revokeSessionsForUser (audited)
  actions/golf-tracer.ts       C  W8  Tracer delegations behind requireSuperAdmin
  actions/baseball-demo.ts     C  W9  demo-sessions delegation
  actions/view-as.ts           C  W10 enterViewAs/exitViewAs (audit_log both ways)
  _components/                 C  W4-W5 AdminShell, admin-nav, SportBadge, AdminStatusBanner, KpiTile,
                                     PanelBoundary, PanelStates, TriageQueue, AutoRefresh, ErrorsOverTime,
                                     TeamHealthTable, SessionsPanel, ViewAsBanner
  __tests__/admin-gate-coverage.test.ts C W1 contract: every entry point calls the gate

src/app/api/
  internal/log-auth-failure/route.ts   C  W7  edge→node capture bridge (shared-secret header)
  cron/integrity-check/route.ts        C  W11 nightly named SQL checks → admin_events source='integrity'
  cron/log-retention/route.ts          C  W11 info 90d / error+critical 13mo, bounded batches
  cron/admin-digest/route.ts           C  W13 daily digest assembly + dedicated send
  cron/__tests__/cron-job-log-coverage.test.ts C W11 contract: every registered cron calls recordJobRun
  cron/*/route.ts (14 existing)        M  W11 wrap post-auth body in recordJobRun (byte-identical logic inside)
  log-error/route.ts                   M  W7  accept unauthenticated + anonymous flag (rate limit kept)

src/ (existing files touched)
  proxy.ts                             M  W1(+W7) '/admin' in APP_ROUTE_PREFIXES; middleware-failure capture fetch
  lib/supabase/middleware.ts           M  W1  evaluateAdminGate matcher after getUser()
  lib/server-error-logger.ts           M  W2(+W6) additive context fields (sport/teamId/dbFingerprint) + source-union extension
  lib/admin-logger.ts                  M  W2  additive input fields; login/signup/security tag source='auth'
  instrumentation.ts                   M  W7(+W12) narrow 'AuthApiError' ignore; boot-time deploy marker hook
  app/golf/actions/golf.ts             M  W0(+W6) logServerException migration; savePartialRound observed-wrapper
  app/golf/actions/auth.ts             M  W7(+W14) password-reset event; admin redirect → /admin
  app/baseball/actions/auth.ts         M  W7  logLogin/logSignup/logSecurityEvent (sport='baseball')
  app/lifting/actions/auth.ts          M  W7  same (sport='shared')
  styles/design-tokens.css             M  W4  --fw-color-team-baseball: #C2703D
  tailwind.config.ts                   M  W4  'team-baseball' color
  vercel.json                          M  W11(+W13) integrity-check, log-retention, admin-digest schedules
  lib/error-monitoring.ts              D  W0  deleted (10 call sites migrated)
  app/golf/admin/page.tsx              M  W14 → redirect('/admin'); CRM subtree + layout gate PRESERVED
  app/golf/admin/components/* (non-CRM) D W14 grep-gated deletion
  app/baseball/admin/                  D  W14 unguarded page retired
  app/golf/actions/admin-people-data.ts, admin-system-data.ts D W14 dead code (grep-gated)
```

## Execution Order

Waves are sequential by default; marked pairs may run in parallel once their shared dependency is merged.

1. **W0** — P0 security prereqs (3 independent tiny PRs; nothing else starts until the trigger fix is live)
2. **W1** — auth foundation (migration + gate + middleware + `/admin` shell; owner sets `SUPER_ADMIN_USER_IDS` at merge)
3. **W2** — `admin_events` additive schema + writer extension
4. **W3** — server data layer (Sentry/Vercel clients, RPCs, triage merge)
5. **W4** — design foundation (chrome, clay ink, panel pattern) — *may run parallel to W3 (both depend only on W1/W2)*
6. **W5** — Overview tab (needs W3 + W4)
7. **W6** — Errors tab + rls_denial + withAdminObserved
8. **W7** — Auth & Sign-ins + capture coverage — *may run parallel to W6*
9. **W8** — Golf tab + Tracer port
10. **W9** — Baseball tab + Lift Lab — *may run parallel to W8*
11. **W10** — Users & Teams + drill-downs + read-only impersonation
12. **W11** — Jobs & Integrity (cron wiring + integrity + retention)
13. **W12** — Deploys & Infra + deploy markers — *may run parallel to W11*
14. **W13** — daily digest (needs W11's recordJobRun + registry)
15. **W14** — retirement + hardening + final QA (ONLY after W5–W13 verified in prod)

## Table of Contents

| Wave | File | Scope |
|---|---|---|
| W0 | [waves/w00-security-prereqs.md](helm-bridge/waves/w00-security-prereqs.md) | trigger fix · test-admin downgrade · error-monitoring replacement |
| W1 | [waves/w01-auth-foundation.md](helm-bridge/waves/w01-auth-foundation.md) | allowlist migration · gate helpers · middleware · /admin shell · contract test |
| W2 | [waves/w02-admin-events-schema.md](helm-bridge/waves/w02-admin-events-schema.md) | additive columns/indexes · legacy-grant revoke · writer extension |
| W3 | [waves/w03-server-data-layer.md](helm-bridge/waves/w03-server-data-layer.md) | sessions/resolve RPCs · sentry-api · vercel-api · triage merge |
| W4 | [waves/w04-design-foundation.md](helm-bridge/waves/w04-design-foundation.md) | clay ink token · AdminShell · banner/KPI · PanelBoundary |
| W5 | [waves/w05-overview.md](helm-bridge/waves/w05-overview.md) | banner · KPI strip · triage queue · regressed · deploy rail · watcher |
| W6 | [waves/w06-errors-tab.md](helm-bridge/waves/w06-errors-tab.md) | RLS-denial capture · withAdminObserved · errors drill-down |
| W7 | [waves/w07-auth-signins.md](helm-bridge/waves/w07-auth-signins.md) | auth coverage · middleware bridge · sessions+revoke · funnel |
| W8 | [waves/w08-golf-tab.md](helm-bridge/waves/w08-golf-tab.md) | golf pulse · team health · LLM spend · Tracer port |
| W9 | [waves/w09-baseball-tab.md](helm-bridge/waves/w09-baseball-tab.md) | C5 rollup · Lift Lab · readiness zero-states · demos |
| W10 | [waves/w10-users-teams-impersonation.md](helm-bridge/waves/w10-users-teams-impersonation.md) | directory · drill-down · read-only view-as |
| W11 | [waves/w11-jobs-integrity.md](helm-bridge/waves/w11-jobs-integrity.md) | recordJobRun · 14-route wiring · integrity cron · retention · jobs tab |
| W12 | [waves/w12-deploys-infra.md](helm-bridge/waves/w12-deploys-infra.md) | deploy markers · deployments table · release health · traffic |
| W13 | [waves/w13-daily-digest.md](helm-bridge/waves/w13-daily-digest.md) | digest builder · dedicated transport · 10:00 UTC cron |
| W14 | [waves/w14-retirement-hardening.md](helm-bridge/waves/w14-retirement-hardening.md) | old-admin retirement · anon-EXECUTE hardening · final QA |

## Owner-Provisioning Checklist

Everything Nick must provide. The build is fail-soft: nothing blocks on these except where marked; unprovisioned panels render honest "not configured" states.

| # | Item | Where | Scope / value | Needed by | Blocking? |
|---|---|---|---|---|---|
| 1 | Confirm `admin@helmsportslabs.com` `auth.users.id` | Supabase (W1 does it via MCP) | seed for `admin_allowlist` | W1 | YES (gate seed) |
| 2 | `SUPER_ADMIN_USER_IDS` | Vercel env (Prod+Preview, server-only) + `.env.local` | Nick's auth uuid (comma list supported) | W1 merge | YES (gate fails closed without it — nobody enters) |
| 3 | Approve test-admin downgrade execution | — (pre-approved OQ1) | `admin-ui-1779052548996@golfhelm.local` → player | W0 | YES |
| 4 | `SENTRY_READ_TOKEN` | Vercel env, server-only | NEW internal-integration/user token: `org:read` + `project:read` + `event:read`. NEVER reuse CI `SENTRY_AUTH_TOKEN` | W3+ live Sentry tiles | No (tiles show "not configured") |
| 5 | Verify `SENTRY_ORG` / `SENTRY_PROJECT` set at runtime | Vercel env | `helm-xs` / `javascript-nextjs` | W3 | No |
| 6 | Verify/create `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` + `VERCEL_TEAM_ID` | Vercel dashboard (team-scoped vars are INVISIBLE to `vercel env pull` — check the UI before duplicating) | minimally-scoped token; IDs in `.vercel/project.json` | W3+ deploy tiles | No |
| 7 | Verify `SENTRY_AUTH_TOKEN` exists at BUILD time | Vercel env | else sourcemaps silently degrade (plugin `silent:true`) | anytime | No |
| 8 | `INTERNAL_LOG_KEY` | Vercel env, server-only | any 32+ char random secret (middleware→node log bridge) | W7 | No (bridge no-ops) |
| 9 | `ADMIN_IMPERSONATION_SECRET` | Vercel env, server-only | any 32+ char random secret | W10 | No (view-as disabled) |
| 10 | `OPS_DIGEST_RESEND_API_KEY` + `OPS_DIGEST_TO` (+optional `OPS_DIGEST_FROM`) | Vercel env, server-only | DEDICATED secret per DECISIONS #10 — **confirm: literal second Resend key, or existing key value under the new name?** `OPS_DIGEST_TO`=Nick's email | W13 | No (digest skips) |
| 11 | Verify `CRON_SECRET` set | Vercel env | existing — new crons reuse it | W11 | YES for new crons |
| 12 | OQ3: confirm Sentry session tracking (autoSessionTracking) for helm-xs | Sentry dashboard/API (post-#4) | gates the release-health widget | W12 | No (stays neutral) |
| 13 | OQ5 (non-blocking note): investigate enabling Supabase auth logs | Supabase dashboard | would backfill the auth feed for free | — | No |

## Shared Interfaces

The single-author contracts every wave imports by these EXACT names/signatures:

```typescript
// ── src/lib/admin/super-admin-shared.ts (W1 · edge-safe, pure) ──────────────
export function parseSuperAdminUserIds(raw: string | undefined | null): ReadonlySet<string>;
export function isAdminPath(pathname: string): boolean;
export type AdminGateDecision = 'not-admin-path' | 'block-native' | 'redirect-login' | 'redirect-dashboard' | 'pass';
export function evaluateAdminGate(input: { pathname: string; isNative: boolean; userId: string | null; allowlistRaw: string | undefined }): AdminGateDecision;

// ── src/lib/admin/require-super-admin.ts (W1 · server-only) ────────────────
export interface SuperAdminContext { userId: string; email: string; }
export type SuperAdminProbe =
  | { allowed: true; context: SuperAdminContext }
  | { allowed: false; reason: 'unauthenticated' | 'forbidden' };
export async function checkSuperAdminAccess(): Promise<SuperAdminProbe>;   // non-throwing probe
export async function requireSuperAdmin(): Promise<SuperAdminContext>;     // throws 'Unauthorized' | 'Forbidden'

// ── src/lib/admin/fetch-result.ts (W3) ──────────────────────────────────────
export type AdminFetchStatus = 'ok' | 'unconfigured' | 'error';
export interface AdminFetchResult<T> { status: AdminFetchStatus; data: T | null; fetchedAt: string | null; error?: string; }
export function ok<T>(data: T): AdminFetchResult<T>;
export function failed<T>(error: string): AdminFetchResult<T>;
export function unconfigured<T>(what: string): AdminFetchResult<T>;

// ── src/lib/admin/sentry-api.ts (W3 · 'server-only') ────────────────────────
export interface SentryIssue { id: string; shortId: string; title: string; culprit: string | null; level: string; status: string; substatus: string | null; count: number; userCount: number; firstSeen: string; lastSeen: string; permalink: string; stats24h: Array<[number, number]>; }
export interface SentryStatsPoint { timestamp: number; accepted: number; total: number; }
export interface SentryReleaseHealth { crashFreeSessions: number | null; crashFreeUsers: number | null; }
export async function fetchSentryIssues(opts?: { query?: string; limit?: number }): Promise<AdminFetchResult<SentryIssue[]>>;
export async function fetchSentryHourlyStats(): Promise<AdminFetchResult<SentryStatsPoint[]>>;
export async function fetchSentryReleaseHealth(): Promise<AdminFetchResult<SentryReleaseHealth>>;

// ── src/lib/admin/vercel-api.ts (W3/W12 · 'server-only') ────────────────────
export type VercelDeployState = 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED' | 'QUEUED' | 'INITIALIZING';
export interface VercelDeployment { uid: string; state: VercelDeployState; createdAt: number; ready: number | null; target: string | null; url: string; commitSha: string | null; commitMessage: string | null; commitRef: string | null; commitAuthor: string | null; }
export interface VercelWebInsights { visitors24h: number; visitors7d: number; visitors30d: number; }
export async function fetchVercelDeployments(limit?: number): Promise<AdminFetchResult<VercelDeployment[]>>;
export async function fetchVercelWebInsights(): Promise<AdminFetchResult<VercelWebInsights>>;

// ── src/lib/admin/data/triage.ts (W3) ───────────────────────────────────────
export type TriageSeverity = 'critical' | 'error' | 'warning' | 'info';
export interface AppTriageEventRow { id: string; title: string; message: string | null; severity: TriageSeverity; sport: string | null; fingerprint: string | null; user_id: string | null; url: string | null; created_at: string; }
export interface TriageItem { key: string; origin: 'sentry' | 'app'; title: string; severity: TriageSeverity; sport: 'golf' | 'baseball' | 'shared' | null; occurrences: number; affectedUsers: number; firstSeen: string; lastSeen: string; permalink: string | null; eventIds: string[]; substatus: string | null; }
export function mergeTriage(input: { sentryIssues: SentryIssue[]; appEvents: AppTriageEventRow[] }): TriageItem[];
export async function fetchTriageQueue(): Promise<{ items: TriageItem[]; sentry: AdminFetchResult<SentryIssue[]> }>;

// ── writer extensions (W2 · additive on EXISTING modules) ───────────────────
// server-error-logger.ts RoundErrorContext gains:
//   sport?: 'golf' | 'baseball' | 'shared'; teamId?: string | null; dbFingerprint?: string;
// ServerTraceSource union gains (W6): 'rls_denial' | 'auth' | 'cron' | 'integrity'
// admin-logger.ts AdminEventInput gains:
//   sport?: 'golf' | 'baseball' | 'shared'; teamId?: string | null; fingerprint?: string; source?: string;

// ── capture wrappers (W6) ────────────────────────────────────────────────────
export function isRlsDenial(error: { code?: string | null; message?: string | null } | null | undefined): boolean;
export function maybeCaptureRlsDenial(error: { code?: string | null; message?: string | null } | null | undefined, ctx: { table: string; verb: 'select' | 'insert' | 'update' | 'delete' | 'rpc'; action: string; userId?: string | null; sport?: 'golf' | 'baseball' | 'shared' }): void;
export function isNextControlFlowError(err: unknown): boolean;
export function withAdminObserved<Args extends unknown[], R>(name: string, opts: { sport?: 'golf' | 'baseball' | 'shared'; featureArea?: string }, fn: (...args: Args) => Promise<R>): (...args: Args) => Promise<R>;

// ── jobs (W11) ───────────────────────────────────────────────────────────────
export async function recordJobRun<T>(jobType: string, fn: () => Promise<T>): Promise<T>;
export interface CronRegistryEntry { jobType: string; path: string; cadenceMinutes: number; }
export const CRON_REGISTRY: readonly CronRegistryEntry[];
export type CronBoardStatus = 'ok' | 'overdue' | 'never-ran' | 'failed';
export function classifyCronStatus(entry: CronRegistryEntry, lastRun: { started_at: string; status: string } | null, now: Date): CronBoardStatus;

// ── impersonation (W10) ─────────────────────────────────────────────────────
export const VIEW_AS_COOKIE = 'helm_bridge_view_as';
export const VIEW_AS_TTL_MS: number; // 15 * 60 * 1000
export function signViewAsToken(targetUserId: string, expiresAtMs: number, secret: string): string;
export function verifyViewAsToken(token: string | undefined, secret: string | undefined, now: Date): { valid: true; targetUserId: string; expiresAtMs: number } | { valid: false };

// ── digest (W13) ────────────────────────────────────────────────────────────
export interface DigestEmail { subject: string; html: string; text: string; }
export function buildDigestEmail(data: DigestData): DigestEmail;
export async function sendOpsDigest(email: DigestEmail): Promise<{ sent: boolean; skipped: boolean; reason?: string; messageId?: string }>;

// ── UI cross-wave components (W4/W5) ────────────────────────────────────────
export type BridgeSport = 'golf' | 'baseball' | 'shared';
export function SportBadge({ sport }: { sport: BridgeSport | null }): JSX.Element | null;
export type BannerState = 'nominal' | 'attention' | 'critical' | 'stale';
export function AdminStatusBanner(props: { state: BannerState; attentionCount: number; checkedAt: string }): JSX.Element;
export function KpiTile(props: { label: string; value: number | null; href: string; format?: Intl.NumberFormatOptions; trendData?: readonly number[]; delta?: number; goodDirection?: 'up' | 'down'; tone?: 'neutral' | 'danger' | 'warning' }): JSX.Element;
export function PanelBoundary(props: { title: string; skeleton?: React.ReactNode; children: React.ReactNode }): JSX.Element;
export function AutoRefresh({ intervalMs }: { intervalMs?: number }): null;
```

```sql
-- ── SQL contracts (all SECURITY DEFINER, pinned search_path, ACL-asserted) ──
public.is_super_admin() RETURNS boolean;                    -- W1 · EXECUTE: authenticated only
public.get_active_sessions() RETURNS jsonb;                 -- W3 · internally is_super_admin()-gated; USER-SCOPED calls only
public.resolve_admin_event(p_event_ids uuid[]) RETURNS integer; -- W3 · same gate; sets resolved/resolved_at/resolved_by
public.revoke_user_sessions(p_user_id uuid) RETURNS integer;    -- W7 · same gate; writes audit_log
public.run_integrity_checks() RETURNS jsonb;                -- W11 · EXECUTE: service_role ONLY
-- admin_events additive columns (W2):
--   sport text CHECK (golf|baseball|shared) · team_id uuid · fingerprint text
--   source text CHECK (server_action|route_handler|server_component|background_job|request_hook|
--                      rls_denial|auth|cron|integrity|client|system)
```

## Residual open items (tracked, not blocking)

1. Owner confirmation on digest secret semantics (checklist #10 — second literal Resend key vs aliased value).
2. OQ3 release-health verification (checklist #12) — widget stays neutral until resolved.
3. `withAdminObserved` retrofit backlog beyond the `savePartialRound` exemplar (submit-round, baseball lineups, lift check-ins) — follow-up PRs after W6.
4. Per-team `team_id` attribution on emitters (OQ10 accepted sport-only for baseball/lifting in v1) — golf emitters may add `teamId` opportunistically.
5. The full 165-function SECURITY DEFINER grant audit (separately deferred) — W14b hardens only the admin-facing family; W11's drift check watches tables, a function-drift extension is a v1.1 candidate.
6. `error_logs`/`admin_events` writer consolidation (OQ4 deferred — touches ~230 files).
7. W2 step-2 decision record: whether `GRANT SELECT ... TO authenticated` had to be retained on `admin_events` for the legacy UI until W14 (remove it in W14 if so).
8. Flag-only CRM reports to owner (from W14 QA): `refresh-engagement` comment drift; `v_crm_coaches_by_school` advisor-ERROR view.
