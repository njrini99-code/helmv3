# Feature: Roster And Team

```yaml
feature_id: roster_team
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: not_started
```

## Purpose

Team membership, roster management, and the coach/player-facing team info
surfaces. A coach uses roster/team views to manage who's on the team and
inspect players; a player uses team views to see their coach, roster, and
role-specific team info.

## User Contract

- A coach sees and manages only their own team's roster.
- A player sees roster and team info scoped to their own team.
- Status shown on a roster entry reflects real, current membership state —
  not a stale or fabricated lifecycle stage.
- A coach who staffs more than one team can switch which team their roster
  writes target, and the UI reflects which team is currently active.

## Current Behavior

Roster membership status lives on `golf_team_members.status`, typed as the
Postgres enum `team_member_status`. **This is a hard correction to the prior
generation of this doc, which described player status as "active, inactive,
redshirt, medical, transfer."** The real enum, confirmed directly against
`src/lib/types/database.ts`, is exactly `"pending" | "active" | "inactive" |
"removed"` — four values, and none of them is redshirt, medical, or transfer.
`FairwayPlayerStatusBadge.tsx` documents this explicitly in its own comments:
`'injured'` and `'redshirt'` were removed from the status picker because they
were "never valid" backing values; the picker exposes only Active/Inactive
(pending/removed are lifecycle-only, driven by the join flow and removal
action, not a manual picker choice).

`roster.ts` is smaller than its file listing suggests: only two exported
actions, `removePlayerFromTeam()` and `getTeamPlayers()`. Most
membership/invite logic — join requests, invite codes, coaching staff
management — lives in `teams.ts`, not `roster.ts`: `joinGolfTeam`,
`processGolfTeamInvitation`, `createTeamJoinRequest`, `getTeamJoinRequests`,
`acceptJoinRequest`, `rejectJoinRequest`, `cancelJoinRequest`,
`regenerateJoinCode`, `createStaffInvite`, `redeemStaffInvite`,
`listTeamCoachingStaff`, `addSecondTeam`. A coach who staffs a second team
selects the active one via a server-validated `golf_active_team` cookie;
`getCoachTeamId()` in `roster.ts` resolves through
`resolveCoachTeamIdWithCookie()` rather than assuming a single team per coach.

## Invariants

- Coach membership and team management route through `golf_team_coach_staff`.
- `golf_team_members.status` is constrained to the four real enum values
  above — do not introduce or document a fifth status without a migration.
- A pending join request must not become active membership without going
  through the intended approval path (`acceptJoinRequest`).
- Roster/player-profile reads are team-scoped.
- Player profile stats are derived from rounds/cache data, not hand-entered
  roster fields.

## Primary Journeys

1. **Roster list**: coach reads team members, players, pending join
   requests, and recent round summaries; renders roster cards with status and
   pending-request visibility.
2. **Player profile**: reads player identity + recent rounds; stats sections
   load separately (suspense) rather than blocking the page.
3. **Team page**: coach sees editable team settings; player sees read-only
   team info, roster snapshot, and (if relevant) announcements/tasks.
4. **Multi-team coach**: a coach who staffs two teams switches the active
   one via the team-switcher; writes from `roster.ts`/`teams.ts` target
   whichever team `golf_active_team` currently resolves to.

## Architecture/Data Flow

```txt
Roster list
  -> read team members, players, join requests, recent round summaries
  -> render roster cards, status, pending requests

Player profile
  -> read player profile and recent rounds
  -> suspense-load stats sections

Team page
  -> coach: editable team settings
  -> player: read-only team info, roster snapshot, announcements, tasks

Coach team switch
  -> resolveCoachTeamIdWithCookie() reads golf_active_team cookie (validated server-side)
  -> subsequent roster/team writes target the resolved team_id
```

## Permissions/Tenancy

Enforced through the shared RLS + server-action-auth pattern documented in
`team_access_control`. `golf_team_coach_staff` is the authorization edge for
"is this coach allowed to act on this team," including for coaches staffing
more than one team.

## Dependencies

- `team_access_control` (auth/RLS enforcement; this doc does not duplicate
  policy definitions).
