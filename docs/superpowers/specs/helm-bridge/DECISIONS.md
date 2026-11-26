# Helm Bridge — Locked Decisions & Open-Question Resolutions

Status: active

_Owner: Nick (njrini99). Date: 2026-07-01. Base branch: `feat/helm-bridge-command-center` off `origin/main` (tip 53697b35c)._

These are BINDING inputs for planning. Do not re-litigate.

## Locked decisions (owner-approved)

1. **Name:** "Helm Bridge".
2. **Route:** new top-level `/admin` route group (`src/app/admin/*`). NOT `/monitoring` (reserved by Sentry tunnelRoute). Replaces `/golf/admin` (non-CRM parts) and `/baseball/admin`.
3. **Structure:** ONE unified cross-sport command center that absorbs the useful parts of the existing per-sport admin, then retires the old non-CRM admin surfaces. Single source of truth.
4. **Access:** single super-admin allowlist — **Nick only**, seeded with **`admin@helmsportslabs.com`** (its `auth.users` id, to be confirmed via DB during Wave 1). Enforced at THREE layers: middleware (`src/proxy.ts`) → shared `requireSuperAdmin()` first-line in every server entry point → deny-by-default Postgres RLS via new `is_super_admin()` + `admin_allowlist` table. The legacy `users.role='admin'` column keeps gating the untouched CRM only.
5. **Error/observability data:** BOTH (a) live Sentry pull server-side (new `SENTRY_READ_TOKEN`) AND (b) extend the existing mature in-app event log (`admin_events` / `error_logs` / loggers used by 237 files) — do NOT build a parallel table. Add the 4 missing capture classes: RLS denials, failed server actions, full auth coverage, cron/integrity outcomes.
6. **Sports:** cover golf (Fairway ink) + baseball incl. Lift Lab (Living Annual ink). Surface EVERYTHING with drill-down.
7. **CRM = fully off-limits** (see design `crmBoundary`). Sever the two couplings (sidebar `crm_coaches` query; `PeopleTab` `BulkEmailModal` import). Retirement preserves the `crm/` subtree + its gate.
8. **Delivery:** phased, small reviewable PR waves. Fable planned this; **Sonnet 5 executes**. Owner approves the plan before any execution.

## v1 scope additions (owner-selected, beyond the 8 tabs)

9. **Read-only impersonation ("view as"):** INCLUDE in v1. Constraints: super-admin only, strictly READ-ONLY, time-boxed session, persistent on-screen banner, every enter/exit written to `audit_log`. Never allows writes as the impersonated user.
10. **Daily email digest:** INCLUDE in v1. Constraint: it must use a **dedicated ops-notification transport** — its own secret + a tiny `src/lib/admin/` module — that touches ZERO `crm_*` tables and ZERO CRM/Resend/Gmail outreach code. Treat the transport secret like `SENTRY_READ_TOKEN` (owner-provisioned, server-only, fail-soft if absent). Recipient = Nick only. Content: overnight errors/regressions, new signups, activity, anything red. Sent by a new Vercel cron.
11. **Feature-flag / kill-switch panel:** DEFERRED to v2 (not in this plan).

## Open-question resolutions (design raised 10; resolved here)

- **OQ1 identity:** `admin@helmsportslabs.com` is the sole super-admin. Confirm its `auth.users.id` via Supabase MCP in Wave 1 and seed `admin_allowlist`. Downgrading the stale `admin-ui-1779052548996@golfhelm.local` test-admin row is APPROVED (owner-gated step, verified before/after).
- **OQ2 secrets:** owner-provisioned, plan builds fail-soft so nothing blocks. Hard blocker for LIVE Sentry data only = **`SENTRY_READ_TOKEN`** (new, scopes `org:read`+`project:read`+`event:read`; do NOT reuse the CI `SENTRY_AUTH_TOKEN`). Verify `VERCEL_API_TOKEN`/`VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID` in the Vercel dashboard (team-scoped vars are invisible to `vercel env pull`). Produce a single **owner-provisioning checklist** in the plan.
- **OQ3 release health:** ship the crash-free widget CONDITIONALLY — render neutral "not configured" if session tracking isn't confirmed. Verify `autoSessionTracking` for helm-xs first.
- **OQ4 double-write:** v1 keeps BOTH writers; read `admin_events`-first with `error_logs` as drill-down detail. Consolidation deferred (touches 237 files).
- **OQ5 auth audit log:** app-level capture is the plan regardless. Add an owner note to investigate enabling Supabase auth logs (would backfill for free) — non-blocking.
- **OQ6 empty scaffolds:** v1 wires `background_job_logs` (crons) + `admin_events` (everything else). Leave `api_call_logs`/`auth_metrics_hourly`/`error_rate_hourly`/`golf_platform_metrics_daily` unwired for v1 (accepted).
- **OQ7 orphaned RPCs:** do NOT resurrect by default. A planner may reuse a specific orphaned RPC only after reading + verifying its internal gate; otherwise leave dead code slated for deletion untouched in v1.
- **OQ8 stretch features:** resolved by decisions 9–11 (digest + impersonation in; flags out).
- **OQ9 `role='admin'` end-state:** after `/golf/admin` retirement, keep `role='admin'` SOLELY as the CRM gate (Nick holds both credentials). Migrating CRM gating to `is_super_admin()` is OUT OF SCOPE (CRM-owned).
- **OQ10 baseball team attribution:** accept sport-only attribution for baseball/lifting emitters that lack an obvious team in scope (v1).

