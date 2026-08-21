# Feature: Settings And Preferences

- feature_id: settings_preferences
- status: active
- criticality: medium
- last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
- last_verified_at: 2026-08-21
- history_backfill: not_started (memory/ledgers/{changes,tests,operations}/settings_preferences.md do not exist yet)

## Purpose

The role-aware configuration hub: account info, preferences, notifications,
golf profile/scoring, team settings, CoachHelm toggles, and coaching
intelligence thresholds.

## User Contract

Each role sees only the settings that can apply to it. Notification
controls must match actual delivery behavior. A saved preference that
nothing downstream consumes should not be presented as if it changes
behavior.

## Current Behavior

All three registry-listed routes are confirmed live and Fairway-rendered
(component imports checked directly per route, not inferred):

- `settings/page.tsx` → `FairwaySettingsGeneral`
  (`src/components/fairway/pages/settings`)
- `settings/notifications/page.tsx` → `FairwaySettingsNotifications`
- `settings/coaching-intelligence/page.tsx` →
  `FairwaySettingsCoachingIntelligence`

`memory/registry.yml`'s `components:` list for this feature
(`src/components/golf/settings/**`,
`src/components/golf/coachhelm/settings/**`) is directionally right in that
both directories still exist on disk, but the routes actually render the
`src/components/fairway/pages/settings/**` tree — the registry names the
old package that the pages no longer import.

`settings/notifications/page.tsx` carries an explicit contract note in its
own header comment: it is the player-scoped V3 notification authority,
mirrors `NotificationsPanel` inside `FairwaySettingsGeneral.tsx` for
layout, excludes coach-only categories from the player matrix, rolls back
a failed optimistic save, and renders a non-404 "unavailable" state for a
coach without a player profile rather than erroring.

## Invariants

- Account/profile updates are scoped to the authenticated user only.
- Coach team settings require coach/team authorization.
- LocalStorage-only preferences must not be described or built as if they
  are server-enforced.
- The player notification matrix must exclude coach-only categories (
  stated directly in `settings/notifications/page.tsx`'s header comment).

## Primary Journeys

```txt
Player/coach opens /golf/dashboard/settings
  -> FairwaySettingsGeneral renders account, preferences, golf profile,
     AI features, team (coach), legal, danger zone sections

Player opens /golf/dashboard/settings/notifications
  -> load per-category prefs via v3/notification-prefs.ts
  -> optimistic save; roll back on failure
  -> coach without a player profile sees an "unavailable" state, not a 404

Coach opens /golf/dashboard/settings/coaching-intelligence
  -> FairwaySettingsCoachingIntelligence exposes CoachHelm behavior
     thresholds/weighting/toggles (coaching-philosophy.ts,
     src/lib/coachhelm/v3/foundation)
```

## Architecture / Data Flow

Coaching philosophy is fetched server-side via
`src/app/golf/actions/coaching-philosophy.ts` and passed into
`FairwaySettingsGeneral`/`FairwaySettingsCoachingIntelligence` as props —
no direct `golf_coach_philosophy` query was found inside the settings
component files themselves, which is expected for a server-actions
architecture but worth knowing if debugging a stale-prop issue.
`golf_coachhelm_settings` is read from `src/app/golf/actions/insights.ts`,
not from a file under `settings/`, so a settings change to CoachHelm
toggles routes through the insights action layer.

## Permissions / Tenancy

Role-gating happens per-route/per-component (player matrix excludes
coach-only categories; coach-only routes require coach role) — not
independently re-verified against RLS policy text this pass.

## Dependencies

CoachHelm AI (coaching intelligence thresholds directly affect AI
behavior), notification delivery (push/email, `foundation/push.ts`,
`foundation/email.ts`).

## Failure Modes

- A coach without a player profile hitting the notifications route is
  handled explicitly (non-404 unavailable state) — confirmed by the page's
  own header comment, not independently exercised in a browser this pass.
- An optimistic save that fails must roll back visibly; not independently
  reproduced this pass.

## Observability Contract

Not independently mapped this pass; no dedicated Sentry tag search run.

## Test Contract

Confirmed present: `src/test/coachhelm/v3/notifications.test.ts`. No
dedicated unit test file for `notification-prefs.ts` or
`coaching-philosophy.ts` was found by direct search this pass (both come
up empty under `src/app/golf/actions/v3/__tests__` and
`src/app/golf/actions/__tests__`) — worth confirming whether
`notifications.test.ts` actually covers the action file or only the
downstream consumer.

## Known Debt / Unknowns

- **`src/lib/coachhelm/v3/foundation/flags.ts`, named by
  `memory/registry.yml`'s `settings_preferences.code.services`, does not
  exist.** The `foundation/` directory contains exactly three files:
  `email.ts`, `push.ts`, `generator-toggles.ts`. Checked whether
  `generator-toggles.ts` is the intended target: it is not — nothing under
  `src/app/golf/actions/coaching-philosophy.ts`,
  `src/app/golf/actions/v3/notification-prefs.ts`, or
  `src/components/fairway/pages/settings/**` imports it. Its only two
  importers are `src/lib/coachhelm/v3/counterfactual/
  player-cohort-loader.ts` and `src/lib/coachhelm/v3/generators/
  tee-strategy.ts` — internal per-generator opt-out plumbing, not a
  settings-surface concern at all. None of the three real `foundation/`
  files is wired to this feature's action/route layer; the registry
  citation has no live replacement and should simply be removed, not
  repointed.
- **The registry's `components:` list points at the pre-redesign package**
  (`src/components/golf/settings/**`), while the live routes render
  `src/components/fairway/pages/settings/**`. Both old-package directories
  still exist on disk (unlike several sibling features where the old path
  was deleted outright), so this is a "points at the wrong tree" gap, not
  a "points at nothing" gap — lower urgency than the dead-path cases found
  in `player_hub`/`qualifiers`/`shot_tracking`, but still wrong.
- Prior-generation doc's stated risk that "coach notification preferences
  are still not generalized into a V3 coach-scoped notification state
  table" was not independently re-checked against
  `notification-prefs.ts` this pass — carried forward as unconfirmed, not
  re-verified true.
- No unit test found for `notification-prefs.ts` or
  `coaching-philosophy.ts` specifically (see Test Contract) — an open gap
  worth closing given this feature directly gates CoachHelm behavior.

## Incident History

None recorded in `memory/incidents/settings_preferences/`.
`docs/PUSH_NOTIFICATION_AUDIT.md` is registry-linked as the incident doc
but was not re-read in full this pass.

## ADR Links

None recorded.

## Verification Evidence

Files read: all three route files (grep for Fairway component imports),
`settings/notifications/page.tsx` header comment (read in full for its
explicit contract statements). Tables confirmed present in
`src/lib/types/database.ts`: `users`, `golf_coaches`, `golf_players`,
`golf_teams`, `golf_team_settings`, `golf_coachhelm_settings`,
`golf_coach_philosophy`. `foundation/flags.ts` absence and actual
`foundation/` directory contents confirmed by direct filesystem listing.
`golf_coachhelm_settings` and `golf_coach_philosophy` call-site locations
confirmed by grep, not assumed from the old doc's prose.
