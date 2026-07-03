## Roster + member detail [both]

End-to-end audit of the GolfHelm Roster tab (`/golf/dashboard/roster`) and the
coach member-detail page (`/golf/dashboard/roster/[id]`), tracing both the coach
and player code paths through the legacy (flag-off) and Fairway redesign
(flag-on, default in prod) forks.

Date: 2026-06-20

---

### Routes audited
- `/golf/dashboard/roster` (coach view + player view, both forks)
- `/golf/dashboard/roster/[id]` (coach member-detail, both forks)
- linked: `/golf/dashboard/players/[playerId]` (coach AI-insight drill-down), `/golf/dashboard/stats?player=`, `/golf/dashboard/messages?player=`

---

### How the tab is actually wired end-to-end

**Role resolution.** `roster/page.tsx` calls `getGolfSessionProfile()`
(`src/lib/auth/session.ts:142`), which returns `{ coach, player }` from
`golf_coaches` / `golf_players`. `role = coach ? 'coach' : player ? 'player' : null`.
The page branches on `if (!coach)` → player path; otherwise coach path. The
detail page (`roster/[id]/page.tsx:101`) does `if (!coach) redirect('/golf/login')`
— it is coach-only.

**Coach roster READ.** Team resolved via `resolveCoachTeamIdWithCookie(supabase,
coach.organization_id, coach.id)` (cookie-aware, staff-strict — honors the
men's/women's `golf_active_team` toggle). It then reads `golf_teams` (name,
join_code) and `golf_team_members` joined to `golf_players(...user:users(last_seen))`,
filtered only by `.eq('team_id', teamId)` (page.tsx:212-230). Per-player stats
(rounds_count, avg_score) are computed from ONE batched `golf_rounds` query
(`.in('player_id', playerIds)`, page.tsx:282) — no N+1. Coach intents come from
`loadCoachIntents(coach.id)`. Flag-on renders `<FairwayCoachRoster>`; flag-off
renders the inline card grid + `RosterPageClient`.

**Player roster READ.** When `!coach`, the page looks up the player's
`golf_team_members.team_id` (`.maybeSingle()`), then fetches teammates
(`golf_team_members` → `golf_players`, `.neq('player_id', player.id)`). Flag-on
renders read-only `<FairwayPlayerRoster>`; flag-off renders `<PlayerRosterView>`.
No mutation, intent, status edit, or invite — correct player scope.

**Member detail (coach).** `roster/[id]` loads the `golf_players` row, re-resolves
`teamId` via the cookie-aware resolver, verifies `golf_team_members` membership
(`notFound()` if absent), loads last-5 `golf_rounds`. Flag-on renders
`<FairwayPlayerProfile>` (identity header + `<FairwayStatsCockpit>`); flag-off
renders inline header + Suspense `<PlayerStatsSection>` + recent rounds.

**Mutations.** Three roster writes exist:
- `removePlayerFromTeam(playerId)` (`actions/roster.ts:51`) — auth → coach →
  `getCoachTeamId` (cookie-aware) → verify membership → `.delete()` →
  `revalidatePath` + `updateTag(ROSTER/DASHBOARD)`. Single scoped delete, gated
  behind explicit confirm modal. Correct.
- `updatePlayerStatus(playerId, status)` (`actions/golf.ts:3001`) — uses
  `requireGolfCoach()` (NOT cookie-aware) → `verifyGolfTeamOwnership` →
  `.update({status})` → revalidate. **Two defects, see findings.**
- `invitePlayerToTeam` / `acceptJoinRequest` / `rejectJoinRequest` (`golf.ts`,
  `teams.ts`) — auth-checked, cookie-aware team scope, non-destructive INSERT,
  revalidate. Correct.

All status controls (`PlayerStatusBadge`, `PlayerActionsMenu`,
`FairwayPlayerStatusBadge`, `FairwayPlayerActionsMenu`) import these actions
verbatim, do optimistic UI + `router.refresh()`, and roll back on failure.

---

### Expected vs actual (golfhelm-features.md #5)

