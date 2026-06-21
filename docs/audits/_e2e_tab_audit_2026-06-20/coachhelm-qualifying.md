## CoachHelm Qualifying predictions [player]

**Route audited:** `/golf/dashboard/coachhelm/qualifying/[id]`
**Role context:** player (the page is COACH-only; the player path here is the redirect away from it)
**Date:** 2026-06-20

---

### What this tab actually is

This is the **W29 "Selection workspace"** — the "who's going to the tournament" decision surface. It is explicitly **coach-only**. The live leaderboard + scoring still lives at `/golf/dashboard/qualifiers/[id]`; this route owns the selection lifecycle (state machine `open → scoring → closed → selected`), the top-N auto-lock, the coach-pick + reasoning ledger, and the final "confirm selection" commit (which also writes `top_score` rows and pushes a travel brief to coach chat).

Because the FOCUS is the **player** role, the load-bearing behavior to verify is the **ownership / role gate** that keeps a player off this page, and where they land instead.

---

### End-to-end wiring (file:line)

**Page (server component):** `src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/page.tsx`
- `getGolfSessionProfile()` resolves role from `golf_coaches` / `golf_players` presence (`src/lib/auth/session.ts:142-167`).
- `page.tsx:42` `if (!session) redirect('/golf/login')` — unauthenticated gate.
- `page.tsx:43` `if (!session.coach) redirect('/golf/dashboard/qualifiers/${id}')` — **the player gate**. Any non-coach (player, or user with no coach profile) is redirected to the qualifier detail page, which IS player-accessible (`qualifiers/[id]/page.tsx:51-77` serves both roles, redirects only unauthenticated). No loop, no 403, no blank page.
- `page.tsx:45-47` `loadQualifyingWorkspace(supabase, id)` → `notFound()` when null. The loader only ever runs for a coach because the player redirect at line 43 returns first.
- `page.tsx:49-55` redesign fork → `<FairwayQualifyingWorkspace>`; legacy branch → `<QualifyingBoard>` (`page.tsx:57-80`).

**Loader (server):** `src/lib/coachhelm/v3/qualifying/loader.ts`
- `loader.ts:32-53` reads `golf_qualifiers` + nested `golf_qualifier_entries` + nested `golf_players(id, first_name, last_name)`. Columns used (`selection_state`, `selection_slots_total`, `selection_slots_coach_pick`, `target_tournament_id`) are real per `src/lib/types/database.ts:9178-9259` (W29 baseline migration `20260527000000`).
- `loader.ts:57-60` reads `golf_qualifier_selections` (columns match `database.ts:9129-9153`).
- Both reads run under the caller's RLS. `golf_qualifiers_select_team` (migration `20260527…:19458`) restricts SELECT to `is_golf_team_coach(team_id) OR is_golf_team_player(team_id)` — so a coach of team A reading team B's qualifier gets null → `notFound()`. **Team boundary is enforced by RLS on the read, not by an explicit team check in the page/loader.**
- `loader.ts:82-90` ranks entries by `(to_par asc, total_score asc)`, unscored → rank null; `is_top_score_slot` = `rank ≤ (slots_total − slots_coach_pick)`. Correct.
- `loader.ts:96-102` `coach_picks_complete` via `canConfirmSelection` (requires state==='closed', exactly slots_coach_pick picks, every pick has non-empty reasoning).

**Components:** `QualifyingBoard/{index,SelectionStateBar,LeaderboardWithSlots,CoachPickPanel}.tsx` (legacy) and `FairwayQualifyingWorkspace.tsx` (redesign). Both render the same data and wire the same 4 actions. Every interactive control is wired:
- Advance state → `advanceSelectionState` (SelectionStateBar:46 / Fairway:156)
- Confirm → `confirmQualifierSelection` (SelectionStateBar:52 / Fairway:164)
- Save pick → `setQualifierCoachPick` (CoachPickPanel:53 / Fairway:323)
- Remove pick → `removeQualifierCoachPick` (CoachPickPanel:66 / Fairway:337)
No dead controls, no `href="#"`, no no-op handlers found.

**Server actions:** `src/app/golf/actions/v3/qualifying.ts`
- Every action calls `getAuthedCoachContext` (`qualifying.ts:28-44`): `supabase.auth.getUser()` first → reject if no user → resolve qualifier `team_id` → `verifyTeamAccess(team_id, user.id)` (coach-of-that-team via `coach_id_for_team` RPC). This is a real defense-in-depth coach gate on top of RLS.
- All four actions `revalidatePath()` the workspace path, the qualifier detail path, and the qualifiers list (`qualifying.ts:46-52, 65, 93, 115, 139`).
- All wrapped in try/catch → `logServerError` → generic error. No raw error leakage.

**Service (mutations):** `src/lib/coachhelm/v3/qualifying/service.ts`
- `setCoachPick` uses `upsert(onConflict: 'qualifier_id,player_id')` — no destructive delete-then-insert (`service.ts:102-112`).
- `confirmSelection` writes `top_score` rows via `upsert(onConflict)` (`service.ts:180-185`) then flips state. No destructive write.
- `removeCoachPick` is a scoped `.delete().eq(selection_type,'coach_pick')` (`service.ts:126-131`) — a deliberate single-row remove on user action, not a save/sync bulk wipe; acceptable.

