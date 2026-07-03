## Classes [player]

**Route:** `/golf/dashboard/classes`
**Primary table:** `golf_player_classes` (+ `golf_events` via calendar-sync)
**Date:** 2026-06-20

---

### End-to-end wiring (actual)

The page is a single `'use client'` component (`src/app/golf/(dashboard)/dashboard/classes/page.tsx`). It is NOT a server component and does no server-side auth/role gating of its own — it relies entirely on:

1. The dashboard layout (`src/app/golf/(dashboard)/layout.tsx:34-180`) which resolves the session via `getGolfSessionProfile()`, redirects unauthenticated users to `/golf/login` (line 35), and populates `GolfUserProvider` with `playerId`/`teamId` ONLY for players (coaches get `coachId` and no `playerId`).
2. RLS on `golf_player_classes` (migration `20260527000000_prod_public_baseline.sql:19303-19328`) for the client-side direct table writes.

**Data read** — `fetchClasses()` (page line 73-100) uses the **browser** Supabase client (`createClient()` from `@/lib/supabase/client`, line 65) to `select('*').eq('player_id', playerId).order('start_time')`. Columns all match the DB (`class_name`, `instructor`, `days[]`, `start_time`, `end_time`, `building`, `room`, `credits`, `color`, `notes`, `team_id` — verified against `golfhelm-database.md:756-774` and the page's `PlayerClass` interface at line 26-42). No pagination, but a player's class count is tiny (<20) so the 1000-row cap is irrelevant here.

**Render fork** — `isRedesignEnabled()` (line 413) selects between the active Fairway re-skin (`FairwayGolfClasses`, `src/components/fairway/pages/player-game/FairwayGolfClasses.tsx`) and the legacy inline JSX (line 527-898). The redesign component is presentation-only and receives the same state + verbatim handlers as props; all writes stay in the page. Per project memory, prod runs with the redesign ON, so the Fairway path is the live one and the legacy JSX is effectively dead code.

**Mutations (all client-side, browser client + RLS):**
- `handleAddClass` (102-143): builds `class_name = "CODE - Name"`, inserts into `golf_player_classes`, then calls `syncClassToCalendar(...)`.
- `handleUpdateClass` (145-182): `.update(...).eq('id').eq('player_id')`, then re-syncs calendar.
- `handleDeleteClass` (184-202): `removeClassFromCalendar()` first, then `.delete().eq('id').eq('player_id')`.
- `handleConfirmClasses` (210-287): bulk insert of CSV-parsed classes + parallel calendar sync. Shows error toasts (the only mutation path that does).
- `confirmDeleteAllClasses` (331-356): per-class `removeClassFromCalendar()` loop then bulk `.delete().eq('player_id')`. Shows an error toast.

**Calendar sync** (`src/app/golf/actions/calendar-sync.ts`) is a proper `'use server'` action: it calls `supabase.auth.getUser()` (line 121), verifies the caller IS the player (133), is a member of the team (149), and OWNS the class (164) before doing any write. It then uses the admin client (because player RLS can't write `golf_events`) scoped to the team + the `[class:<id>]` description tag. Re-sync is a real diff (insert/update changed, delete stale LAST) — NOT a destructive delete-then-reinsert (lines 252-328). This part is well-built and correctly authorized.

**Modals** — `AddClassModal`, `UploadScheduleModal`, `ConfirmClassesModal`, `ClassDetailModal`, plus a `ConfirmDialog` for delete-all. Every button/link/toggle in all four modals is wired to a real handler (verified). Loading skeleton, empty state, no-team state, and a route `error.tsx` (`RouteErrorBoundary`) are all present.

---

### Expected vs actual (golfhelm-features.md §11 "Academics / Classes")

The feature doc marks this 100% complete: manual add, CSV import → confirm → bulk insert, calendar sync, weekly grid, all-classes list, quick stats. All of that IS present and wired. However, the doc overstates completeness — the edit-prefill, type, and error-feedback bugs below are real and not noted as gaps. The doc also lists `golf_academic_exclusions` as a table for this feature, but the player Classes page never reads or writes it (it is a coach calendar-side concern); not a bug for this tab, just scope clarification.

Role-gating: the route relies on nav-hiding + the `!teamId`/`!playerId` early returns rather than an explicit player gate. RLS makes write/read safe for a coach who navigates here directly, but the UX for a coach hitting the URL is a dead page (no `playerId` → `fetchClasses` returns nothing, "Add Class" silently no-ops because `handleAddClass` returns on `!playerId`). Low risk (no nav entry points coaches there), noted as INFO.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| HIGH | broken-wiring | src/components/golf/classes/AddClassModal.tsx:155-171 | `formData` is set via a lazy `useState(() => editingClass \|\| {...})` initializer that runs ONCE. The modal is mounted unconditionally by the page (page.tsx:433 & 832) with `editingClass=null` at page load, and vaul keeps the component mounted across open/close, so the initializer captures the blank default. There is NO `useEffect` syncing `editingClass`→`formData`. | Editing an existing class always opens a BLANK form (course code/name/days/times/etc. not pre-filled). Saving from that blank form sends empty/garbage values for required fields, effectively breaking edit. | Add `useEffect(() => { if (isOpen) setFormData(editingClass ?? blankDefaults); }, [isOpen, editingClass])`, or remount the modal with `key={editingClass?.id ?? 'new'}`. |
| HIGH | type-mismatch | src/components/golf/classes/AddClassModal.tsx:423-431 → page.tsx:122 | Credits `<Input>` uses `step="0.5"` + `parseFloat`, allowing `3.5`, but `golf_player_classes.credits` is `integer` (golfhelm-database.md:770). The float is inserted verbatim. | Postgres rejects a non-integer literal for an integer column → insert throws → (combined with the swallowed-error bug below) the save silently fails with no user feedback. | Use `step="1"` + `parseInt`, OR migrate `credits` to `numeric`. Pick one consistently. |
| MEDIUM | no-error-state | page.tsx:129,170,197 + AddClassModal.tsx:237-241 + ClassDetailModal.tsx:53-57 | `handleAddClass`/`handleUpdateClass`/`handleDeleteClass` just `throw error` on failure (no toast). The modals catch the throw silently (`catch { /* UI shows original state */ }`). Only the import-confirm and delete-all paths show a toast. | On any add/edit/delete failure (RLS rejection, transient network error, the credits type error above) the user gets NOTHING — the modal looks frozen / the save appears to do nothing. Inconsistent with the toast feedback elsewhere on the tab. | Surface the error: have the page handlers `showToast(...)` (or return a result) so add/edit/delete failures are visible, matching `handleConfirmClasses`. |
| MEDIUM | broken-wiring | page.tsx:174,318,492,891 → calendar-sync.ts:169-173 | Editing a class re-syncs the calendar with `semester: ''` because semester is not stored in `golf_player_classes` (page rebuilds the edit form with `semester: ''`). `parseSemesterDates('')` returns `null` → `syncClassToCalendar` returns `{success:false}`. The page `await`s but never checks `.success`. | On every class EDIT, the calendar event series silently fails to update (the class row updates fine, but its calendar occurrences keep the old time/title). User sees stale events on the Calendar tab with no error. | Persist `semester`/`semesterStartDate` on the class row (add columns) so edit can re-supply it, or default to `detectSemester('')` when missing before calling sync; and check the sync result and toast on failure. |
| LOW | ux-gap | src/components/golf/classes/ClassDetailModal.tsx:91 | Detail modal renders `{classData.semester}` as a subtitle, but the page always passes `semester: ''` (not stored). | The detail view shows an empty/blank semester line for every class. | Hide the line when empty, or store + display the real semester. |
| INFO | role-leak | page.tsx:44-72 | Page has no explicit player role gate; it depends on nav-hiding + `!playerId`/`!teamId` early returns. A coach who navigates to the URL directly sees a non-functional page (no `playerId`). RLS keeps data safe. | Cosmetic dead-page for an out-of-nav coach; no data leak (RLS-protected, coach has no `playerId` so no read/write happens). | Optional: add an explicit `if (golfUser.role !== 'player')` guard with a redirect/empty state. |
| INFO | rls | supabase/migrations/20260527000000_prod_public_baseline.sql:19326-19328 | `golf_player_classes_update_player` has a `USING` clause but no `WITH CHECK`. | Not exploitable today — the update path never changes `player_id`, so a player can't reassign a row to another player. Worth a `WITH CHECK` for defense-in-depth. | Add a matching `WITH CHECK` to the UPDATE policy. |

---

### Notes on what is correctly wired (no findings)

- **Auth/redirect**: layout redirects unauthenticated users (`layout.tsx:35`); calendar-sync server action auth-checks + ownership-checks before any write.
- **Tables/columns**: all sport-prefixed (`golf_player_classes`, `golf_events`); column names verified against the DB doc.
- **No destructive delete-then-insert in sync**: `syncClassToCalendar` does a true diff (insert/update/delete-stale-last). Single-class delete and delete-all are pure removals of a deleted source, which is correct.
- **RLS**: `golf_player_classes` is RLS-enabled with player-scoped insert/update/delete and player-or-team-coach select; no anon/over-broad grants. Client-side direct writes are safe because RLS enforces ownership server-side.
- **Correct clients**: page uses the browser client for client-side reads/writes; calendar-sync uses `await createClient()` (server) + admin client for the `golf_events` writes it is authorized to make.
- **Interactive controls**: every button/link/toggle/form across the page and all four modals is wired to a real handler; the Team Hub "Manage classes" link (`FairwayTeamHub.tsx:271`) resolves to this route.
- **States**: loading skeleton (Fairway `Skeleton`), honest empty state, no-team state, and route `error.tsx` are all present and correct.
- **Realtime/badges**: none expected for this tab (correct).
- **Stats**: the four quick readouts (Classes/Credits/Days-per-week/Buildings) are computed from the real fetched rows, not hardcoded.
