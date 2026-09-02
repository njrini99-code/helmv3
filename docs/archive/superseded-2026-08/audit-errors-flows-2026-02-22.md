<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Same-day (2026-02-22) point-in-time audit cluster, superseded many times over by the 06-2026/07-2026 audit cadence (docs/audits/GOLFHELM_E2E_TAB_AUDIT_2026-06-20.md, docs/audits/DB_FORENSIC_AUDIT_2026-07-08.md, RLS Wave A #327).
KEPT FOR HISTORY -- do not delete this file.
-->

# BaseballHelm — Error & Flow Audit
Date: 2026-02-22
Auditor: QA Sub-Agent (automated trace)
Test Account: yup@gmail.com (coach_id: 0917b446-e19e-4b25-9d42-3f358dec8e65, coach_type: college)

---

## Flow Test Results

| Flow | Status | Issues Found |
|------|--------|--------------|
| 1. Login | ✅ Pass | Correctly identifies college coaches, redirects to `/baseball/coach/college` |
| 2. Discover Players | ⚠️ Partial | Pagination count is approximate after roster exclusion; stale comment about `is_on_college_team` filter (not actually applied); `lib/queries/players.ts` calls non-existent column |
| 3. Player Peek Panel | ⚠️ Partial | No visible X close button (title not passed to PeekPanelRoot); `checkWatchlistStatus` uses `.single()` (throws on no row) |
| 4. Team Peek Panel | ✅ Pass | Has close button; handles empty staff/roster gracefully; supabase in useRef |
| 5. Add to Watchlist | ✅ Pass | Duplicate check present; returns success/failure; table exists in migrations |
| 6. Pipeline Stages | ❌ Fail | **CRITICAL**: Kanban board only renders 5 stages but 7 are defined in `stages.ts`; players in `contacted` or `campus_visit` stages vanish from the board |
| 7. Messages | ✅ Pass | Coach can start conversations; `user_id` null check present; tables exist; console.log debug leak in production |
| 8. Player Profile | ⚠️ Partial | `player_stats: []` hardcoded — stats tab always empty even though `baseball_player_stats` table exists |
| 9. Calendar | ⚠️ Partial | College coaches without `organization_id` get `teamId = null` → empty calendar, cannot create events |
| 10. Compare Players | ✅ Pass | Empty state, max 4 players work; supabase client created outside useRef (cosmetic) |

---

## Runtime Error Risks

- [ ] **`.single()` on missing watchlist row** — `src/components/panels/PlayerPeekPanel.tsx:89` — `checkWatchlistStatus` calls `.single()` instead of `.maybeSingle()` on `baseball_watchlists`. When a player is NOT in the coach's watchlist, `.single()` returns a `PGRST116` error. The function catches nothing (no try/catch), so the promise rejection is unhandled. State stays `false` incidentally, but causes a noisy error in Supabase logs and may break if RLS changes the error type.

- [ ] **`is_on_college_team` column does not exist** — `src/lib/queries/players.ts:44` — This file calls `.eq('is_on_college_team', false)` on `baseball_players`. That column does not appear in any migration file. Any code path calling `getDiscoverPlayers()` or `getPlayerProfile()` from this file (NOT the action file) will receive a Supabase error. Callers that `throw error` will crash the page; callers that ignore error will return empty data silently.

- [ ] **Non-existent FK aliases in `getPlayerProfile`** — `src/lib/queries/players.ts:getPlayerProfile` — Selects `organizations!players_showcase_org_id_fkey` and `organizations!players_college_org_id_fkey`. No migration defines `showcase_org_id` or `college_org_id` columns on `baseball_players`. Supabase will return an error for any call to this function.

- [ ] **Unsafe `data!` / `data as X` casts in messages.ts** — `src/app/actions/messages.ts` — Uses `as any` casts throughout (explicitly noted via eslint disable). The `insertedMessage` type is widened with `as any`, which means TypeScript won't catch shape mismatches at build time. Not an immediate crash risk but raises the floor for silent mismatch bugs.

---

## Silent Failures

- [ ] **Empty `catch {}` in `toggleWatchlistPlayer`** — `src/app/baseball/actions/watchlist.ts` (near bottom) — The outermost catch block is `catch { return { success: false, error: '...' }; }`. Error is surfaced to the caller as a message, so not truly silent, but the underlying error is discarded without logging.

- [ ] **`checkWatchlistStatus` silent swallow** — `src/components/panels/PlayerPeekPanel.tsx` — No `try/catch` around `checkWatchlistStatus`. If `supabase.auth.getUser()` throws (e.g., network error) or the `.single()` rejects with PGRST116, the error propagates into the effect without a handler. React will swallow it; `isInWatchlist` will remain `false`. No user feedback.

- [ ] **Pipeline kanban silently hides players** — `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx:56` — The stages array is hard-coded to 5 stages. Players with `pipeline_stage = 'contacted'` or `'campus_visit'` (defined in `lib/recruiting/stages.ts`) are never rendered in any kanban column. They appear in the list view's "All" tab count but not the board. There is no warning, no "hidden players" indicator.

- [ ] **`getDiscoverTeams` pagination + filter mismatch** — `src/app/baseball/actions/discover.ts:getDiscoverTeams` — The DB-level `.range(offset, offset + perPage - 1)` is applied first, then a post-query filter removes orgs without a named head coach. The returned `count` and `pages` are calculated from the post-filter `teams.length`, not the DB total. If many orgs lack head coaches, page 2+ may return far fewer results than expected and page count is wrong.

- [ ] **`handleBulkStatusChange` drops partial failures** — `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx` — `Promise.all(...)` across bulk status updates; the catch block shows a generic toast but doesn't identify which players failed. Partial failures are swallowed.

- [ ] **Player profile `player_stats` hardcoded empty** — `src/app/baseball/(public)/player/[id]/page.tsx:96` — `player_stats: []` is hardcoded with comment "No baseball stats table exists". However, `baseball_player_stats` table was created in migrations `032_baseball_advanced.sql` and `037_baseball_missing_tables.sql`. Stats are never fetched or displayed.

---

## Missing Error Handling

- [ ] `src/components/panels/PlayerPeekPanel.tsx:checkWatchlistStatus` — No try/catch; no error state shown to user if fetch fails.

- [ ] `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx:handleBulkStatusChange` — `catch {}` does not surface per-item failures; user is misled into thinking all succeeded.

- [ ] `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx:handleBulkRemoveConfirm` — Same issue: `Promise.all` on removes; single catch toast hides partial failures.

- [ ] `src/lib/queries/players.ts:getDiscoverPlayers` — `throw error` on DB failure (good), but callers in server components need to handle this or they will produce uncaught exceptions.

- [ ] `src/lib/queries/players.ts:getPlayerProfile` — `throw error` on invalid FK query; there is no fallback or `notFound()` upstream unless the caller wraps it.

- [ ] `src/app/baseball/(dashboard)/dashboard/compare/page.tsx` — `console.error('Error fetching players:', error)` + `setPlayers([])` silently clears state on a DB error with no visible user feedback beyond empty UI.

---

## Edge Cases Not Handled

- [ ] **College coach with no `organization_id`** — `src/app/baseball/(dashboard)/dashboard/calendar/page.tsx:33-45` — Calendar resolves team via `session.coach?.organization_id`. College coaches who haven't set up an org (or whose org isn't linked) get `teamId = null`, which means no events are loaded and they cannot create events. No "set up your org" prompt or fallback shown.

