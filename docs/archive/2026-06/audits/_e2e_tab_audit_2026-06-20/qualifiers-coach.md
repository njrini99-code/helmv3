## Qualifiers (create/manage) [coach]

End-to-end audit of the coach create → manage → standings flow for the Qualifiers
tab. Repo: `/Users/ricknini/Downloads/helmv3`. Audited 2026-06-20.

Routes audited:
- `/golf/dashboard/qualifiers` (list)
- `/golf/dashboard/qualifiers/new` (create)
- `/golf/dashboard/qualifiers/[id]` (detail / manage / standings)

The app runs the **Fairway redesign** (`NEXT_PUBLIC_REDESIGN=true` in `.env.local`,
prod serves redesign per project memory), so the live coach path is the
`isRedesignEnabled()` fork in every page. The legacy branch is still shipped but
dormant; legacy-only issues are flagged as LOW/INFO.

---

### Actual end-to-end wiring

**List (`qualifiers/page.tsx`)**
1. `getGolfSessionProfile()` → redirect `/golf/login` if no session (`page.tsx:26-27`).
2. Role resolved: `isCoach = role === 'coach'` (`page.tsx:30`). Coach team resolved
   via `resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)`
   (`page.tsx:37`).
3. Fetch `golf_qualifiers` filtered by `team_id`, ordered `start_date desc`
   (`page.tsx:48-52`). Correct sport-prefixed table + columns.
4. Redesign fork renders `<FairwayQualifiers isCoach qualifiers />`
   (`page.tsx:60-66`). Coach-only `Create qualifier` CTA gated on `isCoach`
   (`FairwayQualifiers.tsx:112-119`); cards link to `/qualifiers/[id]`.
   Buckets: active = `upcoming`+`in_progress`, concluded = `completed`
   (`FairwayQualifiers.tsx:98-101`).

**Create (`qualifiers/new/page.tsx`)**
1. Auth + **role gate**: `if (role !== 'coach') redirect('/golf/dashboard/qualifiers')`
   (`new/page.tsx:20-21`). Correct — players cannot reach the form.
2. Fetches active roster via `golf_team_members` join `golf_players!inner`
   filtered `status='active'`, sorted by last name (`new/page.tsx:31-48`).
3. Redesign renders `<FairwayNewQualifier players />` (`new/page.tsx:52-57`).
4. `FairwayNewQualifier` collects name/desc/course/rules/dates/entryDeadline +
   travel-squad (`selectionSlotsTotal`/`selectionSlotsCoachPick`) + selected
   playerIds, validates name+startDate client-side, then calls server action
   `createGolfQualifier(...)` (`FairwayNewQualifier.tsx:100-119`). On success
   `router.push('/golf/dashboard/qualifiers')` + `router.refresh()`.

**Server action `createGolfQualifier` (`actions/golf.ts:2663-2800`)**
- `golfQualifierSchema.parse(data)` (zod, `golf.ts:467-489`).
- `supabase.auth.getUser()` → reject if no user BEFORE any write (`golf.ts:2670-2673`). ✓
- Resolves coach + `getCoachTeamId` (cookie-aware) (`golf.ts:2676-2692`).
- INSERT `golf_qualifiers` with `team_id, name, description, course_name,
  course_id, spots_available, entry_deadline, rules, start_date, end_date,
  status:'upcoming', created_by`, and conditionally `selection_slots_total` /
  `selection_slots_coach_pick` (omitted → DB defaults 5/1) (`golf.ts:2695-2720`).
  All columns verified to exist on the live `golf_qualifiers` table (incl. the
  W29 `selection_*` columns).
- INSERT `golf_qualifier_entries` (one row per playerId, `status:'entered'`)
  (`golf.ts:2727-2741`). **Plain insert, no destructive delete-then-insert.** ✓
- Fire-and-forget notify (email + push) wrapped in try/catch + `logServerError`
  (`golf.ts:2744-2786`).
- `revalidatePath('/golf/dashboard')` + `revalidatePath('/golf/dashboard/qualifiers')`
  + `updateTag(CACHE_TAGS.DASHBOARD)` (`golf.ts:2788-2790`). ✓ (note: detail
  route `/qualifiers/[id]` is NOT revalidated, but it has `revalidate` default
  and the realtime hook covers live data.)

**Detail / manage (`qualifiers/[id]/page.tsx`)**
1. Auth → redirect login (`[id]/page.tsx:53-54`). `isCoach=!!coach`, `isPlayer=!!player`.
2. Fetch qualifier + nested `entries:golf_qualifier_entries(*, player:golf_players(...))`
   by id, `.maybeSingle()` → `notFound()` if null (`[id]/page.tsx:63-77`).
   **No explicit team scoping in the query — relies on RLS** (verified below: safe).
3. Fetch completed rounds (`golf_rounds` where `qualifier_id` and `status='completed'`)
   and builds per-player breakdown by in-memory filtering (NOT N+1 queries)
   (`[id]/page.tsx:100-139`).
4. Redesign reads an extra honest `golf_qualifier_selections` count
   (`[id]/page.tsx:178-181`) and renders `<FairwayQualifierDetail>` with the
   pre-computed props. Coach primary action = "Manage selections" →
   `/golf/dashboard/coachhelm/qualifying/[id]` (route exists, coach-gated).
5. Live leaderboard = `FairwayQualifierLeaderboard` → `useQualifierRealtime(id)`
   (`use-qualifier-realtime.ts`) — subscribes to `golf_qualifier_entries`,
   `golf_rounds`, `golf_qualifiers` postgres_changes; recomputes per-player
   aggregates from completed rounds; honest "Awaiting first round" empty state.