**States:** `loading.tsx` (skeleton, not a bare spinner) and `error.tsx` (`RouteErrorBoundary`) both present on the route. Empty states present in both leaderboard and coach-pick panels.

---

### Expected vs actual (feature-doc #3 Qualifiers / #12 Engine)

`golfhelm-features.md` #3 documents the **classic** qualifier (leaderboard, positions, ties, round integration) and lists tables as only `golf_qualifiers, golf_qualifier_entries`. The W29 **Selection workspace** (this route), `golf_qualifier_selections`, and the `selection_state` lifecycle are **not documented** in the feature doc at all — the doc predates W29. The CLAUDE.md ownership table also doesn't list this route. So "spec vs actual": the code is a superset of the documented feature; behavior is internally consistent and correctly gated, but the feature doc is stale relative to shipped code. This is a documentation gap, not a code defect.

The title calls this "Qualifying **predictions**," but the tab contains **no prediction model output** — it is a deterministic leaderboard-ranking + coach-pick selection workspace. There is no `golf_predictions` read here. (Predictions live in the player CoachHelm at `/dashboard/coachhelm`.) The "predictions" naming is a misnomer for this surface; flag as INFO so the auditor catalog is accurate.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| LOW | broken-link | `src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/error.tsx:20` | The route error boundary's `homePath` is `/golf/dashboard/coachhelm`, which is the **player-only** CoachHelm dashboard (`dashboard/coachhelm/page.tsx:57-83` renders a "Player Dashboard Only" dead-end card for coaches). | If this coach-only page errors, the coach's "go home" button lands them on a player dead-end card, not a useful coach destination. | Set `homePath` to `/golf/dashboard/qualifiers` (or `/golf/dashboard`). |
| INFO | incomplete-feature | `src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/page.tsx:1-8` | Tab is titled "Qualifying **predictions**" but contains zero prediction-model output — it is deterministic ranking + coach-pick selection. No `golf_predictions`/engine read on this surface. | Naming implies an AI prediction the surface does not provide; sets a false expectation for the auditor and any future doc. | Rename the audit unit / surface label to "Qualifying selection workspace," or actually surface a prediction (e.g. projected finish) if that was the intent. |
| INFO | wrong-data | `memory/context/golfhelm-database.md` (golf_qualifiers / golf_qualifier_entries blocks) + `golfhelm-features.md` #3 | The DB reference doc's `golf_qualifiers` block is missing the W29 columns (`selection_state`, `selection_slots_total`, `selection_slots_coach_pick`, `target_tournament_id`) and `golf_qualifier_selections` is absent; feature doc #3 documents none of the W29 selection workspace. Columns ARE real in `src/lib/types/database.ts:9129-9259` (the canonical source). | Docs are stale vs shipped code; an engineer reading the DB doc would think these columns don't exist. Not a runtime bug. | Run `npm run docs:regen` so the AUTOGEN DB blocks pick up the W29 columns/table; add a W29 section to features #3. |

---

### Things explicitly verified as CORRECT (no finding)

- **Role-gate (the player focus):** player → redirected to a real, player-accessible page (`page.tsx:43`). No cross-role leak: the loader and all four mutations never execute for a player because the redirect returns first; even if reached, RLS `qualifier_selections_player_read` only exposes selections to players when `selection_state='selected'` (migration `20260527…:20114`), and `qualifier_selections_coach_write` restricts all writes to team coaches (`…:20106`).
- **Auth:** unauthenticated → `/golf/login` (`page.tsx:42`); every server action calls `getUser()` before any read/write (`qualifying.ts:30-31`).
- **Team boundary:** enforced by RLS on the qualifier SELECT (loader returns null → `notFound()`) AND by `verifyTeamAccess` in the action wrapper.
- **Data wiring:** all sport-prefixed (`golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_selections`, `golf_players`, `golf_team_coach_staff`); displayed numbers (rank, to-par, rounds, pick reasoning) trace to real entry/selection rows, no placeholders/hardcoded values. No N+1 (selections fetched once, mapped into a `Map`). Entry sets are roster-sized, so the 1000-row PostgREST cap is not a risk here.
- **Mutations:** all `revalidatePath()`; all use server `createClient()`; upsert-on-conflict, no destructive delete-then-insert in save/confirm paths.
- **Interactive controls:** every button (Advance, Confirm, Pick, Edit, Remove, Save, Cancel) wired to a real action; confirm is correctly disabled until `coach_picks_complete`.
- **States:** `loading.tsx` skeleton, `error.tsx` boundary, and empty states all present in both legacy and redesign forks.
- **Correctness:** ranking `(to_par asc, total asc)` with unscored → null rank; `is_top_score_slot` math `rank ≤ slots_total − slots_coach_pick` is consistent across loader, state-machine `classifySlots`, and `confirmSelection`. `formatToPar` (E / +n / −n) consistent across all three render components. No feet/yards or SG math on this surface.

---

### Coverage notes
- Could not run the app live; RLS behavior asserted from policy SQL in `supabase/migrations/20260527000000_prod_public_baseline.sql` (lines 19444-19462, 20106-20121), not from a live session.
- The travel-brief push on confirm (`service.ts:193-211`) and `pushTravelBriefToChat` were not deep-traced — out of scope for the player-role focus and best-effort (never blocks selection).
- The DB-doc staleness assumes `database.ts` is canonical per CLAUDE.md; not re-verified against the live Supabase schema.
