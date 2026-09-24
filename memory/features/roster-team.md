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

Player profile (coach player field sheet, /roster/[id])
  -> read player, membership, career stats, SG standing rows,
     open focus areas and the last 12 scored rounds in ONE parallel batch
  -> each optional read carries its own `*Unavailable` boolean beside its
     array, so a failed fetch never renders as the honest empty state
  -> one round fetch feeds three regions: the round strip's date axis,
     the 5-vs-5 scoring trend, and the round log table

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
- A route's `loading.tsx` reserves the page's paint at t=0 — for a
  `'use client'` page holding its own `loading` state that is that
  component's loading branch, not its settled layout. A route whose
  `page.tsx` is a pure `permanentRedirect` shim renders `bg-canvas` only:
  no geometry, and no real `<h1>` for a screen that never mounts.
  Reference implementation: `dashboard/alerts/loading.tsx`.

Fairway Premium Facelift (2026-09, golf only): the coach roster page
(`FairwayCoachRoster.tsx`) opens with one header `Surface`: a four-number
`StatMatrix` strip (Players, Active focus, Completed, With recent rounds) across
the top and the "Who needs your attention" seam rows under a hairline, computed
by `roster-health.ts`. Below it a bare `Toolbar` (search, Needs attention
filter, sort `Segmented`, export) and a `MatrixBoard` with row selection. The
page keeps the shell's symmetric `md:px-6` gutter; launcher clearance is the
shell's `md:pb-28`, not a page gutter.

The coach player detail (`FairwayPlayerProfile.tsx`, spec
`docs/design/fairway-facelift/screens/roster-player.v3.md`) follows the same
field-sheet language: a bare masthead (avatar, name, badges, one linked
verdict sentence), ONE `Surface` holding the page-local `RoundStrip`
instrument beside the shared `FieldReadouts` column, a bare two-column ledger
row (strokes-gained off one shared VERTICAL zero rule, open focus areas), and
a round log table with a `md:hidden` stacked list beside it. Derivations live
in `roster-player-logic.ts` (pure, no JSX); parts in
`roster-player-parts.tsx`. `RoundStrip` is PAGE-LOCAL by design — it reuses
`ScoreField`'s exported geometry (`dateFraction`, `scoreFieldTicks`,
`scoreFieldCap`) at single-row scale and is deliberately NOT registered in
`modules/index.ts`, `modules/types.ts` or `registry.ts`. `today` arrives as a
bare `YYYY-MM-DD` prop from the loader; nothing reads a clock during render,
and date-only columns are parsed at local midnight. Plotted rounds are bounded
to ±5 years of today (`DOMAIN_LIMIT_YEARS`) so a corrupt production date
cannot collapse the axis; the table still lists every fetched row. This
replaced the `StatMatrix` mislabeled "Season", the standalone Standing
`Surface`, the Focus/Recent two-`Surface` grid, and the Game/Genome/Rounds
`Segmented` row — which also removed the in-page `?area=` `StatsSpineStage`
drill (a conscious trade, logged in the spec's Risks).

## Known Risk Areas

- Joining, approval, and active membership can drift if `golf_team_join_requests` and `golf_team_members` are not updated intentionally.
- Coach/team access bugs can expose roster details across teams.
- Online status based on `users.last_seen` should remain a lightweight signal, not a permission source.

## Tests To Prefer

- `e2e/roster.spec.ts` no longer exists — golf roster flows are covered by `e2e/golf-dashboard.spec.ts`
- the team-pulse-card test was removed with its component
- RLS tests for team membership and join-request changes.

## Related Docs

- `memory/context/golfhelm-features.md`
- `docs/architecture/USER_ROLE_DATA_OWNERSHIP.md`
- `memory/features/auth-onboarding-join.md`

The player roster owns the standard 16px phone gutter when used as a page. Phone teammates use
compact rows with one 44px message action; embedded rosters retain their host gutters, and desktop
cards keep their existing layout. The route skeleton follows the compact player anatomy.
