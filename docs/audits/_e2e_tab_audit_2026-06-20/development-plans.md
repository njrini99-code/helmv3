## Development Plans (coach) [coach]

**Route:** `/golf/dashboard/development`
**Page:** `src/app/golf/(dashboard)/dashboard/development/page.tsx`
**Live surface (redesign ON):** `src/components/fairway/pages/coachhelm/PlayersGridView.tsx`
**Legacy surface (redesign OFF):** `src/app/golf/(dashboard)/dashboard/development/development-client.tsx`
**Actions:** `src/app/golf/actions/development.ts`
**Card:** `src/components/fairway/pages/coachhelm/FocusAreaCard.tsx`

`NEXT_PUBLIC_REDESIGN=true` is set in `.env.local:45`, so production renders **`PlayersGridView`** (the redesign fork at page.tsx:176-256), NOT the legacy `DevelopmentPlansClient`. Both forks were traced.

---

### How it's actually wired (end-to-end)

1. **Role gate** — `page.tsx:24-37`: `getGolfSessionProfile()` → redirect to `/golf/login` if no session; redirect to `/golf/dashboard?message=...coach-only...` if `!coach`. Correct coach-only gate, enforced on the page itself (not nav-only). Auth resolved via `golf_coaches.user_id` lookup in `session.ts:149-164`.
2. **Team resolution** — `page.tsx:33`: `resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)` (cookie-aware, men's/women's-toggle safe). Null → redirect to dashboard.
3. **Roster load** — `page.tsx:40-55`: `golf_team_members` (status='active') → player IDs → `golf_players` profiles. Sport-prefixed, correct.
4. **Focus areas** — `page.tsx:60-81`: `golf_player_focus_areas` filtered `.in('player_id', playerIds)`. **Selects only:** id, player_id, coach_id, area_type, title, description, status, target_metric, current_value, target_value, started_at, completed_at, created_at, updated_at.
5. **Stats snapshot** — redesign fork (`page.tsx:177-216`) reads `golf_player_stats_cache` (single query); legacy fork re-aggregates `golf_rounds` client-side (`page.tsx:84-161`). Both compute fairway/GIR % as proper ratios; no feet/yards blending; no SG. Columns verified against DB doc.
6. **Goals + causal** — redesign fork (`page.tsx:227-240`) composes `loadActiveGoals` + `loadPlayerStandingMap` per player and `getTeamCausalRelationships(teamId)`; read-only, RLS-scoped.
7. **Mutations** (`development.ts`): `createFocusArea` (INSERT), `updateFocusArea` (UPDATE filtered by `coach_id`), `completeFocusArea` / `updateFocusAreaProgress` / `recordFocusAreaOutcome` (verifyPlayerAccess-gated). All auth-check `getUser()` first and `revalidatePath('/golf/dashboard/development' + '/my-development')`. No destructive delete-then-insert. `deleteFocusArea` is a hard delete but it's an explicit single-row coach action behind a ConfirmDialog (not a save/sync path) — acceptable.