**RLS (verified against live DB):**
- `golf_qualifiers_select_team`: `is_golf_team_coach(team_id) OR is_golf_team_player(team_id)`.
- `golf_qualifier_entries_select_team`: same via parent qualifier; insert/update/delete coach-only.
- So the un-scoped detail query is protected — a coach/player from another team gets
  `null` → `notFound()`. No cross-team leak.

---

### Expected vs actual (feature-doc #3 Qualifiers)

Spec says: "Multi-round qualifier events with live leaderboard, position/tie
calculation… `updateQualifierEntryStats()` aggregates scores across rounds…
System: updateQualifierEntryStats()". Data flow shows coach create → player
submits round w/ qualifier_id → system aggregates → display leaderboard.

Matches:
- Create (coach), entries insert, round linkage via `golf_rounds.qualifier_id`,
  live leaderboard with sort/tie/position, honest empty/loading/error states — all wired.
- Role gating: create is coach-only; list/detail shared coach+player as documented.

Diverges / gaps:
- **Status lifecycle is unmanageable from the UI.** `updateQualifierStatus`
  (`golf.ts:2802-2856`) exists and is correct, but has **zero callers** anywhere
  in `src/` (grep confirms). Qualifiers are created `status:'upcoming'` and there
  is no coach control to move them to `in_progress` or `completed`, and no
  auto-transition on round submission. Consequence: the "Concluded" bucket never
  populates, the realtime "Live" pill never shows, and the player "Play qualifier
  round" gate (`status in_progress|upcoming`) stays open forever — a qualifier can
  never be closed. This is the largest divergence from the implied lifecycle.
- The feature-doc itself lists no open Known Gaps for #3 (marked 100%), so this
  dead-control gap is unflagged in the spec.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| HIGH | dead-control | `src/app/golf/actions/golf.ts:2802-2856` (no caller) | `updateQualifierStatus` is never invoked by any component/page. No UI to transition a qualifier `upcoming → in_progress → completed`; no auto-transition on round submit. | Coach cannot start or conclude a qualifier. "Concluded" section never fills; "Live" pill never shows; player "Play qualifier round" CTA stays enabled indefinitely. Core manage step missing. | Add a coach status control (e.g. Start / Conclude buttons on the detail or qualifying workspace) wired to `updateQualifierStatus`, and/or auto-set `in_progress` when first round posts and `completed` past `end_date`. |
| LOW | dead-control | `src/hooks/golf/use-qualifier-realtime.ts:39,29` + `QualifierLeaderboardRealtime.tsx:29` | Hook types `num_rounds`/`holes_per_round` as optional cols and reads `qualifier?.num_rounds`, but these columns do NOT exist on `golf_qualifiers` (verified live DB). Always `undefined` → falls back to prop `numRounds=1`. | No crash, but multi-round qualifiers can't drive `effectiveNumRounds`; the "num rounds" notion is inert. Legacy `QualifierViewTabs` always treats it as 1 round. | Drop the phantom columns from the type, or add a real round-count source (e.g. `maxRoundNumber`) so multi-round leaderboards reflect actual rounds. |
| LOW | no-empty-state | `src/app/golf/(dashboard)/dashboard/qualifiers/[id]/QualifierRoundBreakdown.tsx:39-40` + `[id]/page.tsx:352` | Legacy (flag-off) coach breakdown renders an all-dash table whenever `sortedBreakdown.length > 0` (true when entries exist but zero rounds posted), instead of an empty state. The Fairway path already fixes this (`FairwayQualifierDetail.tsx:288-298`). | Flag-off coaches would see a confusing all-dash 7-row table before any round is posted. Live (redesign-on) path is correct. | Gate the legacy breakdown on `maxRoundNumber > 0` (mirror the Fairway `hasAnyCompletedRound` guard) or remove the dead legacy branch. |
| LOW | broken-wiring | `src/app/golf/(dashboard)/dashboard/qualifiers/new/new-qualifier-client.tsx:228-241,258-282` | Legacy (flag-off) form uses `<Button variant="primary">` for player tiles and Select-All/Clear; the primary variant injects `bg-primary-600 text-white shadow-sm hover:-translate-y-0.5` ahead of the intended cream/conditional classes. twMerge keeps the trailing bg/text but variant hover/shadow/scale still apply. | Cosmetic only, flag-off path. Buttons still toggle selection correctly (`onClick` wired). Live Fairway form (`FairwayNewQualifier.tsx`) is clean. | Use `variant="ghost"`/plain `<button type="button">` for selectable tiles in the legacy form, or delete the legacy branch. |
| INFO | wrong-data | `memory/context/golfhelm-database.md:1078-1096` | DB doc for `golf_qualifiers` omits `selection_slots_total`, `selection_slots_coach_pick`, `selection_state`, `target_tournament_id` (all present + NOT NULL w/ defaults on the live table and in generated `database.ts:9190-9234`). | Documentation drift only — no runtime impact. Code correctly uses the real columns. | Regenerate `golfhelm-database.md` (the columns exist; doc is stale). |

---

### Coverage notes

- RLS verified live: select policies scope to team coach/player; entries insert/update/
  delete are coach-only. The un-team-scoped detail query is safe.
- `createGolfQualifier` confirmed auth-first, sport-prefixed tables, plain inserts
  (no destructive delete-then-insert), proper `revalidatePath`/`updateTag`.
- Loading/error states exist for all three routes (`loading.tsx`/`error.tsx` present).
- Link targets confirmed to exist: `/qualifiers/new`, `/qualifiers/[id]`,
  `/coachhelm/qualifying/[id]`, `/my-qualifiers`, `/rounds/new?qualifier=`.
- Not verifiable statically (needs live click-through): whether the realtime
  channel actually pushes leaderboard updates on round submit, and the exact
  visual of the unmanageable status (HIGH finding) — both `needsLiveVerify`.
