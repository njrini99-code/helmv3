## My Development (player) [player]

End-to-end audit of the player-facing "My Development" tab.

Route: `/golf/dashboard/my-development`
Page: `src/app/golf/(dashboard)/dashboard/my-development/page.tsx`

---

### How it is actually wired (end-to-end)

1. **Auth + role gate** — `page.tsx:78-82`. `getGolfSessionProfile()` resolves the
   golf session (`src/lib/auth/session.ts:142-167`, `getUser()` + `golf_coaches`/
   `golf_players` lookups). No session → redirect `/golf/login`. No `player`
   profile → redirect `/golf/dashboard`. The page only ever scopes to
   `player.id` (the caller's own player row), so there is no cross-player or
   coach→player leak on this route.

2. **Data read** — `page.tsx:87-106`. Server `createClient()` (RLS, anon key)
   selects from `golf_player_focus_areas` filtered `.eq('player_id', player.id)`,
   ordered `created_at` desc. Every selected column (id, area_type, title,
   description, status, target_metric, current_value, target_value, started_at,
   completed_at, created_at, from_review_id, from_insight_id, review_context)
   exists in `golf_player_focus_areas` (verified against golfhelm-database.md).
   The read is permitted for the player by RLS policy
   `golf_player_focus_areas_select_team` (baseline migration line 19350), whose
   OR-branch grants `golf_players.id = player_id AND user_id = auth.uid()`.

3. **Partition** — `page.tsx:108-109`. `activeAreas` = status active|in_progress;
   `completedAreas` = status completed. (Note: `paused` rows fall into neither
   bucket and silently disappear from both lists — see findings.)

4. **Fork** — `page.tsx:118-157`. When `isRedesignEnabled()` (env
   `NEXT_PUBLIC_REDESIGN`), the page additionally loads v3 Goals, goal
   suggestions, standing map, and causal relationships, then renders
   `FairwayMyDevelopment`. Otherwise the legacy AREA_TYPES/STATUS_CONFIG card
   markup renders (`page.tsx:181-451`).

5. **Player write actions** — both branches reuse the SAME server actions in
   `src/app/golf/actions/development.ts`:
   - `updateFocusAreaProgress(id, value, {note})` (`development.ts:262-327`) —
     auth check, `verifyPlayerAccess()` ownership guard (self allowed), then
     `.update({current_value, updated_at, progress_notes?}).eq('id', id)` on the
     RLS client, then `revalidatePath()`.
   - `completeFocusArea(id)` (`development.ts:334-378`) — same auth +
     `verifyPlayerAccess`, then `.update({status:'completed', completed_at, ...})`.
   Legacy triggers: `LogProgressButton` / `MarkCompleteButton`
   (`my-development/LogProgressButton.tsx`). Redesign triggers:
   `FairwayMyDevelopment` → `FocusAreaCard` (`onLogProgress`/`onComplete`).
   Both call `router.refresh()` on a `{success:true}` result.

6. **Render (redesign)** — `FairwayMyDevelopment.tsx` mounts `CoachHelmShell`
   (player variant), `GoalsSection`, `CausalWhyPanel`, a
   `DevelopmentOverviewInstrument`, and one `FocusAreaCard` per area. Source
   chips, progress meter, sparkline, and standing strip live inside
   `FocusAreaCard.tsx`.

---

### Expected vs actual (golfhelm-features.md #21)

The feature doc's #21 narrative actually describes the COACH Development Plans
tool (create/track focus areas); the player My Development view is the
"player view" terminus referenced by #25 ("Feeds into: My Development (player
view, Feature 21)"). Expected player behavior: read-only-ish view of focus
areas the coach assigned, reflecting coach-assigned plans, with the player able
to log progress and mark complete. The summary table rates #21 at 100%.