| Spec says | Actual |
|-----------|--------|
| `UPDATE golf_team_members.status (active\|inactive\|redshirt\|medical\|transfer)` | The enum `team_member_status` only allows `pending\|active\|inactive\|removed`. UI offers `active\|injured\|redshirt\|inactive`. **Spec, UI, and DB all disagree.** redshirt/injured/medical/transfer cannot persist. |
| Roster list: cards w/ avatar, name, year, handicap; online status; rounds count + avg score; pending requests; invite button | Present. (Handicap intentionally moved off the card to detail page per 2026-05-28 IA trim — documented, not a gap.) Online status from `users.last_seen < 5min`. ✓ |
| Player profile `/roster/[id]`: header, status/role badges, recent rounds (last 5), Suspense stats | Present in both forks. ✓ |
| Coach can manage (invite/remove/role); player read-only | Invite ✓, remove ✓, player read-only ✓. "role" management = status only; status partly broken (below). |

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| CRITICAL | dead-control | `src/app/golf/actions/golf.ts:3024` + `src/components/golf/roster/PlayerActionsMenu.tsx:27`, `PlayerStatusBadge.tsx:19`, `FairwayPlayerStatusBadge.tsx:57`, `FairwayPlayerActionsMenu.tsx:66` | `golf_team_members.status` is the Postgres enum `team_member_status = {pending,active,inactive,removed}` (baseline migration `20260527000000_prod_public_baseline.sql:216`, db types `database.ts:11884`). The UI offers `active/injured/redshirt/inactive`. Selecting **Injured** or **Redshirt** sends a value not in the enum; Postgres rejects it (`invalid input value for enum`), so `updatePlayerStatus` returns `{success:false,'Failed to update player status'}`. The action's comment claiming a CHECK constraint allows all four is stale — no migration adds those enum values. | 2 of 4 status options are non-functional for every coach. Coach picks "Injured", gets a generic failure toast, status never changes. Core roster-management control half-broken. | Either `ALTER TYPE team_member_status ADD VALUE 'injured'; ADD VALUE 'redshirt';` (migration) OR drop Injured/Redshirt from the four status pickers. Pick one source of truth and align spec + UI + enum. |
| HIGH | wrong-data | `src/app/golf/actions/golf.ts:3006` (`updatePlayerStatus`) → `src/lib/auth/ownership.ts:61-86` (`requireGolfCoach`) | `updatePlayerStatus` resolves the team via `requireGolfCoach()`, which does `golf_teams.select('id').eq('organization_id',…).maybeSingle()` — NOT cookie-aware and NOT staff-strict. For a men's/women's program (org with >1 team), `.maybeSingle()` returns an error (multiple rows) → `teamId=null` → action returns "Coach not assigned to a team". The roster READ and `removePlayerFromTeam` correctly use `resolveCoachTeamIdWithCookie`, so this is the lone write that ignores the toggle. | In any 2-team program, changing a player's status from the roster always fails with a misleading "not assigned to a team" error, even though the page rendered the roster fine. Also, in the (single-row) case it would target the org-default team, ignoring the active-team toggle. | Change `updatePlayerStatus` to resolve team via `resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)` like `removePlayerFromTeam` does, instead of `requireGolfCoach().team_id`. |
| MEDIUM | wrong-data | `src/app/golf/(dashboard)/dashboard/roster/page.tsx:230` | Coach roster query filters `golf_team_members` by `team_id` only — no `status` filter. Rows with status `pending` or `removed` are rendered as full roster cards (and counted in the header "N players"). `acceptJoinRequest` inserts `active`, but a removed player re-added, or any direct `pending`/`removed` row, would surface. | Roster can show players who are pending/removed as if active; player count is inflated; "active" count math (`status==='active' \|\| null`) treats unknown statuses as inactive but still lists them. | Filter the roster query to `.in('status', ['active','inactive','injured','redshirt'])` (exclude `pending`/`removed`), or at minimum exclude `removed`. |
| LOW | ux-gap | `src/app/golf/(dashboard)/dashboard/roster/[id]/page.tsx:101` | An authenticated PLAYER who navigates to `/golf/dashboard/roster/[id]` (a teammate detail) is `redirect('/golf/login')`. The login page (`(auth)/login/page.tsx:57-63`) detects the live session and bounces to `/golf/welcome?next=/golf/dashboard`. No loop, but a logged-in player gets a confusing login→welcome→dashboard bounce instead of a clean redirect. The player roster only links teammates via Message, so this is mostly direct-URL reachable. | Confusing bounce for a logged-in player hitting a coach-only detail URL; lands on dashboard, not the intended page. | `if (!coach) redirect('/golf/dashboard')` instead of `/golf/login` (matches `players/[playerId]/page.tsx:123` which already redirects players to `/golf/dashboard`). |
| LOW | ux-gap | `src/components/fairway/pages/roster/FairwayPlayerCard.tsx:121` vs `FairwayPlayerActionsMenu.tsx:157` | The same Fairway coach roster card has TWO different "view this player" destinations: the primary "View player" CTA → `/golf/dashboard/roster/${id}` (identity + stats cockpit), while the kebab "View Profile" → `/golf/dashboard/players/${id}` (AI insight: patterns/insights/predictions). Both routes exist and are valid, but they are different pages with no cross-link, so "View player" and "View Profile" silently diverge. | Coach may not realize there are two player pages; "View Profile" and "View player" feel like they should be the same. | Intentional per design notes, but consider renaming one (e.g. kebab → "AI Insights") or cross-linking the two pages so the divergence is legible. |
| INFO | revalidation | `src/components/golf/roster/PendingJoinRequests.tsx:40-49` | Legacy flag-off path fetches join requests client-side in `useEffect` (`getTeamJoinRequests()`), while the flag-on path passes server-loaded `joinRequests` into `FairwayCoachRoster`. Both correct; just two fetch strategies. No badge/realtime — requests refresh only on mount or `router.refresh()` after accept/reject (acceptable; no realtime spec for this). | None — observation. | — |

---

### Coverage notes
- Could not run the app live; the CRITICAL enum finding is grounded in the
  baseline migration (`20260527000000_prod_public_baseline.sql:216`), generated
  DB types (`database.ts:11884`), and a full migration grep (no `ADD VALUE
  'injured'/'redshirt'`). A live click on Injured/Redshirt would confirm the
  failure toast.
- The HIGH toggle-scope finding assumes a real 2-team program exists; for a
  single-team org `requireGolfCoach()` resolves fine, so the bug only bites
  multi-team programs (the men's/women's toggle population this audit focus calls
  out). Worth verifying on a real 2-team org.
- `FairwayStatsCockpit` (the stats body of the detail page) was not deep-audited
  here — it belongs to the Stats/CoachHelm unit; only its mount wiring from the
  roster detail was verified.
