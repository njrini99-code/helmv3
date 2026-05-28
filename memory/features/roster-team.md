# Feature: Roster And Team

## Status

- active

## Current State

Roster and Team cover team membership, invite codes, player roster management, pending join requests, player profiles, and role-specific team information.

Coaches use roster/team views to manage membership and inspect players. Players use team views to understand their coach, roster, recent announcements, and pending tasks.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/roster/page.tsx`
- `src/app/golf/(dashboard)/dashboard/roster/[id]/page.tsx`
- `src/app/golf/(dashboard)/dashboard/team/page.tsx`

### Components

- `src/components/golf/roster/**`
- `src/app/golf/(dashboard)/dashboard/team/team-settings-client.tsx`
- `src/app/golf/(dashboard)/dashboard/team/team-info-player.tsx`
- `src/components/golf/dashboard/team-pulse-card.tsx`

### Actions

- `src/app/golf/actions/roster.ts`
- `src/app/golf/actions/teams.ts`
- `src/app/golf/actions/player-profile-stats.ts`

## Core Data

- `golf_players`
- `golf_coaches`
- `golf_teams`
- `golf_team_members`
- `golf_team_join_requests`
- `golf_team_coach_staff`
- `users`
- Team view also reads announcements, tasks, assignments, and recent player stats.

## Data Flow

```txt
Roster list
  -> read team members, players, join requests, recent round summaries
  -> render roster cards, status, online state, pending requests

Player profile
  -> read player profile and recent rounds
  -> suspense-load stats sections

Team page
  -> coach sees editable team settings
  -> player sees read-only team info, roster snapshot, announcements, and tasks
```

## Business Rules

- Coach membership and team management must route through `golf_team_coach_staff`.
- Player status transitions are operational state: active, inactive, redshirt, medical, transfer.
- Pending join requests should not become active membership without the intended approval path.
- Roster/player profile data must be team-scoped.
- Player profile stats are derived from rounds and cache/source data, not hand-entered roster fields.

## UI Contract

- Roster needs clear search/filter/status affordances and pending-request visibility.
- Player profile needs identity, role/status badges, recent rounds, and stats sections without blocking the whole page.
- Team page must visibly distinguish coach-editable settings from player read-only info.
- Empty states should distinguish no players, no pending requests, and no recent player activity.

## Known Risk Areas

- Joining, approval, and active membership can drift if `golf_team_join_requests` and `golf_team_members` are not updated intentionally.
- Coach/team access bugs can expose roster details across teams.
- Online status based on `users.last_seen` should remain a lightweight signal, not a permission source.

## Tests To Prefer

- `e2e/roster.spec.ts`
- `src/components/golf/dashboard/__tests__/team-pulse-card.test.tsx`
- RLS tests for team membership and join-request changes.

## Related Docs

- `memory/context/golfhelm-features.md`
- `docs/architecture/USER_ROLE_DATA_OWNERSHIP.md`
- `memory/features/auth-onboarding-join.md`
