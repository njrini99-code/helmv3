# Helm Bridge Command Center — Reconciled Design Spec

_Date: 2026-07-01 · Base: `feat/helm-bridge-command-center` off `origin/main` (tip `53697b35c`) · Status: APPROVED design, reconciled against a fresh reground of main._

This spec supersedes the raw discovery design (`docs/superpowers/specs/helm-bridge/_discovery/design.json`) wherever the two disagree. Binding decisions live in `docs/superpowers/specs/helm-bridge/DECISIONS.md` and are not re-litigated here. The implementation plan is at `docs/superpowers/plans/2026-07-01-helm-bridge-command-center.md`.

---

## 1. Product summary

**Helm Bridge** is ONE server-rendered command center at **`/admin`** (new top-level route group `src/app/admin/*`) that replaces the non-CRM parts of `/golf/admin` and the (nearly nonexistent) `/baseball/admin`. It is a **triage inbox plus a health strip**, not a BI wall:

- A pinned worst-severity **status banner** + 6-tile **KPI strip** answers "is anything on fire?" in under 5 seconds.
- A merged **Sentry + admin_events triage queue** (grouped by fingerprint, ranked by affected users, deploy-correlated) is the centerpiece.
- **8 tabs** give drill-down over errors, auth, golf, baseball + Lift Lab, users/teams, cron/data-integrity, and Vercel deploys.
- Built once from the existing **Fairway component kit** with sport accent inks as wayfinding — no third design language.
- Access is a **Nick-only allowlist** enforced at three independent layers (middleware → `requireSuperAdmin()` → deny-by-default RLS via new `is_super_admin()`).
- v1 also includes **read-only impersonation ("view as")** and a **daily email digest** on a dedicated non-CRM transport (owner decisions 9–10).

Everything ships in small, independently mergeable PR waves (W0–W14). Migrations are additive-only against the **shared prod DB**, ending with `REVOKE` + ACL verification.

## 2. Reground deltas — corrections to the discovery design

The discovery design was generated from a tree 1,722 commits behind main. A full re-verification pass on the actual worktree found these deltas; **this section is authoritative**:

1. **`error-monitoring.ts` P0 rationale corrected.** The design claimed the module "silently drops all server-side calls in production (window-gated send)". FALSE on main: `src/lib/error-monitoring.ts:161-177` has a working server-side else-branch that calls `Sentry.captureException`. The REAL defect is narrower but still worth the P0: the server path is an **unawaited fire-and-forget dynamic import** (`import('@sentry/nextjs').then(...)` with no `await`/`waitUntil`), risking silent loss when a serverless function returns before the microtask resolves — AND it is Sentry-only (no `error_logs`/`admin_events` write), unlike the mature dual-writing `logServerException` used by ~230 files. The fix is unchanged: migrate the 10 call sites in `src/app/golf/actions/golf.ts` (lines 1587, 1724, 4593, 4697, 4726, 4756, 4807, 4926, 6050, 6262) to `logServerException`/`logServerError` from `src/lib/server-error-logger.ts`, then delete the module (sole importer confirmed: `golf.ts:27`).
2. **Cron → admin_events wiring is ALREADY DONE.** All 14 `vercel.json` cron routes already call `logServerError`/`logServerEvent` (2–14 hits per route). What remains open: (a) `background_job_logs` has **zero writers** (only a reader in the dead `admin-system-data.ts`); (b) no nightly integrity-check cron; (c) no retention cron. W11 wires exactly these three, not a re-wrap of Sentry logging.
3. **The baseball "Living Annual" design system DOES NOT EXIST in code.** Zero repo-wide hits for `.living-annual`, `font-annual`, Space Grotesk, `--pursuit-ink`, or an infield-clay token. The design's claim that baseball panes "self-skin automatically" via a `.living-annual` scope is a planning artifact from memory notes, not shipped code. The plan builds a **thin baseball ink layer** (a `--fw-color-team-baseball: #C2703D` clay token + a `data-sport` attribute convention) over Fairway primitives, added in the same wave that first references it (W4).
4. **`server-error-logger.ts` consumer count is ~230 files** (design said 237) — trivial drift; the backward-compatibility constraint is unchanged: additive columns only, writer API signature preserved.
5. **CRM sidebar coupling location corrected:** the `crm_coaches` KPI query is at `src/app/golf/admin/page.tsx:291` (not a `sidebar.tsx`). The `BulkEmailModal` import at `src/app/golf/admin/components/PeopleTab.tsx:10` is confirmed, with launcher state at lines 44/440/496 — severing requires replacing the whole re-engagement launcher flow, not deleting one import line.
6. **`admin_events` carries a table-level `GRANT ALL TO anon, authenticated`** alongside its RLS policies (mitigated today only because no anon/plain-authenticated policy exists). W1's ACL verification explicitly checks and W2's migration explicitly REVOKEs these pre-existing grants, not just grants on new objects.
7. **`RESEND_API_KEY` is NOT CRM-exclusive** — it already powers three non-CRM transactional surfaces (`src/lib/notifications/email.ts`, `src/lib/email/resend-client.ts` coach digest, task reminders), each with its own isolated client instance. The digest's dedicated module follows this exact established pattern; DECISIONS #10 additionally demands its **own secret** (`OPS_DIGEST_RESEND_API_KEY`), a stricter bar than current convention — flagged in the owner checklist for one-line confirmation.
8. **`proxy.ts` has zero admin-path logic** (confirmed); the native-UA exclusion is a generic marketing-route blocker keyed on `APP_ROUTE_PREFIXES`. `/admin` is currently NOT in that list, so native requests to `/admin` are incidentally redirected as "marketing" — W1 adds an **explicit** `/admin` native block + super-admin matcher so the protection is intentional, not accidental.
9. **Not independently re-verified in the reground** (verify during the named waves): RLS-denial centralization helpers (none found — net-new, W6), `withAdminObserved` (net-new, W6), middleware `updateSession` failure capture (still `console.warn`-swallowed per design, W7), deploy-marker events (none found, W12), auth-coverage breadth (helpers `logLogin`/`logSignup` exist; breadth extended in W7), and live-DB state (admin row identities, `admin_events` SELECT RLS — Wave 1 DB tasks).

