# Feature: Auth Onboarding And Join

## Status

- active

## Current State

Auth, onboarding, and join flows establish user identity, role-specific setup, player/coach profiles, and team membership. This is the front door for GolfHelm and a dependency for every dashboard feature.

Coach and player onboarding are separate routes. Join-code links can redirect users into player onboarding when the player profile is incomplete.

## Primary Entry Points

### Routes

- `src/app/golf/(auth)/**`
- `src/app/golf/(onboarding)/coach/**`
- `src/app/golf/(onboarding)/player/**`
- `src/app/golf/join/[code]/**`

### Components

- `src/components/golf/onboarding/**`
- `src/app/golf/join/[code]/golf-join-team-client.tsx`
- `src/components/golf/settings/JoinTeamSection.tsx`

### Actions And Services

- `src/app/golf/actions/auth.ts`
- `src/app/golf/actions/onboarding.ts`
- `src/app/golf/actions/access-code.ts`
- `src/app/golf/actions/roster.ts`
- `src/lib/auth/**`
- `src/lib/supabase/**`
- `src/lib/observability/golf-login-outcome.ts` — `recordLoginOutcome`,
  called from every `loginActionImpl` return branch (Sentry
  `helm.auth.*` + a structured log line). Lives in its own module rather
  than inside `auth.ts` itself: that file opens with `'use server'`, and
  Next.js requires every export from such a file to be an async Server
  Action, which this synchronous telemetry helper is not.

## Core Data

- `users`
- `organizations`
- `memberships`
- `golf_coaches`
- `golf_players`
- `golf_teams`
- `golf_team_members`
- `golf_team_join_requests`

## Data Flow

```txt
User signs in
  -> Supabase auth session
  -> reset the shared idle marker in the successful login response
  -> role/profile lookup
  -> route to coach/player onboarding or dashboard

Coach onboarding
  -> create coach profile/team/org context
  -> prepare invite/join path

Player onboarding
  -> create player profile
  -> optional joinCode handoff

Join code
  -> validate auth and player profile
  -> lookup team by join_code
  -> create membership or join request depending on approval flow
```

## Business Rules

- Server actions must call `supabase.auth.getUser()` before database access.
- Every successful password/demo sign-in must call `resetSessionIdleMarker()` before redirecting. The idle marker intentionally survives old sessions; failing to replace it makes middleware immediately invalidate a fresh session and forces a second sign-in.
- Join codes are team-scoped and should be treated case-insensitively where the route expects that behavior.
- Incomplete player onboarding should redirect to player onboarding with join context preserved.
- A session that expires mid-request on `/golf/dashboard` (passes the top-of-page check, fails the data-fetch re-validation with `Not authenticated`) redirects to `/golf/login?returnTo=/golf/dashboard` instead of hitting the error boundary. Retryable auth failures (network / GoTrue 5xx) still surface to the error boundary — only a genuinely missing/expired session redirects.
- College/coach/player role rules must be respected before granting dashboard access.
- Service-role logic must stay server-only and admin-bounded.

## UI Contract

- Auth/onboarding errors should be specific enough to recover: not signed in, missing profile, invalid code, already joined, or pending approval.
- Join confirmation should show team identity before mutating membership.
- Mobile onboarding should use the shared app shell patterns where applicable and avoid losing progress.

## Known Risk Areas

- Join flow can create duplicate membership or request records if idempotency is not guarded.
- Missing profile/onboarding state can cause redirect loops.
- Auth helpers and route guards can silently drift from server-action auth requirements.
- **A join/claim/accept-invite flow reads its target resource BEFORE the
  membership that would authorize reading it exists — an RLS tightening on
  that resource's SELECT policy can silently break the flow meant to create
  that very membership.** This happened for real: closing a `golf_teams`
  leak with `USING (is_golf_team_coach(id) OR is_golf_team_player(id))`
  broke `validateGolfPlayerCanJoinTeam` (`src/app/golf/actions/teams.ts`),
  whose pre-flight "does this team exist?" read used the same policy — a
  player about to join is neither a coach nor a player yet, so the read
  returned zero rows, reported "Team not found", and abandoned the join
  before the `SECURITY DEFINER` insert (which works fine) ever ran. Both
  `/golf/join/[code]` and signup-with-team-code funnel through
  `processGolfTeamInvitation` (`src/app/golf/actions/onboarding.ts`), so the
  blast radius of a similar future tightening would again be total. Any
  future SELECT-policy change on a table read during onboarding/join/claim
  must be checked with the role-impersonation technique in
  `memory/context/engineering-methodology.md`'s Row-Level Security section,
  specifically as a user in the PRE-membership state — a probe shaped like
  an existing member proves nothing here. A shared-mock unit test cannot
  catch this class either, because a mock that returns seeded data for every
  `.from(table)` call can never express a denial. (STU, source:
  `rls-tightening-broke-the-flow-it-guarded.md` dated 2026-08-04; verified
  2026-09-05 that `validateGolfPlayerCanJoinTeam` and
  `processGolfTeamInvitation` both exist at the cited paths.)

## Tests To Prefer

- `e2e/auth.spec.ts`
- `e2e/golf-team-join.spec.ts` no longer exists — join flows are covered by `e2e/auth.spec.ts`
- `src/test/lib/auth/**`
- RLS tests when membership or join-request tables change.

## Related Docs

- `docs/architecture/COMPREHENSIVE_AUTH_SYSTEM_PLAN.md`
- `docs/architecture/USER_ROLE_DATA_OWNERSHIP.md`
- `docs/security/auth-config.md`
