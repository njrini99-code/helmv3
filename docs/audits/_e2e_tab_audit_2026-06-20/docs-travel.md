## Documents + Travel [both]

End-to-end audit of the shared coach+player Documents (#9) and Travel (#10) tabs.
Audited 2026-06-20. Both routes have a legacy branch and a flag-gated **Fairway**
redesign branch; `NEXT_PUBLIC_REDESIGN` is ON in prod, so the Fairway components
are what actually render. Both branches were traced.

Routes:
- `src/app/golf/(dashboard)/dashboard/documents/page.tsx`
- `src/app/golf/(dashboard)/dashboard/travel/page.tsx`

---

### How Documents is actually wired

1. `documents/page.tsx:20-21` — `getGolfSessionProfile()` resolves `{coach, player}`;
   unauth → `redirect('/golf/login')`. `isCoach = !!coach`.
2. Team resolve: coach via `resolveCoachTeamIdWithCookie(...)` (`page.tsx:30-31`),
   player via `golf_team_members` membership (`page.tsx:33-38`). No team → "No Team
   Found" panel (`page.tsx:41-50`).
3. Fetch `golf_documents` for the team (`page.tsx:73-92`), ordered by `created_at`
   desc. **Players get a server-side `.eq('is_public', true)` filter**
   (`page.tsx:95-97`); coaches get all rows.
4. Flag fork (`page.tsx:106-117`): redesign → `FairwayDocuments`; else
   `DocumentsClient`. Both receive `{documents, coachId, teamId, isCoach}`.
5. Client mutations call server actions in `src/app/golf/actions/documents.ts`:
   `uploadGolfDocument` (storage upload) → `createGolfDocument` (row + v1 version),
   `updateGolfDocument`, `deleteGolfDocument`, `uploadNewVersion`, `getVersionHistory`,
   plus `getPreviewUrl`/`getTextFileContent` for the preview modal. Every action
   calls `supabase.auth.getUser()` first and `verifyTeamAccess()` (coach via
   `validateCoachTeamAccess`, player via active `golf_team_members`), and
   `revalidatePath('/golf/dashboard/documents')` after mutations. No
   delete-then-insert in save paths (delete is a genuine delete of one doc + its
   storage objects). Preview reads via short-lived `createSignedUrl` (correct for
   the now-private bucket).

Tables/columns verified against `golfhelm-database.md`: `golf_documents`
(`is_public`, `version_count`, `folder`, `category`, `file_url`, `file_type`,
`file_size`, `uploaded_by`→auth.users) and `golf_document_versions`
(`storage_path`, `version_number`, `mime_type`, …). All match.

### How Travel is actually wired

1. `travel/page.tsx:20-39` — same session resolve; `isCoach = !!coach && !!coachTeamId`;
   `teamId = coachTeamId || playerTeamId` (player membership requires `status='active'`).
   No team → "No Team Found".
2. Fetch `golf_travel_itineraries` for team (`page.tsx:53-58`), `departure_date` asc,
   `.limit(100)`. Rows are mapped (`page.tsx:61-83`) to flatten `flight_info`/
   `room_assignments` jsonb → string, `gear_list` array → comma string; `check_in_date`/
   `check_out_date` forced null (no such columns — correct).
3. Flag fork (`page.tsx:89-100`): `FairwayTravel` else `TravelClient`. Both receive
   `{itineraries, coachId, teamId, isCoach}`.
4. Itinerary writes: `createGolfTravelItinerary` / `updateGolfTravelItinerary` /
   `deleteGolfTravelItinerary` in `actions/travel.ts` — all auth-check, **re-verify
   coach role** (`golf_coaches` lookup), and on update/delete re-check
   `validateCoachTeamAccess` against the itinerary's team. `created_by` is taken from
   the trusted `coach.id`, not client input (`travel.ts:182`). Zod-validated. Empty
   strings → null for time/date columns. `revalidatePath` after each.
5. Expense sub-feature (Fairway reuses the legacy `ExpenseForm`/`ExpenseList`/
   `ExpenseSummary` verbatim): `getExpensesForItinerary`/`getExpenseSummary`/
   `getBudgetsForItinerary`/`createTravelExpense`/`updateTravelExpense`/
   `deleteTravelExpense`/`setBudget`/`exportExpensesToCSV` — all on `golf_travel_expenses`
   / `golf_travel_budgets` (budgets via `.upsert(onConflict:'itinerary_id,category')`).
   Write actions all gate on coach role server-side; UI gates Add/Edit/Delete behind
   `isCoach`. CSV export builds client blob + `<a download>` (works).
6. Player badge: `FairwayTravel`/`TravelClient` call `markTravelSeen()` on mount for
   players, then `badges.refetch()`. Badge count = `golf_travel_itineraries` with
   `created_at > last_travel_seen_at` (`player-notifications.ts:197-208`). Wiring is
   correct end-to-end.

---

### Expected vs actual (per golfhelm-features.md #9, #10)

- **#9 Documents (✅, 100%)** — Library w/ versioning, categories, visibility,
  folders. Actual implements all of this. BUT the feature doc does not flag the two
  real problems found below (the RLS leak and the broken direct-download after the
  bucket went private). Spec is silent on them; both are genuine defects.
- **#10 Travel (⚠️, 80%)** — "Itinerary creation complete; budget/expense exists in
  DB; expense splits incomplete." Matches actual: full itinerary CRUD + expense CRUD
  + budgets + CSV export are wired and working. `golf_travel_expense_splits` is
  referenced in the schema but there is **no split UI or split-calc logic** anywhere
  in the travel components/actions — confirms the documented Known Gap is still open.
  `event_id` linkage column exists and create accepts it, but no UI populates it from
  a Calendar event (the create modal has no event picker) — the "Links to
  golf_events via event_id" data-flow is effectively dormant.
- **Map**: CLAUDE.md claims Mapbox is "Used for course maps in … Travel itineraries
  (#10)". There is **no map of any kind** in the Travel feature (no Mapbox/CourseMap
  import in any travel page/component; only `MapPin` decorative icons). Feature-doc
  #10 itself does not promise a map, so this is a stale CLAUDE.md claim, not a
  missing feature — INFO.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| CRITICAL | rls | supabase/migrations/20260527000000_prod_public_baseline.sql:19043 | `golf_documents_select_team` RLS = `is_golf_team_coach(team_id) OR is_golf_team_player(team_id)` with NO `is_public` check. A player can SELECT every team document, incl. coach-only (`is_public=false`) rows. UI hides them (`page.tsx:95-97`) but the `getDocument`/`getDocuments`/`getPreviewUrl`/`getVersionHistory` server actions only check team membership (`documents.ts:39-80`), never `is_public`. A player who guesses/obtains a coach-only doc id can read its metadata + a signed preview URL. The recruit_documents migration (20260614020000_recruit_documents.sql:13) explicitly documents this leak as the reason recruit docs got a separate table. | Coach-confidential team files (policies, coach-only forms) leak to players via direct id. | Add `AND (is_public = true OR is_golf_team_coach(team_id))` to a player SELECT policy (mirror `baseball_documents_select_player`), AND have the document read actions enforce `is_public` for non-coaches. |
| HIGH | dead-control | src/components/fairway/pages/documents/FairwayDocuments.tsx:1556-1558 | The per-card Download link is `<a href={doc.file_url} download>`. `doc.file_url` is a `getPublicUrl()` value (documents.ts:207/413/791), but the `documents` storage bucket was flipped **private** in LIVE-29 (`migrations_archive/pre_20260527/20260421100004_coachhelm_storage_buckets.sql:19`). A public URL on a private bucket 403s, so Download is broken. Preview still works (it uses `getPreviewUrl`→`createSignedUrl`). | Players & coaches cannot download any document; the Download button silently fails. | Route download through a signed URL (reuse `getPreviewUrl`) instead of `doc.file_url`, or make the action return a signed download URL. |
| HIGH | dead-control | src/app/golf/(dashboard)/dashboard/documents/documents-client.tsx:1015-1023 | Same broken Download in the legacy branch — `<a href={doc.file_url} download>` against the now-private bucket. (Active only when redesign flag is off, but ships in the bundle.) | Broken download in legacy doc cards. | Same as above — sign the URL. |
| MEDIUM | incomplete-feature | src/app/golf/actions/travel.ts:1-966 | `golf_travel_expense_splits` (per-player split table) is in the schema and referenced by the feature doc, but there is no split CRUD, no split calc, and no UI consuming it anywhere in travel actions/components. `paid_by:'split'` is selectable but never produces split rows. | Coaches can mark an expense "Split" but no per-player amounts are ever created/shown — the split feature is a dead end. | Implement split create/list against `golf_travel_expense_splits`, or remove the 'split' paid_by option until built. |
| MEDIUM | incomplete-feature | src/components/fairway/pages/travel/FairwayItineraryModal.tsx:37-104 | `golf_travel_itineraries.event_id` (link to `golf_events`) exists and `createGolfTravelItinerary` accepts it (travel.ts:28,164), but the create/edit modal has no event picker, so `event_id` is always null. The documented "Links to golf_events via event_id" flow never fires from the UI. | Travel trips are never associated with calendar events; cross-feature linkage is dormant. | Add an optional "Link to event" select (team's upcoming `golf_events`) to the itinerary modal and pass `event_id`. |
| LOW | correctness | src/app/golf/(dashboard)/dashboard/travel/travel-client.tsx:407,445 | Legacy masthead upcoming/past split uses `new Date(i.departure_date) > now`. `new Date("2026-03-15")` parses as UTC midnight → reads as the prior calendar day in US timezones, so a trip departing "today" can be mis-counted as past. The trip cards correctly use `parseDateLocal` (travel-client.tsx:148-158); only the header counts skip it. Fairway branch is correct (FairwayTravel.tsx:256-258 uses local date parts). | Header count of upcoming vs completed trips can be off by one near midnight/date boundaries (legacy/flag-off only). | Use the existing `parseDateLocal` for the masthead filter too. |
| INFO | ux-gap | src/app/golf/actions/player-notifications.ts:197-208 | Travel badge counts only itineraries with `created_at > last_travel_seen_at`. If a coach EDITS an existing itinerary (changes lodging/time), `updated_at` moves but `created_at` doesn't, so no badge alerts the player to the change. Matches the seen-by-creation design but is a real notification gap. | Players aren't notified when trip details change after first view. | Optionally count `greatest(created_at, updated_at) > last_travel_seen_at`. |
| INFO | wrong-data | CLAUDE.md ("Mapbox … Used for course maps in … Travel itineraries (#10)") | No map component exists in any Travel page/component (only decorative `MapPin` icons). The doc claim is stale. | Misleading documentation; no user impact. | Correct CLAUDE.md, or add a destination/hotel map if intended. |

### Notes on what is correctly wired (no finding)

- Role-gating on both pages is enforced at the page (not nav-only): unauth redirect,
  team-membership gate, and `isCoach` controls every write CTA. Travel write actions
  *additionally* re-check coach role + team server-side — defense in depth.
- Document upload/edit/move/delete/version flows: correct clients, auth checks,
  `revalidatePath`, optimistic local state reconciled with `router.refresh()`. No
  destructive delete-then-insert.
- States are complete on both Fairway surfaces: skeleton (expenses), honest empty
  states (no docs / empty folder / no search results / no trips / no expenses), error
  via InlineNotice + fairwayToast. Document preview has loading + error + download
  fallback.
- Expense write actions all gate on coach role; players get read-only expense view.
- 100-row `.limit(100)` on travel itineraries is fine (a team won't exceed it in a
  season; well under the 1000-row PostgREST cap). Documents are unbounded but a team's
  doc count is realistically small; not flagged.