## 3. The 8 tabs — widgets and data sources

All reads happen server-side behind `requireSuperAdmin()`. Existing `get_admin_*_rollup` SECURITY DEFINER RPCs are called with the admin's **user-scoped** client (they Forbid under service_role — documented 509 storm, `admin-data.ts:35-44`). Direct table counts use `createAdminClient()` (service-role) strictly after the gate.

### 3.1 Overview (`/admin`)
| Widget | Data source |
|---|---|
| Global status banner (worst-severity single line, dark InstrumentPanel) | Sentry unresolved count + `admin_events` unresolved error/critical + `background_job_logs` overdue + latest integrity results |
| KPI strip (6 StatTiles) | Sentry org issues; `admin_events` 24h errors; `login_attempts` + security events; `users.last_seen` actives; `golf_rounds`+`baseball_games`+`helm_lifting_sessions` today (head counts); latest Vercel prod deploy |
| Unified triage queue (~2/3 width) | Merged Sentry `is:unresolved` issues + `admin_events` grouped by `lib/admin/incident-grouping.ts` fingerprints, sorted by affected users then recency; inline resolve via `resolve_admin_event()` RPC |
| Regressed-issues callout | Sentry issues `is:regressed` |
| Deploy rail | Vercel `GET /v6/deployments` (last 5 prod) |
| Watch-the-watcher | Last successful Sentry pull timestamp; `MAX(created_at)` per `admin_events.event_type`; `background_job_logs` expected-vs-actual |

### 3.2 Errors (`/admin/errors`)
Sentry unresolved-issues DataTable (24h sparkline, userCount, permalink); errors-over-time ChartFrame with deploy markers (Sentry `stats_v2` × Vercel deploy timestamps); in-app incident feed (ported incident-grouping + one-click resolve); RLS-denial & auth-error counter (`admin_events.source='rls_denial'`, net-new capture); issue detail drawer (events, affected users/teams via new `admin_events.user_id/team_id` joins).

### 3.3 Auth & Sign-ins (`/admin/auth`)
Sign-in feed (`admin_events` login/signup — coverage extended to ALL auth paths incl. failures in W7); failed-auth & lockout panel (`login_attempts` + security events, SQL burst flags); active sessions panel (new `get_active_sessions()` SECURITY DEFINER RPC over `auth.sessions` + revoke via `supabase.auth.admin.signOut(userId)`, audit-logged); signup → activation funnel (`lib/admin/metrics.ts` math, per sport). `auth.audit_log_entries` is confirmed EMPTY — app-level capture is the source of truth (OQ5 owner note stands).

