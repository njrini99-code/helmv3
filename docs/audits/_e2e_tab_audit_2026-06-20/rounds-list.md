## Rounds list [both]

Audited: 2026-06-20
Route: `/golf/dashboard/rounds`
Feature ref: golfhelm-features.md #1 Round Tracking
Live design path: **Fairway** (`NEXT_PUBLIC_REDESIGN=true` in `.env.local`; redesign confirmed ON in prod per memory). The legacy `RoundLibraryClient` path is dormant.

---

### End-to-end wiring (file:line)

**Role gate + auth**
- `src/app/golf/(dashboard)/dashboard/rounds/page.tsx:37-41` — `getGolfSessionProfile()`; redirects to `/golf/login` when no session or no role. Layer-2 gate; the dashboard layout (`src/app/golf/(dashboard)/layout.tsx:34-35`) already redirects unauthenticated users. `getGolfSessionProfile()` resolves role from profile presence (`session.ts:142-167`).
- `dynamic = 'force-dynamic'` (page.tsx:26) — no stale caching of round lists.

**Coach data path (TEAM rounds)** — `page.tsx:52-126`
1. `resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)` (page.tsx:54) → cookie-aware, staff-strict team resolution (`resolve-team-server.ts` → `resolve-team.ts:183`). Honors the men's/women's wall via `validateCoachTeamAccess` (`resolve-team.ts:125`).
2. `golf_team_members.select('player_id').eq('team_id', teamId)` (page.tsx:98-102) → list of player IDs. **No `status` filter.**
3. `golf_rounds.select(playerSelectFields).in('player_id', teamPlayerIds).eq('status','completed').order('round_date', desc).limit(50)` (page.tsx:111-117). Coach gets NO in-progress rounds (by design).

**Player data path (OWN rounds)** — `page.tsx:127-161`
- `Promise.all` of two queries: completed (`.eq('player_id', player.id).eq('status','completed').order('round_date', desc).limit(50)`) and in_progress (`.eq('status','in_progress').order('updated_at', desc)`, no limit). page.tsx:130-144.
- In-progress rounds rendered only for players (`hasUnfinished`, page.tsx:201).

**Stats summary** — `page.tsx:164-199`. Server-computed once; passed to client. Normalizes 9-hole rounds to 18-hole equivalents (`total_score * 18/hp`). Trend compares last-5 vs prev-5 normalized scores (needs ≥6 scored rounds).

**Render fork** — `page.tsx:206-281`
- Flag ON → `FairwayRoundsLibrary` (`src/components/fairway/pages/rounds/FairwayRoundsLibrary.tsx`). Receives `rounds`, `inProgressRounds`, `userRole`, `stats` verbatim.
- Flag OFF → `LargeTitleHeader` + `UnfinishedRoundsSection` + `RoundLibraryClient` (legacy; dormant).

**Row actions / interactive controls**
- Row → `Link href={/golf/dashboard/rounds/${id}}` (FairwayRoundRow.tsx:73, RoundLibraryClient.tsx:222). Detail route exists and is independently gated: coach access requires `golf_team_members` membership of the round's player; otherwise redirect to `/golf/dashboard` (`[id]/page.tsx:117-135`). In-progress rounds redirect to continue (`[id]/page.tsx:107-109`). No leak / no dead link.
- Filter pills + Month/Week segmented — wired to `useState` (FairwayRoundsLibrary.tsx:195-196, 426-453). Real counts from rounds array (filterCounts, :203-217).
- New round CTA — player-only (`primaryAction`, FairwayRoundsLibrary.tsx:280-284) → `/golf/dashboard/rounds/new` (exists).
- In-progress "Continue" → `/golf/dashboard/rounds/continue/[id]` (exists; FairwayUnfinishedBanner.tsx:109-111). "Discard" → two-step confirm → `deleteInProgressRound` (banner :114-127).

**Delete mutation** — `deleteInProgressRound` (`golf.ts:4636-4693`)
- `auth.getUser()` check first (:4646-4649). Scopes the delete to `.eq('player_id', player.id).eq('status','in_progress')` (:4662-4667) — a player can only delete their own in-progress round. NOT a destructive delete-then-insert; cascades to holes/shots. Calls `revalidatePath('/golf/dashboard/rounds')` + `updateTag(CACHE_TAGS.ROUNDS)` (:4673-4674). Errors logged via `logServerError`. Correct.

**States**
- Loading: `rounds/loading.tsx` → `RoundsListSkeleton` (real skeleton, not a spinner).
- Error: `rounds/error.tsx` → `RouteErrorBoundary` with friendly copy.
- Empty: Fairway `EmptyState` with role-specific copy + player-only CTA (FairwayRoundsLibrary.tsx:405-422). Filter-zero empty has a "Clear filter" action (:456-468). Legacy empty also present (page.tsx:248-273).

