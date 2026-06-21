## My Qualifiers (player) [player]

Audited 2026-06-20. Route: `/golf/dashboard/my-qualifiers`. Role: player.

### End-to-end wiring (actual)

**Route resolution + role gate** — `src/app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx`
- `page.tsx:10-11` resolves session via `getGolfSessionProfile()` (`src/lib/auth/session.ts:142-167`), which calls `supabase.auth.getUser()` and rejects (`null`) when unauthenticated. `page.tsx:11` redirects to `/golf/login` when no session.
- `page.tsx:14-27` gates on the **player** profile. If the user is a coach (no `player`, has `coach`), it renders the page in a bounce state with a "this feature is for players only" message instead of leaking coach data (`page.tsx:16-25`). A user that is neither coach nor player is redirected to `/golf/player` (`page.tsx:26`). Correct role gate; the page enforces its own gate, not relying on nav.

**Data fetch (server component, scoped to self)** — `page.tsx:29-141`
- `await createClient()` from `@/lib/supabase/server` (correct server client).
- Query 1: `golf_qualifier_entries` selecting `rounds_completed, total_score, total_to_par, qualifier_id` plus an embedded `qualifier:golf_qualifiers(...)`, filtered `.eq('player_id', player.id)` (`page.tsx:32-49`). **Scoped to self via the app-level `player_id` filter.**
- Query 2: `golf_rounds` selecting `qualifier_id, qualifier_round_number, total_score, score_to_par`, filtered `.eq('player_id', player.id).in('qualifier_id', qualifierIds).eq('status','completed')` (`page.tsx:64-69`). Single batched `.in()` — **no N+1**.
- All selected columns verified against `memory/context/golfhelm-database.md`: `golf_qualifier_entries` (`rounds_completed`, `total_score`, `total_to_par`, `qualifier_id`, `player_id` all exist), `golf_qualifiers` (`id, name, description, course_name, start_date, end_date, status` all exist), `golf_rounds` (`qualifier_id, qualifier_round_number, total_score, score_to_par, status, player_id` all exist). No bare/wrong table names; all sport-prefixed.
- `page.tsx:95-141` maps entries → `PlayerQualifierInfo[]` (type at `src/app/golf/actions/golf.ts:4700-4717`): per-qualifier it sums completed-round `total_score`/`score_to_par`, derives `completedRoundNumbers`, and **infers** `numRounds` (there is no `num_rounds` column on `golf_qualifiers` — confirmed in DB). `holesPerRound` is **hardcoded to 18** (`page.tsx:131`).

**Render fork (flag-gated)** — `page.tsx:53-150`
- `isRedesignEnabled()` (`src/lib/redesign/flag.ts:62-65`, reads `NEXT_PUBLIC_REDESIGN`) chooses `FairwayMyQualifiers` (`src/components/fairway/pages/my-qualifiers/FairwayMyQualifiers.tsx`) vs legacy `MyQualifiersClient` (`my-qualifiers-client.tsx`). Per project state, prod runs with the redesign ON, so the Fairway path is the live one; both paths receive identical `PlayerQualifierInfo[]`.

**Interactive controls**
- Legacy `MyQualifiersClient`: "Enter Round" button → `router.push('/golf/dashboard/rounds/new?qualifier=<id>')` (`my-qualifiers-client.tsx:188-196`); whole card is a `Link` to `/golf/dashboard/qualifiers/<id>` (`my-qualifiers-client.tsx:110-113`). Both targets exist.
- Fairway `FairwayMyQualifiers`: "Start qualifying round" → `Link` to `rounds/new?qualifier=<id>` (`FairwayMyQualifiers.tsx:49,258-265`); "View leaderboard" → `Link` to `qualifiers/<id>` (`FairwayMyQualifiers.tsx:48,266-271`). Both wired.
- **Deep-link is genuinely consumed**: `src/app/.../rounds/new/new-round-client.tsx:585-591` reads `searchParams.get('qualifier')`, sets `roundType='qualifier'` and `selectedQualifierId`. So the CTA round-trips into the entry flow correctly. No dead controls found on this tab.

**Cross-feature link targets** — `qualifiers/[id]/page.tsx:51-58` exists, redirects unauthenticated, handles both coach + player, uses `notFound()`. `rounds/new/page.tsx` exists and gates to players. Both CTA destinations resolve.

**States** — loading: `loading.tsx` → `GenericPageSkeleton` (real skeleton, not a bare spinner). Error: `error.tsx` → `RouteErrorBoundary` with friendly copy + home path. Empty: both render paths have proper empty states (`my-qualifiers-client.tsx:93-102`; `FairwayMyQualifiers.tsx:119-128`). Coach-bounce error message rendered in both (`page.tsx:17-24`; `FairwayMyQualifiers.tsx:113-118`).