### 3.4 Golf (`/admin/golf`) — Fairway green ink
Activity pulse (`get_admin_rounds_rollup`/`get_admin_dashboard_rollup`); teams health table (`get_admin_teams_scoring_rollup` + `admin_events` error counts by `team_id`); **Tracer data-quality suite ported intact** (`admin-tracer-data.ts` reads + `fixRoundData` with its null-score refusal guard — the only admin mutations); CoachHelm engine health (`get_admin_coachhelm_rollup`); AI/LLM spend (`golf_coachhelm_llm_calls`/`_budget`); demo & leads strip (links OUT to CRM, no email capability).

### 3.5 Baseball (`/admin/baseball`) — clay ink (NEW token, see §7)
Activity pulse (`get_admin_baseball_rollup` — the C5 rollup finally rendered); teams registry (same health model as golf); Lift Lab panel (`helm_lifting_*`); event-level data readiness card (honest neutral zero-states for the 0-row event tables); baseball demo sessions (absorbs the one existing page under the guarded shell).

### 3.6 Users & Teams (`/admin/users`)
Users directory (ports `TeamUserDirectory`, no email actions); per-user drill-down (ports `UserDetailPanel` + auth history + error events + sessions with revoke); cross-sport teams table; at-risk list (action = "Open in CRM →" link only). **Read-only impersonation** lives here: `/admin/users/[id]/view-as` renders that user's data read-only inside the admin shell (never a real session as the user), 15-min TTL signed cookie, persistent banner, enter/exit written to `audit_log`.

### 3.7 Jobs & Integrity (`/admin/jobs`)
Cron board — `background_job_logs` (now written by all 14 cron routes via a shared `recordJobRun` wrapper) vs a code-defined cadence registry with OVERDUE detection (`now - last_run > 1.5× cadence`); data-integrity checks grid (new nightly cron: orphan checks, migration recorded-vs-applied via `information_schema`, anon-grant drift via `pg_class.relacl`/`pg_proc` ACLs) writing `admin_events source='integrity'`; log-table health & retention (retention cron: info 90d, error/critical 13mo); Inngest/health endpoint status (honest "not activated" when keys absent).

### 3.8 Deploys & Infra (`/admin/deploys`)
Deployments table (Vercel v6, ERROR builds escalate to banner); currently-deployed build card (`VERCEL_GIT_COMMIT_*` system env — works with zero secrets); release-health strip (CONDITIONAL — renders "not configured" until session tracking is confirmed, OQ3); web-vitals mini panel (ports `fetchVercelAnalytics`, fails soft to null). Deploy-marker `admin_events` rows (`event_type='deploy'`) written on prod-deploy detection so charts can overlay releases even without the Vercel token.

## 4. Three-layer auth model

1. **Middleware** (`src/proxy.ts` → `src/lib/supabase/middleware.ts`): `/admin/*` matcher — native-UA hard block first, then `getUser()` + `user.id ∈ SUPER_ADMIN_USER_IDS` (server-only env), redirect to `/golf/login` (unauth) or `/golf/dashboard` (forbidden). Cheap filter, never trusted alone.
2. **Server**: shared `src/lib/admin/require-super-admin.ts` — `requireSuperAdmin()` (throwing) called FIRST LINE in the `/admin` layout, every `/admin` page, every server action under `src/app/admin/actions`, and every `/api/admin-center` route; plus `checkSuperAdminAccess()` (non-throwing probe preserving the `checkAdminAccess` pattern from `admin-data.ts:95-120` that ended the 576-errors/day polling flood). Only after passing may code touch `createAdminClient()` or the Sentry/Vercel tokens.
3. **Postgres RLS**: new `admin_allowlist` table (one row: Nick, `admin@helmsportslabs.com` — `auth.users.id` confirmed via Supabase MCP in W1) with RLS ENABLE + FORCE and zero anon/authenticated policies; new `is_super_admin()` SECURITY DEFINER function (pinned `search_path`, EXECUTE revoked from anon, granted to authenticated for RLS-policy use); the single admin mutation (`resolve_admin_event()`) is a SECURITY DEFINER RPC internally gated on `is_super_admin()`.

Legacy `users.role='admin'` keeps gating ONLY the untouched CRM (OQ9). The stale test-admin row `admin-ui-1779052548996@golfhelm.local` is downgraded in W0 (owner-approved, verified before/after). The `handle_new_user()` trigger cast (`raw_user_meta_data->>'role'` → any `user_role` incl. `admin`, `prod_public_baseline.sql:3790-3824`) is fixed in W0 before any `/admin` code ships.

## 5. Event log extension + Sentry/Vercel wiring