Actual: the read path faithfully reflects coach-assigned plans (RLS lets the
player read own rows; columns correct; source/context surfaced). BUT the
player's two write controls (Log progress, Mark complete) are blocked by RLS at
the database and silently no-op while reporting success — so the tab is NOT
100%; its primary player interactions do not persist. The redesign's
per-area Sparkline/Trend is also dead because the progress history is never
queried or passed through.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| CRITICAL | rls | development.ts:314-321 (also 360-367) + baseline migration 19358 | The only UPDATE policy on `golf_player_focus_areas` is `golf_player_focus_areas_update_coach` (coach staffing the team). There is NO player-self UPDATE policy in any migration. `updateFocusAreaProgress`/`completeFocusArea` run on the RLS-scoped server client. A player's UPDATE matches 0 rows under RLS; Supabase returns no error on 0 affected rows, so the action returns `{success:true}`. | Player taps "Log progress" or "Mark complete", sees a success toast, page refreshes — but current_value/status/progress_notes never change. The tab's #1 player feature is silently broken. (Coaches still work.) | Add a player-self UPDATE policy on `golf_player_focus_areas` (`golf_players.id = player_id AND user_id = auth.uid()`), restricting writable columns if desired; OR route player writes through a SECURITY DEFINER RPC. Then verify affected-row count and fail honestly when 0. |
| MEDIUM | dead-control | FairwayMyDevelopment.tsx:430-441 + page.tsx:87-106 + FocusAreaCard.tsx:475-482 | The page select never fetches `progress_notes`, and neither `page.tsx` nor `FairwayMyDevelopment` ever sets `progressHistory` on the `FocusAreaCardData` passed to `FocusAreaCard`. So `series` is always empty, `hasTrend` is always false. | The advertised "honest per-area Sparkline + TrendChip" (redesign headline feature) always renders an em-dash and the TrendChip never appears, even for areas with logged history. The trend is permanently dead, not honestly-thin. | Select `progress_notes` in page.tsx, map `progress_notes.entries[]` → `progressHistory` on each `FocusAreaCardData`, and pass it through in both the active and completed maps. |
| MEDIUM | broken-link | FocusAreaCard.tsx:236-238 | `SourceChip` builds the "From a round review" href as `/golf/dashboard/rounds/${reviewId}/review` using `focusArea.from_review_id`. But `from_review_id` is a `golf_round_reviews.id` (review id), while the review route param `[id]` is a ROUND id — the review page loads `golf_rounds.eq('id', roundId)` (review/page.tsx:175, 262-264). Passing a review id as a round id queries a non-existent round. | Clicking the review source chip lands on a not-found / failed round-review page instead of the originating review. (Redesign branch only; legacy renders a plain non-link span.) | Resolve the round id from the review (join `golf_round_reviews.round_id`) and link `/rounds/${round_id}/review`, or carry the round id onto the focus area at creation time. |
| MEDIUM | no-error-state | page.tsx:108-109, 233 (legacy branch) | The select error `focusAreasError` is only consumed in the redesign fork (`loadError` → `InlineNotice`). In the legacy (flag-OFF) branch the page derives `activeAreas`/`completedAreas` from `focusAreas || []` and renders the "No Development Plans Yet" empty state when the select fails. | On the default (flag-OFF) prod build, a transient DB/read failure shows a player a false "your coach hasn't assigned anything" empty state instead of an error — they may believe they have no plans. | In the legacy branch, branch on `focusAreasError` and render a real error (the redesign branch already does this with `loadError`). |
| LOW | wrong-data | page.tsx:108-109 | The active/completed partition only buckets active|in_progress and completed. A focus area with `status='paused'` (a valid status per STATUS_CONFIG, `page.tsx:74`) is in neither bucket and is dropped from the UI entirely. | A coach who pauses a player's focus area makes it vanish from the player's My Development list with no indication; the count strip also undercounts vs `(focusAreas||[]).length`. | Include `paused` in `activeAreas` (or render a separate Paused section), and keep the displayed buckets summing to total. |
| INFO | type-mismatch | development.ts:301-311 + golfhelm-database.md (progress_notes default `'[]'::jsonb`) | The DB column default for `progress_notes` is an array (`'[]'::jsonb`), but the action reads/writes the object shape `{ entries: [...] }` and `FocusAreaProgressEntry`/`ProgressNotes` assume `{entries}`. On a brand-new row the default `[]` has no `.entries`, so the read-modify-write treats it as empty (handled by the `Array.isArray(existingRaw?.entries)` guard) and overwrites it with an object — no crash, but the column default and the runtime shape disagree. | No functional break today (guard tolerates it), but the schema default is misleading and any consumer expecting the array default would misread. | Align the column default to `'{"entries":[]}'::jsonb` (or change code to the array shape) so default and runtime shapes match. |

---

### Notes on what is correct (no finding)

- Role-gating is correct: own-player scope only, non-player redirected
  (`page.tsx:78-82`).
- Auth-first in every write action (`development.ts:269-272, 339-342`), plus a
  `verifyPlayerAccess` ownership guard that correctly allows self and rejects
  others. (The RLS gap above is purely at the DB layer, not the action layer.)
- All tables are sport-prefixed; all selected columns exist.
- Mutations `revalidatePath('/golf/dashboard/my-development')` and the client
  also `router.refresh()`.
- No destructive delete-then-insert in any write path; `progress_notes` is a
  read-modify-write append (no data loss).
- No pagination risk: focus areas per player are bounded (well under the 1000
  PostgREST cap); no shot/hole reads here.
- Loading skeleton (`loading.tsx` → DevelopmentPageSkeleton) and route error
  boundary (`error.tsx` → RouteErrorBoundary) both present and real.
- Redesign branch has a genuine error state (`loadError` → InlineNotice) and an
  honest empty state (EmptyState + Message coach CTA → real `/messages` route).
- Cross-feature links: "Message coach" → `/golf/dashboard/messages` (exists).
  Insight source chip → `/golf/dashboard/coachhelm#insight-<id>` (player
  CoachHelm exists). Only the review source chip is mis-targeted (above).
