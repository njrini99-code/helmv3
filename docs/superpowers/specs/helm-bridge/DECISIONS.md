# Helm Bridge — Locked Decisions & Open-Question Resolutions

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