## Non-negotiable safety rails (shared PROD DB)

- Additive-only DDL. Add columns BEFORE any new emitter ships (schema-drift gotcha).
- Every migration ends with `REVOKE ALL ... FROM anon, authenticated` on new objects + a `pg_class.relacl` / `pg_proc` ACL verification query. Verify applied state via `information_schema` (schema_migrations is unreliable here).
- Call existing `get_admin_*_rollup` SECURITY DEFINER RPCs with the admin's USER-SCOPED client (they Forbid under service_role; documented 509 storm).
- All new event emitters are fire-and-forget (swallowed try/catch or `after()`) — logging must NEVER fail a live user request.
- The `handle_new_user()` privilege-escalation fix ships as its own P0 PR BEFORE any `/admin` code.
- Add `/admin` to the iOS `AdminNativeGuard` + `proxy.ts` native-UA exclusion in the first routing PR.

## Clubhouse edition, as built (redesign PRs 2 and 4, 2026-11-25)

The Clubhouse edition's owner decisions (D1-D12) are in
`2026-11-18-clubhouse-bridge-redesign.md` §15. These are the choices made while
building them, each with its reason.

- **Shortcut keys.** The §7.1 letters (P, O, A, G, D, Q, S, Y, E, V) are retired
  shortcuts (`src/lib/admin/retired-routes.ts`) that still send operators to the
  views that absorbed old tabs, so the Clubhouse screens take free letters: Pages
  H, Controls I, Actions J, Codes C, Readiness M, Drift N. N was the last free
  letter; Duet desk has no key and is reached from the rail and ⌘K. Reclaiming Q
  for it (and letters for PR 3's screens) is an owner call.
- **Drift lists held at zero.** Lists 1, 6 and 7 (build half) were already
  registry violations; list 9 is `clickable-map.mjs --check`; list 8 is a new
  registry check (a page needs a Bridge ID outside category 25). All run in
  `clubhouse:check`. The §4.7 list (controls with neither an action nor a link,
  1,364 of 1,784) is shown on B11 and not gated, because it is not zero.
- **Runtime drift.** Read from `clubhouse_drift` as the super admin; a missing
  table or column (42P01, PGRST205, 42703, PGRST204) reads "No signal yet", never
  zero.
- **The pack's live parts are pluggable.** `PackLiveSource` readers, each "No
  signal yet" by default, replaced by id (`withSources`). PR 4 ships the
  `admin_events` reader; PR 3's live layer adds the rest without editing
  `pack.ts`.
- **D7 in packs.** People are `u-` plus a SHA-256 prefix of the user id, teams
  `t-` likewise; "Include names" adds the email.
- **D9, the Duet door.** `GET /api/admin/clubhouse/duet/{packs,drift}` (the
  brief's path, not §9.2's `/api/admin/bridge/v1/…`). Off while
  `BRIDGE_DUET_TOKEN` is unset or under 32 characters: 404, nothing read,
  nothing audited. Bearer token compared as SHA-256 digests with
  `timingSafeEqual`; 60 requests a minute per caller, counted before the token
  check; every read audited to `audit_log`, best effort. Names only when
  `BRIDGE_DUET_ALLOW_NAMES=1` and the request asks.
- **D4, the Bridge numbers itself.** `br-codes.ts` is the code map;
  `config/bridge/contracts.json` is the labelled list;
  `docs/bridge/generated/BRIDGE_UI_MAP.md` is generated from it by
  `scripts/clubhouse/bridge-ui-map.mjs`, whose `--check` joined
  `clubhouse:check` (where the registry and the graph already live). Codes the
  §8 tables don't name take the next free number (the evidence footer's Copy,
  B13's Build pack and Include names).
- **Category 25.** Minted by `registry.mjs sync` from a table, not by hand:
  -01 Open in Bridge and -03 Context pack implemented, -02 Signal the Bridge
  reads reserved until signals arrive. Every page's CONTRACT.md §25 is DEFINED.
- **B13's queue** (Mark sent, Verify after release, Archive) renders as pending
  controls until `bridge_notes` exists (held migration 20261124090000). No
  `'use server'` surface was added in PR 4.
