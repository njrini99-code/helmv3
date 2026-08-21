# Feature: Auth Onboarding And Join

```
feature_id: auth_onboarding_join
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: partial
```

## Purpose

Establishes user identity, role-specific setup (coach vs. player), and team
membership. This is the front door for GolfHelm and a dependency of every
other dashboard feature — if it routes someone wrong, everything downstream
inherits the mistake.

## User Contract

A user who signs up, signs in, or follows a join-code link reaches the
screen matching their actual role and profile state — never a wizard that
would overwrite an existing program, and never stranded waiting for approval
they already have.

## Current Behavior

- Routes: `src/app/golf/(auth)/**`, `src/app/golf/(onboarding)/coach/**`,
  `src/app/golf/(onboarding)/player/**`, `src/app/golf/join/[code]/**`.
- **Coach routing is now centralized.** `resolveGolfCoachEntry(userId)`
  (`src/lib/golf/coach-entry-path.ts`, admin client, never throws) and its
  server-action wrapper `getGolfCoachEntry()`
  (`src/app/golf/actions/coach-entry.ts`) replaced five separate call sites
  — `loginAction`, the coach-onboarding page's own check, `/golf/join/
  [code]`, the OAuth callback, and the dashboard layout — that had all
  independently implemented the same wrong heuristic:
  `if (!coach.onboarding_completed) -> '/golf/coach'`. `/golf/coach` is
  NEW-PROGRAM onboarding; completing it overwrites
  `golf_coaches.organization_id`, detaching the account from its real
  program. This was the mechanism behind two reported production incidents
  (UNCW 2026-08-18, Shenandoah 2026-08-19) — see Incident History.
- The discriminator is `golf_team_coach_staff` (checked *before* the
  `onboarding_completed` flag), because it is the same table
  `is_golf_team_coach`/`is_golf_team_head_coach` read for RLS — "has a staff
  row" and "can see team data" cannot drift apart. The flag is consulted
  only for the one case the staff table can't resolve on its own: no program
  + no staff row is a pending assistant when false, and a head coach whose
  team creation didn't finish when true.
- A failed COACH or STAFF read routes to `/golf/coach/pending` (the safe
  direction — it self-clears once the row is readable) rather than
  `/golf/coach`.
- Assistant-coach signup is new this week: a team code at signup staffs the
  account immediately (`golf_team_coach_staff` row inserted at signup,
  `9f7e987ea`), and a team code now outranks whatever role the browser sent
  (`0b83f9ca5`).
- Signup access-code gate (`src/lib/golf/signup-gate.ts`, 354 lines) is a
  two-part check: `grantSignupAccess(code)` (interactive, page-level, via
  the `validateAccessCode` action) and `verifySignupGate()` (server-side
  re-check `signupAction` runs one request later). This closed a real gap
  (B8-1): the gate used to exist only in the client component, so
  `signupAction` was directly POST-able and the code was decorative.
- **`SIGNUP_ACCESS_CODE` unset is the intended production configuration**,
  not a misconfiguration. Shared-code signup was deliberately retired
  2026-08-04; a player now signs up with the team `join_code` their coach
  gave them. This was previously logged `critical` and fired 10 false
  CRITICAL alerts in one 24h window (2026-08-05); it is now a one-shot
  `info` log per warm instance.

## Invariants

- Every server action calls `supabase.auth.getUser()` before any DB access.
- `resetSessionIdleMarker()` must run on every successful password/demo
  sign-in before redirecting — the idle marker intentionally survives old
  sessions, so skipping this makes middleware invalidate the fresh session
  and force a second sign-in.
- Coach routing must go through `resolveGolfCoachEntry()` /
  `getGolfCoachEntry()`; adding a new ad hoc `onboarding_completed` check is
  the exact bug class this week's work eliminated.
- A session expiring mid-request on `/golf/dashboard` redirects to
  `/golf/login?returnTo=/golf/dashboard`, not the error boundary; retryable
  auth failures (network / GoTrue 5xx) still surface to the error boundary.
- `getGolfCoachEntry()` takes no caller-supplied id — it reads from the
  session only, so it cannot be used to probe another account's onboarding
  state.

## Primary Journeys

1. New coach signs up → no coach profile → `/golf/coach` (new-program
   wizard) → creates `organizations` + `golf_teams` + head-coach staff row.
2. Assistant coach signs up with a team code → staffed at signup →
   `resolveGolfCoachEntry` finds the staff row → straight to
   `/golf/dashboard`, no pending step.
3. Player signs up (with or without a join code) → player onboarding →
   optional join-code handoff → `golf_team_members` row.
4. Join-code link → validates auth + player profile → looks up team by
   `join_code` → membership or join request depending on approval flow.

## Architecture/Data Flow

```txt
Sign-in -> Supabase auth session -> resetSessionIdleMarker()
  -> role/profile lookup -> route to onboarding or dashboard

Coach entry decision -> resolveGolfCoachEntry(userId) [admin client]
  -> golf_team_coach_staff lookup (primary)
  -> golf_coaches.onboarding_completed (tiebreak only)
  -> { /golf/dashboard | /golf/coach/pending | /golf/coach }

Player onboarding -> create player profile -> optional joinCode handoff

Join code -> validate auth + player profile -> lookup team by join_code
  -> membership or join request