- `stats_analytics` (player profile stats sections).
- `team_operations` / `team_communications` (team page surfaces
  announcements and tasks for players).

## Failure Modes

- **Join/approval/membership drift.** If `golf_team_join_requests` and
  `golf_team_members` are updated inconsistently (e.g. a partial write during
  approval), a request can appear pending while membership already exists,
  or vice versa. `acceptJoinRequest`/`rejectJoinRequest`/`cancelJoinRequest`
  are the only sanctioned paths — a direct membership write that bypasses
  them is a correctness risk.
- **Cross-team leakage.** A roster/team access bug can expose one team's
  roster detail to a coach or player scoped to a different team; this is the
  class of bug `team_access_control`'s RLS layer exists to prevent.
- **Multi-team cookie desync.** If `golf_active_team` and the coach's actual
  staffed-team set drift (e.g. removed from a team but the cookie still
  points at it), writes could target a team the coach no longer staffs unless
  `resolveCoachTeamIdWithCookie()`'s server-side validation catches it —
  verify this path specifically if changing multi-team coach behavior.

## Observability Contract

No feature-specific observability contract (custom metrics, alert
thresholds) is defined in code as of `last_verified_sha` beyond the shared
`logServerError()` convention.

## Test Contract

- `src/app/golf/actions/__tests__/dashboard-data.test.ts` — covers
  `getCoachDashboardData`, including a team-staffing authorization check
  ("refuses a teamId the caller does not staff").
- `e2e/roster.spec.ts`, named in `memory/registry.yml` for this feature,
  **does not exist** — confirmed absent from `e2e/`. Roster-adjacent E2E
  coverage currently lives in `e2e/golf-critical-paths.spec.ts` instead.
- `supabase/tests/rls/golf_team_coach_staff.sql` is the relevant pgTAP RLS
  coverage for coach/team authorization. No dedicated RLS test exists for
  `golf_team_members` or `golf_team_join_requests` themselves.

## Known Debt/Unknowns

- `memory/registry.yml` cites `src/components/golf/dashboard/team-pulse-card.tsx`
  and its test for this feature; **neither exists anywhere in `src/`**,
  confirmed by repo-wide search. This is dead registry content, not a
  missing feature to build — remove the citation rather than treat it as a
  gap to fill.
- "Online status" (if surfaced anywhere via `users.last_seen`) should remain
  a lightweight presence signal, not a permission source; not independently
  re-verified this pass whether any current UI actually reads it.

## Incident History

No incidents specific to this feature were found in this week's operational
ledger (`/tmp/claude/night/ledger.md`) or in `memory/incidents/` (README stub
only as of `last_verified_sha`). A calendar-feature fix this week (#1470,
commit `62d469df8`) was initially miscategorized as roster-related in an
early read of the ledger — its own commit message ("calendar ALL now shows
the whole team's schedule") confirms it is `calendar_events` scope, not
`roster_team`; it is correctly excluded from this doc.

## ADR Links

None recorded yet — `memory/decisions/` contains only a README stub as of
`last_verified_sha`.

## Verification Evidence

- `team_member_status` enum confirmed at `src/lib/types/database.ts:21460`
  and its values array at line 21676: exactly `pending, active, inactive,
  removed`. `golf_players` table confirmed to carry no status column of its
  own (identity fields only) — status is a team-membership property on
  `golf_team_members`, not a player property.
- `FairwayPlayerStatusBadge.tsx` comment block (lines ~23-55) read directly,
  confirming `redshirt`/`injured` were deliberately dropped as invalid.
- `roster.ts` exports enumerated via direct grep (`removePlayerFromTeam`,
  `getTeamPlayers` only); `teams.ts` join/staff exports enumerated via direct
  grep (function names cited above).
- `e2e/roster.spec.ts` confirmed absent via `find e2e -iname "*roster*"`
  (zero results) and a full directory listing of `e2e/`.
- `team-pulse-card` confirmed absent via repo-wide `find`.
- Tables (`golf_players`, `golf_coaches`, `golf_teams`, `golf_team_members`,
  `golf_team_join_requests`, `golf_team_coach_staff`, `users`) confirmed
  present in `src/lib/types/database.ts`.
