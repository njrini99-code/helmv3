# Feature: Settings And Preferences

## Status

- active

## Current State

Settings is the role-aware configuration hub for account information, preferences, notifications, golf profile/scoring, team settings, CoachHelm toggles, and coaching intelligence.

The per-category notification page is the player-scoped V3 notification authority. It excludes coach-only categories from the player matrix, rolls back failed optimistic saves, and shows a non-404 unavailable state when a coach without a player profile reaches the route.

Some preferences are saved locally and not yet consumed globally, so agents should distinguish persisted UI preferences from behavior that is actually applied.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/settings/page.tsx`
- `src/app/golf/(dashboard)/dashboard/settings/notifications/page.tsx`
- `src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/page.tsx`

### Components

- `src/components/golf/settings/**`
- `src/components/golf/coachhelm/settings/**`

### Actions And Services

- `src/app/golf/actions/v3/notification-prefs.ts`
- `src/app/golf/actions/coaching-philosophy.ts`
- `src/app/golf/actions/teams.ts`
- `src/lib/coachhelm/v3/foundation/flags.ts`

## Core Data

- `users`
- `golf_coaches`
- `golf_players`
- `golf_teams`
- `golf_team_settings`
- `golf_coachhelm_settings`
- `golf_coach_philosophy`
- notification preference columns/tables depending on current migration state.

## Business Rules

- Account/profile updates must be scoped to the authenticated user.
- Coach team settings require coach/team authorization.
- Coaching intelligence settings affect CoachHelm behavior and should be reviewed as product logic, not only preferences.
- Notification settings must match actual notification delivery behavior.
- LocalStorage-only preferences should not be described as server-enforced.

## UI Contract

- Settings should clearly separate account, preferences, golf settings/profile, AI features, team, legal, and danger zone.
- Role-specific panels should not show controls that cannot apply to the current role.
- Notification controls should disclose email/push distinctions.
- Coaching intelligence controls need clear sensitivity, threshold, weighting, and toggle semantics.

## Known Risk Areas

- Appearance preferences are saved but not broadly consumed.
- Location defaults are saved but round creation may not prefill from them.
- Notification UI can drift from actual push/email implementation.
- Coach notification preferences are still not generalized into a V3 coach-scoped notification state table; coach preferences remain a backend/product backlog item.
- CoachHelm toggle/settings can affect AI behavior without obvious downstream feedback.

## Tests To Prefer

- `src/test/coachhelm/v3/notifications.test.ts`
- Browser/mobile checks for settings panels touched by a change.
- RLS/action tests when account, team, or notification persistence changes.

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/features/coach-intelligence-triage.md`
- `docs/PUSH_NOTIFICATION_AUDIT.md`