The render path is well structured, honest about empty/awaiting states, and the auth/role gating is solid. The findings below are data-wiring gaps where the redesigned UI reads fields the route never selects (or that don't exist on the table), plus a long-standing silent-no-op edit bug.

---

### Expected vs Actual (feature-doc #25)

The feature doc (#25, golfhelm-features.md:1008-1049) describes: select player → modal → 8 area types → title/description/target metric/target value → suggested metrics auto-populate → `createFocusArea` INSERT; progress tracking via status + current/target %; trend. **All of that is implemented and wired correctly in both forks.** The doc marks the feature 95% and lists no open "Known Gaps" specific to this tab. The divergences below are introduced by the redesign fork (`PlayersGridView` + `FocusAreaCard`), which the feature doc does not describe — it surfaces outcome-mix, source chips, and per-area progress sparklines that the route's SELECT does not feed.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| HIGH | wrong-data | PlayersGridView.tsx:316-345 / page.tsx:60-81 | RosterHealthHeader's "Did the coaching land?" outcome-mix tallies `fa.outcome_status`, but (a) the route SELECT never selects it and (b) `outcome_status` is NOT a column on `golf_player_focus_areas` — it lives only on `golf_coach_insights` (DB doc:256, written by `recordFocusAreaOutcome` development.ts:837). | The hero "closed-loop payoff" instrument is permanently stuck on "Awaiting outcomes" no matter how many outcomes a coach records. The whole effectiveness-loop payoff of the redesign is dead on this surface. | Surface the verdict onto each focus-area row (e.g. join the source insight's `outcome_status` via `from_insight_id`, or add an `outcome_status` column to `golf_player_focus_areas` and write it in `recordFocusAreaOutcome`), then select it in page.tsx. |
| MEDIUM | dead-control | FocusAreaCard.tsx:223-268 / page.tsx:60-81 | `SourceChip` renders a real `<Link>` "From a round review" / "From a CoachHelm insight" only when `from_review_id`/`from_insight_id` is present, but the route SELECT omits both columns (and `review_context`). | Provenance chips never render even for focus areas created from a review/insight (which DO populate those columns). A built, real cross-feature link is silently invisible. | Add `from_review_id, from_insight_id, review_context` to the page.tsx:63-78 select; the card already wires the links and "use my-development#insight-" anchor. |
| MEDIUM | wrong-data | FocusAreaCard.tsx:99-105,140-145 / page.tsx:60-81 | The per-area Sparkline consumes `progressHistory` (from `golf_player_focus_areas.progress_notes.entries[]`), but the route never selects `progress_notes` and never maps it into `progressHistory`. | Every focus-area card shows the honest em-dash sparkline; the logged progress history (written by `updateFocusAreaProgress`, development.ts:300-312) is never visualized on the coach surface. | Select `progress_notes` in page.tsx and map `progress_notes.entries` → `progressHistory` in `focusAreasWithPlayers` (page.tsx:164-167). |
| MEDIUM | broken-wiring | development.ts:177-194 | `updateFocusArea` filters the UPDATE by `.eq('coach_id', coach.id)`. A Supabase UPDATE matching 0 rows returns `error: null`, so the action returns `{ success: true }` even when nothing changed. Focus areas created via `createFocusAreaFromReview`/`createFocusAreaFromInsightV2` set `coach_id` to "any one coach who staffs the team" (development.ts:447,517) or null; an assistant/second coach (or any coach editing a null-coach_id row) silently no-ops. | Editing or (legacy fork) marking complete a focus area not created by the exact logged-in coach shows a success toast + router.refresh() but the row is unchanged — confusing silent data-write failure for multi-coach programs. | Verify the row's player via `verifyPlayerAccess` (like `completeFocusArea` already does) instead of the brittle `coach_id` self-filter; or return an error when 0 rows are affected (use `.select()` and check length). |
| LOW | type-mismatch | development.ts:301-311 vs DB doc:816 | `progress_notes` is treated as `{ entries: [...] }` (object), but the column default in the DB doc is `'[]'::jsonb` (array). First write to a default-`[]` row will overwrite the array with `{entries:[...]}`; reads (`Array.isArray(existingRaw?.entries)`) tolerate both, so no crash, but the default value shape and the written shape disagree. | Cosmetic / latent; no user-visible break today because the writer always normalizes to `{entries:[]}`. | Align the column default to `'{"entries":[]}'::jsonb` (or change the code to use a bare array) so default and written shapes match. |
| LOW | revalidation | development.ts:144-145,191-192,232-233 | All five mutators revalidate `/golf/dashboard/development` + `/golf/dashboard/my-development`, but `createFocusArea`/`updateFocusArea`/`deleteFocusArea` do NOT revalidate `/golf/dashboard/insights` or `/golf/dashboard/analytics/coachhelm`. The client compensates with `router.refresh()`, so the open tab updates; other cached coach tabs (e.g. CoachHelm Analytics outcome counts) may serve stale data until their own revalidate window. | Minor staleness across tabs; the active tab is correct via router.refresh(). | Optionally add the analytics/insights paths to the create/update revalidation set for cross-tab freshness. |
| INFO | n+1 | page.tsx:228-231 | Redesign fork issues `loadActiveGoals(pid)` + `loadPlayerStandingMap(pid)` per player in `Promise.all` over `playerIds` (parallel fan-out, 2 queries × roster size). Bounded by roster (~5-15), so acceptable, but it is a per-player fan-out rather than a single batched query. | Negligible for normal rosters; would matter only for very large teams. | Consider batching goals/standing by `.in('player_id', playerIds)` if roster sizes grow. |

---

### Notes on what is correctly wired (no finding)

- Role gate, auth, and unauth redirect: correct (page.tsx:24-37).
- All table names sport-prefixed; all selected columns exist in `golf_player_focus_areas` (DB doc:793-817).
- Create/edit/complete/log-progress/record-outcome handlers in `PlayersGridView` are all wired to real server actions with toasts + `router.refresh()` reconciliation (PlayersGridView.tsx:412-506).
- No PostgREST 1000-row cap risk on this surface (roster-scoped reads; `golf_rounds` aggregation in the legacy fork is roster-scoped, not shot-level).
- Empty / awaiting / load-error states all present (InlineNotice loadError, EmptyState for no roster / no focus areas, honest "awaiting" Readouts) — though `loadError` prop is never passed by the route (always null), so the error branch is currently unreachable.
- `recordFocusAreaOutcome` correctly writes the effectiveness loop to `golf_coach_insights` and completes the focus area; the *write* is fine — only the *read-back* on this surface (finding #1) is broken.
