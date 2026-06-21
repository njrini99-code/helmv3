## Round create / continue / recover (core flow) [player]

E2E audit of the core round-tracking flow: start round → enter shots/holes → partial save (incl. sendBeacon/keepalive unload save) → resume via continue → recover via recover. Date: 2026-06-20.

### Routes / files audited
- `src/app/golf/(dashboard)/dashboard/rounds/new/page.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/new/layout.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/recover/page.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/recover/recover-round-client.tsx`
- `src/components/fairway/pages/rounds-recover/FairwayRecoverRound.tsx`
- `src/app/golf/actions/golf.ts` (submitGolfRoundComprehensive, savePartialRound, deleteInProgressRound)
- `src/app/golf/actions/round-drafts.ts` (saveRoundDraft, checkRoundStaleness)
- `src/app/api/golf/rounds/partial-save/route.ts` (beacon endpoint)
- `src/lib/offline/partial-save-beacon.ts`
- `src/lib/utils/emergency-save.ts`

### Actual end-to-end wiring

**Role-gate / auth (all 3 pages).** `new/page.tsx:8-12`, `continue/[id]/page.tsx:157-161`, `recover/page.tsx:8-12` all call `getGolfSessionProfile()` (`src/lib/auth/session.ts:142`), redirect to `/golf/login` if no session, and redirect non-players away (`new` → dashboard with "Only players can submit rounds"; `continue`/`recover` → login/dashboard). Continue additionally scopes the round load by `player_id` (`continue/[id]/page.tsx:171`). Role resolution is `coach ? 'coach' : player ? 'player' : null` — solid. No cross-role leak.

**Start round.** `new/page.tsx` (server) optionally loads the latest `in_progress` round (`golf_rounds`, scoped by `player_id`, `.limit(1)`) and passes it as `existingInProgressRound` to `NewRoundClient`. Client wizard `new-round-client.tsx` runs a 4-step machine (`setup → holes → tracking → submitting`). Course chosen from Cloud Library tee picker (`handleTeePick`), recent/saved courses (`handleQuickPickConfirm`/`handleSavedCourseSelect`), or manual. Setup submit validates rating/slope ranges client-side to mirror the server Zod schema (`golf.ts:264+`).

**Enter shots / holes + auto-save.** `ShotTrackingComprehensive` (legacy) / `FairwayShotTracking` (redesign) fire `onSaveShot` (in-memory) and `onAutoSave` every 15s. `handleAutoSave` (`new-round-client.tsx:1306`, mirror in `continue-round-client.tsx:557`) does: (1) synchronous `emergencySave()` to localStorage, (2) awaited `savePartialRound()` to the DB guarded by a `serverSaveInProgressRef` mutex + `pendingServerSaveRef` queue so concurrent saves don't drop. `handleHoleComplete` persists each completed hole the same way. Consecutive failures bump `consecutiveSaveFailuresRef` and surface a throttled warning toast; `result.error === 'conflict'` triggers `checkRoundStaleness` reconciliation; "already completed" redirects to the saved round.

**Partial save (server).** `savePartialRound` (`golf.ts:4022`): Zod-validates, `auth.getUser()` first, resolves player + team + course. EXISTING round → atomic RPC `save_partial_round_atomic` (delete+insert wrapped in a single DB transaction, with optimistic locking via `p_expected_updated_at`). NEW round (no id) → non-destructive `.upsert(onConflict: 'round_id,hole_number')` on `golf_holes` and `.upsert(onConflict: 'round_id,hole_number,shot_number')` on `golf_shots`, with orphan-trim DELETEs running ONLY after all upserts succeed (`golf.ts:4443-4613`). Intentionally does NOT `revalidatePath` (documented: avoids router refetch races during 15s autosave). Tables/columns all sport-prefixed and match `golfhelm-database.md` (`draft_data`, `current_hole`, `holes_played`, `tee_id`, `total_penalties`, `back_nine`, `score_to_par` all verified present).

**Unload-safe save (mobile/offline).** Both clients register `beforeunload` + `visibilitychange:hidden` + `pagehide` handlers (`new-round-client.tsx:362-457`, `continue-round-client.tsx:259-333`). On background: synchronous `emergencySave()` to localStorage, then `beaconPartialSave()` (`partial-save-beacon.ts`) → `navigator.sendBeacon` (fallback `fetch(..., {keepalive:true})`) → `POST /api/golf/rounds/partial-save` → delegates to `savePartialRound` (same auth/RLS/upsert path). This is the fix for the 2026-06-10 prod incident; correctly wired.

**Submit.** `handleRoundSubmit` waits for any in-flight save (≤10s), runs `checkRoundStaleness` (multi-device guard), then `submitGolfRoundComprehensive` (`golf.ts:1082`). Server: Zod + completeness + sanity validation, auth, ownership/double-submit guard, qualifier validation, server-recomputes totals/GIR. EXISTING → `submit_round_atomic` RPC (with a `submitRoundDirectFallback` on internal RPC error, after persisting a `draft_data.submissionBackup`); NEW → insert as `draft` then `submit_round_atomic`. On RPC failure the round is NEVER deleted (preserved for retry). Post-success: `revalidatePath` for dashboard/rounds/stats/coachhelm/my-development/my-qualifiers + cache tags, plus `after()` background stats-cache invalidation and CoachHelm trigger. Recoverable submit errors route the player to `/recover?from=submit` after persisting localStorage + IndexedDB backups.