**RLS (live DB, verified)** — `golf_qualifier_entries`, `golf_qualifiers`, `golf_rounds` all have `relrowsecurity=true`. `golf_qualifier_entries_select_team` allows read when `is_golf_team_coach(team_id) OR is_golf_team_player(team_id)` — i.e. RLS scopes to the **team**, not the individual; the per-player scoping on this page is enforced by the app-level `.eq('player_id', player.id)` filter, which is present. No anon/over-broad grants observed on these policies.

### Expected vs actual (feature-doc #22)

Feature doc says: read `golf_qualifiers + golf_qualifier_entries WHERE player_id`; display name/course/dates/holes-per-round; progress = rounds completed / total; score + to-par; status badges; "Enter Round" CTA → rounds/new; link to full leaderboard → qualifiers/[id]. **All of this is implemented.** The doc references `getPlayerQualifiers()` as the action; the page does **not** call it — it inlines an equivalent query directly (`page.tsx:32-141` vs `golf.ts:4723-4859`). The two are near-duplicates but have drifted (see findings) — the page is the live code path; the action is effectively dead for this route.

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| MEDIUM | correctness | `src/components/fairway/pages/my-qualifiers/FairwayMyQualifiers.tsx:70-72` | `formatDate` uses `new Date(dateStr)` on a `date`-typed `start_date`/`end_date` (`'YYYY-MM-DD'`). Date-only strings parse as UTC midnight; `toLocaleDateString` in a US (negative-offset) timezone renders the **previous calendar day**. The legacy client avoids this by string-splitting (`my-qualifiers-client.tsx:37-45`). | On the live (redesign-on) path, qualifier start/end dates can display one day early for most US users. | Parse as local: split `YYYY-MM-DD` and build `new Date(y, m-1, d)`, or reuse the legacy string-split formatter. |
| LOW | broken-wiring | `src/app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx:64-76` | The `golf_rounds` query destructures only `{ data: roundsData }` and **ignores the error**. The canonical action checks `roundsResult.error` and returns failure (`golf.ts:4777-4779`). | On a transient rounds-query failure the page silently shows entry-aggregate fallback totals (or zeros) instead of surfacing an error; numbers can look wrong without any signal. | Destructure `error`; on error either throw (let `error.tsx` catch) or fall through deliberately with a logged note. |
| LOW | correctness | `src/app/golf/(dashboard)/dashboard/my-qualifiers/my-qualifiers-client.tsx:21-23,107` | "Complete" badge requires `roundsCompleted >= numRounds`, but for any non-completed qualifier `numRounds = roundsCompleted + 1` (`page.tsx:119-122`), so `N >= N+1` is never true and `canEnterRounds` (`N < N+1`) is always true. | A player can never see "Complete" and can always "Enter Round" on a non-`completed` qualifier — the X/N denominator is effectively fictional. (Intended honesty per Fairway notes, but the legacy client still presents a real-looking "X / N" that can't reach N.) | Legacy path: drop the fake denominator (mirror Fairway's "thru R1, R2"), or source a real round count. Fairway path already handles this correctly. |
| LOW | wrong-data | `src/app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx:131` | `holesPerRound` is hardcoded to `18`. `golf_qualifiers` has no holes-per-round column, so a 9-hole qualifier still shows "18 holes/round" in the legacy client (`my-qualifiers-client.tsx:143`). | Misleading holes/round label for non-18-hole qualifiers. | Add a column to `golf_qualifiers` (or derive from linked course) instead of a constant; or drop the label until sourced. |
| INFO | broken-wiring | `src/app/golf/actions/golf.ts:4723-4859` vs `page.tsx:32-141` | `getPlayerQualifiers()` is a near-duplicate of the page's inline fetch but has drifted (action honors `num_rounds` if present at `golf.ts:4829`; page does not; action checks rounds error, page does not). The page does not call the action. | Maintenance hazard / silent divergence; the feature doc points at the action that isn't actually used by the route. | Have `page.tsx` call `getPlayerQualifiers()` (single source of truth) or delete the unused action. |

### Coverage notes
- The page itself contains no mutations (read-only); the actual mutation (entering a qualifier round) happens in `rounds/new` → `new-round-client.tsx`, which is a separate audit unit. I confirmed the `?qualifier=<id>` deep-link is consumed there but did not audit the full submit/save path here.
- RLS is team-scoped (not per-player) on `golf_qualifier_entries`; per-player scoping for this tab relies on the app `player_id` filter being present, which it is. A live click-through as a player + as a teammate would confirm no cross-player leak in practice.
- The date off-by-one (Fairway path) is timezone-dependent and best confirmed live in a US timezone against a real qualifier row.