- [ ] **Player with no `user_id` in message search** — `src/components/messages/NewMessageModal.tsx:57` — Players without an auth account are filtered out via `.filter(p => p.user_id)`. This is correct business logic but silently excludes them. A coach might not understand why a known player doesn't appear.

- [ ] **Pipeline kanban with `contacted`/`campus_visit` stage** — `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx` — As noted above, players in these two stages do not appear in any kanban column. If a coach has previously set a player to `contacted` (e.g., via API or manual DB update), the player disappears from the board view with no explanation.

- [ ] **Discover page — all players unassigned to teams** — `src/app/baseball/actions/discover.ts:116-119` — If `discoverablePlayerIds` is an empty array (no players assigned to any HS/showcase/JUCO team), the function returns early with 0 results. There is no distinction between "no players match filters" and "no players are assigned to any discoverable team." The empty state message may be misleading.

- [ ] **Discover pagination approximate count** — `src/app/baseball/actions/discover.ts:176-179` — `adjustedCount = Math.max(0, count - coachRosterIds.size)` is a rough estimate. If the coach has 10 roster players but only 2 happen to be in the current page, the count underestimates. The page count (`Math.ceil(adjustedCount / perPage)`) may show fewer pages than there are, cutting off the last page.

- [ ] **New message flow — `?new=1` URL param not cleared** — `src/app/baseball/(dashboard)/dashboard/messages/page.tsx:43-47` — When `openNewParam === '1'`, the modal opens but the URL param is never removed. If the user closes the modal and navigates back with browser history, the modal re-opens. Also, `TeamPeekPanel`'s "Contact Coach" button navigates to `?new=1` without the specific coach ID, so the modal opens to a generic player list — no pre-selection of the team's coaches.

- [ ] **Login redirect for college coach type** — `src/app/baseball/actions/auth.ts:160` — Redirect is built as `coach_type.replace('_', '-')`. For `coach_type = 'college'`, this correctly produces `/baseball/coach/college`. However, if `coach_type` is an unexpected value (e.g., `null` or a future type like `d3_college`), the `|| 'college'` fallback would silently route them to the college page. Works today but fragile.

---

## Broken/Missing Tables