- **Extend `admin_events`, never fork it** (90,796 rows; mature writers `lib/admin-logger.ts`, `lib/server-error-logger.ts`, `/api/admin/log-event`). Additive columns only: `sport`, `team_id`, `fingerprint`, `source` + indexes; columns land in W2 BEFORE any new emitter ships (schema-drift gotcha). Writer API stays backward-compatible for its ~230 importers; the W2 migration also REVOKEs the pre-existing table-level anon/authenticated grants (§2.6).
- **Four net-new capture classes:** (1) `rls_denial` — `maybeCaptureRlsDenial()` helper detecting 42501/PGRST codes, wired through the admin data layer and the observed-action wrapper (W6); (2) `server_action_failed` — `withAdminObserved()` wrapper (Sentry server-action instrumentation + one fire-and-forget `admin_events` insert, skipping `NEXT_REDIRECT`/`NEXT_NOT_FOUND`), retrofitted to mutation-heavy actions first (W6); (3) full auth coverage — `logLogin`/`logSignup` on every auth path incl. failures + password resets, plus an edge-safe fire-and-forget POST from middleware `updateSession` failures to an internal route (W7); (4) cron/integrity — `recordJobRun()` writing `background_job_logs` + nightly integrity cron + retention cron (W11).
- **Sentry read side (greenfield):** `src/lib/admin/sentry-api.ts` (`import 'server-only'`) — Bearer `SENTRY_READ_TOKEN` (NEW token; do NOT reuse the CI `SENTRY_AUTH_TOKEN`), org issues / issue detail / stats_v2 / sessions endpoints, Link-header cursor pagination capped at 3 pages, 60s `next.revalidate`, 429 handled fail-soft. SDK ingest is already complete and untouched.
- **Vercel read side:** `src/lib/admin/vercel-api.ts` (`import 'server-only'`) — v6 deployments, reusing the token trio already consumed at `admin-data.ts:1563`, failing soft to `unconfigured` exactly as `fetchVercelAnalytics` does.
- **`/api/log-error`** relaxed to accept unauthenticated clients with an `anonymous: true` flag (keeps rate limit + size cap) so login/signup-flow client errors reach `error_logs` (W7).
- **OQ4 stands:** both writers (`error_logs` + `admin_events`) keep double-writing; readers are `admin_events`-first with `error_logs` as drill-down detail.

## 6. Read-only impersonation + daily digest (v1 additions)

- **Impersonation:** super-admin only; strictly read-only by construction — the "view as" surface renders the target user's data via gated service-role reads inside `/admin`; it NEVER mints a session as the user, so writes are impossible. Time-boxed (15-min signed-cookie TTL, HMAC via `ADMIN_IMPERSONATION_SECRET`), persistent on-screen banner, enter/exit each write an `audit_log` row.
- **Daily digest:** new Vercel cron (`/api/cron/admin-digest`, 10:00 UTC) → `src/lib/admin/digest/` — its own Resend client instance on its **own secret** (`OPS_DIGEST_RESEND_API_KEY`), recipient Nick only, fail-soft skip when unconfigured. Content: overnight errors/regressions, new signups, activity, cron/integrity reds. Touches ZERO `crm_*` tables and ZERO CRM/outreach code.

## 7. Visual direction

