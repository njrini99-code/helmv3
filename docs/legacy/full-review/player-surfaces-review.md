# Agent 2: player surfaces — DONE

## Per-surface verdict

- **Player Hub** (`/dashboard/hub`, `src/app/golf/(dashboard)/dashboard/hub/page.tsx`): **WIRED**. All four sections — trips (golf_travel_itineraries L73-76), tasks (golf_task_assignments + golf_tasks L80-83 / L150-155), events (RPC `get_player_hub_events` L88-92), announcements (`getPlayerHubAnnouncements` L95) — pull live data. `HubInsightSignalCard` (L100, L199) reads top-1 evidence-backed insight. No mocks/TODOs found in `src/components/golf/player-hub/*.tsx`.

- **My Development** (`/dashboard/my-development`, `page.tsx`): **PARTIAL — read-only by design**. Page reads `golf_player_focus_areas` filtered by `player_id` (L73-89). No create/edit/log-progress UI: `createFocusArea`/`updateFocusArea`/`deleteFocusArea` (development.ts L51, L153, L200) are gated to coaches via `golf_coaches` lookup (L62-70). `updateFocusAreaProgress` (L241) exists with `verifyPlayerAccess` but is **never imported by any player tsx** (grep shows only test file `src/test/golf/actions/development.test.ts:27`). Empty state explicitly says "Your coach hasn't assigned any focus areas yet" (L159) — design intent is coach-curated. Matches the known fact: 7/7 focus areas are coach-curated, no player path exists.

- **My Qualifiers** (`/dashboard/my-qualifiers`, `page.tsx` + `my-qualifiers-client.tsx`): **WIRED**. Reads real entries (L21-39) and joins `golf_rounds` for completed scores (L48-53). Aggregates per-qualifier total/to-par (L100-101) and round numbers (L94-98). `showLiveLeaderboard: true` is hardcoded (L121) but the field is unused in the client (no leaderboard render here — leaderboard lives at `/dashboard/qualifiers/[id]` linked at client L89). "Enter Round" button correctly routes with `?qualifier=` param (client L169).

- **Round Entry** (`/dashboard/rounds/new`, `new-round-client.tsx` 2596 LoC): **WIRED**. Detects in-progress rounds and prompts resume (page L20-41). Saved courses loaded dynamically (L499). Auto-save: per-shot save via `savePartialRound` (L979-995) plus 15s interval (L2215). `golf.ts` `savePartialRound` (L3286) writes `golf_holes` + `golf_shots` for real (L3693-3738). Conflict detection via `lastServerUpdatedAtRef` (L960). Only "placeholder" matches are HTML form attrs (L1569, L1735, L1753, L1768, L1789, L1805).

- **Continue Round** (`/dashboard/rounds/continue/[id]`, `page.tsx` 498 LoC + client 1239 LoC): **WIRED**. Server hydrates from `golf_holes`, `golf_shots`, `putt_details`, `approach_miss_details`, `golf_course_holes` (L201-293). Sparse-aware completed-hole stat reconstruction (L350-382, L445-453). In-progress shots for non-completed holes preserved across resume (L470-479). Client autosaves per shot at 15s (continue-client L931, executes via `savePartialRound` at L302/435/464/609/646/804). `draft_data` JSON fallback for hole pars/yardages (L399-412).

- **Classes** (`/dashboard/classes`, page.tsx 742 LoC, inline client): **WIRED**. Real CRUD against `golf_player_classes` (L72-76). Modals for add/upload/confirm/detail (L11-14). Schedule parser + calendar sync hooks (`syncClassToCalendar`/`removeClassFromCalendar` L17). No mocks/TODOs found.

- **My Insights redirect** (`/dashboard/my-insights/page.tsx` L6): **WIRED**. Pure server `redirect('/golf/dashboard/coachhelm')`, 7-line file. No stub render.

## Top wiring gaps (ranked)

1. **[MAJOR — by design, but worth surfacing] My Development is fully read-only for players.** `src/app/golf/(dashboard)/dashboard/my-development/page.tsx:1-341` has no `'use client'`, no mutation calls, no buttons aside from "Message Coach" CTA (L162). `updateFocusAreaProgress` action (`src/app/golf/actions/development.ts:241`) is implemented and ownership-guarded but **never wired to a player UI** — only used in tests. **Fix sketch**: add a small client modal (e.g., "Update progress" button on each active focus area row at page.tsx L194+) that calls `updateFocusAreaProgress(fa.id, newCurrentValue)`. Confirms the known finding that the promote-from-insight flow has never fired and players have no self-service path.

2. **[MINOR] `showLiveLeaderboard: true` hardcoded** at `src/app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx:121`. Field is currently unused by the client, so no functional impact, but it tells consumers a per-qualifier toggle exists when the DB schema (`golf_qualifiers`) likely has the actual flag. **Fix sketch**: drop the field or read `qualifier.show_live_leaderboard` from the qualifier row.

3. **[MINOR] My-Qualifiers has no signed-up-but-not-yet-started view** distinct from "Upcoming". `getStatusBadge` (client L19-33) maps only `upcoming`/`in_progress`/`completed`/`Complete`. There is no "results recap" surface for completed qualifiers beyond the inline totalScore/toPar — players click through to `/dashboard/qualifiers/[id]` (out of scope, owned by team-shared agent). Standings/real-time updates are not implemented in this surface (no `useEffect` polling, no realtime channel in `my-qualifiers-client.tsx`).

4. **[MINOR] HubInsightSignalCard returns `null` when no insight** (`src/app/golf/(dashboard)/dashboard/hub/page.tsx:97-100, L199`). This is the documented behavior, but a player who has zero insights silently gets a missing card with no explanatory text. Not a bug, but a polish gap.

## Summary

Six of seven player surfaces feel real and production-grade — Player Hub, My Qualifiers, Round Entry, Continue Round, Classes, and the My-Insights redirect all read live tables, persist via server actions, and have no mock/TODO/placeholder strings. The one significant gap is **My Development**: it's deliberately a read-only viewer over coach-curated `golf_player_focus_areas`, with no mutation UI for players despite a working `updateFocusAreaProgress` server action sitting unused. Round entry/continue have full autosave (15s + per-shot) with conflict detection and sparse-hole resume — these are the strongest surfaces in the player suite.
