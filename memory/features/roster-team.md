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
- `src/components/fairway/pages/team/FairwayTeamSettings.tsx`
- `src/components/fairway/pages/team/FairwayTeamInfo.tsx`
- team-pulse-card was removed; no successor component

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
- Roster membership now has a messaging side effect. The definer helper
  `public.golf_user_on_conversation_team(uuid, uuid)`
  (`supabase/migrations/20260907160000_golf_team_chat_membership_management.sql`,
  APPLIED to production 2026-09-08) reads
  `golf_team_members` and `golf_team_coach_staff` to decide who may be added to or
  removed from a team chat. Removing someone from either roster table therefore also
  removes the ability to add them to a team conversation. Nothing about joining,
  approval, or roster status changed; the coupling runs one way, roster → messaging.
  The messaging contract itself lives in `memory/features/team-communications.md`.

## Tests To Prefer

- `e2e/roster.spec.ts` no longer exists — golf roster flows are covered by `e2e/golf-dashboard.spec.ts`
- the team-pulse-card test was removed with its component
- RLS tests for team membership and join-request changes.

## Related Docs

- `memory/context/golfhelm-features.md`
- `docs/architecture/USER_ROLE_DATA_OWNERSHIP.md`
- `memory/features/auth-onboarding-join.md`

<!--
  `golf_user_on_conversation_team` was declared `schema-drift-absent` here while
  20260907160000 was written but unapplied. The owner applied that migration on
  2026-09-08 and `npm run db:types` now carries the function, so the whole
  declaration was removed as its own wording instructed — keeping it would
  exempt a live object from the drift check.
-->