```

## Permissions/Tenancy

College/coach/player role rules gate dashboard access. The coach-entry
resolver deliberately uses the admin client — it is a routing decision, not
a data grant, and nothing it reads is returned to the caller.

## Dependencies

supabase, team_access_control (this feature is itself upstream of nearly
every other golf feature).

## Failure Modes

- Wrong coach routing overwrites `golf_coaches.organization_id` with no
  undo path — this was live in production before this week's fix. Treat any
  future change to coach-entry routing as high-blast-radius even though it
  touches no migration.
- Missing profile/onboarding state can still cause redirect loops in
  principle (pre-existing known risk; not independently re-verified this
  pass).
- Duplicate membership/join-request rows if idempotency isn't guarded on the
  join-code path.

## Observability Contract

`getGolfCoachEntry` is wrapped via `withAdminObserved('getGolfCoachEntry',
{ sport: 'golf', feature: 'auth_onboarding', observeSoftFailures: false },
...)` — a `null` return is the ordinary not-signed-in answer (not an
incident); thrown exceptions are recorded. This ties the feature into the
`admin_events`/Bridge substrate documented under `admin_platform`.

## Test Contract

- `src/lib/golf/__tests__/coach-entry-path.test.ts` — 11 cases: new coach →
  wizard; pending assistant → waiting page, never the wizard; approved
  assistant → dashboard even with a stale flag; fully onboarded head coach →
  dashboard; declined assistant → wizard (they have no program); head coach
  whose team creation half-failed stays on dashboard; failed COACH/STAFF
  reads → waiting page, not the wizard; never throws, even with a missing
  service-role key.
- `e2e/auth.spec.ts`, `src/test/lib/auth/**` (`rate-limit`,
  `session-idle-invariant`, `session-idle-shared`, `verify-player-access`,
  `verify-players-on-team`).
- `src/app/golf/actions/__tests__/access-code.test.ts` covers the signup
  gate.

## Known Debt/Unknowns

- The prior generation of this doc listed `memberships` as a Core Data
  table. **It does not exist** in `src/lib/types/database.ts` (0 matches);
  team membership is `golf_team_members`. Corrected here.
- `docs/security/auth-config.md` (the Supabase auth dashboard-settings
  mirror) was last updated 2026-04-21 and names one still-open manual
  toggle (`auth_leaked_password_protection`) that requires a project-admin
  dashboard click. Its live state was not re-checked this pass (would need
  the Supabase advisor tool) — flagged unverified, not asserted either way.
- This repo shares one working tree across parallel agent sessions. At the
  start of this verification pass, `git status` showed several
  auth-area files (`access-code.ts`, `auth.ts`, `onboarding.ts`, `teams.ts`,
  `signup-gate.ts`, `golf-sign-up-form.tsx`, `callback/route.ts`,
  `(auth)/signup/page.tsx`, `join/[code]/page.tsx`,
  `(onboarding)/coach/page.tsx`, `(dashboard)/layout.tsx`) as locally
  modified; by the time this doc was written all had landed on `HEAD`
  (`c567bcd44f`) or an ancestor. This doc reflects the committed state —
  re-run `git status` before trusting it unchanged.
- The "five call sites now use one resolver" claim comes from
  `coach-entry-path.ts`'s own doc comment; this pass confirmed
  `getGolfCoachEntry` is imported at `src/app/golf/(onboarding)/coach/
  page.tsx` and used within `coach-entry.ts` itself, but did not
  individually re-read `loginAction`, the OAuth callback, and the dashboard
  layout to confirm each one now calls the shared resolver rather than a
  leftover local check.

## Incident History

No `memory/incidents/auth_onboarding_join/` directory exists yet — this
section is backfilled from source-file doc comments and `git log`, not a
durable incident file.

- **Phantom-duplicate-program bug** (UNCW 2026-08-18, Shenandoah 2026-08-19):
  root cause and fix are documented directly in
  `src/lib/golf/coach-entry-path.ts`'s file-level comment. Fix landed via
  `coach-entry.ts`/`coach-entry-path.ts` plus the assistant-coach signup
  work; commits `0b83f9ca5`, `9f7e987ea`, `6f2eb667d`, `71101b471`,
  `ec96d9b8b`, `affdb58d0`, `1017c43d7` (`git log --since=2026-08-18`).
- **`SIGNUP_ACCESS_CODE` false-critical alerting**: 10 CRITICAL alerts in
  24h on 2026-08-05, root-caused and downgraded to one-shot `info`
  (documented in `signup-gate.ts`'s own comment); reconfirmed as
  "working as designed" in tonight's triage owner-list.

## ADR Links

None yet.

## Verification Evidence

- Read in full: `src/lib/golf/coach-entry-path.ts`, `src/app/golf/actions/
  coach-entry.ts`; read `src/lib/golf/signup-gate.ts` (first 60 of 354
  lines) and `src/lib/golf/__tests__/coach-entry-path.test.ts` (test names,
  11 cases).
- `git log --since=2026-08-18` for the auth/onboarding paths: 7 commits
  found, listed above.
- Confirmed table existence/non-existence in `database.ts`: `users` (1),
  `organizations` (1), `memberships` (0 — does not exist), `golf_coaches`
  (1), `golf_players` (1), `golf_teams` (1), `golf_team_members` (1),
  `golf_team_join_requests` (1).
- Confirmed file existence for every route/action/component listed above.
- Did not execute `e2e/auth.spec.ts` or the auth unit suite live — tests
  were located, not run, in this read-only pass.
