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
- Join codes are team-scoped and should be treated case-insensitively where the route expects that behavior.
- Incomplete player onboarding should redirect to player onboarding with join context preserved.
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

## Tests To Prefer

- `e2e/auth.spec.ts`
- `e2e/golf-team-join.spec.ts`
- `src/test/lib/auth/**`
- RLS tests when membership or join-request tables change.

## Related Docs

- `docs/architecture/COMPREHENSIVE_AUTH_SYSTEM_PLAN.md`
- `docs/architecture/USER_ROLE_DATA_OWNERSHIP.md`
- `docs/security/auth-config.md`