Fairway ops chrome, sport-inked lanes. Warm-black `AppShell` rail (`--fw-color-nav-bg`) + cream canvas as the neutral shell; the pinned status banner is the ONE sanctioned on-dark `InstrumentPanel` strip signaling "admin mode". Severity uses the `fw-danger`/`fw-warning`/`fw-success` trio exclusively, always icon + label, never color alone. Fragment Mono tabular numerals on every metric (StatTile/Readout). Golf lanes use the existing helm-green accent; baseball lanes use a **NEW** `--fw-color-team-baseball: #C2703D` clay token added in W4 (the design's `.living-annual` self-skinning scope does not exist — §2.3). Never blend the two inks on one surface. LazyMotion `domAnimation` provider at the `/admin` route root (documented gotcha: without it `m.*` renders static and animated numbers freeze at 0). Per-panel Suspense + error boundaries with amber STALE overlay and last-known-good data; skeletons mirror final layout; three visually distinct empty cases (all-clear green / no-data-yet neutral / fetch-failed amber). 30–60s polling, no websockets; Supabase Realtime NOT used in v1 (SELECT-RLS leak risk unverified — risk register #9). ⌘K CommandMenu for jump-to-user/team/issue; keys 1–8 for tabs, R for refresh.

## 8. CRM boundary (untouchable)

Verbatim from DECISIONS #7 and the design `crmBoundary`: never read/write/import `/golf/admin/crm/**`, the 14 `crm-*.ts` action files + `resend-activity.ts`, `src/lib/crm/**`, all 18 `crm_*` tables + `emails`/`email_events`/`email_clicks` + CRM views/matview/RPCs, or `RESEND_*`/`GMAIL_SA_*`/`CRM_UNSUB_SECRET`/calendar-OAuth env in any new code. The two couplings are severed on the /admin side by construction (no `crm_coaches` query; at-risk action is a plain `<a href="/golf/admin/crm">` link). No event-log hooks into CRM code paths. Retirement (W14) deletes only non-CRM surfaces and preserves the `crm/` subtree, its `role='admin'` layout gate, and `AdminNativeGuard`. Flag-only (reported, untouched): `refresh-engagement` cron comment drift; `v_crm_coaches_by_school` advisor-ERROR view.

## 9. Risks (carried + updated)

| # | Risk | Mitigation |
|---|---|---|
| 1 | `handle_new_user()` can mint `role='admin'` from raw signup metadata | W0 P0 migration restricts cast to player/coach BEFORE any /admin code; verify `users_update_own` RLS can't self-update role; downgrade stale test admin |
| 2 | One missed `requireSuperAdmin()` = full data leak (service-role reads on shared prod) | Single shared helper; CI grep gate that every export under `src/app/admin` calls it; RLS deny-by-default as last line |
| 3 | Migrations/matview recreates auto-grant anon; agents ship `GRANT TO anon` | Every migration ends with REVOKE + ACL-assertion DO block; additive-only DDL; verify applied via `information_schema`; W11 integrity check watches grant drift continuously |
| 4 | Rollup RPCs Forbid under service_role (509 storm) | All `get_admin_*_rollup` calls use the user-scoped client (rollup-a.ts pattern); non-throwing probe preserved |
| 5 | Retirement deletes the CRM or breaks 230 logger importers | W14 preserves `crm/` subtree + gates; `admin_events` changes additive-only, writer API frozen |
| 6 | Dashboard load on shared prod (prior 576/day polling flood; `auth_rls_initplan` on 90k-row tables) | Per-panel server components with 30–60s cached slice fetches; service-role reads behind gate; visibility-aware polling; fixed panel budget |
| 7 | Sentry/Vercel API fragility + token leak | `import 'server-only'` on both modules; 60s server cache; cursor cap; tokens never `NEXT_PUBLIC_`; fail-soft STALE states |
| 8 | New capture classes create noise / break user flows; error-monitoring fix surfaces hidden-error backlog | All emitters fire-and-forget; first-week Sentry bump pre-announced; keep refresh-token-expiry suppression; retention cron ships in the same wave as new write volume (W11) |
| 9 | Realtime channel could leak admin_events payloads to authenticated users | v1 drops Realtime entirely; 30s polling only |
| 10 | Apple App Store exposure of `/admin` (4.2.2/3.1.1) | Explicit `/admin` native-UA block in middleware + `AdminNativeGuard` in the /admin layout, shipped in the FIRST routing PR (W1) |
| 11 | `.living-annual` assumed to exist (it doesn't) | W4 builds the clay ink token + `data-sport` convention as new work; no wave references `.living-annual` |
| 12 | `background_job_logs` read before it's written renders misleading empties | Jobs tab (W11) ships in the same wave as the writers; cron board renders "awaiting first run" per registry entry until rows exist |

## 10. Open items for the owner (also in the plan's provisioning checklist)

1. Confirm `admin@helmsportslabs.com`'s `auth.users.id` (Supabase MCP, W1) → seeds `admin_allowlist` + `SUPER_ADMIN_USER_IDS`.
2. Create `SENTRY_READ_TOKEN` (scopes `org:read`, `project:read`, `event:read`) — the ONE hard blocker for live Sentry tiles; everything else fails soft.
3. Verify/create `VERCEL_API_TOKEN`/`VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID` in the Vercel dashboard (team-scoped vars invisible to `vercel env pull`); verify `SENTRY_AUTH_TOKEN` exists at build time.
4. Mint the dedicated digest secret `OPS_DIGEST_RESEND_API_KEY` — confirm whether a literal second Resend key or the existing key value under the new name (DECISIONS #10 wording says own secret).
5. Provide `ADMIN_IMPERSONATION_SECRET` (any 32+ char random string).
6. Approve the stale test-admin downgrade execution window (W0, pre-approved in OQ1).
7. Non-blocking: investigate enabling Supabase auth logs (OQ5); confirm Sentry session tracking for the release-health widget (OQ3).