- [ ] **`is_on_college_team` column** — Referenced in `src/lib/queries/players.ts:44` with `.eq('is_on_college_team', false)`. No migration adds this column to `baseball_players`. Runtime DB error for any caller of this function.

- [ ] **`organizations!players_showcase_org_id_fkey`** — Referenced in `src/lib/queries/players.ts:getPlayerProfile` select. No migration defines `showcase_org_id` on `baseball_players`. Supabase will reject this join.

- [ ] **`organizations!players_college_org_id_fkey`** — Same file, same issue. No migration defines `college_org_id` on `baseball_players`.

- [ ] **`baseball_player_stats` — EXISTS but never queried** — Table is created in migrations `032` and `037` but `player/[id]/page.tsx` hardcodes `player_stats: []`. Stats tab always empty. Not missing from DB, but functionally dead code.

- [ ] **`notifications` table** — `src/app/actions/messages.ts:149` inserts into a `notifications` table. No `baseball_notifications` or plain `notifications` table found in migration files. This insert likely fails silently (error is not awaited with a throw). Notifications never delivered.

---

## Supplemental: Code Quality Issues

### `catch (e) {}` / Empty Catches Swallowing Errors
- `src/components/panels/PlayerPeekPanel.tsx` — `checkWatchlistStatus` has no try/catch at all; async errors in effects are unhandled
- `src/app/baseball/actions/watchlist.ts:toggleWatchlistPlayer` — `catch {}` block with no error logging
- `src/app/baseball/actions/watchlist.ts:checkWatchlistStatus` — `catch {}` block with no error logging
- `src/app/baseball/(dashboard)/dashboard/compare/page.tsx:handleSearch` — `catch (error)` sets empty state with no user feedback
- `src/components/messages/NewMessageModal.tsx:searchUsers` — `catch {}` sets empty results, no user feedback

### `data!` / Unsafe Type Assertions
- `src/app/actions/messages.ts` — Entire file uses `as any` casts to bypass Supabase typed client (noted in eslint-disable comment). Shape mismatches at runtime are invisible to TypeScript.
- `src/app/baseball/(public)/player/[id]/page.tsx:100` — `as unknown as Parameters<typeof PlayerProfileClient>[0]['player']` double-cast bypasses all type safety on the player data passed to the client component.

### `array[0]` Without Null Check
- `src/app/actions/messages.ts:219` — `sharedConversations[0].conversation_id` — the array is checked for `.length > 0` first, so this is safe. ✅
- `src/app/baseball/actions/discover.ts:getDiscoverTeams` — `validStates[0]` guarded by `.length === 1 && validStates[0]` check. ✅

### `useEffect` Missing Dependencies (Potential Stale Closures)
- `src/components/panels/PlayerPeekPanel.tsx:47` — `// eslint-disable-line react-hooks/exhaustive-deps` on `useEffect` with `[playerId]`. `fetchPlayer` and `checkWatchlistStatus` are defined outside the effect and capture the current `supabase` reference. Since `supabase` is in a `useRef`, this is safe, but `fetchPlayer` and `checkWatchlistStatus` themselves are recreated on every render yet not in deps — low risk but worth noting.
- `src/app/baseball/(dashboard)/dashboard/discover/page.tsx` — Two effects use `// eslint-disable-next-line react-hooks/exhaustive-deps` with a comment explaining the rationale (adding `players.length`/`teams.length` would cause infinite loops). The suppression is intentional and documented. ✅
- `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx:handleKeyboardNavigation` — Uses `useCallback` with full deps array including `focusedIndex`. ✅

### Console.log Leaking Debug Info to Production
- `src/app/actions/messages.ts` — Extensive `console.log` statements logging user IDs, conversation IDs, insert data (lines 183, 187, 218, 225, 244, 245, 253, 269, 279, 297). These are in a server action that runs server-side in production.

### Supabase Client Not in `useRef`
- `src/app/baseball/(dashboard)/dashboard/compare/page.tsx:21` — `const supabase = createClient()` called at component body level (not in useRef or useMemo). A new client is created on every render. This can cause excess connections and stale subscription teardowns, though it won't cause a functional crash.

---

## Summary

| Severity | Count | Examples |
|----------|-------|---------|
| ❌ Critical | 2 | Pipeline kanban missing 2 stages; `is_on_college_team` column doesn't exist in DB |
| ⚠️ High | 5 | Player profile stats always empty; calendar broken for coaches without org; `.single()` on watchlist check; non-existent FK aliases in `lib/queries/players.ts`; `notifications` table likely missing |
| ℹ️ Medium | 8 | No visible close button in PlayerPeekPanel; approximate pagination count; `?new=1` URL not cleared; console.log in production; empty catch blocks; stale `is_on_college_team` comments |
| 💅 Low | 3 | Compare page supabase client not in useRef; double-cast on player profile data; hardcoded `player_stats: []` comment is misleading |