**Resume (continue).** `continue/[id]/page.tsx` loads the round (scoped by id+player_id), redirects to `/rounds/[id]` if not `in_progress`, and in parallel loads `golf_holes`, `golf_shots`, `golf_course_holes` yardages, then `putt_details` + `approach_miss_details` for the round's shots. It reconstructs `completedHoleStats` (DB-authoritative score/putts/FW/GIR/scramble/sand/penalty preserved over shot-derivation), `allInProgressShots` for every non-completed hole (prevents multi-hole data loss), and computes `startHoleIndex` from `current_hole`. Hole configs restored from `draft_data.holes` (fallback legacy `notes` JSON). All server errors logged via `logServerError`; failures degrade gracefully.

**Recover.** `recover/page.tsx` forks on `isRedesignEnabled()` → `FairwayRecoverRound` vs legacy `RecoverRoundClient` (logic identical 1:1). Scans modern IndexedDB + legacy IndexedDB + localStorage emergency saves (`Promise.allSettled`), dedups, filters to rounds with real completed-hole scores, and re-submits via `submitGolfRoundComprehensive`. Cleanup (delete offline copy) runs ONLY after a confirmed server submit — never delete-then-reinsert. "Already submitted" short-circuits to the saved round. Honest empty state. Loading + error states present.

### Expected vs actual (golfhelm-features.md #1 Round Tracking)
- Spec data flow (setup → hole config → shot tracking w/ auto-save → submit writing golf_rounds/holes/shots + async stats/CoachHelm/review/qualifier): **matches**. Continue flow (load in_progress, map shots → ShotRecord, restore putt/approach detail, resume from current_hole): **matches and exceeds** (restores ALL unfinished holes, not just the start hole).
- Spec Known Gap "Draft data in notes field": **resolved** — drafts now persist to dedicated `golf_rounds.draft_data` JSONB; `notes` is read only as a legacy fallback (`continue/[id]/page.tsx:399-412`).
- Spec Known Gap "Offline shot sync disabled": continue-client still queues shots to IndexedDB when offline (`continue-round-client.tsx:604-613`); new-client documents the offline limitation. Partially addressed; localStorage + beacon cover the primary loss path.
- **Divergence**: Spec says the new-round page should "prompt the player to resume." In code the resume prompt is **permanently disabled** — `showResumePrompt` is initialized `false` and `setShowResumePrompt(true)` is never called (verified). The documented intent (comment at `new-round-client.tsx:102-105`) is that unfinished rounds surface on the `/rounds` page instead. This is intentional, but it leaves dead UI and an unused server query (see findings).

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| MEDIUM | destructive-write | src/lib/utils/emergency-save.ts:128-137 | `clearEmergencySave(roundId)` unconditionally `removeItem`s the `_new` key in addition to the round-specific key. | Saving/submitting an already-server-backed round (id present) wipes a *separate* unsaved fresh-round draft stored under `_new`. Narrow but real cross-draft data-loss path. | Only remove `_new` when `roundId` is null/undefined; when a specific roundId is cleared, leave `_new` intact. |
| LOW | dead-control | src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx:106,1779-1820 | The "Round in Progress / Continue Round / Start Fresh" resume prompt (and the redesign resume gate at 1671-1683) is unreachable — `setShowResumePrompt(true)` is never called. | Dead UI branch; the documented resume affordance lives on `/rounds` instead. Server still fetches `existingInProgressRound` (`new/page.tsx:18-41`) only to drive emergency-save status wiring, not the prompt. | Either re-enable the prompt (set true when `existingInProgressRound` exists) or delete the dead branches + trim the now-cosmetic server query to reduce confusion. |
| LOW | ux-gap | src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx:260-263 | `handleBeforeUnload` always `preventDefault()`s / sets `returnValue`, with no "has unsaved changes" guard (unlike the new-round client at 364-369). | Browser shows the "Leave site?" confirmation even immediately on load before any edits. Minor friction; data is safe either way. | Gate the beforeunload prompt on actual unsaved progress (mirror `new-round-client.tsx:460-467`). |
| INFO | revalidation | src/app/golf/actions/golf.ts:4351-4357,4615-4617 | `savePartialRound` deliberately omits `revalidatePath`/`updateTag`. | Intentional and correct (documented: avoids 15s-autosave router refetch races). The `/rounds` UnfinishedRounds list relies on `submitGolfRoundComprehensive`/`deleteInProgressRound` revalidation + its own fetch instead. Not a bug — noted for completeness. | None. |
| INFO | pagination-cap | src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx:206-224 | `golf_shots`/`golf_holes` for the round are fetched with `.select('*')` and no `.range()`/pagination. | NOT a real risk here: a single round is ≤18 holes and the Zod schema caps score ≤20/putts ≤10, bounding shots-per-round well under the 1000-row PostgREST cap. Flagged only to confirm it was checked. | None. |

### Notes on things that are correctly wired (no finding)
- No destructive delete-then-insert in any save/submit path: existing-round writes go through atomic RPCs (transaction-wrapped); the new-round path uses `.upsert(onConflict)` with orphan-trim only AFTER success. Submit never deletes the round on failure.
- Beacon/keepalive unload save is correctly implemented and delegates to the same auth-checked server action.
- Optimistic locking (`expectedUpdatedAt` / `checkRoundStaleness`) is consistently threaded through autosave, hole-complete, save-for-later, and submit.
- Every interactive control traced is wired: Continue Round / Start Fresh / Submit / Save for Later / Delete / Recover / Restore / Discard / Go Back / Retry / Save and Exit / Discard-on-error all hit real handlers.
- Loading, empty, and error states present on continue (graceful degradation + logging) and recover (skeleton dots, honest EmptyState, InlineNotice errors). Submit overlay handles submitting/success/error with retry/save/discard.
- All tables sport-prefixed; columns verified against `golfhelm-database.md` / `glossary.md`.