**Tables touched** (all sport-prefixed, columns verified against golfhelm-database.md):
- `golf_team_members` (player_id, team_id, status) ✓
- `golf_rounds` (all selected columns exist: course_name/city/state, round_date, round_type, total_score, score_to_par, total_putts, total_fairways, total_fairways_hit, total_gir, total_gir_possible, status, holes_played, current_hole, updated_at, created_at) ✓
- `golf_players` (embedded: first_name, last_name, avatar_url) ✓
- `golf_teams`, `golf_team_coach_staff` (via resolver) ✓

---

### Expected vs actual (golfhelm-features.md #1)

- "Coach sees TEAM rounds; player sees OWN rounds" — **MATCHES.** Distinct role-scoped queries (player_id-by-team vs player_id-self). Coach gets no in-progress; player gets completed + in-progress.
- Row actions review/continue/delete — **MATCHES.** Card→detail, Continue→continue route, Discard→`deleteInProgressRound`. All wired.
- Pagination — **PARTIAL.** Both completed queries cap at `.limit(50)`. The Fairway masthead honestly says "showing most recent 50" for a saturated coach view (FairwayRoundsLibrary.tsx:269-278); there is no "load more" / infinite scroll, so rounds 51+ are unreachable from this tab. Player rarely hits 50; a multi-player team will. See FW-ROUNDS-01.
- Known Gaps in the doc (SG null, offline shots, draft-in-notes) are out of scope for the list view and not surfaced here.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| MEDIUM | wrong-data | page.tsx:98-102 | Coach team-member query has **no `status` filter** (`golf_team_members.select('player_id').eq('team_id', teamId)`), unlike every other coach surface (dashboard-data.ts:282, insights.ts:621, player-profile-stats.ts:78/323 all `.eq('status','active')`). | A graduated/transferred/inactive/redshirt/medical player's completed rounds keep appearing in the coach's team Rounds library, while that same player's profile is access-denied to the coach (player-profile-stats is active-only) — inconsistent roster scoping. | Add `.eq('status','active')` to the team-member query to match the established active-roster convention. |
| MEDIUM | pagination-cap | page.tsx:111-117 (coach), page.tsx:130-137 (player) | Completed-rounds query hard-caps at `.limit(50)` with no "load more"/range pagination. Coach teams with >50 completed rounds (easily exceeded by a full roster over a season) silently lose access to older rounds from this tab. | Older team rounds are unreachable from the Rounds list; coach stat strip + period groups only ever reflect the most-recent 50. The Fairway header is honest about it ("showing most recent 50") but offers no way to page further. | Add range-based pagination (`.order('round_date').range()`) or a "load more" control; or scope the cap per-player for the coach view. |
| LOW | rls | page.tsx:111-117 vs golf_rounds RLS (migration 20260527000000_prod_public_baseline.sql:19517-19523) | Coach query filters by `player_id IN (teamPlayerIds)` but the `golf_rounds` SELECT RLS for a coach is keyed on `team_id IS NOT NULL AND is_golf_team_coach(team_id)`. A round saved with `team_id = NULL` (column is nullable; `getPlayerTeamId` returns null when the player has no **active** membership — golf.ts:523-535) is invisible to the coach even though the app asked for it by player_id. | Edge-case data invisibility: rounds a player logged while pending/inactive won't show in the coach library even after the player is activated (the round's team_id stays null). Happy path (active player) is unaffected. | Backfill `golf_rounds.team_id` on activation, or add a coach RLS clause that resolves team via `golf_team_members` (as `golf_rounds_update_team` already does), so coach read matches the player_id-based app query. |
| LOW | wrong-data | RoundLibraryClient.tsx:225, page.tsx:225 | **Legacy path only (dormant).** When the redesign flag is OFF, the `LargeTitleHeader` subtitle (`${rounds.length} rounds recorded`) and hero (`stats.totalRounds`) both display the capped count (max 50) with no "most recent 50" qualifier — the Fairway path fixes this (FairwayRoundsLibrary.tsx:275). | Misleading total for a coach with >50 rounds, but only when `NEXT_PUBLIC_REDESIGN` is off; prod runs with it on, so this is currently unreachable. | If the legacy path is ever re-enabled, mirror the Fairway cap-note; otherwise remove the legacy branch. |
| INFO | correctness | page.tsx:180,183 / FairwayRoundsLibrary.tsx:143 | 9-hole rounds are normalized to 18-hole equivalents for avg/best/sparkline (`total_score * 18/hp`). This is intentional and documented, applied consistently across page + Fairway. No bug — noted so a reader doesn't mistake a doubled 9-hole "best" for an error. | None. | None. |

---

### Notes / coverage

- Role-gate, auth, mutation safety (auth-first, scoped delete, revalidate, no delete-then-insert), correct server/client Supabase clients, loading/empty/error states, and cross-feature links (detail, continue, new) are all correctly wired.
- No N+1: coach path is 2 sequential queries (team_members, then rounds with embedded player); player path is 2 parallel queries. No per-row fetching.
- No realtime on this tab (none expected per feature doc; auto-save lives in the round-entry flow, not the list).
- The two MEDIUM findings and the LOW RLS finding are the only substantive issues; both MEDIUMs are confirmable live by viewing a coach account with an inactive ex-roster player who has rounds (FW-ROUNDS status filter) and a team with >50 completed rounds (pagination cap).
